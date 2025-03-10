<script setup lang="ts">
const props = defineProps<{
  isActive: boolean
}>()
</script>

<template>
  <div class="resize-handle" :class="{ active: props.isActive }" />
</template>

<style scoped>
.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--vscode-scrollbarSlider-hoverBackground);
  opacity: 0.6;
  z-index: 2;
  cursor: col-resize;
  transition: background-color 0.1s ease;
}

.resize-handle:hover {
  background: var(--vscode-activityBar-activeBorder);
  opacity: 0.8;
  cursor: col-resize;
}

.resize-handle.active {
  background: var(--vscode-activityBar-activeBorder);
  opacity: 1;
  cursor: col-resize;
}
</style>
