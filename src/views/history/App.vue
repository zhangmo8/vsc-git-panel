<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import CommitTable from './components/CommitTable/index.vue'
import Empty from './components/Empty.vue'

import { CHANNEL, WEBVIEW_CHANNEL } from '@/constant'

import type { Commit, CommitGraph, GitHistoryFilter } from '@/git'

declare global {
  interface Window {
    vscode: WebviewApi<State>
  }
}

interface State {
  commits: CommitGraph
  selectedHash?: string
  filter?: GitHistoryFilter
}

const commits = ref<CommitGraph>()
const error = ref<string>('')

const searchText = ref<string>('')
const selectedBranch = ref<string>('') // 改为单选分支
const isLoading = ref<boolean>(false)
const currentPage = ref<number>(1)
const pageSize = ref<number>(45)
const allCommits = ref<Commit[]>([]) // 累积所有已加载的提交
const hasMoreData = ref<boolean>(true) // 是否还有更多数据
const availableBranches = ref<string[]>([]) // 可用分支
// VSCode webview API
const vscode = acquireVsCodeApi<State>()
window.vscode = vscode

const selectedCommitHashes = ref<string[]>([])

// 应用筛选
function applyFilter(resetPage: boolean = true) {
  const filter: GitHistoryFilter = {}

  if (searchText.value.trim()) {
    filter.search = searchText.value.trim()
  }

  if (selectedBranch.value) {
    filter.branches = [selectedBranch.value]
  }

  if (resetPage) {
    currentPage.value = 1
    allCommits.value = []
    hasMoreData.value = true
  }

  filter.page = currentPage.value
  filter.pageSize = pageSize.value

  isLoading.value = true
  vscode.postMessage({
    command: WEBVIEW_CHANNEL.GET_HISTORY,
    forceRefresh: true,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  })
}

// 搜索按钮点击事件
function handleSearchClick() {
  applyFilter(true) // 搜索时重置页面
}

// 处理回车键搜索
function handleSearchKeyup(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    applyFilter(true) // 搜索时重置页面
  }
}

// 清除筛选
function clearFilter() {
  searchText.value = ''
  selectedBranch.value = ''
  currentPage.value = 1 // 重置页面
  allCommits.value = [] // 清空累积数据
  hasMoreData.value = true // 重置数据状态
  isLoading.value = true

  applyFilter(true)
}

function loadMoreData() {
  if (isLoading.value || !hasMoreData.value)
    return

  currentPage.value++
  applyFilter(false)
}

watch(() => selectedBranch.value, () => {
  applyFilter(true)
})

// Handle messages from extension
window.addEventListener('message', (event: { data: any }) => {
  const message = event.data

  switch (message.command) {
    case CHANNEL.HISTORY: {
      commits.value = message.commits as CommitGraph

      const newCommits = commits.value?.logResult.all || []

      if (currentPage.value === 1) {
        allCommits.value = [...newCommits]
      }
      else {
        allCommits.value = [...allCommits.value, ...newCommits]
      }

      hasMoreData.value = newCommits.length === pageSize.value

      isLoading.value = false // 停止加载状态
      break
    }
    case CHANNEL.CLEAR_SELECTED:
      selectedCommitHashes.value = []
      break
    case CHANNEL.BRANCHES:
      availableBranches.value = message.branches || []
      break
    case 'error':
      error.value = message.message
      isLoading.value = false // 出错时也停止加载状态
      break
  }
})

onMounted(() => {
  vscode.postMessage({ command: WEBVIEW_CHANNEL.GET_ALL_BRANCHES })
  applyFilter(true)
})

const transformedCommits = computed(() => {
  return Array.from(allCommits.value || []) || []
})

// 计算筛选状态
const hasActiveFilter = computed(() => {
  return searchText.value.trim() || selectedBranch.value
})
</script>

