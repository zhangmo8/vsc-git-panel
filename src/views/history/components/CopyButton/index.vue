<script setup lang="ts">
import { defineProps, ref } from 'vue'

const props = defineProps<{
  copyText: string
}>()

const copyStatus = ref<boolean>(false)

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(props.copyText)
    copyStatus.value = true
    setTimeout(() => {
      copyStatus.value = false
    }, 400)
  }
  catch (error) {
    console.error('Failed to copy: ', error)
  }
}
</script>

<template>
  <button class="copy-button" @click.stop="copyToClipboard">
    {{ copyStatus ? '✓' : 'Copy' }}
  </button>
</template>

<style scoped>
.copy-button {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
  opacity: 0.6;
  z-index: 1;
}

.copy-button:hover {
  opacity: 1;
  background-color: var(--vscode-button-hoverBackground);
}

.copy-button.success {
  background-color: var(--vscode-gitDecoration-addedResourceForeground);
}
</style>
