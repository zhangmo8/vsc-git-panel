import * as vscode from 'vscode'
import type { DiffProvider } from '@/views/diff'
import { GitService } from '@/git'

export default function diffCommand(gitService: GitService, diffProvider: DiffProvider) {
  return vscode.commands.registerCommand('vscGitPanel.openDiff', async (fileInfo: { path: string, status: string }) => {
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
        const previousCommit = await gitService.getPreviousCommit(commit)
        if (previousCommit) {
          const leftUri = GitService.toGitUri(uri, previousCommit)
          const rightUri = GitService.toGitUri(uri, commit)
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
      const gitUri = GitService.toGitUri(uri, commit)
      await vscode.commands.executeCommand('vscode.open', gitUri)
    }
  })
}
