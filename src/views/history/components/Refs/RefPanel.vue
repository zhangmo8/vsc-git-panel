<script setup lang="ts">
import { computed } from 'vue'

import RefListItem from './RefListItem.vue'

import type { GitBranchRef, GitRemoteRef } from '@/git'

const props = defineProps<{
  mode: 'branches' | 'remotes'
  branches: GitBranchRef[]
  remotes: GitRemoteRef[]
  loading?: boolean
  search: string
}>()

const emit = defineEmits<{
  (e: 'update:search', value: string): void
  (e: 'refresh'): void
  (e: 'selectBranch', branch: GitBranchRef): void
}>()

const keyword = computed(() => props.search.trim().toLowerCase())

function branchMatches(branch: GitBranchRef) {
  if (!keyword.value)
    return true

  return [
    branch.name,
    branch.fullName,
    branch.remote || '',
    branch.upstream || '',
    branch.commit,
    branch.subject,
  ].some(value => value.toLowerCase().includes(keyword.value))
}

const filteredBranches = computed(() => {
  return props.branches.filter(branchMatches)
})

const filteredRemotes = computed(() => {
  return props.remotes
    .map(remote => ({
      ...remote,
      branches: remote.branches.filter(branchMatches),
    }))
    .filter((remote) => {
      if (!keyword.value)
        return true

      return remote.name.toLowerCase().includes(keyword.value)
        || (remote.fetchUrl || '').toLowerCase().includes(keyword.value)
        || (remote.pushUrl || '').toLowerCase().includes(keyword.value)
        || remote.branches.length > 0
    })
})

const localCount = computed(() => props.branches.filter(branch => branch.type === 'local').length)
const remoteBranchCount = computed(() => props.branches.filter(branch => branch.type === 'remote').length)
const hasSearch = computed(() => !!keyword.value)

function clearSearch() {
  emit('update:search', '')
}
</script>

<template>
  <div class="ref-panel">
    <div class="ref-toolbar">
      <div class="search-container">
        <input
          :value="search"
          class="search-input"
          type="text"
          :placeholder="mode === 'branches' ? 'Search branches...' : 'Search remotes...'"
          :disabled="loading"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        >
        <button
          v-if="hasSearch"
          class="search-button"
          title="Clear search"
          @click="clearSearch"
        >
          x
        </button>
      </div>

      <button class="icon-action-button" :disabled="loading" title="Refresh references" @click="emit('refresh')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3 8C3 5.23858 5.23858 3 8 3C9.63527 3 11.0878 3.78495 12.0005 5H10C9.72386 5 9.5 5.22386 9.5 5.5C9.5 5.77614 9.72386 6 10 6H12.8904C12.8973 6.00014 12.9041 6.00014 12.911 6H13C13.2761 6 13.5 5.77614 13.5 5.5V2.5C13.5 2.22386 13.2761 2 13 2C12.7239 2 12.5 2.22386 12.5 2.5V4.03138C11.4009 2.78613 9.79253 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.1301 14 13.6999 11.6035 13.9756 8.54488C14.0003 8.26985 13.7975 8.0268 13.5225 8.00202C13.2474 7.97723 13.0044 8.1801 12.9796 8.45512C12.75 11.003 10.6079 13 8 13C5.23858 13 3 10.7614 3 8Z" />
        </svg>
      </button>
    </div>

    <div v-if="mode === 'branches' && (branches.length > 0 || loading)" class="ref-status">
      <span class="status-pill">{{ filteredBranches.length }} / {{ branches.length }}</span>
      <span class="status-hint">{{ localCount }} local · {{ remoteBranchCount }} remote</span>
    </div>

    <div v-if="mode === 'remotes' && (remotes.length > 0 || loading)" class="ref-status">
      <span class="status-pill">{{ filteredRemotes.length }} / {{ remotes.length }}</span>
      <span class="status-hint">{{ remoteBranchCount }} remote branches</span>
    </div>

    <div class="ref-content">
      <template v-if="loading && branches.length === 0 && remotes.length === 0">
        <div class="loading-state">
          <div class="loader" />
          <span>Loading references...</span>
        </div>
      </template>

      <template v-else-if="mode === 'branches'">
        <div v-if="filteredBranches.length === 0" class="empty-state">
          <div class="empty-title">
            {{ hasSearch ? 'No matching branch' : 'No branches' }}
          </div>
          <div class="empty-sub">
            {{ hasSearch ? 'Try a different keyword' : 'No Git branches were found' }}
          </div>
        </div>

        <ul v-else class="ref-list">
          <RefListItem
            v-for="branch in filteredBranches"
            :key="branch.fullName"
            :branch="branch"
            show-remote
            @select="emit('selectBranch', branch)"
          />
        </ul>
      </template>

      <template v-else>
        <div v-if="filteredRemotes.length === 0" class="empty-state">
          <div class="empty-title">
            {{ hasSearch ? 'No matching remote' : 'No remotes' }}
          </div>
          <div class="empty-sub">
            {{ hasSearch ? 'Try a different keyword' : 'No Git remotes were found' }}
          </div>
        </div>

        <div v-else class="remote-list">
          <section v-for="remote in filteredRemotes" :key="remote.name" class="remote-group">
            <div class="remote-header">
              <div class="remote-title">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M1.75 2C0.784 2 0 2.784 0 3.75V11.25C0 12.216 0.784 13 1.75 13H14.25C15.216 13 16 12.216 16 11.25V3.75C16 2.784 15.216 2 14.25 2H1.75ZM1 3.75C1 3.336 1.336 3 1.75 3H14.25C14.664 3 15 3.336 15 3.75V11.25C15 11.664 14.664 12 14.25 12H1.75C1.336 12 1 11.664 1 11.25V3.75ZM3 5.5C3 5.224 3.224 5 3.5 5H12.5C12.776 5 13 5.224 13 5.5C13 5.776 12.776 6 12.5 6H3.5C3.224 6 3 5.776 3 5.5ZM3 8.5C3 8.224 3.224 8 3.5 8H9.5C9.776 8 10 8.224 10 8.5C10 8.776 9.776 9 9.5 9H3.5C3.224 9 3 8.776 3 8.5Z" />
                </svg>
                <span>{{ remote.name }}</span>
                <span class="branch-count">{{ remote.branches.length }}</span>
              </div>
              <div class="remote-url" :title="remote.fetchUrl || remote.pushUrl">
                {{ remote.fetchUrl || remote.pushUrl || 'No URL' }}
              </div>
            </div>

            <ul v-if="remote.branches.length > 0" class="ref-list">
              <RefListItem
                v-for="branch in remote.branches"
                :key="branch.fullName"
                :branch="branch"
                @select="emit('selectBranch', branch)"
              />
            </ul>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ref-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ref-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-sideBar-background);
}

