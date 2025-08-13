<script setup lang="ts">
import { computed, ref } from 'vue'
import CopyButton from '../CopyButton/index.vue'
// import GitGraph from './GitGraph.vue'

import { WEBVIEW_CHANNEL } from '@/constant'

import type { Commit, GitOperation } from '@/git'

const props = defineProps<{
  commit: Commit
  graphData: GitOperation
  columnWidths: Record<string, number>
  isSelected?: boolean
  activeBranches?: string[]
}>()

const emit = defineEmits(['select'])

const hoveredCell = ref<string | null>(null)

function getBranchColorFromGraphData(branchName: string): string {
  if (!props.graphData)
    return '#888888'

  // 检查当前提交的主分支颜色
  if (props.graphData.branch === branchName && props.graphData.branchColor) {
    return props.graphData.branchColor
  }

  // 检查目标分支颜色
  if (props.graphData.targetBranch === branchName && props.graphData.targetBranchColor) {
    return props.graphData.targetBranchColor
  }

  // 检查源分支颜色
  if (props.graphData.sourceBranchColors && props.graphData.sourceBranchColors[branchName]) {
    return props.graphData.sourceBranchColors[branchName]
  }

  // 生成一个基于分支名的稳定颜色
  // 使用分支名作为唯一标识符来生成一个稳定的哈希值
  let hash = 0
  for (let i = 0; i < branchName.length; i++) {
    hash = ((hash << 5) - hash) + branchName.charCodeAt(i)
    hash = hash & hash // 转换为32位整数
  }

  // 使用哈希值选择一个颜色
  // 黄金比例法生成分散均匀的颜色
  const hue = (hash % 360 + 360) % 360 // 确保是正数
  return `hsl(${hue}, 70%, 45%)` // 使用 HSL 颜色格式
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

// 计算在当前提交处结束（不应向上延伸）的分支
// const branchEndingUp = computed(() => {
//   if (!props.graphData)
//     return []

//   const endingBranches = []

//   // 当前提交的相关分支
//   if (props.graphData.branch) {
//     // 当前分支如果没有父提交，则结束于此
//     if (!props.commit.parents || props.commit.parents.length === 0) {
//       endingBranches.push(props.graphData.branch)
//     }
//   }

//   // 源分支在此结束
//   if (props.graphData.sourceBranches && props.graphData.sourceBranches.length) {
//     props.graphData.sourceBranches.forEach((branch) => {
//       // 如果源分支不等于主分支，则在此结束
//       if (branch !== props.graphData.branch) {
//         endingBranches.push(branch)
//       }
//     })
//   }

//   return endingBranches
// })
</script>

<template>
  <li
    class="commit-row"
    :class="{ selected: isSelected }"
    @click="handleCommitClick"
    @dblclick="handleDoubleClick"
  >
    <div class="branch-name-col commit-cell" :style="{ width: `${columnWidths.branchName}px` }">
      <!-- 显示分支和标签 -->
      <template v-if="commit.refs && commit.refs !== ''">
        <div class="refs-container">
          <template v-for="(ref, index) in getRefsArray(commit.refs)" :key="index">
            <span
              class="ref-item"
              :class="{ tag: ref.isTag, branch: !ref.isTag }"
              :style="{
                backgroundColor: !ref.isTag ? `${getBranchColorFromGraphData(ref.name)}20` : undefined,
                color: !ref.isTag ? getBranchColorFromGraphData(ref.name) : undefined,
                borderColor: !ref.isTag ? getBranchColorFromGraphData(ref.name) : undefined,
              }"
            >
              {{ ref.displayName }}
            </span>
          </template>
        </div>
      </template>
    </div>
    <!-- <div class="branch-col commit-cell" :style="{ width: `${columnWidths.branch}px` }">
      <GitGraph
        :graph-data="graphData"
        :active-branches="activeBranches"
        :is-selected="isSelected"
        :branch-ending-up="branchEndingUp"
      />
    </div> -->
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
  display: flex;
  align-items: center;
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
  overflow: visible;
  padding: 0px;
}

.refs-container {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
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
