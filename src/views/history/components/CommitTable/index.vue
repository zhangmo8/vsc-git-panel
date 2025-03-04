<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRaw } from 'vue'
import dayjs from 'dayjs'

import ColumnHeader from './ColumnHeader.vue'
import ListItem from './ListItem.vue'

import type { Commit, GitOperation } from '@/git'
import { WEBVIEW_CHANNEL } from '@/constant'

const props = defineProps<{
  commits: Commit[]
  graphData: GitOperation[]
}>()

// Selected commit hash state
const selectedCommitHashes = ref<string[]>([])
const isDragging = ref(false)
const dragStartIndex = ref<number | null>(null)
const dragEndIndex = ref<number | null>(null)

const ITEMS_PER_PAGE = 45
const currentPage = ref(1)
const observer = ref<IntersectionObserver | null>(null)
const loadingTriggerRef = ref<HTMLElement | null>(null)

const columnWidths = ref({
  branch: 120,
  hash: 80,
  message: 200,
  stats: 140,
  author: 120,
  date: 160,
})

const commitData = computed(() => {
  return (props.commits || []).map(commit => ({
    ...commit,
    date: dayjs(commit.date).format('YYYY-MM-DD HH:mm'),
  }))
})

const visibleCommits = computed(() => {
  const end = currentPage.value * ITEMS_PER_PAGE
  return commitData.value.slice(0, end)
})

function handleCommitSelected(hash: string, index: number, event: MouseEvent) {
  if (event.shiftKey && selectedCommitHashes.value.length > 0) {
    // Range selection with shift key
    const lastSelectedIndex = visibleCommits.value.findIndex(
      commit => commit.hash === selectedCommitHashes.value[selectedCommitHashes.value.length - 1],
    )
    if (lastSelectedIndex !== -1) {
      const startIdx = Math.min(lastSelectedIndex, index)
      const endIdx = Math.max(lastSelectedIndex, index)
      const hashesToSelect = visibleCommits.value
        .slice(startIdx, endIdx + 1)
        .map(commit => commit.hash)

      // Add all hashes in range without duplicates
      selectedCommitHashes.value = [...new Set([...selectedCommitHashes.value, ...hashesToSelect])]
    }
  }
  else {
    selectedCommitHashes.value = [hash]
  }

  try {
    if (window.vscode) {
      window.vscode.postMessage({
        command: WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS,
        commitHashes: JSON.stringify(toRaw(selectedCommitHashes.value)),
      })
    }
  }
  catch (error) {
    console.error('Error sending commit details:', error)
  }
}

onMounted(() => {
  observer.value = new IntersectionObserver((entries) => {
    const target = entries[0]
    if (target.isIntersecting && currentPage.value * ITEMS_PER_PAGE < commitData.value.length) {
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
  <div class="git-graph" @mouseleave="isDragging = false">
    <ul class="commit-list">
      <ColumnHeader v-model="columnWidths" />
      <ListItem
        v-for="(commit, index) in visibleCommits" :key="commit.hash" :graph-data="graphData[index]"
        :prev-graph-data="index > 0 ? graphData[index - 1] : null"
        :next-graph-data="index < graphData.length - 1 ? graphData[index + 1] : null" :commit="commit"
        :column-widths="columnWidths" :is-selected="selectedCommitHashes.includes(commit.hash)"
        @select="(event) => handleCommitSelected(commit.hash, index, event)"
      />
      <li ref="loadingTriggerRef" class="loading-trigger">
        <div v-if="visibleCommits.length < commitData.length" class="loading-text">
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
  min-width: min-content;
}

.loading-trigger {
  padding: 8px;
  text-align: center;
}

.loading-text {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}
</style>
