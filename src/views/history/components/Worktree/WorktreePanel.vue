<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'

import WorktreeContextMenu from './WorktreeContextMenu.vue'
import WorktreeListItem from './WorktreeListItem.vue'

import type { GitWorktree, GitWorktreeAction } from '@/git'

const props = defineProps<{
  worktrees: GitWorktree[]
  loading?: boolean
  search: string
}>()

const emit = defineEmits<{
  (e: 'update:search', value: string): void
  (e: 'refresh'): void
  (e: 'add'): void
  (e: 'worktreeAction', action: GitWorktreeAction, worktree: GitWorktree): void
}>()

const contextMenuWorktree = shallowRef<GitWorktree | null>(null)
const contextMenuX = shallowRef(0)
const contextMenuY = shallowRef(0)

const keyword = computed(() => props.search.trim().toLowerCase())

const filteredWorktrees = computed(() => {
  if (!keyword.value)
    return props.worktrees
  return props.worktrees.filter((wt) => {
    return [wt.path, wt.branch || '', wt.head || '', wt.shortHead || '']
      .some(value => value.toLowerCase().includes(keyword.value))
  })
})

const mainCount = computed(() => props.worktrees.filter(wt => wt.isMain).length)
const linkedCount = computed(() => props.worktrees.filter(wt => !wt.isMain).length)
const mainIsBare = computed(() => props.worktrees.some(wt => wt.isMain && wt.bare))
const hasSearch = computed(() => !!keyword.value)
const hasContextMenu = computed(() => contextMenuWorktree.value !== null)

function clearSearch() {
  emit('update:search', '')
}

function getEventPoint(event: MouseEvent | KeyboardEvent) {
  if ('clientX' in event && (event.clientX !== 0 || event.clientY !== 0))
    return { x: event.clientX, y: event.clientY }

  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  if (!rect)
    return { x: 12, y: 12 }
  return { x: rect.left + 24, y: rect.top + 24 }
}

function openContextMenu(worktree: GitWorktree, event: MouseEvent | KeyboardEvent) {
  event.preventDefault()
  const point = getEventPoint(event)
  const menuWidth = 210
  const menuHeight = 280
  const maxX = Math.max(8, window.innerWidth - menuWidth - 8)
  const maxY = Math.max(8, window.innerHeight - menuHeight - 8)
  contextMenuWorktree.value = worktree
  contextMenuX.value = Math.max(8, Math.min(point.x, maxX))
  contextMenuY.value = Math.max(8, Math.min(point.y, maxY))
}

function closeContextMenu() {
  contextMenuWorktree.value = null
}

function runWorktreeAction(action: GitWorktreeAction, worktree: GitWorktree) {
  emit('worktreeAction', action, worktree)
  closeContextMenu()
}

function handleDocumentClick() {
  closeContextMenu()
}

function handleDocumentScroll() {
  closeContextMenu()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    closeContextMenu()
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('scroll', handleDocumentScroll, true)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('scroll', handleDocumentScroll, true)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div class="wt-panel">
    <div class="wt-toolbar">
      <div class="search-container">
        <input
          :value="search"
          class="search-input"
          type="text"
          placeholder="Search worktrees..."
          :disabled="loading"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        >
        <button v-if="hasSearch" class="search-button" title="Clear search" @click="clearSearch">
          x
        </button>
      </div>

      <button class="icon-action-button" :disabled="loading" title="Add worktree" @click="emit('add')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z" />
        </svg>
      </button>

      <button class="icon-action-button" :disabled="loading" title="Refresh worktrees" @click="emit('refresh')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3 8C3 5.23858 5.23858 3 8 3C9.63527 3 11.0878 3.78495 12.0005 5H10C9.72386 5 9.5 5.22386 9.5 5.5C9.5 5.77614 9.72386 6 10 6H12.8904C12.8973 6.00014 12.9041 6.00014 12.911 6H13C13.2761 6 13.5 5.77614 13.5 5.5V2.5C13.5 2.22386 13.2761 2 13 2C12.7239 2 12.5 2.22386 12.5 2.5V4.03138C11.4009 2.78613 9.79253 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.1301 14 13.6999 11.6035 13.9756 8.54488C14.0003 8.26985 13.7975 8.0268 13.5225 8.00202C13.2474 7.97723 13.0044 8.1801 12.9796 8.45512C12.75 11.003 10.6079 13 8 13C5.23858 13 3 10.7614 3 8Z" />
        </svg>
      </button>
    </div>

    <div v-if="worktrees.length > 0 || loading" class="wt-status">
      <span class="status-pill">{{ filteredWorktrees.length }} / {{ worktrees.length }}</span>
      <span class="status-hint">{{ linkedCount }} linked · {{ mainCount }} main</span>
    </div>

    <div class="wt-content">
      <template v-if="loading && worktrees.length === 0">
        <div class="loading-state">
          <div class="loader" />
          <span>Loading worktrees...</span>
        </div>
      </template>

      <template v-else>
        <div v-if="filteredWorktrees.length === 0" class="empty-state">
          <div class="empty-title">
            {{ hasSearch ? 'No matching worktree' : 'No worktrees' }}
          </div>
          <div class="empty-sub">
            {{ hasSearch ? 'Try a different keyword' : 'Add a worktree to check out a branch in a separate directory' }}
          </div>
        </div>

        <ul v-else class="wt-list">
          <WorktreeListItem
            v-for="wt in filteredWorktrees"
            :key="wt.path"
            :worktree="wt"
            @context-menu="openContextMenu(wt, $event)"
          />
        </ul>
      </template>
    </div>

    <WorktreeContextMenu
      v-if="hasContextMenu && contextMenuWorktree"
      :worktree="contextMenuWorktree"
      :main-is-bare="mainIsBare"
      :x="contextMenuX"
      :y="contextMenuY"
      @action="runWorktreeAction"
      @close="closeContextMenu"
    />
  </div>
</template>

<style scoped>
.wt-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wt-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-sideBar-background);
}

.search-container {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  position: relative;
}

.search-input {
  flex: 1;
  min-width: 0;
  min-height: 26px;
  padding: 4px 32px 4px 8px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  outline: none;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
}

.search-input:focus {
  border-color: var(--vscode-focusBorder);
}

.search-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.search-button {
  position: absolute;
  right: 2px;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  transform: translateY(-50%);
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--vscode-input-foreground);
  cursor: pointer;
  opacity: 0.7;
}

.search-button:hover {
  opacity: 1;
  background-color: var(--vscode-toolbar-hoverBackground);
}

.icon-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background-color: transparent;
  color: var(--vscode-icon-foreground, var(--vscode-foreground));
  cursor: pointer;
}

.icon-action-button:hover:not(:disabled) {
  background-color: var(--vscode-toolbar-hoverBackground, rgba(127, 127, 127, 0.15));
}

.icon-action-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wt-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  color: var(--vscode-badge-foreground, var(--vscode-foreground));
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.15));
  font-weight: 500;
}

.status-hint {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.wt-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
}

.wt-list {
  margin: 0;
  padding: 4px 0 8px;
}

.loading-state,
.empty-state {
  height: 100%;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}

.loader {
  width: 18px;
  height: 18px;
  border: 2px solid var(--vscode-progressBar-background, rgba(127, 127, 127, 0.35));
  border-top-color: var(--vscode-focusBorder, #0075ca);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.empty-title {
  color: var(--vscode-foreground);
  font-size: 14px;
  font-weight: 500;
}

.empty-sub {
  max-width: 260px;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
