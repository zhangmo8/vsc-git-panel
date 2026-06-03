<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw, watch } from 'vue'

import CommitTable from './components/CommitTable/index.vue'
import Empty from './components/Empty.vue'
import FilterSelect from './components/FilterSelect.vue'
import RefPanel from './components/Refs/RefPanel.vue'
import StashItem from './components/StashItem.vue'

import { getVscodeApi } from './utils'

import { CHANNEL, WEBVIEW_CHANNEL } from '@/constant'

import type { Commit, CommitGraph, GitBranchAction, GitBranchRef, GitHistoryFilter, GitOperation, GitRefsSummary, StashEntry } from '@/git'

declare global {
  interface Window {
    vscode: WebviewApi<State>
  }
}

const commits = ref<CommitGraph>()
const error = ref<string>('')

const searchText = ref<string>('')
const selectedBranch = ref<string>('') // 改为单选分支
const selectedAuthor = ref<string>('') // 作者筛选
const isLoading = ref<boolean>(false)
const currentPage = ref<number>(1)
const pageSize = ref<number>(45)
const allCommits = ref<Commit[]>([]) // 累积所有已加载的提交
const allOperations = ref<GitOperation[]>([]) // 累积所有已加载的操作
const hasMoreData = ref<boolean>(true) // 是否还有更多数据
const availableBranches = ref<string[]>([]) // 可用分支
const availableAuthors = ref<string[]>([]) // 可用作者
// VSCode webview API
const vscode = getVscodeApi()
window.vscode = vscode

const selectedCommitHashes = ref<string[]>([])
const scrollToHash = ref<string>('')
let latestHistoryRequestId = 0
let suppressFilterWatch = false

// ---------------- Stash 面板 ----------------
type TabKey = 'history' | 'stash' | 'branches' | 'remotes'
const activeTab = ref<TabKey>('history')
const stashes = ref<StashEntry[]>([])
const isStashLoading = ref<boolean>(false)
const stashSearch = ref<string>('')
const expandedStashRef = ref<string>('')
const gitRefs = ref<GitRefsSummary>({ branches: [], remotes: [] })
const isRefsLoading = ref<boolean>(false)
const refsSearch = ref<string>('')
const fetchingRemote = ref<string>('')

const filteredStashes = computed(() => {
  const keyword = stashSearch.value.trim().toLowerCase()
  if (!keyword)
    return stashes.value
  return stashes.value.filter((item) => {
    return (
      item.message.toLowerCase().includes(keyword)
      || item.branch.toLowerCase().includes(keyword)
      || item.shortHash.toLowerCase().includes(keyword)
      || item.hash.toLowerCase().includes(keyword)
      || item.ref.toLowerCase().includes(keyword)
      || item.authorName.toLowerCase().includes(keyword)
    )
  })
})

const hasStashFilter = computed(() => !!stashSearch.value.trim())

function loadStashList() {
  isStashLoading.value = true
  vscode.postMessage({ command: WEBVIEW_CHANNEL.GET_STASH_LIST })
}

function loadGitRefs() {
  isRefsLoading.value = true
  vscode.postMessage({ command: WEBVIEW_CHANNEL.GET_GIT_REFS })
}

function fetchRemote(remoteName: string) {
  fetchingRemote.value = remoteName
  vscode.postMessage({ command: WEBVIEW_CHANNEL.FETCH_REMOTE, remote: remoteName })
}

function runBranchAction(action: GitBranchAction, branch: GitBranchRef) {
  vscode.postMessage({ command: WEBVIEW_CHANNEL.RUN_BRANCH_ACTION, action, branch })
}

function clearStashSearch() {
  stashSearch.value = ''
}

function applyStash(item: StashEntry) {
  vscode.postMessage({ command: WEBVIEW_CHANNEL.APPLY_STASH, ref: item.ref })
}

function popStash(item: StashEntry) {
  vscode.postMessage({ command: WEBVIEW_CHANNEL.POP_STASH, ref: item.ref })
}

function dropStash(item: StashEntry) {
  vscode.postMessage({ command: WEBVIEW_CHANNEL.DROP_STASH, ref: item.ref })
}

function clearAllStash() {
  vscode.postMessage({ command: WEBVIEW_CHANNEL.CLEAR_STASH })
}

