import { Uri, window } from 'vscode'
import { executeCommand, useWorkspaceFolders } from 'reactive-vscode'

import type { DiffTreeView } from '@/views/diff'
import { useGitService } from '@/git'
import { GIT_STATUS } from '@/constant'
import { toGitUri } from '@/utils'

export default function diffCommand(diffProvider: DiffTreeView) {
  const { getPreviousCommit } = useGitService()
  const workspaceFolders = useWorkspaceFolders()

  return async (fileInfo: { path: string, status: string }) => {
    const commit = diffProvider.getSelectedCommitHash()
    if (!commit) {
      return
    }

    const workspaceRoot = workspaceFolders.value?.[0]?.uri
    if (!workspaceRoot) {
      return
    }

    const uri = Uri.joinPath(workspaceRoot, fileInfo.path)
    const title = `${fileInfo.path} (${commit})`

    // For modified files, show diff between current commit and its parent
    if (fileInfo.status === GIT_STATUS.MODIFIED) {
      try {
        const previousCommit = await getPreviousCommit(commit)
        if (previousCommit) {
          const leftUri = toGitUri(uri, previousCommit)
          const rightUri = toGitUri(uri, commit)
          await executeCommand('vscode.diff', leftUri, rightUri, title)
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
      const gitUri = toGitUri(uri, commit)
      await executeCommand('vscode.open', gitUri)
    }
  }
}
