import * as vscode from 'vscode'

import { GitPanelViewProvider } from './views/webview'
import { DiffProvider } from './views/diff'

import { GitService } from './git'
import { StorageService } from './storage'
import { logger } from './utils'

export function activate(context: vscode.ExtensionContext) {
  logger.info('Git Panel Activated')

  const storageService = StorageService.initialize(context)
  storageService.clearCommits()

  const gitService = new GitService()

  const provider = new GitPanelViewProvider(vscode.Uri.file(__dirname), gitService)
  vscode.window.registerWebviewViewProvider(GitPanelViewProvider.viewType, provider)

  const diffProvider = DiffProvider.getInstance()
  vscode.window.createTreeView('git-panel.changes', {
    treeDataProvider: diffProvider,
    showCollapseAll: true,
  })

  // Register openDiff command
  context.subscriptions.push(
    vscode.commands.registerCommand('vscGitPanel.openDiff', async (fileInfo: { path: string, status: string }) => {
      const commit = diffProvider.getSelectedCommitHash()
      if (!commit) {
        return
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
      if (!workspaceRoot) {
        return
      }

      const uri = vscode.Uri.joinPath(workspaceRoot, fileInfo.path)
      const title = `${fileInfo.path} (${commit})`

      // For modified files, show diff between current commit and its parent
      if (fileInfo.status === 'M') {
        try {
          const parentCommit = await gitService.getParentCommit(commit)
          if (parentCommit) {
            const leftUri = toGitUri(uri, parentCommit)
            const rightUri = toGitUri(uri, commit)
            await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title)
            return
          }
        }
        catch (error) {
          vscode.window.showErrorMessage(`无法获取父提交: ${error}`)
          return
        }
      }

      // For added files, show the entire file content
      if (fileInfo.status === 'A') {
        const gitUri = toGitUri(uri, commit)
        await vscode.commands.executeCommand('vscode.open', gitUri)
      }
    }),
  )
}

// Helper function to create Git URIs
function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
  return uri.with({
    scheme: 'git',
    path: uri.path,
    query: JSON.stringify({
      path: uri.path,
      ref,
    }),
  })
}
