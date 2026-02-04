# VSC Git Panel 👀 WIP

  Inspect by [Git History](https://marketplace.visualstudio.com/items?itemName=GuodongSun.vscode-git-cruise).

  A Git viewing tool for the brief introduction version for VS Code.

  Just a bare-bones implementation. Many features are not yet fully developed. If there is a real need, you can use [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens).

<a href="https://marketplace.visualstudio.com/items?itemName=zhangmo8.git-panel" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/v/zhangmo8.git-panel.png?color=eee&amp;label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="Visual Studio Marketplace Version" /></a>
<a href="https://kermanx.github.io/reactive-vscode/" target="__blank"><img src="https://img.shields.io/badge/made_with-reactive--vscode-%23007ACC?style=flat&labelColor=%23229863"  alt="Made with reactive-vscode" /></a>

## 📚 Documentation

- [**技术栈与开发指南**](./TECH_STACK.md) - 详细的技术栈说明、架构设计和开发规范
- [**Copilot 配置文档**](./.copilot-context.md) - 为 AI 助手提供的项目上下文信息

## Configurations

<!-- configs -->

| Key                                  | Description                                                          | Type      | Default |
| ------------------------------------ | -------------------------------------------------------------------- | --------- | ------- |
| `git-panel.history.pageSize`         | Number of commits to load per page in history view                   | `number`  | `45`    |
| `git-panel.history.refreshDebounce`  | Debounce time (ms) for auto-refresh when git changes are detected    | `number`  | `500`   |
| `git-panel.performance.enableCache`  | Enable caching of git history queries for better performance         | `boolean` | `true`  |
| `git-panel.performance.cacheTimeout` | Cache timeout in milliseconds (default: 60 seconds)                  | `number`  | `60000` |
| `git-panel.search.enableFilePath`    | Enable file path search in history (requires -- separator in search) | `boolean` | `true`  |

<!-- configs -->

## Commands

<!-- commands -->

| Command                     | Title                                |
| --------------------------- | ------------------------------------ |
| `git-panel.history`         | GitPanel: History                    |
| `git-panel.history.clear`   | GitPanel: Clear Selection            |
| `git-panel.history.refresh` | GitPanel: Refresh History            |
| `git-panel.copyHash`        | GitPanel: Copy Commit Hash           |
| `git-panel.showStats`       | GitPanel: Show Repository Statistics |
| `git-panel.goToCommit`      | GitPanel: Go to Commit by Hash       |

<!-- commands -->

## License

[MIT](./LICENSE.md) License © 2025 [zhangmo8](https://github.com/zhangmo8)
