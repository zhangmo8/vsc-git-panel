<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import CommitTable from './components/CommitTable/index.vue'

import { CHANNEL, WEBVIEW_CHANNEL } from '@/constant'

import type { CommitGraph } from '@/git'

declare global {
  interface Window {
    vscode: WebviewApi<State>
  }
}

interface State {
  commits: CommitGraph
  selectedHash?: string
  filter?: string
}

const commits = ref<CommitGraph>()
const error = ref<string>('')
// const selectedHash = ref<string>('')
// const filter = ref<string>('')

// VSCode webview API
const vscode = acquireVsCodeApi<State>()
window.vscode = vscode

const selectedCommitHashes = ref<string[]>([])

// Handle messages from extension
window.addEventListener('message', (event: { data: any }) => {
  const message = event.data

  switch (message.command) {
    case CHANNEL.HISTORY:
      commits.value = message.commits as CommitGraph
      break
    case CHANNEL.CLEAR_SELECTED:
      selectedCommitHashes.value = []
      break
    case 'error':
      error.value = message.message
      break
  }
})

onMounted(() => {
  vscode.postMessage({ command: WEBVIEW_CHANNEL.GET_HISTORY })
})

const transformedCommits = computed(() => {
  return Array.from(commits.value?.logResult.all || []) || []
})
</script>

<template>
  <div class="git-panel">
    <!-- <div class="toolbar">
      <input v-model="filter" type="text" placeholder="Search commits..." class="search-input">
    </div> -->

    <CommitTable 
      v-model="selectedCommitHashes" 
      :commits="transformedCommits" 
      :graph-data="commits?.operations || []" 
      class="git-graph-container" 
    />

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
  padding: 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.search-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--vscode-input-border);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  outline: none;
}

.search-input:focus {
  border-color: var(--vscode-focusBorder);
}

.git-graph-container {
  flex: 1;
  overflow: auto;
}

.error {
  color: var(--vscode-errorForeground);
  padding: 8px;
}
</style>
