<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import dayjs from 'dayjs'

import ColumnHeader from './ColumnHeader.vue'
import ListItem from './ListItem.vue'

import type { Commit } from '@/git'

const props = defineProps<{
  commits: Commit[]
}>()

const ITEMS_PER_PAGE = 45
const currentPage = ref(1)
const observer = ref<IntersectionObserver | null>(null)
const loadingTriggerRef = ref<HTMLElement | null>(null)

const columnWidths = ref({
  hash: 80,
  message: 200,
  stats: 140,
  author: 120,
  date: 160,
})

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
      <ColumnHeader v-model="columnWidths" />
      <ListItem v-for="commit in visibleCommits" :key="commit.hash" :commit="commit" :column-widths="columnWidths" />
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
