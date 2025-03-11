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
const selectedCommitHashes = defineModel<string[]>({ default: [] })

const isDragging = ref(false)
const selectionStart = ref<number | null>(null)
const dragEndIndex = ref<number>(0)

const ITEMS_PER_PAGE = 45
const currentPage = ref(1)
const observer = ref<IntersectionObserver | null>(null)
const loadingTriggerRef = ref<HTMLElement | null>(null)

const columnWidths = ref({
  branch: 120,
  branchName: 140, // 新增: 分支名和标签列
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

// 计算所有活跃分支
const activeBranches = computed(() => {
  const branches = new Set<string>()

  // 收集所有图表数据中的分支信息
  props.graphData.forEach((operation) => {
    // 当前分支
    if (operation.branch) {
      branches.add(operation.branch)
    }

    // 目标分支
    if (operation.targetBranch) {
      branches.add(operation.targetBranch)
    }

    // 源分支列表
    if (operation.sourceBranches && operation.sourceBranches.length) {
      operation.sourceBranches.forEach(branch => branches.add(branch))
    }
  })

  // 收集所有提交中的分支引用信息
  props.commits.forEach(commit => {
    if (commit.refs) {
      const refsList = commit.refs.split(',').map(ref => ref.trim())
      
      refsList.forEach(ref => {
        // 处理各种分支格式
        if (!ref.includes('tag:') && !ref.includes('refs/tags/')) {
          let branchName = ref
          
          // 清理分支名称
          if (ref.includes('refs/heads/')) {
            branchName = ref.replace('refs/heads/', '')
          }
          else if (ref.includes('refs/remotes/')) {
            branchName = ref.replace('refs/remotes/', '')
          }
          
          branches.add(branchName)
        }
      })
    }
  })

  return Array.from(branches)
})

function handleCommitSelected(hash: string, index: number, event: MouseEvent) {
  isDragging.value = true

  if (event.shiftKey && selectedCommitHashes.value.length > 0) {
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
  else if (event.ctrlKey || event.metaKey) {
    if (selectedCommitHashes.value.includes(hash)) {
      selectedCommitHashes.value = selectedCommitHashes.value.filter(h => h !== hash)
    }
    else {
      selectedCommitHashes.value.push(hash)
    }
  }
  else {
    selectedCommitHashes.value = [hash]
  }

  handleMouseUp()
}

function handleMouseDown(index: number, event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.copy-button')) {
    return
  }

  if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
    isDragging.value = true
    selectionStart.value = index
    dragEndIndex.value = index
    selectedCommitHashes.value = [visibleCommits.value[index].hash]
  }
}

function handleMouseOver(index: number) {
  if (isDragging.value && selectionStart.value !== null) {
    const startIdx = Math.min(selectionStart.value, index)
    const endIdx = Math.max(selectionStart.value, index)
    const hashesToSelect = visibleCommits.value
      .slice(startIdx, endIdx + 1)
      .map(commit => commit.hash)

    selectedCommitHashes.value = hashesToSelect
  }
}

function handleMouseUp() {
  const wasDragging = isDragging.value

  isDragging.value = false

  if (wasDragging) {
    try {
      window.vscode.postMessage({
        command: WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS,
        commitHashes: JSON.stringify(toRaw(selectedCommitHashes.value)),
      })
    }
    catch (error) {
      console.error('Error sending commit details:', error)
    }
  }

  // 最后重置选择起点
  selectionStart.value = null
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
  <div :class="{ dragging: isDragging }" class="git-graph" @mouseleave="handleMouseUp" @mouseup="handleMouseUp">
    <ul class="commit-list">
      <ColumnHeader v-model="columnWidths" />
      <ListItem
        v-for="(commit, index) in visibleCommits" :key="commit.hash" :commit="commit"
        :graph-data="graphData[index]" :column-widths="columnWidths"
        :active-branches="activeBranches"
        :is-selected="selectedCommitHashes.includes(commit.hash)" :class="{
          'being-dragged': isDragging && selectionStart !== null
            && ((index >= selectionStart && index <= dragEndIndex)
              || (index <= selectionStart && index >= dragEndIndex)),
        }" @select="(event) => handleCommitSelected(commit.hash, index, event)"
        @mousedown="(event: MouseEvent) => handleMouseDown(index, event)"
        @mouseover="() => isDragging && handleMouseOver(index)"
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
  user-select: none;
  /* Prevent text selection during drag */
}

.dragging {
  cursor: col-resize;
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

.being-dragged {
  background-color: var(--vscode-list-activeSelectionBackground, rgba(0, 0, 0, 0.1));
}
</style>
