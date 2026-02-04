<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRaw } from 'vue'
import dayjs from 'dayjs'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

import ColumnHeader from './ColumnHeader.vue'
import ListItem from './ListItem.vue'

import type { Commit, GitOperation } from '@/git'
import { WEBVIEW_CHANNEL } from '@/constant'

const props = defineProps<{
  commits: Commit[]
  graphData: GitOperation[]
  hasMoreData?: boolean
  onLoadMore?: () => void
}>()

// Selected commit hash state
const selectedCommitHashes = defineModel<string[]>({ default: [] })

const isDragging = ref(false)
const selectionStart = ref<number | null>(null)
const dragEndIndex = ref<number>(0)

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

const branchLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = {}
  for (const operation of props.graphData || []) {
    if (!operation.hash || !operation.branchExplicit)
      continue

    lookup[operation.hash] = operation.branch
  }

  return lookup
})

const commitData = computed(() => {
  const branches = branchLookup.value
  return (props.commits || []).map(commit => ({
    ...commit,
    branchName: commit.branchName || branches[commit.hash] || '',
    date: dayjs(commit.date).format('YYYY-MM-DD HH:mm'),
  }))
})

// 计算所有活跃分支和图表数据
const processedRows = computed(() => {
  const hashToBranch = branchLookup.value
  const rows: {
    commit: any
    graph: {
      node: { x: number, color: string }
      edges: { toX: number, color: string, type: 'straight' | 'merge' }[]
      columns: (string | null)[]
      hasIncoming: boolean
    }
    branchHint: string
  }[] = []

  type ColumnEntry = { hash: string, color: string } | null
  const columns: ColumnEntry[] = []
  const columnMap = new Map<string, number>()
  const columnLabels: (string | null)[] = []
  const colors = [
    '#0075ca', // Blue
    '#1db35b', // Green
    '#ffb900', // Yellow
    '#e81123', // Red
    '#8e44ad', // Purple
    '#ff8c00', // Orange
    '#00cc6a', // Teal
    '#ea4c89', // Pink
    '#00bcf2', // Light Blue
    '#7f8c8d', // Grey
    '#d35400', // Pumpkin
    '#2c3e50', // Midnight Blue
    '#f1c40f', // Sun Flower
    '#c0392b', // Pomegranate
    '#16a085', // Green Sea
  ]
  let colorIndex = 0
  const getNextColor = () => {
    const usedColors = new Set(columns.filter(c => c !== null).map(c => c!.color))

    // Try to find a color not in use
    for (let i = 0; i < colors.length; i++) {
      // We start checking from colorIndex to maintain some rotation even if colors are freed up
      const idx = (colorIndex + i) % colors.length
      if (!usedColors.has(colors[idx])) {
        colorIndex = idx + 1 // Update index for next time
        return colors[idx]
      }
    }

    // If all used, just return next in rotation
    return colors[colorIndex++ % colors.length]
  }

  const findAvailableColumnIndex = (targetColumns: ColumnEntry[]) => {
    const emptyIndex = targetColumns.findIndex(c => c === null)
    return emptyIndex === -1 ? targetColumns.length : emptyIndex
  }

  const normalizeCommitRef = (ref: string) => {
    if (!ref)
      return ''

    let cleaned = ref.trim()
    cleaned = cleaned.replace(/^\(+/, '').replace(/\)+$/, '').trim()
    cleaned = cleaned.replace(/^,+/, '').replace(/,+$/, '').trim()

    if (cleaned.startsWith('HEAD -> '))
      cleaned = cleaned.replace('HEAD -> ', '')

    if (cleaned.startsWith('refs/heads/'))
      cleaned = cleaned.substring('refs/heads/'.length)

    if (cleaned.startsWith('refs/remotes/'))
      cleaned = cleaned.substring('refs/remotes/'.length)

    if (cleaned.startsWith('ref:'))
      cleaned = cleaned.substring('ref:'.length)

    return cleaned.replace(/[()]/g, '').trim()
  }

  const extractBranchLabel = (commit: Commit) => {
    if (commit.branchName)
      return commit.branchName

    if (!commit.refs)
      return ''

    const refs = commit.refs.split(',').map(ref => ref.trim())
    const branchRef = refs.find(ref =>
      ref.includes('refs/heads/')
      || ref.includes('refs/remotes/')
      || ref.startsWith('HEAD -> ')
      || (!ref.includes('refs/') && !ref.includes('tag:')),
    )

    if (!branchRef)
      return ''

    return normalizeCommitRef(branchRef)
  }

  for (const commit of commitData.value) {
    // 1. 查找当前 commit 是否在追踪列中
    const trackedColumnIndex = columnMap.get(commit.hash)
    let colIndex = trackedColumnIndex ?? -1
    const hasIncomingLine = trackedColumnIndex !== undefined
    let color

    if (colIndex === -1) {
      // 未追踪（新分支头），找第一个空闲列或追加
      colIndex = findAvailableColumnIndex(columns)
      if (colIndex === columns.length) {
        columns.push(null)
        columnLabels.push(null)
      }
      color = getNextColor()
      columns[colIndex] = { hash: commit.hash, color }
      columnMap.set(commit.hash, colIndex)
      if (!columnLabels[colIndex]) {
        const inferredLabel = hashToBranch[commit.hash] || commit.branchName || ''
        if (inferredLabel)
          columnLabels[colIndex] = inferredLabel
      }
    }
    else {
      color = columns[colIndex]!.color
    }

    const node = { x: colIndex, color }
    const edges: { toX: number, color: string, type: 'straight' | 'merge' }[] = []

    // 记录当前行的列状态（用于绘制背景线）
    // 注意：这里我们需要深拷贝 columns 的颜色信息，因为 columns 会在下面被修改
    const currentColumns = columns.map(c => c ? c.color : null)

    // 2. 决定下一行的列状态
    const nextColumns = [...columns]
    const nextColumnMap = new Map(columnMap)
    const nextColumnLabels = [...columnLabels]
    const releaseColumn = (index: number) => {
      const existing = nextColumns[index]
      if (existing) {
        nextColumnMap.delete(existing.hash)
      }
      nextColumns[index] = null
      nextColumnLabels[index] = null
    }
    const assignColumn = (index: number, hash: string, valueColor: string) => {
      const existing = nextColumns[index]
      if (existing && existing.hash !== hash) {
        nextColumnMap.delete(existing.hash)
      }
      nextColumns[index] = { hash, color: valueColor }
      nextColumnMap.set(hash, index)
      if (typeof nextColumnLabels[index] === 'undefined')
        nextColumnLabels[index] = null
      if (!nextColumnLabels[index]) {
        const inferredParent = hashToBranch[hash] || ''
        if (inferredParent)
          nextColumnLabels[index] = inferredParent
      }
    }
    const parents = commit.parents || []

    if (parents.length === 0) {
      // 分支结束
      releaseColumn(colIndex)
    }
    else {
      // Parent 0 继承当前列
      const p0 = parents[0]

      // 检查 p0 是否已经被其他列追踪（合并汇聚点）
      // 注意：这里检查的是 nextColumns，因为我们在构建下一行的状态
      const existingP0Index = nextColumnMap.get(p0) ?? -1

      if (existingP0Index !== -1 && existingP0Index !== colIndex) {
        // P0 已经在其他列中（合并），当前列结束，连线到 P0 所在列
        releaseColumn(colIndex)
        edges.push({ toX: existingP0Index, color, type: 'merge' })
      }
      else {
        // P0 未被追踪，或者就在当前列，继续追踪
        assignColumn(colIndex, p0, color)
        edges.push({ toX: colIndex, color, type: 'straight' })
      }

      // 处理其他 Parents (Merge Sources)
      for (let i = 1; i < parents.length; i++) {
        const p = parents[i]
        let pIndex = nextColumnMap.get(p) ?? -1

        if (pIndex === -1) {
          // 未追踪，分配新列
          pIndex = findAvailableColumnIndex(nextColumns)
          if (pIndex === nextColumns.length) {
            nextColumns.push(null)
            nextColumnLabels.push(null)
          }
          const pColor = getNextColor()
          assignColumn(pIndex, p, pColor)
        }

        // 连线：从当前节点连向 parent 所在列
        // 注意：这里的颜色通常使用 parent 的颜色，表示“来自那个分支”
        edges.push({ toX: pIndex, color: nextColumns[pIndex]!.color, type: 'merge' })
      }
    }

    const explicitLabel = extractBranchLabel(commit)
    rows.push({
      commit,
      graph: {
        node,
        edges,
        columns: currentColumns,
        hasIncoming: hasIncomingLine,
      },
      branchHint: explicitLabel ? '' : (columnLabels[colIndex] || commit.branchName || ''),
    })

    if (explicitLabel) {
      nextColumnLabels[colIndex] = explicitLabel
    }

    // 更新 columns
    // 更新 columns
    while (nextColumns.length > 0 && nextColumns[nextColumns.length - 1] === null) {
      nextColumns.pop()
      nextColumnLabels.pop()
    }

    // 替换 columns
    columns.length = 0
    columnMap.clear()
    columnLabels.length = 0
    nextColumns.forEach((c, idx) => {
      columns.push(c)
      columnLabels.push(nextColumnLabels[idx] ?? null)
      if (c) {
        columnMap.set(c.hash, idx)
      }
    })
  }

  return rows
})

