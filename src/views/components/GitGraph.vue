<script setup lang="ts">
import { computed } from 'vue'

interface Commit {
  hash: string
  message: string
  author: string
  date: string
  parents: string[]
}

interface CommitNode {
  commit: Commit
  column: number
  parents: { hash: string, fromColumn: number, toColumn: number }[]
  color: string
  branchName?: string
  isHead?: boolean
  isBranch?: boolean
  isMerge?: boolean
}

const props = defineProps<{
  commits: Commit[]
}>()

// Calculate branch positions and paths
const COLUMN_WIDTH = 14
const DOT_SIZE = 6
const BRANCH_COLORS = [
  'var(--vscode-charts-blue)',
  'var(--vscode-charts-red)',
  'var(--vscode-charts-yellow)',
  'var(--vscode-charts-orange)',
  'var(--vscode-charts-purple)',
  'var(--vscode-charts-green)',
]

const graphData = computed(() => {
  const nodes: CommitNode[] = []
  const columns = new Map<string, number>()
  const columnColors = new Map<number, string>()
  const branchPaths = new Map<string, string[]>()
  const activeBranches = new Set<number>()
  let maxColumn = 0

  // Get color for column
  const getColumnColor = (column: number) => {
    if (!columnColors.has(column)) {
      columnColors.set(column, BRANCH_COLORS[column % BRANCH_COLORS.length])
    }
    return columnColors.get(column)!
  }

  // First pass: identify branches and their paths
  props.commits.forEach((commit) => {
    const children = props.commits.filter(c => (c.parents || []).includes(commit.hash))
    if (children.length > 1) {
      // This is a fork point - each child starts a new branch
      children.forEach((child) => {
        const branchPath = [child.hash]
        let current = child
        while (true) {
          const nextCommits = props.commits.filter(c => (c.parents || []).includes(current.hash))
          if (nextCommits.length !== 1)
            break
          current = nextCommits[0]
          branchPath.push(current.hash)
        }
        branchPaths.set(child.hash, branchPath)
      })
    }
  })

  // Second pass: assign columns based on branch structure
  let currentColumn = 0
  const processedCommits = new Set<string>()

  const assignColumn = (commit: Commit, preferredColumn?: number) => {
    if (processedCommits.has(commit.hash))
      return columns.get(commit.hash)!

    let column = preferredColumn ?? currentColumn

    // Try to reuse parent's column if it's a single-parent commit
    if ((commit.parents || []).length === 1 && columns.has(commit.parents![0])) {
      const parentColumn = columns.get(commit.parents![0])!
      if (![...columns.values()].some(col => col === parentColumn && !processedCommits.has(commit.hash))) {
        column = parentColumn
      }
    }

    // Find first available column if preferred is taken
    while ([...columns.values()].some(col => col === column && !processedCommits.has(commit.hash))) {
      column++
    }

    maxColumn = Math.max(maxColumn, column)
    columns.set(commit.hash, column)
    processedCommits.add(commit.hash)
    activeBranches.add(column)

    if (preferredColumn === undefined) {
      currentColumn = column + 1
    }

    return column
  }

  // Process commits in order
  props.commits.forEach((commit, index) => {
    const column = assignColumn(commit)
    const isHead = index === 0
    const isBranch = (commit.parents || []).length === 1 && props.commits.filter(c => (c.parents || []).includes(commit.hash)).length > 1
    const isMerge = (commit.parents || []).length > 1

    const parentConnections = (commit.parents || []).map((parentHash) => {
      const parentCommit = props.commits.find(c => c.hash === parentHash)
      if (!parentCommit)
        return null

      const parentColumn = assignColumn(
        parentCommit,
        columns.get(parentHash),
      )

      return {
        hash: parentHash,
        fromColumn: column,
        toColumn: parentColumn,
      }
    }).filter((connection): connection is NonNullable<typeof connection> => connection !== null)

    let branchName: string | undefined
    for (const [startHash, path] of branchPaths.entries()) {
      if (path.includes(commit.hash)) {
        branchName = startHash
        break
      }
    }

    nodes.push({
      commit: {
        hash: commit.hash,
        author: commit.author,
        message: commit.message,
        date: commit.date,
      },
      column,
      parents: parentConnections,
      color: getColumnColor(column),
      branchName,
      isHead,
      isBranch,
      isMerge,
    })
  })

  return {
    nodes,
    maxColumn,
    columnWidth: COLUMN_WIDTH,
    dotSize: DOT_SIZE,
    getColumnColor,
    activeBranches,
  }
})
</script>

<template>
  <div class="git-graph">
    <table>
      <thead>
        <tr>
          <th class="hash-col">
            Commit ID
          </th>
          <th>Message</th>
          <th>Author</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="node in graphData.nodes" :key="node.commit.hash">
          <td class="hash-col">
            {{ node.commit.hash.substring(0, 7) }}
          </td>
          <td class="message">
            {{ node.commit.message }}
          </td>
          <td class="author">
            {{ node.commit.author }}
          </td>
          <td class="date">
            {{ node.commit.date }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.git-graph {
  width: 100%;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  padding: 8px;
  font-weight: normal;
  border-bottom: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-sideBar-background);
}

td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
  vertical-align: middle;
}

.graph-col {
  padding: 0;
}

.hash-col {
  font-family: var(--vscode-editor-font-family), monospace;
  color: var(--vscode-textLink-foreground);
  width: 80px;
  padding: 4px 8px;
  white-space: nowrap;
}

.graph {
  display: block;
}

.commit-dot {
  stroke: var(--vscode-sideBar-background);
  stroke-width: 1;
}

.head-dot {
  stroke-width: 2;
}

.branch-dot {
  stroke-width: 2;
}

.merge-dot {
  stroke-width: 2;
}

.commit-line {
  fill: red;
  stroke-width: 2;
}

.branch-line {
  stroke-width: 2;
  opacity: 0.3;
}

.message {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}

.author {
  white-space: nowrap;
}

.date {
  white-space: nowrap;
  color: var(--vscode-descriptionForeground);
}

tr:hover {
  background-color: var(--vscode-list-hoverBackground);
}

/* Ensure the graph lines remain visible when hovering */
tr:hover .commit-line {
  opacity: 0.8;
}
</style>
