<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'

import type { Commit } from '@/git'
import { WEBVIEW_CHANNEL } from '@/channel/constant'

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

function handleCommitClick(commit: Commit & { date: string }) {
  try {
    if (window.vscode) {
      window.vscode.postMessage({
        command: WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS,
        commit: {
          hash: commit.hash,
          message: commit.message,
          date: commit.date,
          stats: commit.stats,
        },
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
          v-for="commit in graphData"
          :key="commit.hash"
          class="commit-row"
          @click="handleCommitClick(commit)"
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

/* Ensure the graph lines remain visible when hovering */
tr:hover .commit-line {
  opacity: 0.8;
}
</style>
