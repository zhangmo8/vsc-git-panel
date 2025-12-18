<script setup lang="ts">
import { computed, ref } from 'vue'
import CopyButton from '../CopyButton/index.vue'
import GitGraph from './GitGraph.vue'

import { WEBVIEW_CHANNEL } from '@/constant'

import type { Commit } from '@/git'

const props = defineProps<{
  commit: Commit
  columnWidths: Record<string, number>
  isSelected?: boolean
  graph?: {
    node: { x: number, color: string }
    edges: { toX: number, color: string, type: 'straight' | 'merge' }[]
    columns: (string | null)[]
    hasIncoming: boolean
  }
  ghostBranch?: string
}>()

const emit = defineEmits(['select'])

const parsedRefs = computed(() => getRefsArray(props.commit.refs))

const hoveredCell = ref<string | null>(null)

const ghostBranchName = computed(() => {
  if (parsedRefs.value.length > 0)
    return ''
  return props.ghostBranch?.trim() || props.commit.branchName?.trim() || ''
})

type ColumnKey = 'branchName' | 'branch' | 'hash' | 'message' | 'stats' | 'author' | 'date'

const FLEXIBLE_COLUMN: ColumnKey = 'branchName'
const MIN_WIDTHS: Record<ColumnKey, number> = {
  branchName: 80,
  branch: 60,
  hash: 60,
  message: 110,
  stats: 90,
  author: 70,
  date: 90,
}

function getColumnStyle(column: ColumnKey) {
  const width = props.columnWidths?.[column] ?? MIN_WIDTHS[column]
  const minWidth = MIN_WIDTHS[column]
  if (column === FLEXIBLE_COLUMN) {
    return {
      flex: `1 1 ${width}px`,
      minWidth: `${minWidth}px`,
    }
  }
  if (column === 'branch') {
    return {
      flex: `0 0 ${width}px`,
      minWidth: `${minWidth}px`,
      width: `${width}px`,
    }
  }

  return {
    flex: `0 1 ${width}px`,
    minWidth: `${minWidth}px`,
  }
}

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

type RefType = 'head' | 'local' | 'remote' | 'tag' | 'other'

interface RefItem {
  raw: string
  name: string
  displayName: string
  type: RefType
  isRemote: boolean
  isTag: boolean
}

