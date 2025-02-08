import * as vscode from 'vscode'
import type { GitPanelViewProvider } from '@/views/webview'

export default function refreshCommand(provider: GitPanelViewProvider) {
  return vscode.commands.registerCommand('git-panel.history.refresh', () => {
    provider.refreshHistory(true)
  })
}
