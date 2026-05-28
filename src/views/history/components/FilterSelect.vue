<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  options: string[]
  placeholder?: string
  disabled?: boolean
  emptyText?: string
  allLabel?: string
  width?: string
  placement?: 'left' | 'right'
}>(), {
  placeholder: 'Select...',
  emptyText: 'No results',
  allLabel: 'All',
  width: '180px',
  placement: 'left',
})

const modelValue = defineModel<string>({ default: '' })

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const query = ref('')
const activeIndex = ref(0)

const selectedLabel = computed(() => modelValue.value || '')

const filteredOptions = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword)
    return props.options

  return props.options.filter(option => option.toLowerCase().includes(keyword))
})

watch(() => modelValue.value, (value) => {
  if (!isOpen.value) {
    query.value = value || ''
  }
})

watch(filteredOptions, () => {
  activeIndex.value = 0
})

function open() {
  if (props.disabled)
    return

  isOpen.value = true
  query.value = ''
  activeIndex.value = Math.max(0, filteredOptions.value.findIndex(option => option === modelValue.value))

  nextTick(() => inputRef.value?.focus())
  document.addEventListener('mousedown', handleDocumentMouseDown)
}

function close() {
  isOpen.value = false
  query.value = modelValue.value || ''
  document.removeEventListener('mousedown', handleDocumentMouseDown)
}

function toggle() {
  if (isOpen.value)
    close()
  else
    open()
}

function selectOption(option: string) {
  modelValue.value = option
  close()
}

function clear(event?: MouseEvent) {
  event?.stopPropagation()
  modelValue.value = ''
  query.value = ''
  close()
}

function handleDocumentMouseDown(event: MouseEvent) {
  if (!rootRef.value?.contains(event.target as Node)) {
    close()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value && (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === ' ')) {
    event.preventDefault()
    open()
    return
  }

  if (!isOpen.value)
    return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filteredOptions.value.length - 1)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  }
  else if (event.key === 'Enter') {
    event.preventDefault()
    const option = filteredOptions.value[activeIndex.value]
    if (option)
      selectOption(option)
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown)
})
</script>

<template>
  <div
    ref="rootRef"
    class="filter-select"
    :class="{ open: isOpen, disabled, 'align-right': placement === 'right' }"
    :style="{ width }"
    @keydown="handleKeydown"
  >
    <div
      role="button"
      tabindex="0"
      class="filter-select-trigger"
      :aria-disabled="disabled"
      @click="toggle"
    >
      <span class="filter-select-value" :class="{ placeholder: !selectedLabel }">
        {{ selectedLabel || placeholder }}
      </span>
      <button
        v-if="selectedLabel && !disabled"
        type="button"
        class="filter-select-clear"
        title="Clear"
        @click="clear"
      >
        ×
      </button>
      <span class="filter-select-chevron codicon codicon-chevron-down" />
    </div>

    <div v-if="isOpen" class="filter-select-popover">
      <div class="filter-select-search">
        <span class="codicon codicon-search" />
        <input
          ref="inputRef"
          v-model="query"
          class="filter-select-input"
          :placeholder="placeholder"
          :disabled="disabled"
        >
      </div>

      <div class="filter-select-options">
        <button
          type="button"
          class="filter-select-option clear-option"
          :class="{ active: modelValue === '' && query.trim() === '' }"
          @click="clear()"
        >
          {{ allLabel }}
        </button>
        <template v-if="filteredOptions.length > 0">
          <button
            v-for="(option, index) in filteredOptions"
            :key="option"
            type="button"
            class="filter-select-option"
            :class="{ selected: option === modelValue, active: index === activeIndex }"
            :title="option"
            @mouseenter="activeIndex = index"
            @click="selectOption(option)"
          >
            <span class="option-text">{{ option }}</span>
            <span v-if="option === modelValue" class="codicon codicon-check" />
          </button>
        </template>
        <div v-else class="filter-select-empty">
          {{ emptyText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-select {
  position: relative;
  flex: 0 0 auto;
  min-width: 120px;
  max-width: 240px;
  font-size: 13px;
}

.filter-select-trigger {
  width: 100%;
  height: 26px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 7px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  cursor: pointer;
  outline: none;
}

.filter-select.open .filter-select-trigger,
.filter-select-trigger:focus-visible {
  border-color: var(--vscode-focusBorder);
}

.filter-select.disabled .filter-select-trigger {
  opacity: 0.6;
  cursor: not-allowed;
}

.filter-select-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.filter-select-value.placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.filter-select-clear {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  font-size: 14px;
}

.filter-select-clear:hover {
  color: var(--vscode-foreground);
}

.filter-select-chevron {
  flex: 0 0 auto;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  transition: transform 0.12s ease;
}

.filter-select.open .filter-select-chevron {
  transform: rotate(180deg);
}

.filter-select-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: min(320px, max(100%, 260px));
  max-width: calc(100vw - 24px);
  z-index: 1000;
  border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
  border-radius: 8px;
  background: var(--vscode-editorWidget-background, var(--vscode-dropdown-background));
  box-shadow: 0 8px 24px var(--vscode-widget-shadow);
  padding: 6px;
}

.filter-select.align-right .filter-select-popover {
  left: auto;
  right: 0;
}

.filter-select-search {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 7px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 5px;
  background: var(--vscode-input-background);
  color: var(--vscode-descriptionForeground);
  margin-bottom: 6px;
}

.filter-select-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--vscode-input-foreground);
  font-size: 13px;
}

.filter-select-options {
  max-height: 260px;
  overflow-y: auto;
  padding-right: 2px;
}

.filter-select-option {
  width: 100%;
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  padding: 4px 7px;
  text-align: left;
  font-size: 12px;
}

.filter-select-option:hover,
.filter-select-option.active {
  background: var(--vscode-list-hoverBackground);
}

.filter-select-option.selected {
  color: var(--vscode-list-activeSelectionForeground);
  background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 78%, transparent);
}

.clear-option {
  color: var(--vscode-descriptionForeground);
  margin-bottom: 2px;
}

.option-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-select-empty {
  padding: 10px 7px;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}
</style>