// 解析Git引用字符串为数组
function getRefsArray(refsString: string): RefItem[] {
  if (!refsString)
    return []

  // 将引用字符串分割成数组
  const refs = refsString.split(',').map(ref => ref.trim())

  const parsedRefs = refs.map((ref) => {
    const normalized = ref.replace(/^refs\//, '')
    let name = normalized
    let displayName = normalized
    let type: RefType = 'other'
    let isTag = false
    let isRemote = false

    if (normalized.includes('remotes/')) {
      name = normalized.replace('remotes/', '')
      displayName = name
      type = 'remote'
      isRemote = true
    }
    else if (normalized.includes('heads/')) {
      name = normalized.replace('heads/', '')
      displayName = name
      type = 'local'
    }
    else if (normalized.includes('tags/')) {
      name = normalized.replace('tags/', '').replace('tag:', '')
      displayName = name
      type = 'tag'
      isTag = true
    }
    else if (normalized.includes('tag:')) {
      name = normalized.replace('tag:', '')
      displayName = name
      type = 'tag'
      isTag = true
    }
    else if (ref.startsWith('HEAD ->')) {
      name = ref.replace('HEAD -> ', '')
      displayName = name
      type = 'head'
    }
    else if (ref === 'HEAD') {
      name = 'HEAD'
      displayName = 'HEAD'
      type = 'head'
    }

    return {
      raw: ref,
      name,
      displayName,
      type,
      isRemote,
      isTag,
    } as RefItem
  })

  const typeOrder: Record<RefType, number> = {
    head: 0,
    local: 1,
    remote: 2,
    tag: 3,
    other: 4,
  }

  return parsedRefs.sort((a, b) => typeOrder[a.type] - typeOrder[b.type])
}

function getRefStyle(refItem: RefItem) {
  if (refItem.type === 'tag') {
    return {
      backgroundColor: 'var(--vscode-badge-background)',
      borderColor: 'var(--vscode-panel-border)',
      color: 'var(--vscode-badge-foreground)',
      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    }
  }

  if (refItem.type === 'head') {
    return {
      backgroundColor: '#e81123',
      borderColor: '#f1707a',
      color: '#ffffff',
      boxShadow: '0 1px 4px rgba(232,17,35,0.4)',
    }
  }

  const branchColor = getBranchColorFromGraphData(refItem.name)
  return {
    backgroundColor: branchColor,
    borderColor: branchColor,
    color: '#ffffff',
    boxShadow: `0 1px 4px ${branchColor}44`,
  }
}

function getGhostBadgeStyle(branchName: string) {
  const color = getBranchColorFromGraphData(branchName)
  return {
    backgroundColor: color,
    borderColor: color,
    color: '#ffffff',
    boxShadow: `0 1px 4px ${color}44`,
  }
}

function getRefIcons(refItem: RefItem) {
  const icons: string[] = []

  if (refItem.type === 'head') {
    icons.push('codicon-target')
  }
  else if (refItem.type === 'remote') {
    icons.push('codicon-cloud')
  }
  else if (refItem.type === 'tag') {
    icons.push('codicon-tag')
  }
  else {
    icons.push('codicon-git-branch')
  }

  return icons
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
    <div class="branch-name-col commit-cell" :style="getColumnStyle('branchName')">
      <template v-if="parsedRefs.length > 0">
        <div class="refs-container">
          <!-- First item -->
          <span
            class="ref-item"
            :class="{
              tag: parsedRefs[0].type === 'tag',
              head: parsedRefs[0].type === 'head',
              remote: parsedRefs[0].type === 'remote',
            }"
            :style="getRefStyle(parsedRefs[0])"
            :title="parsedRefs[0].displayName"
          >
            <span class="ref-icons">
              <span
                v-for="icon in getRefIcons(parsedRefs[0])"
                :key="`${parsedRefs[0].raw}-${icon}`"
                class="codicon" :class="[icon]"
              />
            </span>
            <span class="ref-text">
              {{ parsedRefs[0].displayName }}
            </span>
          </span>

          <!-- More badge -->
          <span v-if="parsedRefs.length > 1" class="ref-more-badge">
            +{{ parsedRefs.length - 1 }}
            <div class="more-refs-popup">
              <template v-for="refItem in parsedRefs.slice(1)" :key="refItem.raw">
                <span
                  class="ref-item"
                  :class="{
                    tag: refItem.type === 'tag',
                    head: refItem.type === 'head',
                    remote: refItem.type === 'remote',
                  }"
                  :style="getRefStyle(refItem)"
                  :title="refItem.displayName"
                >
                  <span class="ref-icons">
                    <span
                      v-for="icon in getRefIcons(refItem)"
                      :key="`${refItem.raw}-${icon}`"
                      class="codicon" :class="[icon]"
                    />
                  </span>
                  <span class="ref-text">
                    {{ refItem.displayName }}
                  </span>
                </span>
              </template>
            </div>
          </span>
        </div>
      </template>
      <template v-else-if="ghostBranchName">
        <div class="refs-container ghost">
          <span class="ref-item ghost" :style="getGhostBadgeStyle(ghostBranchName)">
            <span class="ref-icons">
              <span class="codicon codicon-git-branch" />
            </span>
            <span class="ref-text">
              {{ ghostBranchName }}
            </span>
          </span>
        </div>
      </template>
    </div>
    <div class="branch-col commit-cell" :style="getColumnStyle('branch')">
      <div class="branch-graph-mask">
        <GitGraph
          :graph="graph"
          :is-selected="isSelected"
          :has-branch-label="!!(commit.refs && commit.refs !== '')"
        />
      </div>
      <div class="branch-graph-shadow" />
    </div>
    <span
      class="hash-col commit-cell" :style="getColumnStyle('hash')" @mouseenter="hoveredCell = 'hash'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.hash.substring(0, 7) }}
      <CopyButton v-show="hoveredCell === 'hash'" :copy-text="commit.hash" />
    </span>

    <span
      class="commit-cell" :style="getColumnStyle('message')" @mouseenter="hoveredCell = 'message'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.message }}
      <CopyButton v-show="hoveredCell === 'message'" :copy-text="commit.message" />
    </span>

    <span class="commit-cell" :style="getColumnStyle('stats')">
      <span v-if="commit.diff" class="commit-stats">
        <span class="files">{{ commit.diff.changed }} files</span>
        <span v-if="commit.diff.insertions" class="additions">+{{ commit.diff.insertions }}</span>
        <span v-if="commit.diff.deletions" class="deletions">-{{ commit.diff.deletions }}</span>
      </span>
    </span>

    <span
      class="commit-cell" :style="getColumnStyle('author')" @mouseenter="hoveredCell = 'authorName'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.authorName }}
      <CopyButton v-show="hoveredCell === 'authorName'" :copy-text="`${commit.authorName} <${commit.authorEmail}>`" />
    </span>

    <span class="commit-cell date" :style="getColumnStyle('date')">{{ commit.date }}</span>
  </li>
</template>

<style scoped>
.commit-row {
  display: flex;
  align-items: center;
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
  height: 32px;
  line-height: 32px;
  min-width: 0;
}

.branch-col {
  position: relative;
  padding: 0px;
  z-index: 1;
  height: 32px;
}

.branch-graph-mask {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.branch-graph-shadow {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -2px;
  width: 10px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, var(--vscode-sideBar-background) 100%);
  pointer-events: none;
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
  display: flex;
  align-items: center;
  min-height: 32px;
  overflow: visible;
  position: relative;
  z-index: 3;
}

.refs-container {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  align-items: center;
  justify-content: flex-start;
  padding: 4px 8px 4px 0;
  width: 100%;
  overflow: visible;
  position: relative;
  z-index: 3;
}

.refs-container.ghost {
  justify-content: flex-start;
  position: relative;
  min-height: 24px;
}

.ref-item {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 2px 6px;
  white-space: nowrap;
  border-radius: 4px;
  font-weight: 500;
  line-height: 16px;
  max-width: 100%;
  min-width: 0;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
  z-index: 2;
}

.ref-more-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  cursor: pointer;
  position: relative;
  height: 16px;
  line-height: 16px;
  flex-shrink: 0;
  z-index: 3;
}

.ref-item.ghost {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: 1;
}

.ref-text {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  display: inline-block;
}

.commit-row:hover .refs-container.ghost .ref-item.ghost,
.commit-row.selected .refs-container.ghost .ref-item.ghost {
  opacity: 0.55;
  visibility: visible;
}

.more-refs-popup {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  box-shadow: 0 2px 8px var(--vscode-widget-shadow);
  padding: 8px;
  border-radius: 4px;
  flex-direction: column;
  gap: 4px;
  min-width: max-content;
  margin-top: 4px;
}

.ref-more-badge:hover .more-refs-popup {
  display: flex;
}
</style>
