<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import dayjs from 'dayjs'

import type { Commit } from '@/git'
import { WEBVIEW_CHANNEL } from '@/constant'

const props = defineProps<{
  commits: Commit[]
}>()

// interface CommitNode {
//   commit: Commit
//   column: number
//   parents: { hash: string, fromColumn: number, toColumn: number }[]
//   color: string
//   branchName?: string
//   isHead?: boolean
//   isBranch?: boolean
//   isMerge?: boolean
// }

const ITEMS_PER_PAGE = 45
const currentPage = ref(1)
const observer = ref<IntersectionObserver | null>(null)
const loadingTriggerRef = ref<HTMLElement | null>(null)

function handleCommitClick(commit: Commit & { date: string }) {
  try {
    if (window.vscode) {
      window.vscode.postMessage({
        command: WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS,
        commitHash: commit.hash,
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

// Calculate branch positions and paths
// const COLUMN_WIDTH = 14
// const DOT_SIZE = 6
// const BRANCH_COLORS = [
//   'var(--vscode-charts-blue)',
//   'var(--vscode-charts-red)',
//   'var(--vscode-charts-yellow)',
//   'var(--vscode-charts-orange)',
//   'var(--vscode-charts-purple)',
//   'var(--vscode-charts-green)',
// ]

const graphData = computed(() => {
  return (props.commits || []).map(commit => ({
    ...commit,
    date: dayjs(commit.date).format('YYYY-MM-DD HH:mm'),
  }))
})

const visibleCommits = computed(() => {
  const end = currentPage.value * ITEMS_PER_PAGE
  return graphData.value.slice(0, end)
})

onMounted(() => {
  observer.value = new IntersectionObserver((entries) => {
    const target = entries[0]
    if (target.isIntersecting && currentPage.value * ITEMS_PER_PAGE < graphData.value.length) {
      currentPage.value++
    }
  })

  if (loadingTriggerRef.value) {
    observer.value.observe(loadingTriggerRef.value)
  }
})

onUnmounted(() => {
  if (observer.value) {
    observer.value.disconnect()
  }
})
</script>

<template>
  <div class="git-graph">
    <table>
      <thead>
        <tr>
          <th class="hash-col">
            CommitId
          </th>
          <th class="message-col">
            Message
          </th>
          <th class="stats-col">
            Changes
          </th>
          <th>Author</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="commit in visibleCommits"
          :key="commit.hash"
          class="commit-row"
          @click="handleCommitClick(commit)"
          @dblclick="handleDoubleClick"
        >
          <td class="hash-col">
            {{ commit.hash.substring(0, 7) }}
          </td>
          <td class="message-col">
            {{ commit.message }}
          </td>
          <td class="stats-col">
            <span v-if="commit.stats" class="commit-stats">
              <span class="files">{{ commit.stats.files }} files</span>
              <span v-if="commit.stats.additions" class="additions">+{{ commit.stats.additions }}</span>
              <span v-if="commit.stats.deletions" class="deletions">-{{ commit.stats.deletions }}</span>
            </span>
          </td>
          <td class="author">
            {{ commit.authorName }}
          </td>
          <td class="date">
            {{ commit.date }}
          </td>
        </tr>
        <tr ref="loadingTriggerRef" class="loading-trigger">
          <td colspan="5" class="loading-cell">
            <div v-if="visibleCommits.length < graphData.length" class="loading-text">
              Loading more commits...
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.git-graph {
  width: 100%;
  overflow: auto;
  font-family: var(--vscode-editor-font-family);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  border-bottom: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-sideBar-background);
}

td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
  vertical-align: middle;
}

.graph-col {
  padding: 0;
}

.hash-col {
  width: 80px;
  padding: 4px 8px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

td.hash-col:hover {
  text-decoration: underline;
}

.message-col {
  min-width: 200px;
  max-width: 400px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.author-col {
  width: 120px;
}

.date-col {
  width: 150px;
}

.commit-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.additions {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.deletions {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.author {
  white-space: nowrap;
}

.date {
  white-space: nowrap;
  color: var(--vscode-descriptionForeground);
}

tr:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.loading-cell {
  text-align: center;
  padding: 8px;
  color: var(--vscode-descriptionForeground);
}

.loading-text {
  font-size: 12px;
}

/* Ensure the graph lines remain visible when hovering */
tr:hover .commit-line {
  opacity: 0.8;
}
</style>
