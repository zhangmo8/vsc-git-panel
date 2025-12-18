<script setup lang="ts">
const props = defineProps<{
  graph?: {
    node: { x: number, color: string }
    edges: { toX: number, color: string, type: 'straight' | 'merge' }[]
    columns: (string | null)[]
    hasIncoming: boolean
  }
  isSelected?: boolean
  hasBranchLabel?: boolean
}>()

// SVG宽度将根据分支数量动态计算
const SVG_HEIGHT = 32
// 图表配置
const DOT_SIZE = 10
const LINE_WIDTH = 3
const HORIZONTAL_SPACING = 18

// 计算水平位置
function getX(index: number) {
  return (index + 1) * HORIZONTAL_SPACING
}

function createCurvePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const radius = Math.min(Math.abs(dy) / 2, Math.abs(dx) / 2, 12)
  const verticalGap = (Math.abs(dy) - 2 * radius) / 2

  const xDir = dx > 0 ? 1 : -1
  const sweep1 = dx > 0 ? 0 : 1
  const sweep2 = dx > 0 ? 1 : 0

  let d = `M ${x1} ${y1}`
  d += ` L ${x1} ${y1 + verticalGap}`
  d += ` A ${radius} ${radius} 0 0 ${sweep1} ${x1 + radius * xDir} ${y1 + verticalGap + radius}`
  d += ` L ${x2 - radius * xDir} ${y1 + verticalGap + radius}`
  d += ` A ${radius} ${radius} 0 0 ${sweep2} ${x2} ${y2 - verticalGap}`
  d += ` L ${x2} ${y2}`

  return d
}
</script>

<template>
  <div class="git-graph">
    <svg
      v-if="props.graph"
      class="svg-wrapper"
      :width="(props.graph.columns.length + 1) * HORIZONTAL_SPACING + HORIZONTAL_SPACING"
      :height="SVG_HEIGHT"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- 1. 绘制背景竖线 (直通线) -->
      <template v-for="(color, index) in props.graph.columns" :key="`col-${index}`">
        <line
          v-if="color && index !== props.graph.node.x"
          :x1="getX(index)"
          :y1="0"
          :x2="getX(index)"
          :y2="SVG_HEIGHT"
          :stroke="color"
          :stroke-width="LINE_WIDTH"
          :stroke-opacity="isSelected ? 1 : 0.5"
        />
      </template>

      <!-- 1.5 绘制来自左侧分支标签的连接线 -->
      <line
        v-if="hasBranchLabel"
        :x1="0"
        :y1="SVG_HEIGHT / 2"
        :x2="getX(props.graph.node.x)"
        :y2="SVG_HEIGHT / 2"
        :stroke="props.graph.node.color"
        :stroke-width="LINE_WIDTH"
        :stroke-opacity="isSelected ? 1 : 0.5"
      />

      <!-- 2. 绘制出射连线 (Edges) -->
      <template v-for="(edge, i) in props.graph.edges" :key="`edge-${i}`">
        <!-- 直线 -->
        <line
          v-if="edge.type === 'straight'"
          :x1="getX(props.graph.node.x)"
          :y1="SVG_HEIGHT / 2"
          :x2="getX(edge.toX)"
          :y2="SVG_HEIGHT"
          :stroke="edge.color"
          :stroke-width="LINE_WIDTH"
          :stroke-opacity="isSelected ? 1 : 0.5"
        />
        <!-- 曲线 (Merge/Fork) -->
        <path
          v-else
          :d="createCurvePath(getX(props.graph.node.x), SVG_HEIGHT / 2, getX(edge.toX), SVG_HEIGHT)"
          :stroke="edge.color"
          :stroke-width="LINE_WIDTH"
          :stroke-opacity="isSelected ? 1 : 0.5"
          fill="none"
        />
      </template>

      <!-- 3. 绘制来自上方的连接线 (如果当前节点不是起始点) -->
      <line
        v-if="props.graph.hasIncoming"
        :x1="getX(props.graph.node.x)"
        :y1="0"
        :x2="getX(props.graph.node.x)"
        :y2="SVG_HEIGHT / 2"
        :stroke="props.graph.node.color"
        :stroke-width="LINE_WIDTH"
        :stroke-opacity="isSelected ? 1 : 0.5"
      />

      <!-- 4. 绘制节点 -->
      <!-- 外圈 (Halo) 用于遮挡线条 -->
      <circle
        :cx="getX(props.graph.node.x)"
        :cy="SVG_HEIGHT / 2"
        :r="DOT_SIZE / 2 + 2"
        fill="var(--vscode-editor-background)"
      />
      <!-- 内圈 (实心点) -->
      <circle
        :cx="getX(props.graph.node.x)"
        :cy="SVG_HEIGHT / 2"
        :r="DOT_SIZE / 2"
        :fill="props.graph.node.color"
        :fill-opacity="isSelected ? 1 : 0.9"
      />
    </svg>
  </div>
</template>

<style scoped>
.git-graph {
  width: calc(100% + 16px);
  padding: 0 8px;
  overflow: visible;
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  pointer-events: none; /* 让点击穿透到下面的行 */
}

.svg-wrapper {
  display: block;
  overflow: visible;
}
</style>
