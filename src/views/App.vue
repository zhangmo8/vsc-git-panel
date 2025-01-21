<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

interface Commit {
  hash: string
  author_name: string
  author_email: string
  message: string
  body: string
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
  const state: State = {
    commits: commits.value,
    selectedHash: selectedHash.value,
    filter: filter.value,
  }
  vscode.postMessage({ command: 'setState', state })
}, { deep: true })

function refreshHistory() {
  commits.value = []
  vscode.postMessage({ command: 'getHistory', forceRefresh: true })
}

onMounted(() => {
  // Request git history
  vscode.postMessage({ command: 'getHistory', forceRefresh: true })
})

function selectCommit(hash: string) {
  selectedHash.value = hash
}
</script>

<template>
  <div class="git-panel">
    <div class="toolbar">
      <button class="refresh-button" @click="refreshHistory">
        <span class="codicon codicon-refresh" />
        Refresh
      </button>
    </div>
    <div v-if="error" class="error">
      {{ error }}
    </div>
    <div v-else-if="commits.length === 0" class="loading">
      Loading git history...
    </div>
    <div v-else class="commits">
      <div class="filter">
        <input
          v-model="filter"
          type="text"
          placeholder="Filter commits..."
          class="filter-input"
        >
      </div>
      <div
        v-for="commit in commits"
        :key="commit.hash"
        class="commit"
        :class="{ selected: commit.hash === selectedHash }"
        @click="selectCommit(commit.hash)"
      >
        <div class="commit-header">
          <span class="commit-hash">{{ commit.hash.substring(0, 7) }}</span>
          <span class="commit-author">{{ commit.author_name }}</span>
        </div>
        <div class="commit-message">
          {{ commit.message }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.git-panel {
  padding: 10px;
}

.error {
  color: red;
  padding: 10px;
}

.loading {
  padding: 10px;
  color: #666;
}

.toolbar {
  margin-bottom: 10px;
}

.refresh-button {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 4px 8px;
  border-radius: 2px;
  cursor: pointer;
}

.refresh-button:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.refresh-button:active {
  background-color: var(--vscode-button-activeBackground);
}

.filter {
  margin-bottom: 10px;
}

.filter-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--vscode-input-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 2px;
}

.filter-input:focus {
  outline: 1px solid var(--vscode-focusBorder);
  border-color: transparent;
}

.commits {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.commit {
  padding: 8px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.commit:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.commit.selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.commit-header {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.commit-hash {
  color: var(--vscode-textLink-foreground);
  font-family: monospace;
}

.commit.selected .commit-hash {
  color: inherit;
}

.commit-author {
  color: var(--vscode-textPreformat-foreground);
}

.commit-message {
  color: var(--vscode-foreground);
}

.commit.selected .commit-message,
.commit.selected .commit-author {
  color: inherit;
}
</style>
