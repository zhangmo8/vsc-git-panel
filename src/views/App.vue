<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import GitGraph from './components/GitGraph.vue'

interface Commit {
  hash: string
  author_name: string
  author_email: string
  message: string
  body: string
  parents?: string[]
  date: string
}

interface State {
  commits: Commit[]
  selectedHash?: string
  filter?: string
}

const commits = ref<Commit[]>([])
const error = ref<string>('')
const selectedHash = ref<string>('')
const filter = ref<string>('')

// VSCode webview API
declare const acquireVsCodeApi: any
const vscode = acquireVsCodeApi()

// Handle messages from extension
window.addEventListener('message', (event: { data: any }) => {
  const message = event.data
  switch (message.command) {
    case 'history':
      commits.value = message.data
      break
    case 'error':
      error.value = message.message
      break
  }
})

// Save state when it changes
watch([commits, selectedHash, filter], () => {
  try {
    const state: State = {
      commits: commits.value.map(commit => ({
        ...commit,
        parents: Array.isArray(commit.parents) ? [...commit.parents] : [],
      })),
      selectedHash: selectedHash.value || '',
      filter: filter.value || '',
    }
    vscode.postMessage({ command: 'setState', state })
  }
  catch (err) {
    console.error('Failed to save state:', err)
  }
}, { deep: true })

// function refreshHistory() {
//   commits.value = []
//   vscode.postMessage({ command: 'getHistory', forceRefresh: true })
// }

onMounted(() => {
  // Request git history
  vscode.postMessage({ command: 'getHistory', forceRefresh: true })
})

const transformedCommits = computed(() => {
  return commits.value.map(commit => ({
    hash: commit.hash,
    message: commit.message,
    author: commit.author_name,
    date: commit.date,
    parents: commit.parents || [],
  }))
})
</script>

<template>
  <div class="git-panel">
    <div class="toolbar">
      <input
        v-model="filter"
        type="text"
        placeholder="Search commits..."
        class="search-input"
      >
    </div>

    <GitGraph
      :commits="transformedCommits"
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
