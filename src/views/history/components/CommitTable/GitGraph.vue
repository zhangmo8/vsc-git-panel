<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface Commit {
  id: string
  message: string
  branch: string
  branches: Array<{ name: string }>
  hasParent: boolean
  parentIds?: string[]
  mergeTarget?: string
}

const props = defineProps<{
  commits: Array<Commit>
}>()

const SVG_WIDTH = 180
const SVG_HEIGHT = 40
const centerY = SVG_HEIGHT / 2

// Enhanced branch tracking system
const branchRegistry = ref<{
  [branchName: string]: {
    x: number
    color: string
    order: number
  }
}>({})

const colors = ['#0366d6', '#28a745', '#6f42c1', '#1da1f2', '#f66a0a', '#d73a49', '#00b5ad', '#6a737d', '#ea4aaa']

function initializeBranches() {
  // Clear existing branches first
  branchRegistry.value = {}

  // First pass: register all branches
  const uniqueBranches = new Set<string>()

  props.commits.forEach((commit) => {
    uniqueBranches.add(commit.branch)
    if (commit.branches) {
      commit.branches.forEach(b => uniqueBranches.add(b.name))
    }
    if (commit.mergeTarget) {
      uniqueBranches.add(commit.mergeTarget)
    }
  })

  // Second pass: assign positions to each branch
  const mainBranches = ['master', 'main', 'release', 'develop', 'staging']
  const sortedBranches = Array.from(uniqueBranches).sort((a, b) => {
    // Place main branches first in a specific order
    const aIndex = mainBranches.indexOf(a)
    const bIndex = mainBranches.indexOf(b)

    if (aIndex >= 0 && bIndex >= 0)
      return aIndex - bIndex
    if (aIndex >= 0)
      return -1
    if (bIndex >= 0)
      return 1
    return a.localeCompare(b)
  })

  // Assign positions and colors
  sortedBranches.forEach((branchName, index) => {
    const color = colors[index % colors.length]

    branchRegistry.value[branchName] = {
      x: 30 + (index * 30),
      color,
      order: index,
    }
  })
}

onMounted(() => {
  initializeBranches()
})

function getBranchColor(branchName: string): string {
  if (!branchRegistry.value[branchName]) {
    initializeBranches()
  }
  return branchRegistry.value[branchName]?.color || '#999999'
}

function getBranchX(branchName: string): number {
  if (!branchRegistry.value[branchName]) {
    initializeBranches()
  }
  return branchRegistry.value[branchName]?.x || 20
}

function centerX(commit: { branch: string }): number {
  return getBranchX(commit.branch)
}

// Compute total unique branches for dynamic SVG width
const totalBranches = computed(() => {
  const uniqueBranches = new Set<string>()
  props.commits.forEach((commit) => {
    uniqueBranches.add(commit.branch)
    commit.branches.forEach(b => uniqueBranches.add(b.name))
  })
  return uniqueBranches.size
})

// Get commit by ID for connections
function getCommitIndex(id: string): number {
  return props.commits.findIndex(c => c.id === id)
}

// Determine if a commit is a merge commit
function isMergeCommit(commit: Commit): boolean {
  return !!commit.mergeTarget || (commit.parentIds && commit.parentIds.length > 1)
}

// Find parent commit
function getParentCommit(commitId: string): Commit | undefined {
  const index = getCommitIndex(commitId)
  if (index < props.commits.length - 1) {
    return props.commits[index + 1]
  }
  return undefined
}
</script>

<template>
  <table class="commit-table" :style="{ width: `${Math.max(350, totalBranches * 60)}px` }">
    <tr v-for="(commit, index) in commits" :key="commit.id" class="commit-row">
      <td class="graph-cell">
        <svg
          :width="Math.max(180, totalBranches * 60)"
          :height="SVG_HEIGHT"
          class="commit-graph"
        >
          <!-- Branch lines -->
          <g v-for="branch in commit.branches" :key="branch.name">
            <line
              :x1="getBranchX(branch.name)"
              y1="0"
              :x2="getBranchX(branch.name)"
              :y2="SVG_HEIGHT"
              :stroke="getBranchColor(branch.name)"
              stroke-width="2"
              opacity="0.7"
            />
          </g>

          <!-- Current branch line -->
          <line
            :x1="centerX(commit)"
            y1="0"
            :x2="centerX(commit)"
            :y2="SVG_HEIGHT"
            :stroke="getBranchColor(commit.branch)"
            stroke-width="2"
          />

          <!-- Merge connections -->
          <g v-if="commit.mergeTarget">
            <!-- Horizontal merge line -->
            <path
              :d="`M ${centerX(commit)} ${centerY} Q ${(centerX(commit) + getBranchX(commit.mergeTarget)) / 2} ${centerY + 15} ${getBranchX(commit.mergeTarget)} ${centerY}`"
              :stroke="getBranchColor(commit.branch)"
              fill="none"
              stroke-width="2"
            />
          </g>

          <!-- Parent connection (straight vertical line) -->
          <line
            v-if="commit.hasParent && !isMergeCommit(commit)"
            :x1="centerX(commit)"
            y1="SVG_HEIGHT"
            :x2="centerX(commit)"
            :y2="centerY"
            :stroke="getBranchColor(commit.branch)"
            stroke-width="2"
          />

          <!-- Commit point (circle) -->
          <circle
            :cx="centerX(commit)"
            :cy="centerY"
            r="5"
            :fill="getBranchColor(commit.branch)"
            :stroke="index === 0 ? '#fff' : 'none'"
            stroke-width="1.5"
          />
        </svg>
      </td>
      <td class="commit-info">
        <div class="commit-message" :class="[{ 'merge-commit': isMergeCommit(commit) }]">
          {{ commit.message }}
        </div>
      </td>
    </tr>
  </table>
</template>

<style scoped>
.commit-table {
  border-collapse: collapse;
  table-layout: fixed;
  max-width: 100%;
}

.commit-row {
  height: 40px;
}

.graph-cell {
  width: 180px;
  max-width: 180px;
  padding: 0;
  position: relative;
  overflow: hidden;
}

.commit-graph {
  overflow: visible;
}

.commit-info {
  padding-left: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-message {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
}

.merge-commit {
  font-style: italic;
}
</style>
