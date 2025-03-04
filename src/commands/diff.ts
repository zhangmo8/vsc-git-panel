import { Uri, window } from 'vscode'
import { executeCommand, useWorkspaceFolders } from 'reactive-vscode'

import { useGitService } from '@/git'
import { GIT_STATUS } from '@/constant'
import { toGitUri } from '@/utils'
import { useDiffTreeView } from '@/views/diff'

export default function diffCommand() {
  const { getPreviousCommit } = useGitService()
  const workspaceFolders = useWorkspaceFolders()
  const { selectedCommitHashes } = useDiffTreeView()

  return async (fileInfo: { path: string, status: string, commitHash: string, oldPath?: string }) => {
    const commits = selectedCommitHashes.value
    if (!commits || commits.length === 0) {
      return
    }

    const workspaceRoot = workspaceFolders.value?.[0]?.uri
    if (!workspaceRoot) {
      return
    }

    const uri = Uri.joinPath(workspaceRoot, fileInfo.path)
    const title = `${fileInfo.path} (${fileInfo.commitHash})`

    // For modified files, show diff between current commit and its parent
    if (fileInfo.status === GIT_STATUS.MODIFIED) {
      try {
        const previousCommit = await getPreviousCommit(fileInfo.commitHash)
        if (previousCommit) {
          const leftUri = toGitUri(uri, previousCommit)
          const rightUri = toGitUri(uri, fileInfo.commitHash)
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
      const gitUri = toGitUri(uri, fileInfo.commitHash)
      await executeCommand('vscode.open', gitUri)
    }
  }
}
