<script setup lang="ts">
import { computed, ref } from 'vue'
import CopyButton from '../CopyButton/index.vue'
import GitGraph from './GitGraph.vue'

import { WEBVIEW_CHANNEL } from '@/constant'

import type { Commit, GitOperation } from '@/git'

const props = defineProps<{
  commit: Commit
  columnWidths: Record<string, number>
  isSelected?: boolean
  graph?: {
    node: { x: number, color: string }
    edges: { toX: number, color: string, type: 'straight' | 'merge' }[]
    columns: (string | null)[]
  }
}>()

const emit = defineEmits(['select'])

const hoveredCell = ref<string | null>(null)

function getBranchColorFromGraphData(branchName: string): string {
  // 优先使用 graph 中的颜色
  if (props.graph && props.graph.node && props.graph.node.color) {
    return props.graph.node.color
  }

  // 简化：不再从 graphData 获取颜色，而是使用固定颜色或 hash
  // 因为现在颜色是由 graph 算法分配的，这里主要用于 badge
  // 可以简单 hash
  let hash = 0
  for (let i = 0; i < branchName.length; i++) {
    hash = ((hash << 5) - hash) + branchName.charCodeAt(i)
    hash = hash & hash
  }
  const hue = (hash % 360 + 360) % 360
  return `hsl(${hue}, 70%, 45%)`
}

// 解析Git引用字符串为数组
function getRefsArray(refsString: string) {
  if (!refsString)
    return []

  // 将引用字符串分割成数组
  const refs = refsString.split(',').map(ref => ref.trim())

  return refs.map((ref) => {
    // 判断是标签还是分支
    const isTag = ref.includes('tag:') || ref.includes('refs/tags/')
    let name = ref
    let displayName = ref

    // 清理显示名称
    if (ref.includes('refs/heads/')) {
      // 本地分支
      name = ref.replace('refs/heads/', '')
      displayName = name
    }
    else if (ref.includes('refs/remotes/')) {
      // 远程分支
      name = ref.replace('refs/remotes/', '')
      displayName = name
    }
    else if (ref.includes('tag:')) {
      // 标签格式1
      name = ref.replace('tag:', '')
      displayName = name
    }
    else if (ref.includes('refs/tags/')) {
      // 标签格式2
      name = ref.replace('refs/tags/', '')
      displayName = name
    }
    else if (ref === 'HEAD') {
      name = 'HEAD'
      displayName = 'HEAD'
    }

    return {
      raw: ref,
      name,
      displayName,
      isTag,
    }
  })
}

function handleCommitClick(event: MouseEvent) {
  emit('select', event)
}

function handleDoubleClick() {
  try {
    if (window.vscode) {
      window.vscode.postMessage({
        command: WEBVIEW_CHANNEL.SHOW_CHANGES_PANEL,
      })
    }
  }
  catch (error) {
    console.error('Error sending commit details:', error)
  }
}
</script>

<template>
  <li
    class="commit-row"
    :class="{ selected: isSelected }"
    @click="handleCommitClick"
    @dblclick="handleDoubleClick"
  >
    <div class="branch-name-col commit-cell" :style="{ width: `${columnWidths.branchName}px` }">
      <template v-if="commit.refs && commit.refs !== ''">
        <div class="refs-container">
          <template v-for="refItem in getRefsArray(commit.refs)" :key="refItem.raw">
            <span
              class="ref-item"
              :class="{ tag: refItem.isTag, branch: !refItem.isTag }"
              :style="{
                backgroundColor: !refItem.isTag ? getBranchColorFromGraphData(refItem.name) : undefined,
                color: !refItem.isTag ? '#ffffff' : undefined,
                borderColor: !refItem.isTag ? getBranchColorFromGraphData(refItem.name) : undefined,
              }"
            >
              <span v-if="!refItem.isTag" class="codicon codicon-git-branch" style="font-size: 12px; margin-right: 4px;" />
              <span v-else class="codicon codicon-tag" style="font-size: 12px; margin-right: 4px;" />
              {{ refItem.displayName }}
            </span>
          </template>
        </div>
      </template>
    </div>
    <div class="branch-col commit-cell" :style="{ width: `${columnWidths.branch}px` }">
      <GitGraph
        :graph="graph"
        :is-selected="isSelected"
        :has-branch-label="!!(commit.refs && commit.refs !== '')"
      />
    </div>
    <span
      class="hash-col commit-cell" :style="{ width: `${columnWidths.hash}px` }" @mouseenter="hoveredCell = 'hash'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.hash.substring(0, 7) }}
      <CopyButton v-show="hoveredCell === 'hash'" :copy-text="commit.hash" />
    </span>

    <span
      class="commit-cell" :style="{ width: `${columnWidths.message}px` }" @mouseenter="hoveredCell = 'message'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.message }}
      <CopyButton v-show="hoveredCell === 'message'" :copy-text="commit.message" />
    </span>

    <span class="commit-cell" :style="{ width: `${columnWidths.stats}px` }">
      <span v-if="commit.diff" class="commit-stats">
        <span class="files">{{ commit.diff.changed }} files</span>
        <span v-if="commit.diff.insertions" class="additions">+{{ commit.diff.insertions }}</span>
        <span v-if="commit.diff.deletions" class="deletions">-{{ commit.diff.deletions }}</span>
      </span>
    </span>

    <span
      class="commit-cell" :style="{ width: `${columnWidths.author}px` }" @mouseenter="hoveredCell = 'authorName'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.authorName }}
      <CopyButton v-show="hoveredCell === 'authorName'" :copy-text="`${commit.authorName} <${commit.authorEmail}>`" />
    </span>

    <span class="commit-cell date" :style="{ width: `${columnWidths.date}px` }">{{ commit.date }}</span>
  </li>
</template>

<style scoped>
.commit-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--vscode-panel-border);
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  user-select: none;
}

.commit-row:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.commit-row.selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.commit-row.selected .hash-col {
  color: var(--vscode-list-activeSelectionForeground);
}

.commit-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0px 8px;
  position: relative;
  width: 100%;
  height: 32px;
  line-height: 32px;
}

.branch-col {
  position: relative;
  padding: 0px;
  z-index: 1;
  height: 32px;
  overflow: visible;
}

.hash-col {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.commit-stats {
  font-size: 0.85em;
  display: flex;
  gap: 8px;
}

.additions {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.deletions {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.date {
  color: var(--vscode-descriptionForeground);
  font-size: 0.9em;
}

.branch-name-col {
  white-space: normal;
  padding: 0px;
}

.refs-container {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  justify-content: flex-end; /* Align badges to the right to connect with graph */
  padding-right: 8px;
}

.ref-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.ref-item.branch {
  border: 1px solid;
  font-weight: 500;
}

.ref-item.tag {
  background-color: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}
</style>