// const activeBranches = computed(() => {
//   // const branches = new Set<string>()
//   return []
// })

function handleCommitSelected(hash: string, index: number, event: MouseEvent) {
  isDragging.value = true

  if (event.shiftKey && selectedCommitHashes.value.length > 0) {
    const lastSelectedIndex = commitData.value.findIndex(
      commit => commit.hash === selectedCommitHashes.value[selectedCommitHashes.value.length - 1],
    )
    if (lastSelectedIndex !== -1) {
      const startIdx = Math.min(lastSelectedIndex, index)
      const endIdx = Math.max(lastSelectedIndex, index)
      const hashesToSelect = commitData.value
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
    selectedCommitHashes.value = [commitData.value[index].hash]
  }
}

function handleMouseOver(index: number) {
  if (isDragging.value && selectionStart.value !== null) {
    const startIdx = Math.min(selectionStart.value, index)
    const endIdx = Math.max(selectionStart.value, index)
    const hashesToSelect = commitData.value
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
    if (target.isIntersecting && props.hasMoreData && props.onLoadMore) {
      props.onLoadMore()
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

<!-- :graph-data="graphData[index]"  -->
<template>
  <div :class="{ dragging: isDragging }" class="git-graph" @mouseleave="handleMouseUp" @mouseup="handleMouseUp">
    <div class="commit-list-container">
      <ColumnHeader v-model="columnWidths" class="column-header" />
      <RecycleScroller
        v-slot="{ item: row, index }"
        :items="processedRows"
        :item-size="32"
        key-field="commit.hash"
        class="commit-scroller"
        :buffer="200"
        :prerender="20"
      >
        <ListItem
          :key="row.commit.hash"
          :commit="row.commit"
          :graph="row.graph"
          :ghost-branch="row.branchHint"
          :column-widths="columnWidths"
          :is-selected="selectedCommitHashes.includes(row.commit.hash)"
          :class="{
            'being-dragged': isDragging && selectionStart !== null
              && ((index >= selectionStart && index <= dragEndIndex)
                || (index <= selectionStart && index >= dragEndIndex)),
          }"
          @select="(event) => handleCommitSelected(row.commit.hash, index, event)"
          @mousedown="(event: MouseEvent) => handleMouseDown(index, event)"
          @mouseover="() => isDragging && handleMouseOver(index)"
        />
      </RecycleScroller>
      <div v-if="hasMoreData" ref="loadingTriggerRef" class="loading-trigger">
        <div class="loading-text">
          Loading more commits...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.git-graph {
  width: 100%;
  height: 100%;
  font-family: var(--vscode-editor-font-family);
  user-select: none;
  /* Prevent text selection during drag */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dragging {
  cursor: col-resize;
}

.commit-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.column-header {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--vscode-sideBar-background);
}

.commit-scroller {
  flex: 1;
  height: 100%;
  overflow-y: auto;
}

.commit-scroller :deep(.vue-recycle-scroller__item-view) {
  overflow: visible;
}

.commit-scroller :deep(.vue-recycle-scroller__item-wrapper) {
  overflow: visible;
}

.loading-trigger {
  text-align: center;
  padding: 8px 0;
  flex-shrink: 0;
}

.loading-text {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.being-dragged {
  background-color: var(--vscode-list-activeSelectionBackground, rgba(0, 0, 0, 0.1));
}
</style>
