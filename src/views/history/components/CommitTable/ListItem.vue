<script setup lang="ts">
import { ref } from 'vue'
// import GitGraph from './GitGraph.vue'
import CopyButton from '../CopyButton/index.vue'

import { WEBVIEW_CHANNEL } from '@/constant'

import type { Commit, GitOperation } from '@/git'

const props = defineProps<{
  commit: Commit
  graphData: GitOperation
  prevGraphData?: GitOperation
  nextGraphData?: GitOperation
  columnWidths: Record<string, number>
  isSelected?: boolean
}>()

const emit = defineEmits(['select'])

const hoveredCell = ref<string | null>(null)

function handleCommitClick() {
  // Emit the selection event
  emit('select')

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
    class="commit-row"
    :class="{ selected: isSelected }"
    @click="handleCommitClick"
    @dblclick="handleDoubleClick"
  >
    <!-- <div class="branch-col commit-cell" :style="{ width: `${columnWidths.branch}px` }">
      <GitGraph
        :graph-data="graphData"
        :prev-graph-data="prevGraphData"
        :next-graph-data="nextGraphData"
      />
    </div> -->
    <span
      class="hash-col commit-cell" :style="{ width: `${columnWidths.hash}px` }" @mouseenter="hoveredCell = 'hash'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.hash.substring(0, 7) }}
      <CopyButton v-show="hoveredCell === 'hash'" :copy-text="commit.hash" />
    </span>

    <span
      class="commit-cell" :style="{ width: `${columnWidths.message}px` }" @mouseenter="hoveredCell = 'message'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.message }}
      <CopyButton v-show="hoveredCell === 'message'" :copy-text="commit.message" />
    </span>

    <span class="commit-cell" :style="{ width: `${columnWidths.stats}px` }">
      <span v-if="commit.diff" class="commit-stats">
        <span class="files">{{ commit.diff.changed }} files</span>
        <span v-if="commit.diff.insertions" class="additions">+{{ commit.diff.insertions }}</span>
        <span v-if="commit.diff.deletions" class="deletions">-{{ commit.diff.deletions }}</span>
      </span>
    </span>

    <span
      class="commit-cell" :style="{ width: `${columnWidths.author}px` }" @mouseenter="hoveredCell = 'authorName'"
      @mouseleave="hoveredCell = null"
    >
      {{ commit.authorName }}
      <CopyButton v-show="hoveredCell === 'authorName'" :copy-text="`${commit.authorName} <${commit.authorEmail}>`" />
    </span>

    <span class="commit-cell date" :style="{ width: `${columnWidths.date}px` }">{{ commit.date }}</span>
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
  position: relative;
}

.commit-row:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.commit-row.selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.commit-row.selected .hash-col {
  color: var(--vscode-list-activeSelectionForeground);
}

.commit-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 8px;
  position: relative;
}

.branch-col {
  position: relative;
  padding: 0px;
  z-index: 1;
}

.hash-col {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.commit-stats {
  font-size: 0.85em;
  display: flex;
  gap: 8px;
}

.additions {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.deletions {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.date {
  color: var(--vscode-descriptionForeground);
  font-size: 0.9em;
}
</style>
