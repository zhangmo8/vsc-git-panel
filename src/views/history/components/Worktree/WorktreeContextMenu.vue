<script setup lang="ts">
import { computed } from 'vue'

import type { GitWorktree, GitWorktreeAction } from '@/git'

const props = defineProps<{
  worktree: GitWorktree
  x: number
  y: number
  /** 主仓库是否为 bare（无工作树可合并）。 */
  mainIsBare?: boolean
}>()

const emit = defineEmits<{
  (e: 'action', action: GitWorktreeAction, worktree: GitWorktree): void
  (e: 'close'): void
}>()

interface MenuAction {
  action: GitWorktreeAction
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
  const wt = props.worktree
  const items: MenuAction[] = [
    {
      action: 'open',
      label: 'Open',
      disabled: wt.isCurrent,
      reason: wt.isCurrent ? 'Already open' : undefined,
    },
    { action: 'openNewWindow', label: 'Open in New Window' },
    { action: 'reveal', label: 'Reveal in File Explorer' },
    { action: 'copyPath', label: 'Copy Path' },
  ]

  if (wt.locked) {
    items.push({
      action: 'unlock',
      label: 'Unlock',
      disabled: wt.isMain,
      reason: wt.isMain ? 'Cannot unlock the main working tree' : undefined,
    })
  }
  else {
    items.push({
      action: 'lock',
      label: 'Lock',
      disabled: wt.isMain,
      reason: wt.isMain ? 'Cannot lock the main working tree' : undefined,
    })
  }

  items.push({
    action: 'merge',
    label: 'Merge into Main',
    disabled: wt.isMain || wt.detached || !wt.branch || props.mainIsBare,
    reason: wt.isMain
      ? 'This is the main working tree'
      : (props.mainIsBare
          ? 'The main repository is bare'
          : (wt.detached || !wt.branch ? 'No branch to merge' : undefined)),
  })

  items.push({
    action: 'remove',
    label: 'Remove',
    disabled: wt.isMain || wt.isCurrent,
    reason: wt.isMain
      ? 'Cannot remove the main working tree'
      : (wt.isCurrent ? 'Cannot remove the current worktree' : undefined),
    danger: true,
  })

  return items
})

let lastDispatchKey = ''
let lastDispatchAt = 0

function runAction(item: MenuAction) {
  if (item.disabled)
    return
  const dispatchKey = `${item.action}:${props.worktree.path}`
  const now = Date.now()
  if (dispatchKey === lastDispatchKey && now - lastDispatchAt < 250)
    return
  lastDispatchKey = dispatchKey
  lastDispatchAt = now
  emit('action', item.action, props.worktree)
}
</script>

<template>
  <div class="context-menu-backdrop" @click="emit('close')" />
  <div
    class="context-menu"
    role="menu"
    :style="menuStyle"
    :aria-label="`Worktree actions for ${worktree.branch || worktree.path}`"
    @pointerdown.stop
    @click.stop
    @contextmenu.prevent
  >
    <div class="context-menu-header">
      <span class="context-menu-scope" :class="{ main: worktree.isMain }">
        {{ worktree.isMain ? 'MAIN' : 'WORKTREE' }}
      </span>
      <span class="context-menu-name" :title="worktree.path">{{ worktree.branch || worktree.path }}</span>
    </div>

    <button
      v-for="item in actions"
      :key="item.action"
      class="context-menu-item"
      :class="{ danger: item.danger, unavailable: item.disabled }"
      type="button"
      role="menuitem"
      :aria-disabled="item.disabled ? 'true' : undefined"
      :title="item.reason || item.label"
      @pointerdown.prevent.stop="runAction(item)"
      @mousedown.prevent.stop="runAction(item)"
      @click.prevent.stop="runAction(item)"
    >
      <span>{{ item.label }}</span>
      <span v-if="item.disabled" class="disabled-note">N/A</span>
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
  width: 210px;
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
  background-color: var(--vscode-gitDecoration-addedResourceForeground, #1db35b);
}

.context-menu-scope.main {
  background-color: var(--vscode-focusBorder, #0075ca);
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

.context-menu-item:hover,
.context-menu-item:focus-visible {
  outline: none;
  background-color: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
  color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
}

.context-menu-item.danger:hover,
.context-menu-item.danger:focus-visible {
  color: var(--vscode-errorForeground, #f14c4c);
}

.context-menu-item.unavailable {
  color: var(--vscode-disabledForeground, var(--vscode-descriptionForeground));
  opacity: 0.72;
  cursor: default;
}

.disabled-note {
  flex: 0 0 auto;
  color: var(--vscode-descriptionForeground);
  font-size: 10px;
}
</style>
