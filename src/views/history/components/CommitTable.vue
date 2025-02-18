<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import dayjs from 'dayjs'

import type { Commit } from '@/git'
import { WEBVIEW_CHANNEL } from '@/constant'

const props = defineProps<{
  commits: Commit[]
}>()

// interface CommitNode {
//   commit: Commit
//   column: number
//   parents: { hash: string, fromColumn: number, toColumn: number }[]
//   color: string
//   branchName?: string
//   isHead?: boolean
//   isBranch?: boolean
//   isMerge?: boolean
// }

const ITEMS_PER_PAGE = 45
const currentPage = ref(1)
const observer = ref<IntersectionObserver | null>(null)
const loadingTriggerRef = ref<HTMLElement | null>(null)

// 列宽度状态
const columnWidths = ref({
  hash: 80,
  message: 400, // 给定初始宽度，不再使用 flex: 1
  stats: 140,
  author: 120,
  date: 160,
})

// 拖拽状态
const isDragging = ref(false)
const currentColumn = ref('')
const startX = ref(0)
const startWidth = ref(0)

function handleDragStart(e: MouseEvent, column: string) {
  e.preventDefault()
  e.stopPropagation()

  isDragging.value = true
  currentColumn.value = column
  startX.value = e.clientX
  startWidth.value = columnWidths.value[column]

  document.addEventListener('mousemove', handleDragging, { passive: false })
  document.addEventListener('mouseup', handleDragEnd, { once: true })
  document.addEventListener('mouseleave', handleDragEnd, { once: true })
  document.addEventListener('keydown', handleKeyDown)

  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function handleDragging(e: MouseEvent) {
  if (!isDragging.value) {
    handleDragEnd()
    return
  }

  e.preventDefault()
  e.stopPropagation()

  const diff = e.clientX - startX.value
  const newWidth = Math.max(100, startWidth.value + diff)
  columnWidths.value[currentColumn.value] = newWidth
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    handleDragEnd()
  }
}

