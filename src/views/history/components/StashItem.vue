<script setup lang="ts">
import { computed } from 'vue'

import type { StashEntry } from '@/git'

const props = defineProps<{
  stash: StashEntry
  expanded?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'apply'): void
  (e: 'pop'): void
  (e: 'drop'): void
}>()

// Use the first line of the message as the title; the rest goes into the detail
const titleAndDetail = computed(() => {
  const message = props.stash.message || '(no message)'
  const lines = message.split('\n').map(s => s.trim()).filter(Boolean)
  return {
    title: lines[0] || '(no message)',
    detail: lines.slice(1).join('\n'),
  }
})

const initialChar = computed(() => {
  const name = props.stash.authorName || props.stash.branch || 'S'
  return name.trim().charAt(0).toUpperCase() || 'S'
})

// Stable color per stash index so it does not collide with history view branch colors
const accentColor = computed(() => {
  const palette = [
    '#0075ca', // Blue
    '#1db35b', // Green
    '#ffb900', // Yellow
    '#8e44ad', // Purple
    '#ff8c00', // Orange
    '#00bcf2', // Light Blue
    '#ea4c89', // Pink
    '#16a085', // Green Sea
  ]
  return palette[props.stash.index % palette.length]
})

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  // Clicking the action buttons should not trigger expand
  if (target.closest('.actions'))
    return
  emit('toggle')
}
</script>