<template>
  <div class="git-panel">
    <div class="toolbar">
      <!-- 搜索框和分支筛选 -->
      <div class="filter-row">
        <div class="search-container">
          <input
            v-model="searchText"
            type="text"
            placeholder="搜索提交信息或 SHA..."
            class="search-input"
            :disabled="isLoading"
            @keyup="handleSearchKeyup"
          >
          <button
            class="search-button"
            :disabled="isLoading"
            title="搜索"
            @click="handleSearchClick"
          >
            <svg v-if="!isLoading" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M15.7 13.3l-3.81-3.83A5.93 5.93 0 0 0 13 6c0-3.31-2.69-6-6-6S1 2.69 1 6s2.69 6 6 6c1.3 0 2.48-.41 3.47-1.11l3.83 3.81c.19.2.45.3.7.3.25 0 .52-.09.7-.3a.996.996 0 0 0 0-1.4zM7 10.7c-2.59 0-4.7-2.11-4.7-4.7 0-2.59 2.11-4.7 4.7-4.7 2.59 0 4.7 2.11 4.7 4.7 0 2.59-2.11 4.7-4.7 4.7z" />
            </svg>
            <div v-else class="loading-spinner">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="9.42" stroke-dashoffset="9.42">
                  <animateTransform attributeName="transform" dur="1s" type="rotate" values="0 8 8;360 8 8" repeatCount="indefinite" />
                </circle>
              </svg>
            </div>
          </button>
        </div>
        <select
          v-model="selectedBranch"
          class="branch-select"
          :disabled="isLoading"
        >
          <option value="">
            所有分支
          </option>
          <option
            v-for="branch in availableBranches"
            :key="branch"
            :value="branch"
          >
            {{ branch }}
          </option>
        </select>
        <button
          v-if="hasActiveFilter"
          class="clear-button"
          title="清除筛选"
          :disabled="isLoading"
          @click="clearFilter"
        >
          ✕
        </button>
      </div>
    </div>

    <template v-if="!isLoading && transformedCommits.length === 0">
      <Empty class="git-graph-container" />
    </template>
    <template v-else>
      <CommitTable
        v-model="selectedCommitHashes"
        :commits="transformedCommits"
        :graph-data="commits?.operations || []"
        :has-more-data="hasMoreData"
        :on-load-more="loadMoreData"
        class="git-graph-container"
      />
    </template>

    <div v-if="error" class="error">
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
.git-panel {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--vscode-sideBar-background);
}

.toolbar {
  border-bottom: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-sideBar-background);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}

.search-container {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}

.search-input {
  flex: 1;
  padding: 4px 36px 4px 8px;
  border: 1px solid var(--vscode-input-border);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  outline: none;
  border-radius: 2px;
  font-size: 13px;
  transition: border-color 0.2s ease;
}

.search-input:focus {
  border-color: var(--vscode-focusBorder);
}

.search-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.search-button {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--vscode-input-foreground);
  cursor: pointer;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: all 0.2s ease;
}

.search-button:hover:not(:disabled) {
  opacity: 1;
  background-color: var(--vscode-toolbar-hoverBackground);
}

.search-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
}

.branch-select {
  min-width: 120px;
  padding: 4px 8px;
  border: 1px solid var(--vscode-input-border);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  outline: none;
  border-radius: 2px;
  font-size: 13px;
  transition: border-color 0.2s ease;
}

.branch-select:focus {
  border-color: var(--vscode-focusBorder);
}

.branch-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.clear-button {
  padding: 4px 8px;
  border: 1px solid var(--vscode-button-border);
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
  border-radius: 2px;
  font-size: 12px;
  min-width: 24px;
  transition: background-color 0.2s ease;
}

.clear-button:hover:not(:disabled) {
  background-color: var(--vscode-button-hoverBackground);
}

.clear-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.git-graph-container {
  flex: 1;
  overflow: auto;
}

.error {
  color: var(--vscode-errorForeground);
  background-color: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  margin: 8px;
  border-radius: 2px;
  font-size: 12px;
}
</style>
