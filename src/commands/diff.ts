import { Uri, commands, window, workspace } from 'vscode'

import type { DiffTreeView } from '@/views/diff'
import { GitService } from '@/git'
import { EXTENSION_SYMBOL, GIT_STATUS } from '@/constant'

export default function diffCommand(gitService: GitService, diffProvider: DiffTreeView) {
  return commands.registerCommand(`${EXTENSION_SYMBOL}.openDiff`, async (fileInfo: { path: string, status: string }) => {
    const commit = diffProvider.getSelectedCommitHash()
    if (!commit) {
      return
    }

    const workspaceRoot = workspace.workspaceFolders?.[0]?.uri
    if (!workspaceRoot) {
      return
    }

    const uri = Uri.joinPath(workspaceRoot, fileInfo.path)
    const title = `${fileInfo.path} (${commit})`

    // For modified files, show diff between current commit and its parent
    if (fileInfo.status === GIT_STATUS.MODIFIED) {
      try {
        const previousCommit = await gitService.getPreviousCommit(commit)
        if (previousCommit) {
          const leftUri = GitService.toGitUri(uri, previousCommit)
          const rightUri = GitService.toGitUri(uri, commit)
          await commands.executeCommand('vscode.diff', leftUri, rightUri, title)
          return
        }
      }
      catch (error) {
        window.showErrorMessage(`Fail to get parent commit: ${error}`)
        return
      }
    }

    // For added files, show the entire file content
    if (fileInfo.status === GIT_STATUS.ADDED) {
      const gitUri = GitService.toGitUri(uri, commit)
      await commands.executeCommand('vscode.open', gitUri)
    }
  })
}
