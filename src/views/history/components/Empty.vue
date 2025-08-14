<script setup lang="ts">
// 无需逻辑
</script>

<template>
  <div class="empty-container">
    <div class="empty-text">
      Not Found
    </div>
  </div>
</template>

<style scoped>
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--vscode-descriptionForeground, #888);
  padding: 32px 0;
}
.empty-illustration {
  margin-bottom: 16px;
}
.empty-text {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 4px;
}
.empty-sub {
  font-size: 13px;
  color: var(--vscode-descriptionForeground, #aaa);
}
</style>
