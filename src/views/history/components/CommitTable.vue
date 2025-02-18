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
    <ul class="commit-list">
      <li class="commit-header">
        <span class="hash-col">CommitId</span>
        <span class="message-col">Message</span>
        <span class="stats-col">Changes</span>
        <span class="author">Author</span>
        <span class="date">Date</span>
      </li>
      <li
        v-for="commit in visibleCommits"
        :key="commit.hash"
        class="commit-row"
        @click="handleCommitClick(commit)"
        @dblclick="handleDoubleClick"
      >
        <span class="hash-col">{{ commit.hash.substring(0, 7) }}</span>
        <span class="message-col">{{ commit.message }}</span>
        <span class="stats-col">
          <span v-if="commit.stats" class="commit-stats">
            <span class="files">{{ commit.stats.files }} files</span>
            <span v-if="commit.stats.additions" class="additions">+{{ commit.stats.additions }}</span>
            <span v-if="commit.stats.deletions" class="deletions">-{{ commit.stats.deletions }}</span>
          </span>
        </span>
        <span class="author">{{ commit.authorName }}</span>
        <span class="date">{{ commit.date }}</span>
      </li>
      <li ref="loadingTriggerRef" class="loading-trigger">
        <div v-if="visibleCommits.length < graphData.length" class="loading-text">
          Loading more commits...
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.git-graph {
  width: 100%;
  overflow: auto;
  font-family: var(--vscode-editor-font-family);
}

.commit-list {
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
}

.commit-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  padding: 8px;
  background-color: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  font-weight: bold;
}

.commit-row {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
  cursor: pointer;
  gap: 5px;
}

.commit-row:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.hash-col {
  width: 80px;
  padding-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-row .hash-col {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.commit-row .hash-col:hover {
  text-decoration: underline;
}

.message-col {
  flex: 1;
  padding-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stats-col {
  width: 140px;
  padding-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.author {
  width: 120px;
  padding-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.date {
  width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.loading-trigger {
  text-align: center;
  padding: 8px;
}

.loading-text {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

/* Ensure the graph lines remain visible when hovering */
.commit-row:hover .commit-line {
  opacity: 0.8;
}
</style>
