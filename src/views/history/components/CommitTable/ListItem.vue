<script setup lang="ts">
import { WEBVIEW_CHANNEL } from '@/constant'
import type { Commit } from '@/git'

const props = defineProps<{
  commit: Commit
  columnWidths: Record<string, number>
}>()

function handleCommitClick() {
  try {
    if (window.vscode) {
      window.vscode.postMessage({
        command: WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS,
        commitHash: props.commit.hash,
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
</script>

<template>
  <li
    class="commit-row" @click="handleCommitClick"
    @dblclick="handleDoubleClick"
  >
    <span class="hash-col" :style="{ width: `${columnWidths.hash}px` }">{{ commit.hash.substring(0, 7) }}</span>
    <span :style="{ width: `${columnWidths.message}px` }">{{ commit.message }}</span>
    <span :style="{ width: `${columnWidths.stats}px` }">
      <span v-if="commit.stats" class="commit-stats">
        <span class="files">{{ commit.stats.files }} files</span>
        <span v-if="commit.stats.additions" class="additions">+{{ commit.stats.additions }}</span>
        <span v-if="commit.stats.deletions" class="deletions">-{{ commit.stats.deletions }}</span>
      </span>
    </span>
    <span :style="{ width: `${columnWidths.author}px` }">{{ commit.authorName }}</span>
    <span class="date" :style="{ width: `${columnWidths.date}px` }">{{ commit.date }}</span>
  </li>
</template>

<style scoped>
.commit-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--vscode-panel-border);
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;

}

.commit-row:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.hash-col {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.date {
  padding-right: 16px;
  color: var(--vscode-descriptionForeground);
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
</style>