function handleDragEnd() {
  if (!isDragging.value)
    return

  isDragging.value = false
  currentColumn.value = ''

  document.removeEventListener('mousemove', handleDragging)
  document.removeEventListener('mouseup', handleDragEnd)
  document.removeEventListener('mouseleave', handleDragEnd)
  document.removeEventListener('keydown', handleKeyDown)

  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

function handleCommitClick(commit: Commit & { date: string }) {
  try {
    if (window.vscode) {
      window.vscode.postMessage({
        command: WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS,
        commitHash: commit.hash,
      })
    }
  }
  catch (error) {
    console.error('Error sending commit details:', error)
  }
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

// Calculate branch positions and paths
// const COLUMN_WIDTH = 14
// const DOT_SIZE = 6
// const BRANCH_COLORS = [
//   'var(--vscode-charts-blue)',
//   'var(--vscode-charts-red)',
//   'var(--vscode-charts-yellow)',
//   'var(--vscode-charts-orange)',
//   'var(--vscode-charts-purple)',
//   'var(--vscode-charts-green)',
// ]

const graphData = computed(() => {
  return (props.commits || []).map(commit => ({
    ...commit,
    date: dayjs(commit.date).format('YYYY-MM-DD HH:mm'),
  }))
})

const visibleCommits = computed(() => {
  const end = currentPage.value * ITEMS_PER_PAGE
  return graphData.value.slice(0, end)
})

onMounted(() => {
  observer.value = new IntersectionObserver((entries) => {
    const target = entries[0]
    if (target.isIntersecting && currentPage.value * ITEMS_PER_PAGE < graphData.value.length) {
      currentPage.value++
    }
  })

  if (loadingTriggerRef.value) {
    observer.value.observe(loadingTriggerRef.value)
  }
})

onUnmounted(() => {
  if (observer.value) {
    observer.value.disconnect()
  }
  if (isDragging.value) {
    handleDragEnd()
  }
})
</script>

<template>
  <div class="git-graph">
    <ul class="commit-list" :class="{ dragging: isDragging }">
      <li class="commit-header">
        <span class="hash-col column-header" :style="{ width: `${columnWidths.hash}px` }">
          CommitId
          <div
            class="resize-handle"
            :class="{ active: currentColumn === 'hash' }"
            @mousedown="handleDragStart($event, 'hash')"
          />
        </span>
        <span class="message-col column-header" :style="{ width: `${columnWidths.message}px` }">
          Message
          <div
            class="resize-handle"
            :class="{ active: currentColumn === 'message' }"
            @mousedown="handleDragStart($event, 'message')"
          />
        </span>
        <span class="stats-col column-header" :style="{ width: `${columnWidths.stats}px` }">
          Changes
          <div
            class="resize-handle"
            :class="{ active: currentColumn === 'stats' }"
            @mousedown="handleDragStart($event, 'stats')"
          />
        </span>
        <span class="author column-header" :style="{ width: `${columnWidths.author}px` }">
          Author
          <div
            class="resize-handle"
            :class="{ active: currentColumn === 'author' }"
            @mousedown="handleDragStart($event, 'author')"
          />
        </span>
        <span class="date column-header">
          Date
        </span>
      </li>
      <li
        v-for="commit in visibleCommits"
        :key="commit.hash"
        class="commit-row"
        @click="handleCommitClick(commit)"
        @dblclick="handleDoubleClick"
      >
        <span class="hash-col" :style="{ width: `${columnWidths.hash}px` }">{{ commit.hash.substring(0, 7) }}</span>
        <span class="message-col" :style="{ width: `${columnWidths.message}px` }">{{ commit.message }}</span>
        <span class="stats-col" :style="{ width: `${columnWidths.stats}px` }">
          <span v-if="commit.stats" class="commit-stats">
            <span class="files">{{ commit.stats.files }} files</span>
            <span v-if="commit.stats.additions" class="additions">+{{ commit.stats.additions }}</span>
            <span v-if="commit.stats.deletions" class="deletions">-{{ commit.stats.deletions }}</span>
          </span>
        </span>
        <span class="author" :style="{ width: `${columnWidths.author}px` }">{{ commit.authorName }}</span>
        <span class="date" :style="{ width: `${columnWidths.date}px` }">{{ commit.date }}</span>
      </li>
      <li ref="loadingTriggerRef" class="loading-trigger">
        <div v-if="visibleCommits.length < graphData.length" class="loading-text">
          Loading more commits...
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.git-graph {
  width: 100%;
  overflow: auto;
  font-family: var(--vscode-editor-font-family);
}

.commit-list {
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  min-width: min-content;
}

.commit-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  background-color: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  font-weight: bold;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  z-index: 2;
}

.commit-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--vscode-panel-border);
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
}

.commit-row:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.column-header,
.hash-col,
.message-col,
.stats-col,
.author,
.date {
  position: relative;
  box-sizing: border-box;
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
}

.column-header {
  user-select: none;
}

.hash-col {
  width: 80px;
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.message-col {
  min-width: 100px;
}

.stats-col {
  width: 140px;
}

.author {
  width: 120px;
}

.date {
  width: 160px;
  padding-right: 16px;
  color: var(--vscode-descriptionForeground);
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  cursor: col-resize;
  background: var(--vscode-scrollbarSlider-hoverBackground);
  opacity: 0.6;
  z-index: 1;
  transition: background-color 0.1s ease;
}

.resize-handle:hover {
  background: var(--vscode-activityBar-activeBorder);
  opacity: 0.8;
}

.resize-handle.active {
  background: var(--vscode-activityBar-activeBorder);
  opacity: 1;
}

.commit-list.dragging {
  cursor: col-resize;
}

.commit-list.dragging .resize-handle.active {
  display: block;
  background: var(--vscode-activityBar-activeBorder);
  opacity: 1;
}

.commit-stats {
  display: inline-flex;
  gap: 8px;
  font-size: 12px;
  white-space: nowrap;
}

.additions {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.deletions {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.loading-trigger {
  padding: 8px;
  text-align: center;
}

.loading-text {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}
</style>
