# VSC Git Panel - 技术栈与开发指南

本文档详细描述了 VSC Git Panel 项目的技术栈、架构设计、代码风格和开发规范。

## 📋 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [架构设计](#架构设计)
- [代码风格](#代码风格)
- [开发规范](#开发规范)
- [构建与部署](#构建与部署)
- [贡献指南](#贡献指南)

## 🎯 项目概述

VSC Git Panel 是一个为 Visual Studio Code 开发的 Git 可视化扩展，提供直观的 Git 历史查看和文件变更管理功能。项目采用现代化的前端技术栈，注重性能和用户体验。

## 🔧 技术栈

### 核心技术

| 技术 | 版本 | 用途 | 说明 |
|------|------|------|------|
| **TypeScript** | ~5.6.2 | 主要开发语言 | 提供类型安全和现代ES特性 |
| **Vue 3** | ^3.5.13 | 前端框架 | 使用 Composition API 构建用户界面 |
| **Vite** | ^6.0.5 | 前端构建工具 | 快速的开发服务器和构建工具 |
| **tsup** | ^8.2.4 | 扩展后端构建 | 构建VS Code扩展的后端代码 |

### VS Code 相关

| 依赖 | 版本 | 用途 |
|------|------|------|
| **@types/vscode** | ^1.92.0 | VS Code API 类型定义 |
| **reactive-vscode** | ^0.2.0 | 响应式扩展开发框架 |
| **vscode-ext-gen** | ^0.4.1 | 扩展元数据生成工具 |

### Git 操作

| 依赖 | 版本 | 用途 |
|------|------|------|
| **simple-git** | ^3.27.0 | Git 操作库 |

### 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| **@antfu/eslint-config** | ^2.26.0 | 代码规范配置 |
| **vitest** | latest | 单元测试框架 |
| **pnpm** | ^9.7.1 | 包管理器 |
| **concurrently** | ^9.1.2 | 并行运行开发任务 |

### UI 组件与工具

| 依赖 | 版本 | 用途 |
|------|------|------|
| **vue-virtual-scroller** | ^1.1.2 | 虚拟滚动组件 |
| **dayjs** | ^1.11.13 | 时间处理库 |

## 🏗️ 架构设计

### 项目结构

```
src/
├── commands/           # VS Code 命令定义
│   ├── clear.ts       # 清除选择命令
│   ├── diff.ts        # 差异对比命令
│   ├── refresh.ts     # 刷新命令
│   └── index.ts       # 命令注册
├── decoration/         # 文件装饰器
│   ├── FileNodeDecoration.ts
│   └── utils.ts
├── git/               # Git 操作相关
│   ├── GitChangeMonitor.ts  # Git 变更监控
│   ├── types.ts            # Git 类型定义
│   └── index.ts
├── views/             # 视图组件
│   ├── webview.ts     # Webview 管理
│   ├── diff/          # 差异视图
│   └── history/       # 历史视图
│       ├── App.vue    # 主应用组件
│       ├── index.ts   # 入口文件
│       └── components/ # 子组件
├── generated/         # 自动生成的文件
├── config.ts          # 配置管理
├── constant.ts        # 常量定义
├── storage.ts         # 数据存储
├── utils.ts           # 工具函数
└── index.ts           # 扩展入口
```

### 核心架构模式

#### 1. 响应式架构
```typescript
// 使用 reactive-vscode 创建响应式扩展
const { activate, deactivate } = defineExtension(() => {
  // 扩展逻辑
})
```

#### 2. 单例模式
```typescript
// 存储管理使用单例模式
export const useStorage = createSingletonComposable(() => {
  // 存储逻辑
})
```

#### 3. 组合式 API
```vue
<script setup lang="ts">
// Vue 3 Composition API
const commits = ref<CommitGraph>()
const selectedCommitHashes = ref<string[]>([])
</script>
```

## 🎨 代码风格

### TypeScript 配置

```json
{
  "compilerOptions": {
    "target": "es2017",
    "module": "esnext",
    "moduleResolution": "node",
    "strict": true,
    "strictNullChecks": true,
    "esModuleInterop": true
  }
}
```

### ESLint 配置

使用 Anthony Fu 的 ESLint 配置，提供一致的代码风格：

```javascript
import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['dist', 'node_modules', 'generated']
})
```

### 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 文件名 | PascalCase (组件) / camelCase (工具) | `GitChangeMonitor.ts`, `utils.ts` |
| 变量名 | camelCase | `selectedCommitHashes` |
| 常量名 | UPPER_SNAKE_CASE | `WEBVIEW_CHANNEL` |
| 组件名 | PascalCase | `CommitTable` |
| 函数名 | camelCase | `getCommitFiles` |

### Vue 组件风格

```vue
<script setup lang="ts">
// 使用 <script setup> 语法
import { computed, ref } from 'vue'

// Props 定义
const props = defineProps<{
  commits: Commit[]
  graphData: GitOperation[]
}>()

// 响应式数据
const selectedHashes = ref<string[]>([])

// 计算属性
const transformedCommits = computed(() => {
  return props.commits.map(commit => ({
    ...commit,
    formattedDate: dayjs(commit.date).format('YYYY-MM-DD HH:mm')
  }))
})
</script>

<template>
  <!-- 模板使用 VS Code CSS 变量 -->
  <div
    class="container"
    :style="{
      backgroundColor: 'var(--vscode-sideBar-background)',
    }"
  >
    <!-- 内容 -->
  </div>
</template>

<style scoped>
/* 使用 VS Code 主题变量 */
.container {
  color: var(--vscode-foreground);
  background-color: var(--vscode-sideBar-background);
}
</style>
```

## 📋 开发规范

### 1. 类型定义

所有数据结构都应有明确的类型定义：

```typescript
interface Commit {
  hash: string
  date: string
  message: string
  author_name: string
  author_email: string
  refs?: string
  files?: Array<{ status: string, path: string }>
}

interface CommitGraph {
  operations: GitOperation[]
  branches: string[]
  logResult: {
    all: Commit[]
    total: number
  }
}
```

### 2. 错误处理

使用统一的错误处理模式：

```typescript
try {
  const result = await gitOperation()
  return result
}
catch (error) {
  logger.error('Git operation failed:', error)
  vscode.window.showErrorMessage(`操作失败: ${error.message}`)
}
```

### 3. 日志记录

使用专门的 logger 而非 console：

```typescript
import { logger } from './utils'

logger.info('Extension activated')
logger.error('Error occurred:', error)
```

### 4. 性能优化

- 使用虚拟滚动处理大量数据
- 计算属性缓存复杂计算
- 按需加载组件

```typescript
// 虚拟滚动配置
const ITEMS_PER_PAGE = 45
const visibleCommits = computed(() => {
  const end = currentPage.value * ITEMS_PER_PAGE
  return commitData.value.slice(0, end)
})
```

## 🚀 构建与部署

### 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式（并行运行前端和后端）
pnpm dev

# 构建
pnpm build

# 代码检查
pnpm lint

# 运行测试
pnpm test

# 类型检查
pnpm typecheck
```

### 构建配置

#### Vite 配置 (前端)
```typescript
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: './src/views/history/index.ts',
      formats: ['es'],
      fileName: format => `views.${format}.js`,
    },
    rollupOptions: {
      output: {
        assetFileNames: 'views.css'
      }
    }
  }
})
```

#### tsup 配置 (扩展后端)
```typescript
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  external: ['vscode'],
  noExternal: ['simple-git']
})
```

### 发布流程

```bash
# 更新版本并发布
pnpm release
```

这会执行：
1. 准备构建 (`pnpm prepare`)
2. 版本升级 (`bumpp`)
3. 发布到市场 (`pnpm publish`)

## 🤝 贡献指南

### 开发环境要求

- Node.js >= 18
- pnpm >= 9
- VS Code >= 1.92.0

### 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 添加新功能
fix: 修复bug
docs: 更新文档
style: 代码格式调整
refactor: 重构代码
test: 添加测试
chore: 构建过程或辅助工具的变动
```

### Pull Request 流程

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 代码审查要点

- [ ] TypeScript 类型检查通过
- [ ] ESLint 规则通过
- [ ] 单元测试覆盖新功能
- [ ] 文档更新完整
- [ ] 性能影响评估

## 📚 学习资源

- [VS Code Extension API](https://code.visualstudio.com/api)
- [reactive-vscode 文档](https://kermanx.github.io/reactive-vscode/)
- [Vue 3 Composition API](https://vuejs.org/guide/composition-api-introduction.html)
- [Vite 构建工具](https://vitejs.dev/)
- [Anthony Fu's ESLint Config](https://github.com/antfu/eslint-config)

---

## 🔄 更新日志

本文档会随着项目的发展持续更新。最后更新时间：2025年8月13日

如有疑问或建议，请提交 Issue 或联系维护者。