function toggleStashExpand(item: StashEntry) {
  expandedStashRef.value = expandedStashRef.value === item.ref ? '' : item.ref
  // Selecting a stash also shows its file changes in the Git Changes panel
  vscode.postMessage({
    command: WEBVIEW_CHANNEL.SHOW_STASH_DETAILS,
    ref: item.ref,
    message: item.message,
    branch: item.branch,
    date: item.date,
    authorName: item.authorName,
    authorEmail: item.authorEmail,
  })
}

function switchTab(tab: TabKey) {
  if (activeTab.value === tab)
    return
  activeTab.value = tab
  // Clear Git Changes panel selection when switching tabs to avoid stale view
  expandedStashRef.value = ''
  selectedCommitHashes.value = []
  if (tab === 'stash') {
    loadStashList()
  }
  else if (tab === 'branches' || tab === 'remotes') {
    loadGitRefs()
  }
}

// 应用筛选
function applyFilter(resetPage: boolean = true) {
  const filter: GitHistoryFilter = {}

  if (searchText.value.trim()) {
    filter.search = searchText.value.trim()
  }

  if (selectedBranch.value) {
    filter.branches = [selectedBranch.value]
  }

  if (selectedAuthor.value) {
    filter.author = selectedAuthor.value
  }

  if (resetPage) {
    currentPage.value = 1
    allCommits.value = []
    hasMoreData.value = true
  }

  filter.page = currentPage.value
  filter.pageSize = pageSize.value

  const requestedPage = currentPage.value

  const requestId = ++latestHistoryRequestId

  isLoading.value = true
  error.value = ''
  vscode.postMessage({
    command: WEBVIEW_CHANNEL.GET_HISTORY,
    forceRefresh: true,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    requestId,
    page: requestedPage,
    resetPage,
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
  selectedAuthor.value = ''
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
  if (suppressFilterWatch)
    return
  applyFilter(true)
})

watch(() => selectedAuthor.value, () => {
  if (suppressFilterWatch)
    return
  applyFilter(true)
})

async function backToHead(head: { hash: string, branch: string }) {
  // Ensure history tab is visible when triggered while on the stash tab
  activeTab.value = 'history'
  expandedStashRef.value = ''

  suppressFilterWatch = true
  searchText.value = head.branch ? '' : head.hash
  selectedAuthor.value = ''
  selectedBranch.value = head.branch || ''
  selectedCommitHashes.value = [head.hash]
  scrollToHash.value = ''
  await nextTick()
  scrollToHash.value = head.hash
  await nextTick()
  suppressFilterWatch = false
  applyFilter(true)
}

// Handle messages from extension
window.addEventListener('message', (event: { data: any }) => {
  const message = event.data

  switch (message.command) {
    case CHANNEL.HISTORY: {
      if (typeof message.requestId === 'number' && message.requestId !== latestHistoryRequestId) {
        break
      }

      commits.value = message.commits as CommitGraph

      const newCommits = toRaw(commits.value?.logResult.all) || []
      const newOperations = toRaw(commits.value?.operations) || []
      const _commits = toRaw(allCommits.value) || []
      const _operations = toRaw(allOperations.value) || []

      const responsePage = typeof message.page === 'number' ? message.page : currentPage.value
      const shouldReset = message.resetPage === true || responsePage === 1

      if (shouldReset) {
        allCommits.value = [...newCommits]
        allOperations.value = [...newOperations]
      }
      else {
        allCommits.value = [..._commits, ...newCommits]
        allOperations.value = [..._operations, ...newOperations]
      }

      hasMoreData.value = newCommits.length === pageSize.value

      isLoading.value = false // 停止加载状态
      break
    }
    case CHANNEL.CLEAR_SELECTED:
      selectedCommitHashes.value = []
      break
    case CHANNEL.BACK_TO_HEAD:
      void backToHead(message.head)
      break
    case CHANNEL.BRANCHES:
      availableBranches.value = message.branches || []
      break
    case CHANNEL.AUTHORS:
      availableAuthors.value = message.authors || []
      break
    case CHANNEL.STASH_LIST:
      stashes.value = (message.stashes as StashEntry[]) || []
      isStashLoading.value = false
      break
    case CHANNEL.GIT_REFS:
      gitRefs.value = (message.refs as GitRefsSummary) || { branches: [], remotes: [] }
      isRefsLoading.value = false
      fetchingRemote.value = ''
      break
    case CHANNEL.ERROR:
      if (typeof message.requestId === 'number' && message.requestId !== latestHistoryRequestId) {
        break
      }
      error.value = message.message
      isLoading.value = false // 出错时也停止加载状态
      isStashLoading.value = false
      isRefsLoading.value = false
      fetchingRemote.value = ''
      break
  }
})

onMounted(() => {
  vscode.postMessage({ command: WEBVIEW_CHANNEL.GET_ALL_BRANCHES })
  vscode.postMessage({ command: WEBVIEW_CHANNEL.GET_ALL_AUTHORS })
  applyFilter(true)
  // 后台预拉取 stash 列表，切到 stash tab 时无感
  loadStashList()
  loadGitRefs()
})

const transformedCommits = computed(() => {
  return Array.from(allCommits.value || []) || []
})

// 计算筛选状态
const hasActiveFilter = computed(() => {
  return searchText.value.trim() || selectedBranch.value || selectedAuthor.value
})
</script>

<template>
  <div class="git-panel">
    <!-- 顶部 Tab 切换 -->
    <div class="tabs">
      <button
        class="tab"
        :class="{ active: activeTab === 'history' }"
        @click="switchTab('history')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M7.99909 3C10.7605 3 12.9991 5.23858 12.9991 8C12.9991 10.7614 10.7605 13 7.99909 13C5.39117 13 3.2491 11.003 3.0195 8.45512C2.99471 8.1801 2.75167 7.97723 2.47664 8.00202C2.20161 8.0268 1.99875 8.26985 2.02353 8.54488C2.29916 11.6035 4.86898 14 7.99909 14C11.3128 14 13.9991 11.3137 13.9991 8C13.9991 4.68629 11.3128 2 7.99909 2C6.20656 2 4.59815 2.78613 3.49909 4.03138V2.5C3.49909 2.22386 3.27524 2 2.99909 2C2.72295 2 2.49909 2.22386 2.49909 2.5V5.5C2.49909 5.77614 2.72295 6 2.99909 6H3.08812C3.09498 6.00014 3.10184 6.00014 3.10868 6H5.99909C6.27524 6 6.49909 5.77614 6.49909 5.5C6.49909 5.22386 6.27524 5 5.99909 5H3.99863C4.91128 3.78495 6.36382 3 7.99909 3ZM7.99909 5.5C7.99909 5.22386 7.77524 5 7.49909 5C7.22295 5 6.99909 5.22386 6.99909 5.5V8.5C6.99909 8.77614 7.22295 9 7.49909 9H9.49909C9.77524 9 9.99909 8.77614 9.99909 8.5C9.99909 8.22386 9.77524 8 9.49909 8H7.99909V5.5Z" />
        </svg>
        <span>History</span>
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'stash' }"
        @click="switchTab('stash')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M6.5 8C6.22386 8 6 8.22386 6 8.5C6 8.77614 6.22386 9 6.5 9H9.5C9.77614 9 10 8.77614 10 8.5C10 8.22386 9.77614 8 9.5 8H6.5ZM1 3.5C1 2.67157 1.67157 2 2.5 2H13.5C14.3284 2 15 2.67157 15 3.5V4.5C15 5.15311 14.5826 5.70873 14 5.91465V11.5C14 12.8807 12.8807 14 11.5 14H4.5C3.11929 14 2 12.8807 2 11.5V5.91465C1.4174 5.70873 1 5.15311 1 4.5V3.5ZM2.5 3C2.22386 3 2 3.22386 2 3.5V4.5C2 4.77614 2.22386 5 2.5 5H13.5C13.7761 5 14 4.77614 14 4.5V3.5C14 3.22386 13.7761 3 13.5 3H2.5ZM3 6V11.5C3 12.3284 3.67157 13 4.5 13H11.5C12.3284 13 13 12.3284 13 11.5V6H3Z" />
        </svg>
        <span>Stash</span>
        <span v-if="stashes.length > 0" class="tab-badge">{{ stashes.length }}</span>
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'branches' }"
        @click="switchTab('branches')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M14 5.5C14 4.121 12.879 3 11.5 3C10.121 3 9 4.121 9 5.5C9 6.682 9.826 7.669 10.93 7.928C10.744 8.546 10.177 9 9.5 9H6.5C5.935 9 5.419 9.195 5 9.512V4.949C6.14 4.717 7 3.707 7 2.5C7 1.121 5.879 0 4.5 0C3.121 0 2 1.121 2 2.5C2 3.708 2.86 4.717 4 4.949V11.05C2.86 11.282 2 12.292 2 13.499C2 14.878 3.121 15.999 4.5 15.999C5.879 15.999 7 14.878 7 13.499C7 12.317 6.174 11.33 5.07 11.071C5.256 10.453 5.823 9.999 6.5 9.999H9.5C10.723 9.999 11.74 9.115 11.954 7.953C13.116 7.738 14 6.723 14 5.5ZM3 2.5C3 1.673 3.673 1 4.5 1C5.327 1 6 1.673 6 2.5C6 3.327 5.327 4 4.5 4C3.673 4 3 3.327 3 2.5ZM6 13.5C6 14.327 5.327 15 4.5 15C3.673 15 3 14.327 3 13.5C3 12.673 3.673 12 4.5 12C5.327 12 6 12.673 6 13.5ZM11.5 7C10.673 7 10 6.327 10 5.5C10 4.673 10.673 4 11.5 4C12.327 4 13 4.673 13 5.5C13 6.327 12.327 7 11.5 7Z" />
        </svg>
        <span>Branches</span>
        <span v-if="gitRefs.branches.length > 0" class="tab-badge">{{ gitRefs.branches.length }}</span>
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'remotes' }"
        @click="switchTab('remotes')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.75 2C0.784 2 0 2.784 0 3.75V11.25C0 12.216 0.784 13 1.75 13H14.25C15.216 13 16 12.216 16 11.25V3.75C16 2.784 15.216 2 14.25 2H1.75ZM1 3.75C1 3.336 1.336 3 1.75 3H14.25C14.664 3 15 3.336 15 3.75V11.25C15 11.664 14.664 12 14.25 12H1.75C1.336 12 1 11.664 1 11.25V3.75ZM3 5.5C3 5.224 3.224 5 3.5 5H12.5C12.776 5 13 5.224 13 5.5C13 5.776 12.776 6 12.5 6H3.5C3.224 6 3 5.776 3 5.5ZM3 8.5C3 8.224 3.224 8 3.5 8H9.5C9.776 8 10 8.224 10 8.5C10 8.776 9.776 9 9.5 9H3.5C3.224 9 3 8.776 3 8.5Z" />
        </svg>
        <span>Remotes</span>
        <span v-if="gitRefs.remotes.length > 0" class="tab-badge">{{ gitRefs.remotes.length }}</span>
      </button>
    </div>

    <!-- ============ History Tab ============ -->
    <template v-if="activeTab === 'history'">
      <div class="toolbar">
        <!-- 搜索框和分支筛选 -->
        <div class="filter-row">
          <div class="search-container">
            <input
              v-model="searchText"
              type="text"
              placeholder="Search commit message or SHA..."
              class="search-input"
              :disabled="isLoading"
              @keyup="handleSearchKeyup"
            >
            <button
              class="search-button"
              :disabled="isLoading"
              title="Search"
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
          <FilterSelect
            v-model="selectedBranch"
            :options="availableBranches"
            placeholder="All branches"
            empty-text="No matching branch"
            all-label="All branches"
            width="180px"
            :disabled="isLoading"
          />
          <FilterSelect
            v-model="selectedAuthor"
            :options="availableAuthors"
            placeholder="All authors"
            empty-text="No matching author"
            all-label="All authors"
            width="220px"
            placement="right"
            :disabled="isLoading"
          />
          <button
            v-if="hasActiveFilter"
            class="clear-button"
            title="Clear filter"
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
          :graph-data="allOperations"
          :has-more-data="hasMoreData"
          :on-load-more="loadMoreData"
          :scroll-to-hash="scrollToHash"
          class="git-graph-container"
        />
      </template>
    </template>

    <!-- ============ Stash Tab ============ -->
    <template v-else-if="activeTab === 'stash'">
      <div class="toolbar">
        <div class="filter-row stash-filter-row">
          <div class="search-container">
            <input
              v-model="stashSearch"
              type="text"
              placeholder="Search stash message / branch / hash..."
              class="search-input"
              :disabled="isStashLoading"
            >
            <button
              v-if="hasStashFilter"
              class="search-button"
              title="Clear filter"
              @click="clearStashSearch"
            >
              ✕
            </button>
          </div>
          <button
            class="icon-action-button"
            :disabled="isStashLoading"
            title="Refresh stash list"
            @click="loadStashList"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M3 8C3 5.23858 5.23858 3 8 3C9.63527 3 11.0878 3.78495 12.0005 5H10C9.72386 5 9.5 5.22386 9.5 5.5C9.5 5.77614 9.72386 6 10 6H12.8904C12.8973 6.00014 12.9041 6.00014 12.911 6H13C13.2761 6 13.5 5.77614 13.5 5.5V2.5C13.5 2.22386 13.2761 2 13 2C12.7239 2 12.5 2.22386 12.5 2.5V4.03138C11.4009 2.78613 9.79253 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.1301 14 13.6999 11.6035 13.9756 8.54488C14.0003 8.26985 13.7975 8.0268 13.5225 8.00202C13.2474 7.97723 13.0044 8.1801 12.9796 8.45512C12.75 11.003 10.6079 13 8 13C5.23858 13 3 10.7614 3 8Z" />
            </svg>
          </button>
          <button
            class="icon-action-button danger"
            :disabled="isStashLoading || stashes.length === 0"
            title="Drop all stash entries"
            @click="clearAllStash"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z" />
            </svg>
          </button>
        </div>
        <div v-if="stashes.length > 0 || isStashLoading" class="stash-status">
          <span class="status-pill">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M6.5 8C6.22386 8 6 8.22386 6 8.5C6 8.77614 6.22386 9 6.5 9H9.5C9.77614 9 10 8.77614 10 8.5C10 8.22386 9.77614 8 9.5 8H6.5ZM1 3.5C1 2.67157 1.67157 2 2.5 2H13.5C14.3284 2 15 2.67157 15 3.5V4.5C15 5.15311 14.5826 5.70873 14 5.91465V11.5C14 12.8807 12.8807 14 11.5 14H4.5C3.11929 14 2 12.8807 2 11.5V5.91465C1.4174 5.70873 1 5.15311 1 4.5V3.5ZM2.5 3C2.22386 3 2 3.22386 2 3.5V4.5C2 4.77614 2.22386 5 2.5 5H13.5C13.7761 5 14 4.77614 14 4.5V3.5C14 3.22386 13.7761 3 13.5 3H2.5ZM3 6V11.5C3 12.3284 3.67157 13 4.5 13H11.5C12.3284 13 13 12.3284 13 11.5V6H3Z" />
            </svg>
            {{ filteredStashes.length }} / {{ stashes.length }}
          </span>
          <span v-if="hasStashFilter" class="status-hint">Filtered by "{{ stashSearch }}"</span>
        </div>
      </div>

      <div class="stash-container">
        <template v-if="isStashLoading && stashes.length === 0">
          <div class="loading-state">
            <div class="loader" />
            <span>Loading stash list...</span>
          </div>
        </template>
        <template v-else-if="filteredStashes.length === 0">
          <div class="empty-state">
            <div class="empty-illustration">
              <svg width="44" height="44" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M6.5 8C6.22386 8 6 8.22386 6 8.5C6 8.77614 6.22386 9 6.5 9H9.5C9.77614 9 10 8.77614 10 8.5C10 8.22386 9.77614 8 9.5 8H6.5ZM1 3.5C1 2.67157 1.67157 2 2.5 2H13.5C14.3284 2 15 2.67157 15 3.5V4.5C15 5.15311 14.5826 5.70873 14 5.91465V11.5C14 12.8807 12.8807 14 11.5 14H4.5C3.11929 14 2 12.8807 2 11.5V5.91465C1.4174 5.70873 1 5.15311 1 4.5V3.5ZM2.5 3C2.22386 3 2 3.22386 2 3.5V4.5C2 4.77614 2.22386 5 2.5 5H13.5C13.7761 5 14 4.77614 14 4.5V3.5C14 3.22386 13.7761 3 13.5 3H2.5ZM3 6V11.5C3 12.3284 3.67157 13 4.5 13H11.5C12.3284 13 13 12.3284 13 11.5V6H3Z" />
              </svg>
            </div>
            <div class="empty-title">
              <template v-if="hasStashFilter">
                No matching stash
              </template>
              <template v-else>
                No stash entries
              </template>
            </div>
            <div class="empty-sub">
              <template v-if="hasStashFilter">
                Try a different keyword
              </template>
              <template v-else>
                Use <code>git stash push</code> to save your work in progress
              </template>
            </div>
          </div>
        </template>
        <template v-else>
          <ul class="stash-list">
            <StashItem
              v-for="item in filteredStashes"
              :key="item.ref"
              :stash="item"
              :expanded="expandedStashRef === item.ref"
              @toggle="toggleStashExpand(item)"
              @apply="applyStash(item)"
              @pop="popStash(item)"
              @drop="dropStash(item)"
            />
          </ul>
        </template>
      </div>
    </template>

    <!-- ============ Branches Tab ============ -->
    <template v-else-if="activeTab === 'branches'">
      <RefPanel
        v-model:search="refsSearch"
        mode="branches"
        :branches="gitRefs.branches"
        :remotes="gitRefs.remotes"
        :loading="isRefsLoading"
        :fetching-remote="fetchingRemote"
        @refresh="loadGitRefs"
        @fetch-remote="fetchRemote"
        @branch-action="runBranchAction"
      />
    </template>

    <!-- ============ Remotes Tab ============ -->
    <template v-else>
      <RefPanel
        v-model:search="refsSearch"
        mode="remotes"
        :branches="gitRefs.branches"
        :remotes="gitRefs.remotes"
        :loading="isRefsLoading"
        :fetching-remote="fetchingRemote"
        @refresh="loadGitRefs"
        @fetch-remote="fetchRemote"
        @branch-action="runBranchAction"
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
  min-height: 26px;
  border: 1px solid var(--vscode-input-border);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  outline: none;
  border-radius: 4px;
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

