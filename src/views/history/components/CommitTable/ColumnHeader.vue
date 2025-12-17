<script setup lang="ts">
import { ref } from 'vue'
import ResizeHandle from '../ResizeHandle/index.vue'

interface ColumnWidths {
  branch: number
  branchName: number
  hash: number
  message: number
  stats: number
  author: number
  date: number
}

const FLEXIBLE_COLUMN: keyof ColumnWidths = 'branchName'
const MIN_WIDTHS: Record<keyof ColumnWidths, number> = {
  branchName: 80,
  branch: 60,
  hash: 60,
  message: 110,
  stats: 90,
  author: 70,
  date: 90,
}

const modelValue = defineModel<ColumnWidths>()
const isDragging = ref(false)
const currentColumn = ref<keyof ColumnWidths>()
const startX = ref(0)
const startWidth = ref(0)

function getColumnStyle(column: keyof ColumnWidths) {
  const width = modelValue.value?.[column] ?? MIN_WIDTHS[column]
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
    }
  }

  return {
    flex: `0 1 ${width}px`,
    minWidth: `${minWidth}px`,
  }
}

function handleDragStart(e: MouseEvent, column: keyof ColumnWidths) {
  e.preventDefault()
  e.stopPropagation()

  isDragging.value = true
  currentColumn.value = column
  startX.value = e.clientX
  startWidth.value = modelValue.value?.[column] || 0

  document.addEventListener('mousemove', handleDragging, { passive: false })
  document.addEventListener('mouseup', handleDragEnd, { once: true })
  document.addEventListener('mouseleave', handleDragEnd, { once: true })

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
  const minWidth = MIN_WIDTHS[currentColumn.value!]
  const newWidth = Math.max(minWidth, startWidth.value + diff)

  modelValue.value![currentColumn.value!] = newWidth
}

function handleDragEnd() {
  if (!isDragging.value)
    return

  isDragging.value = false
  currentColumn.value = undefined

  document.removeEventListener('mousemove', handleDragging)
  document.removeEventListener('mouseup', handleDragEnd)
  document.removeEventListener('mouseleave', handleDragEnd)

  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}
</script>

<template>
  <li class="commit-header">
    <span class="column-header" :style="getColumnStyle('branchName')">
      Refs
      <ResizeHandle :is-active="currentColumn === 'branchName'" @mousedown="handleDragStart($event, 'branchName')" />
    </span>
    <span class="column-header" :style="getColumnStyle('branch')">
      Graph
      <ResizeHandle :is-active="currentColumn === 'branch'" @mousedown="handleDragStart($event, 'branch')" />
    </span>
    <span class="hash-col column-header" :style="getColumnStyle('hash')">
      CommitId
      <ResizeHandle :is-active="currentColumn === 'hash'" @mousedown="handleDragStart($event, 'hash')" />
    </span>
    <span class="column-header" :style="getColumnStyle('message')">
      Message
      <ResizeHandle :is-active="currentColumn === 'message'" @mousedown="handleDragStart($event, 'message')" />
    </span>
    <span class="column-header" :style="getColumnStyle('stats')">
      Changes
      <ResizeHandle :is-active="currentColumn === 'stats'" @mousedown="handleDragStart($event, 'stats')" />
    </span>
    <span class="column-header" :style="getColumnStyle('author')">
      Author
      <ResizeHandle :is-active="currentColumn === 'author'" @mousedown="handleDragStart($event, 'author')" />
    </span>
    <span class="column-header" :style="getColumnStyle('date')">
      Date
      <ResizeHandle :is-active="currentColumn === 'date'" @mousedown="handleDragStart($event, 'date')" />
    </span>
  </li>
</template>

<style scoped>
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
  padding: 8px 0px;
  z-index: 2;
}

.column-header {
  user-select: none;
  position: relative;
  box-sizing: border-box;
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  min-width: 0;
}

.hash-col {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}
</style>
