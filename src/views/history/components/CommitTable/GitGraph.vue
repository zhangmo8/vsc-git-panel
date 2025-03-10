<script setup lang="ts">
import { computed } from 'vue'
import type { CommitOperation } from '@/git'

const props = defineProps<{
  graphData?: CommitOperation
  // 所有活跃分支的列表
  activeBranches?: string[]
  // 是否被选中
  isSelected?: boolean
}>()

// SVG宽度将根据分支数量动态计算
const SVG_HEIGHT = 33
// 图表配置
const DOT_SIZE = 8
const LINE_WIDTH = 2
const HORIZONTAL_SPACING = 15

// 不需要线条样式常量，所有类型都使用实线

// 存储分支与其索引的映射关系
const branchIndices = new Map<string, number>()
let currentBranchIndex = 0

// 计算水平位置 - 为每个新出现的分支分配一个唯一的水平位置
function getBranchPosition(branchName: string) {
  // 如果这个分支之前没有出现过，给它分配一个新的索引
  if (!branchIndices.has(branchName)) {
    branchIndices.set(branchName, currentBranchIndex++)
  }

  // 根据分支索引计算水平位置
  return (branchIndices.get(branchName)! + 1) * HORIZONTAL_SPACING
}

// 从graphData中获取分支颜色
function getBranchColorFromData(branchName: string): string {
  if (!props.graphData) return '#888888'
  
  // 检查当前提交的主分支颜色
  if (props.graphData.branch === branchName && props.graphData.branchColor) {
    return props.graphData.branchColor
  }
  
  // 检查目标分支颜色
  if (props.graphData.targetBranch === branchName && props.graphData.targetBranchColor) {
    return props.graphData.targetBranchColor
  }
  
  // 检查源分支颜色
  if (props.graphData.sourceBranchColors && props.graphData.sourceBranchColors[branchName]) {
    return props.graphData.sourceBranchColors[branchName]
  }
  
  // 如果没有找到预处理的颜色，返回默认颜色
  return '#888888'
}

// 计算当前提交涉及的所有分支
const allBranches = computed(() => {
  const branches = new Set<string>()

  // 添加活跃分支列表中的所有分支
  if (props.activeBranches && props.activeBranches.length) {
    props.activeBranches.forEach(branch => branches.add(branch))
  }

  // 添加当前提交相关的分支
  if (props.graphData) {
    // 当前分支
    if (props.graphData.branch) {
      branches.add(props.graphData.branch)
    }

    // 目标分支
    if (props.graphData.targetBranch) {
      branches.add(props.graphData.targetBranch)
    }

    // 源分支列表
    if (props.graphData.sourceBranches && props.graphData.sourceBranches.length) {
      props.graphData.sourceBranches.forEach(branch => branches.add(branch))
    }
  }

  return Array.from(branches)
})
</script>

<template>
  <div class="git-graph">
    <svg class="svg-wrapper" :width="(allBranches.length + 1) * HORIZONTAL_SPACING + HORIZONTAL_SPACING" :height="SVG_HEIGHT" xmlns="http://www.w3.org/2000/svg">
      <!-- 绘制提交点和线条 -->
      <g v-if="graphData">
        <!-- 第1层: 先绘制所有活跃分支的竖线 -->
        <template v-for="(branch, index) in allBranches" :key="`branch-${index}`">
          <!-- 垂直分支线 - 贯穿整个图表 -->
          <line
            :x1="getBranchPosition(branch)"
            y1="0"
            :x2="getBranchPosition(branch)"
            :y2="SVG_HEIGHT"
            :stroke="getBranchColorFromData(branch)"
            :stroke-width="LINE_WIDTH"
            stroke-dasharray="none"
            :stroke-opacity="isSelected ? 1 : 0.7"
          />
        </template>

        <!-- 第2层: 绘制合并线和分叉线 -->
        <!-- 如果是合并提交，绘制合并线 -->
        <template v-if="graphData.type === 'merge' && graphData.sourceBranches && graphData.sourceBranches.length">
          <template v-for="(sourceBranch, index) in graphData.sourceBranches" :key="`merge-${index}`">
            <!-- 只有当源分支与目标分支不同时才绘制合并线 -->
            <path
              v-if="sourceBranch !== graphData.branch"
              :d="`M ${getBranchPosition(sourceBranch)} ${SVG_HEIGHT / 2} C ${getBranchPosition(sourceBranch) + HORIZONTAL_SPACING / 2} ${SVG_HEIGHT / 2}, ${getBranchPosition(graphData.branch) - HORIZONTAL_SPACING / 2} ${SVG_HEIGHT / 2}, ${getBranchPosition(graphData.branch)} ${SVG_HEIGHT / 2}`"
              :stroke="getBranchColorFromData(sourceBranch)"
              :stroke-width="LINE_WIDTH"
              stroke-dasharray="none"
              :stroke-opacity="isSelected ? 1 : 0.7"
              fill="none"
            />
          </template>
        </template>

        <!-- 如果分支发生变化，绘制分支分叉线 -->
        <template v-if="graphData.branchChanged && graphData.targetBranch && graphData.targetBranch !== graphData.branch">
          <path
            :d="`M ${getBranchPosition(graphData.branch)} ${SVG_HEIGHT / 2} C ${getBranchPosition(graphData.branch) + HORIZONTAL_SPACING / 2} ${SVG_HEIGHT / 2}, ${getBranchPosition(graphData.targetBranch) - HORIZONTAL_SPACING / 2} ${SVG_HEIGHT / 2}, ${getBranchPosition(graphData.targetBranch)} ${SVG_HEIGHT / 2}`"
            :stroke="getBranchColorFromData(graphData.targetBranch)"
            :stroke-width="LINE_WIDTH"
            stroke-dasharray="none"
            :stroke-opacity="isSelected ? 1 : 0.7"
            fill="none"
          />
        </template>

        <!-- 第3层: 最后绘制提交节点，确保在线的上面 -->
        <template v-if="graphData.branch">
          <!-- 提交节点 -->
          <circle
            :cx="getBranchPosition(graphData.branch)"
            :cy="SVG_HEIGHT / 2"
            :r="DOT_SIZE / 2"
            :stroke="getBranchColorFromData(graphData.branch)"
            :stroke-width="graphData.type === 'merge' ? 2 : 1"
            :stroke-opacity="isSelected ? 1 : 0.8"
            :fill="graphData.type === 'merge' ? 'white' : getBranchColorFromData(graphData.branch)"
            :fill-opacity="isSelected ? 1 : 0.8"
          />
        </template>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.git-graph {
  width: 100%;
  padding: 0 8px;
  overflow: auto;
  position: absolute;
  top: 0;
  left: 0;
}

.svg-wrapper {
  display: block;
}
</style>