/* ---------------- Tab 切换 ---------------- */
.tabs {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-sideBar-background);
  padding: 0 8px;
  flex-shrink: 0;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.15s ease;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--vscode-foreground);
}

.tab.active {
  color: var(--vscode-foreground);
  border-bottom-color: var(--vscode-focusBorder, #0075ca);
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.25));
  color: var(--vscode-badge-foreground, var(--vscode-foreground));
  font-size: 10.5px;
  font-weight: 600;
  line-height: 16px;
}

.tab.active .tab-badge {
  background-color: var(--vscode-focusBorder, #0075ca);
  color: #fff;
}

/* ---------------- Stash 工具栏 ---------------- */
.stash-filter-row {
  gap: 6px;
}

.icon-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  background-color: transparent;
  color: var(--vscode-icon-foreground, var(--vscode-foreground));
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.icon-action-button:hover:not(:disabled) {
  background-color: var(--vscode-toolbar-hoverBackground, rgba(127, 127, 127, 0.15));
}

.icon-action-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-action-button.danger:hover:not(:disabled) {
  background-color: var(--vscode-inputValidation-errorBackground, rgba(244, 71, 71, 0.15));
  color: var(--vscode-errorForeground);
}

.stash-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 8px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 10px;
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.15));
  color: var(--vscode-badge-foreground, var(--vscode-foreground));
  font-weight: 500;
}

.status-hint {
  opacity: 0.85;
}

/* ---------------- Stash 列表容器 ---------------- */
.stash-container {
  flex: 1;
  overflow: auto;
  scrollbar-width: thin;
}

.stash-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  padding: 24px;
}

.loader {
  width: 18px;
  height: 18px;
  border: 2px solid var(--vscode-progressBar-background, rgba(127, 127, 127, 0.35));
  border-top-color: var(--vscode-focusBorder, #0075ca);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px 16px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}

.empty-illustration {
  margin-bottom: 14px;
  opacity: 0.5;
  color: var(--vscode-foreground);
  line-height: 0;
}

.empty-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--vscode-foreground);
}

.empty-sub {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
}

.empty-sub code {
  padding: 1px 5px;
  border-radius: 3px;
  background-color: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.15));
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
}
</style>
