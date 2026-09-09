<script setup lang="ts">
import { computed } from 'vue'

import type { GitWorktree } from '@/git'

const props = defineProps<{
  worktree: GitWorktree
}>()

const emit = defineEmits<{
  (e: 'contextMenu', event: MouseEvent | KeyboardEvent): void
}>()

const displayName = computed(() => {
  if (props.worktree.detached)
    return props.worktree.shortHead ? `(detached ${props.worktree.shortHead})` : '(detached)'
  return props.worktree.branch || '(no branch)'
})

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('contextMenu', event)
    return
  }
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))
    return
  event.preventDefault()
  emit('contextMenu', event)
}
</script>

<template>
  <li class="wt-item">
    <div
      class="wt-row"
      :class="{ current: worktree.isCurrent, prunable: worktree.prunable }"
      :title="worktree.path"
      tabindex="0"
      @click="emit('contextMenu', $event)"
      @contextmenu.prevent="emit('contextMenu', $event)"
      @keydown="handleKeydown"
    >
      <span class="wt-icon">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M14.5 2h-13C.67 2 0 2.67 0 3.5v9c0 .83.67 1.5 1.5 1.5h13c.83 0 1.5-.67 1.5-1.5v-9c0-.83-.67-1.5-1.5-1.5zM15 12.5c0 .28-.22.5-.5.5h-13c-.28 0-.5-.22-.5-.5v-9c0-.28.22-.5.5-.5h13c.28 0 .5.22.5.5v9zM3.5 5h9v1h-9V5zm0 3h6v1h-6V8z" />
        </svg>
      </span>

      <span class="wt-main">
        <span class="wt-title">
          <span class="wt-name">{{ displayName }}</span>
          <span v-if="worktree.isMain" class="badge main">MAIN</span>
          <span v-if="worktree.isCurrent" class="badge current">CURRENT</span>
          <span v-if="worktree.locked" class="badge locked" :title="worktree.lockReason || 'Locked'">LOCKED</span>
          <span v-if="worktree.prunable" class="badge prunable" :title="worktree.prunableReason || 'Prunable'">PRUNABLE</span>
        </span>
        <span class="wt-subtitle">
          <span v-if="worktree.shortHead" class="mono">{{ worktree.shortHead }}</span>
          <span class="wt-path">{{ worktree.path }}</span>
        </span>
      </span>
    </div>
  </li>
</template>

<style scoped>
.wt-item {
  list-style: none;
}

.wt-row {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px;
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--vscode-foreground);
  text-align: left;
  cursor: pointer;
}

.wt-row:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.wt-row:focus-visible {
  outline: 1px solid var(--vscode-focusBorder, #0075ca);
  outline-offset: -1px;
}

.wt-row.current {
  border-left-color: var(--vscode-focusBorder, #0075ca);
  background-color: var(--vscode-list-inactiveSelectionBackground, rgba(127, 127, 127, 0.08));
}

.wt-row.prunable {
  border-left-color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c);
}

.wt-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: var(--vscode-focusBorder, #0075ca);
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.16));
}

.wt-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.wt-title {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.wt-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
}

.badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 16px;
  color: #fff;
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.18));
}

.badge.main {
  background-color: var(--vscode-focusBorder, #0075ca);
}

.badge.current {
  background-color: var(--vscode-gitDecoration-addedResourceForeground, #1db35b);
}

.badge.locked {
  background-color: var(--vscode-gitDecoration-modifiedResourceForeground, #d67e00);
}

.badge.prunable {
  background-color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c);
}

.wt-subtitle {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
}

.mono {
  flex: 0 0 auto;
  font-family: var(--vscode-editor-font-family);
  font-size: 10.5px;
}

.wt-path {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
}
</style>
