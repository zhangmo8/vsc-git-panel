<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import ResizeHandle from '../ResizeHandle/index.vue'

import {
  COMMIT_TABLE_COLUMNS,
  DEFAULT_COLUMN_VISIBILITY,
  MIN_COLUMN_WIDTHS,
  getCommitColumnStyle,
  getFlexibleColumn,
  isCommitColumnVisible,
  normalizeColumnVisibility,
} from './columns'

import type { ColumnVisibility, ColumnWidths, CommitTableColumn } from './columns'

const columnWidths = defineModel<ColumnWidths>()
const columnVisibility = defineModel<ColumnVisibility>('visibility', {
  default: () => ({ ...DEFAULT_COLUMN_VISIBILITY }),
})

const isDragging = ref(false)
const isColumnMenuOpen = ref(false)
const currentColumn = ref<CommitTableColumn>()
const startX = ref(0)
const startWidth = ref(0)

const activeColumnVisibility = computed(() => normalizeColumnVisibility(columnVisibility.value))
const visibleColumns = computed(() => {
  return COMMIT_TABLE_COLUMNS.filter(column => isCommitColumnVisible(activeColumnVisibility.value, column.key))
})
const visibleColumnCount = computed(() => visibleColumns.value.length)
const flexibleColumn = computed(() => getFlexibleColumn(activeColumnVisibility.value))

function getColumnStyle(column: CommitTableColumn) {
  return getCommitColumnStyle(column, columnWidths.value, flexibleColumn.value)
}

function handleDragStart(e: MouseEvent, column: CommitTableColumn) {
  e.preventDefault()
  e.stopPropagation()

  isDragging.value = true
  currentColumn.value = column
  startX.value = e.clientX
  startWidth.value = columnWidths.value?.[column] || 0

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

  if (!currentColumn.value || !columnWidths.value)
    return

  const diff = e.clientX - startX.value
  const minWidth = MIN_COLUMN_WIDTHS[currentColumn.value]
  const newWidth = Math.max(minWidth, startWidth.value + diff)

  columnWidths.value[currentColumn.value] = newWidth
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

function toggleColumnMenu() {
  isColumnMenuOpen.value = !isColumnMenuOpen.value
}

function isLastVisibleColumn(column: CommitTableColumn) {
  return activeColumnVisibility.value[column] && visibleColumnCount.value <= 1
}

function toggleColumnVisibility(column: CommitTableColumn) {
  if (isLastVisibleColumn(column))
    return

  columnVisibility.value = {
    ...activeColumnVisibility.value,
    [column]: !activeColumnVisibility.value[column],
  }
}

function handleDocumentClick() {
  isColumnMenuOpen.value = false
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    isColumnMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleDocumentKeydown)
  handleDragEnd()
})
</script>

<template>
  <li class="commit-header">
    <span
      v-for="column in visibleColumns"
      :key="column.key"
      class="column-header"
      :class="{ 'hash-col': column.key === 'hash' }"
      :style="getColumnStyle(column.key)"
    >
      {{ column.label }}
      <ResizeHandle :is-active="currentColumn === column.key" @mousedown="handleDragStart($event, column.key)" />
    </span>

    <div class="column-visibility" @click.stop>
      <button
        type="button"
        class="column-visibility-button"
        :class="{ active: isColumnMenuOpen }"
        title="Show columns"
        aria-label="Show columns"
        @click="toggleColumnMenu"
      >
        <svg class="column-visibility-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2.5 3C2.224 3 2 3.224 2 3.5S2.224 4 2.5 4h11c.276 0 .5-.224.5-.5S13.776 3 13.5 3h-11ZM4 7.5c0-.276.224-.5.5-.5h7c.276 0 .5.224.5.5S11.776 8 11.5 8h-7A.5.5 0 0 1 4 7.5ZM6 11.5c0-.276.224-.5.5-.5h3c.276 0 .5.224.5.5s-.224.5-.5.5h-3a.5.5 0 0 1-.5-.5Z" />
        </svg>
      </button>
      <div v-if="isColumnMenuOpen" class="column-visibility-menu">
        <label
          v-for="column in COMMIT_TABLE_COLUMNS"
          :key="column.key"
          class="column-visibility-item"
          :class="{ disabled: isLastVisibleColumn(column.key) }"
        >
          <input
            type="checkbox"
            :checked="activeColumnVisibility[column.key]"
            :disabled="isLastVisibleColumn(column.key)"
            @change="toggleColumnVisibility(column.key)"
          >
          <span>{{ column.label }}</span>
        </label>
      </div>
    </div>
  </li>
</template>

<style scoped>
.commit-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  height: 32px;
  background-color: color-mix(in srgb, var(--vscode-sideBar-background) 94%, var(--vscode-editor-background));
  border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  z-index: 5;
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
  color: var(--vscode-descriptionForeground);
}

.column-visibility {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 7;
}

.column-visibility-button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 78%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--vscode-sideBar-background) 82%, var(--vscode-editor-background));
  color: var(--vscode-descriptionForeground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.column-visibility-icon {
  display: block;
  width: 14px;
  height: 14px;
  pointer-events: none;
}

.column-visibility-button:hover,
.column-visibility-button.active {
  border-color: color-mix(in srgb, var(--vscode-focusBorder) 72%, transparent);
  background-color: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.column-visibility-menu {
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
  min-width: 148px;
  padding: 5px;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  background-color: var(--vscode-editorWidget-background, var(--vscode-editor-background));
  box-shadow: 0 8px 24px var(--vscode-widget-shadow);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.column-visibility-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 7px;
  border-radius: 4px;
  color: var(--vscode-foreground);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
}

.column-visibility-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.column-visibility-item.disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.column-visibility-item input {
  margin: 0;
  accent-color: var(--vscode-focusBorder);
}
</style>
