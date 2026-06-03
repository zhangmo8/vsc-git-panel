<script setup lang="ts">
import { computed } from 'vue'

import type { GitBranchRef } from '@/git'

const props = defineProps<{
  branch: GitBranchRef
  showRemote?: boolean
}>()

const emit = defineEmits<{
  (e: 'contextMenu', event: MouseEvent | KeyboardEvent): void
}>()

const displayName = computed(() => {
  if (!props.branch.remote)
    return props.branch.name

  const prefix = `${props.branch.remote}/`
  return props.branch.name.startsWith(prefix)
    ? props.branch.name.slice(prefix.length)
    : props.branch.name
})

const dateLabel = computed(() => {
  if (!props.branch.date)
    return ''

  const date = new Date(props.branch.date)
  if (Number.isNaN(date.getTime()))
    return props.branch.date

  const year = date.getFullYear()
  const currentYear = new Date().getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

  return year === currentYear
    ? `${month}-${day} ${time}`
    : `${year}-${month}-${day} ${time}`
})

const fullDateLabel = computed(() => {
  if (!props.branch.date)
    return ''

  const date = new Date(props.branch.date)
  if (Number.isNaN(date.getTime()))
    return props.branch.date

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
})

const trackingLabel = computed(() => {
  const parts: string[] = []
  if (props.branch.ahead)
    parts.push(`+${props.branch.ahead}`)
  if (props.branch.behind)
    parts.push(`-${props.branch.behind}`)
  return parts.join(' ')
})

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))
    return

  event.preventDefault()
  emit('contextMenu', event)
}
</script>

<template>
  <li class="ref-item">
    <div
      class="ref-row"
      :class="[branch.type, { current: branch.current }]"
      :title="branch.name"
      tabindex="0"
      @contextmenu.prevent="emit('contextMenu', $event)"
      @keydown="handleKeydown"
    >
      <span class="ref-icon" :class="branch.type">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M14 5.5C14 4.121 12.879 3 11.5 3C10.121 3 9 4.121 9 5.5C9 6.682 9.826 7.669 10.93 7.928C10.744 8.546 10.177 9 9.5 9H6.5C5.935 9 5.419 9.195 5 9.512V4.949C6.14 4.717 7 3.707 7 2.5C7 1.121 5.879 0 4.5 0C3.121 0 2 1.121 2 2.5C2 3.708 2.86 4.717 4 4.949V11.05C2.86 11.282 2 12.292 2 13.499C2 14.878 3.121 15.999 4.5 15.999C5.879 15.999 7 14.878 7 13.499C7 12.317 6.174 11.33 5.07 11.071C5.256 10.453 5.823 9.999 6.5 9.999H9.5C10.723 9.999 11.74 9.115 11.954 7.953C13.116 7.738 14 6.723 14 5.5ZM3 2.5C3 1.673 3.673 1 4.5 1C5.327 1 6 1.673 6 2.5C6 3.327 5.327 4 4.5 4C3.673 4 3 3.327 3 2.5ZM6 13.5C6 14.327 5.327 15 4.5 15C3.673 15 3 14.327 3 13.5C3 12.673 3.673 12 4.5 12C5.327 12 6 12.673 6 13.5ZM11.5 7C10.673 7 10 6.327 10 5.5C10 4.673 10.673 4 11.5 4C12.327 4 13 4.673 13 5.5C13 6.327 12.327 7 11.5 7Z" />
        </svg>
      </span>

      <span class="ref-main">
        <span class="ref-title">
          <span class="ref-name">{{ displayName }}</span>
          <span class="scope-badge" :class="branch.type">
            {{ branch.type === 'local' ? 'LOCAL' : 'REMOTE' }}
          </span>
          <span v-if="branch.current" class="current-badge">HEAD</span>
          <span v-if="showRemote && branch.remote" class="remote-badge">{{ branch.remote }}</span>
        </span>
        <span class="ref-subtitle">
          <span v-if="branch.upstream" class="meta-chip" :title="branch.upstream">
            {{ branch.upstream }}
          </span>
          <span v-if="trackingLabel" class="meta-chip tracking">{{ trackingLabel }}</span>
          <span v-if="branch.commit" class="mono">{{ branch.commit }}</span>
          <span v-if="branch.subject" class="subject">{{ branch.subject }}</span>
        </span>
      </span>

      <span v-if="dateLabel" class="ref-date" :title="fullDateLabel || branch.date">{{ dateLabel }}</span>
    </div>
  </li>
</template>

<style scoped>
.ref-item {
  list-style: none;
}

.ref-row {
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
}

.ref-row:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.ref-row:focus-visible {
  outline: 1px solid var(--vscode-focusBorder, #0075ca);
  outline-offset: -1px;
}

.ref-row.local {
  border-left-color: var(--vscode-focusBorder, #0075ca);
  background-image: linear-gradient(90deg, rgba(0, 117, 202, 0.12), transparent 42px);
}

.ref-row.remote {
  border-left-color: var(--vscode-gitDecoration-addedResourceForeground, #1db35b);
  background-image: linear-gradient(90deg, rgba(29, 179, 91, 0.12), transparent 42px);
}

.ref-row.current {
  background-color: var(--vscode-list-inactiveSelectionBackground, rgba(127, 127, 127, 0.08));
}

.ref-icon {
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

.ref-icon.remote {
  color: var(--vscode-gitDecoration-addedResourceForeground, #1db35b);
  border-radius: 50%;
}

.ref-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ref-title {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.ref-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
}

.current-badge,
.remote-badge,
.scope-badge,
.meta-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 10.5px;
  line-height: 16px;
  color: var(--vscode-badge-foreground, var(--vscode-foreground));
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.18));
}

.current-badge {
  color: #fff;
  background-color: var(--vscode-focusBorder, #0075ca);
}

.scope-badge {
  border-radius: 3px;
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
}

.scope-badge.local {
  background-color: var(--vscode-focusBorder, #0075ca);
}

.scope-badge.remote {
  background-color: var(--vscode-gitDecoration-addedResourceForeground, #1db35b);
}

.ref-subtitle {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
}

.meta-chip {
  max-width: 140px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tracking {
  color: var(--vscode-gitDecoration-modifiedResourceForeground, #ffb900);
}

.mono {
  flex: 0 0 auto;
  font-family: var(--vscode-editor-font-family);
  font-size: 10.5px;
}

.subject {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ref-date {
  flex: 0 0 auto;
  color: var(--vscode-descriptionForeground);
  font-size: 10.5px;
  opacity: 0.85;
}
</style>