<template>
  <li class="stash-item" :class="{ expanded }" :title="stash.message" @click="handleClick">
    <div class="row">
      <div class="avatar" :style="{ backgroundColor: accentColor }">
        {{ initialChar }}
      </div>

      <div class="main">
        <div class="header-line">
          <span class="ref-badge" :style="{ color: accentColor, borderColor: accentColor }">
            {{ stash.ref }}
          </span>
          <span v-if="stash.branch" class="branch-badge" title="Source branch">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M14 5.5C14 4.121 12.879 3 11.5 3C10.121 3 9 4.121 9 5.5C9 6.682 9.826 7.669 10.93 7.928C10.744 8.546 10.177 9 9.5 9H6.5C5.935 9 5.419 9.195 5 9.512V4.949C6.14 4.717 7 3.707 7 2.5C7 1.121 5.879 0 4.5 0C3.121 0 2 1.121 2 2.5C2 3.708 2.86 4.717 4 4.949V11.05C2.86 11.282 2 12.292 2 13.499C2 14.878 3.121 15.999 4.5 15.999C5.879 15.999 7 14.878 7 13.499C7 12.317 6.174 11.33 5.07 11.071C5.256 10.453 5.823 9.999 6.5 9.999H9.5C10.723 9.999 11.74 9.115 11.954 7.953C13.116 7.738 14 6.723 14 5.5ZM3 2.5C3 1.673 3.673 1 4.5 1C5.327 1 6 1.673 6 2.5C6 3.327 5.327 4 4.5 4C3.673 4 3 3.327 3 2.5ZM6 13.5C6 14.327 5.327 15 4.5 15C3.673 15 3 14.327 3 13.5C3 12.673 3.673 12 4.5 12C5.327 12 6 12.673 6 13.5ZM11.5 7C10.673 7 10 6.327 10 5.5C10 4.673 10.673 4 11.5 4C12.327 4 13 4.673 13 5.5C13 6.327 12.327 7 11.5 7Z" />
            </svg>
            {{ stash.branch }}
          </span>
          <span class="time" :title="stash.date">{{ stash.relativeDate || stash.date }}</span>
        </div>

        <div class="title-line">
          {{ titleAndDetail.title }}
        </div>

        <div v-if="expanded" class="expanded-detail">
          <div v-if="titleAndDetail.detail" class="detail-block">
            <pre>{{ titleAndDetail.detail }}</pre>
          </div>
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Hash</span>
              <span class="meta-value mono">{{ stash.shortHash }}</span>
            </div>
            <div v-if="stash.authorName" class="meta-item">
              <span class="meta-label">Author</span>
              <span class="meta-value">{{ stash.authorName }}</span>
            </div>
            <div v-if="stash.date" class="meta-item">
              <span class="meta-label">Date</span>
              <span class="meta-value">{{ stash.date }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="actions" @click.stop>
        <button class="action-btn primary" title="Apply stash (keep entry)" @click="emit('apply')">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.6572 3.13573C13.8583 2.9465 14.175 2.95614 14.3643 3.15722C14.5535 3.35831 14.5438 3.675 14.3428 3.86425L5.84277 11.8642C5.64597 12.0494 5.33756 12.0446 5.14648 11.8535L1.64648 8.35351C1.45121 8.15824 1.45121 7.84174 1.64648 7.64647C1.84174 7.45121 2.15825 7.45121 2.35351 7.64647L5.50976 10.8027L13.6572 3.13573Z" />
          </svg>
          <span>Apply</span>
        </button>
        <button class="action-btn" title="Pop stash (apply and drop)" @click="emit('pop')">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.854 7.14576L8.85401 2.14576C8.65901 1.95076 8.34201 1.95076 8.14701 2.14576L3.14601 7.14576C2.95101 7.34076 2.95101 7.65776 3.14601 7.85276C3.34101 8.04776 3.65801 8.04776 3.85301 7.85276L7.99901 3.70676V13.4998C7.99901 13.7758 8.22301 13.9998 8.49901 13.9998C8.77501 13.9998 8.99901 13.7758 8.99901 13.4998V3.70676L13.145 7.85276C13.243 7.95076 13.371 7.99876 13.499 7.99876C13.627 7.99876 13.755 7.94976 13.853 7.85276C14.048 7.65776 14.048 7.34076 13.853 7.14576H13.854Z" />
          </svg>
          <span>Pop</span>
        </button>
        <button class="action-btn danger" title="Drop stash" @click="emit('drop')">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z" />
          </svg>
        </button>
      </div>
    </div>
  </li>
</template>

<style scoped>
.stash-item {
  position: relative;
  padding: 10px 12px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.stash-item:hover {
  background-color: var(--vscode-list-hoverBackground);
  border-left-color: var(--vscode-focusBorder, #0075ca);
}

.stash-item.expanded {
  background-color: var(--vscode-list-inactiveSelectionBackground, rgba(127, 127, 127, 0.08));
  border-left-color: var(--vscode-focusBorder, #0075ca);
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.avatar {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  user-select: none;
  margin-top: 1px;
  box-shadow: 0 0 0 2px var(--vscode-sideBar-background);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.header-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.ref-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  height: 16px;
  line-height: 16px;
  border-radius: 8px;
  border: 1px solid currentColor;
  font-family: var(--vscode-editor-font-family);
  font-size: 10.5px;
  font-weight: 600;
  background-color: transparent;
}

.branch-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  height: 16px;
  line-height: 16px;
  border-radius: 8px;
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.18));
  color: var(--vscode-badge-foreground, var(--vscode-foreground));
  font-size: 10.5px;
  font-weight: 500;
  max-width: 160px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.time {
  margin-left: auto;
  font-size: 10.5px;
  opacity: 0.8;
}

.title-line {
  font-size: 13px;
  font-weight: 500;
  color: var(--vscode-foreground);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expanded-detail {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  background-color: var(--vscode-editor-background, rgba(127, 127, 127, 0.08));
  border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.2));
}

.detail-block pre {
  margin: 0 0 8px;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  color: var(--vscode-editor-foreground, var(--vscode-foreground));
  white-space: pre-wrap;
  word-break: break-word;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 4px 12px;
}

.meta-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11.5px;
  min-width: 0;
}

.meta-label {
  flex: 0 0 auto;
  color: var(--vscode-descriptionForeground);
  font-weight: 500;
}

.meta-value {
  flex: 1;
  color: var(--vscode-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mono {
  font-family: var(--vscode-editor-font-family);
}

/* ---------------- 操作按钮 ---------------- */
.actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transform: translateX(2px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.stash-item:hover .actions,
.stash-item.expanded .actions {
  opacity: 1;
  transform: translateX(0);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--vscode-button-border, transparent);
  background-color: var(--vscode-button-secondaryBackground, rgba(127, 127, 127, 0.15));
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  line-height: 22px;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.action-btn:hover {
  background-color: var(--vscode-button-secondaryHoverBackground, rgba(127, 127, 127, 0.28));
}

.action-btn.primary {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.action-btn.primary:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.action-btn.danger {
  padding: 0 6px;
}

.action-btn.danger:hover {
  background-color: var(--vscode-inputValidation-errorBackground, rgba(244, 71, 71, 0.2));
  color: var(--vscode-errorForeground);
}
</style>
