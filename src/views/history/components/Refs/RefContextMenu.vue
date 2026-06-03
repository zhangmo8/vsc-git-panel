<script setup lang="ts">
import { computed } from 'vue'

import type { GitBranchAction, GitBranchRef } from '@/git'

const props = defineProps<{
  branch: GitBranchRef
  x: number
  y: number
}>()

const emit = defineEmits<{
  (e: 'action', action: GitBranchAction, branch: GitBranchRef): void
  (e: 'close'): void
}>()

interface MenuAction {
  action: GitBranchAction
  label: string
  disabled?: boolean
  reason?: string
  danger?: boolean
}

const menuStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}))

const actions = computed<MenuAction[]>(() => {
  const isRemote = props.branch.type === 'remote'

  return [
    {
      action: 'switch',
      label: isRemote ? 'Switch and Track' : 'Switch',
      disabled: props.branch.current,
      reason: props.branch.current ? 'Already on this branch' : undefined,
    },
    {
      action: 'pull',
      label: isRemote ? 'Fetch Remote' : 'Pull',
      disabled: !isRemote && !props.branch.upstream,
      reason: !isRemote && !props.branch.upstream ? 'No upstream branch configured' : undefined,
    },
    {
      action: 'delete',
      label: 'Delete',
      disabled: props.branch.current,
      reason: props.branch.current ? 'Cannot delete the current branch' : undefined,
      danger: true,
    },
    {
      action: 'rename',
      label: 'Rename',
    },
    {
      action: 'clone',
      label: 'Clone',
    },
    {
      action: 'push',
      label: 'Push',
      disabled: isRemote,
      reason: isRemote ? 'Push is only available for local branches' : undefined,
    },
  ]
})

function runAction(item: MenuAction) {
  if (item.disabled)
    return

  emit('action', item.action, props.branch)
}
</script>

<template>
  <div class="context-menu-backdrop" @click="emit('close')" />
  <div
    class="context-menu"
    role="menu"
    :style="menuStyle"
    :aria-label="`Branch actions for ${branch.name}`"
    @pointerdown.stop
    @click.stop
    @contextmenu.prevent
  >
    <div class="context-menu-header">
      <span class="context-menu-scope" :class="branch.type">
        {{ branch.type === 'local' ? 'LOCAL' : 'REMOTE' }}
      </span>
      <span class="context-menu-name" :title="branch.name">{{ branch.name }}</span>
    </div>

    <button
      v-for="item in actions"
      :key="item.action"
      class="context-menu-item"
      :class="{ danger: item.danger }"
      type="button"
      role="menuitem"
      :disabled="item.disabled"
      :title="item.reason || item.label"
      @pointerdown.stop
      @click="runAction(item)"
    >
      <span>{{ item.label }}</span>
      <span v-if="item.disabled" class="disabled-note">Unavailable</span>
    </button>
  </div>
</template>

<style scoped>
.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}

.context-menu {
  position: fixed;
  z-index: 21;
  width: 190px;
  padding: 4px;
  border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
  border-radius: 6px;
  background-color: var(--vscode-menu-background, var(--vscode-editorWidget-background));
  color: var(--vscode-menu-foreground, var(--vscode-foreground));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.context-menu-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 7px 7px;
  border-bottom: 1px solid var(--vscode-menu-separatorBackground, var(--vscode-panel-border));
  margin-bottom: 3px;
}

.context-menu-scope {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border-radius: 3px;
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0;
}

.context-menu-scope.local {
  background-color: var(--vscode-focusBorder, #0075ca);
}

.context-menu-scope.remote {
  background-color: var(--vscode-gitDecoration-addedResourceForeground, #1db35b);
}

.context-menu-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
}

.context-menu-item {
  width: 100%;
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.context-menu-item:hover:not(:disabled),
.context-menu-item:focus-visible:not(:disabled) {
  outline: none;
  background-color: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
  color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
}

.context-menu-item.danger:hover:not(:disabled),
.context-menu-item.danger:focus-visible:not(:disabled) {
  color: var(--vscode-errorForeground, #f14c4c);
}

.context-menu-item:disabled {
  color: var(--vscode-disabledForeground, var(--vscode-descriptionForeground));
  cursor: not-allowed;
  opacity: 0.55;
}

.disabled-note {
  flex: 0 0 auto;
  color: var(--vscode-descriptionForeground);
  font-size: 10px;
}
</style>