.search-container {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  position: relative;
}

.search-input {
  flex: 1;
  min-width: 0;
  min-height: 26px;
  padding: 4px 32px 4px 8px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  outline: none;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  transform: translateY(-50%);
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--vscode-input-foreground);
  cursor: pointer;
  opacity: 0.7;
}

.search-button:hover {
  opacity: 1;
  background-color: var(--vscode-toolbar-hoverBackground);
}

.icon-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background-color: transparent;
  color: var(--vscode-icon-foreground, var(--vscode-foreground));
  cursor: pointer;
}

.icon-action-button:hover:not(:disabled) {
  background-color: var(--vscode-toolbar-hoverBackground, rgba(127, 127, 127, 0.15));
}

.icon-action-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ref-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  color: var(--vscode-badge-foreground, var(--vscode-foreground));
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.15));
  font-weight: 500;
}

.status-hint {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ref-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
}

.ref-list {
  margin: 0;
  padding: 4px 0;
}

.remote-list {
  padding: 4px 0;
}

.remote-group {
  border-bottom: 1px solid var(--vscode-panel-border);
}

.remote-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 12px 7px;
  background-color: var(--vscode-sideBarSectionHeader-background, rgba(127, 127, 127, 0.08));
}

.remote-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--vscode-foreground);
  font-size: 12px;
  font-weight: 600;
}

.branch-count {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border-radius: 8px;
  color: var(--vscode-badge-foreground, var(--vscode-foreground));
  background-color: var(--vscode-badge-background, rgba(127, 127, 127, 0.18));
  font-size: 10.5px;
  font-weight: 500;
}

.remote-url {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  font-family: var(--vscode-editor-font-family);
}

.loading-state,
.empty-state {
  height: 100%;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}

.loader {
  width: 18px;
  height: 18px;
  border: 2px solid var(--vscode-progressBar-background, rgba(127, 127, 127, 0.35));
  border-top-color: var(--vscode-focusBorder, #0075ca);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.empty-title {
  color: var(--vscode-foreground);
  font-size: 14px;
  font-weight: 500;
}

.empty-sub {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
