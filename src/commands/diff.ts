import { Uri, window } from 'vscode'
import { executeCommand, useWorkspaceFolders } from 'reactive-vscode'

import { useGitService } from '@/git'
import { GIT_STATUS } from '@/constant'
import { getFileNameByPath, shortHash, toGitUri } from '@/utils'
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

    // For modified files, show diff between current commit and its parent
    if (fileInfo.status === GIT_STATUS.MODIFIED) {
      try {
        const title = `${getFileNameByPath(fileInfo.path)} (${shortHash(fileInfo.commitHash)})`
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

    // For added files, show diff between empty untitled file and new file
    if (fileInfo.status === GIT_STATUS.ADDED) {
      const title = `${getFileNameByPath(fileInfo.path)} (Add to ${shortHash(fileInfo.commitHash)})`
      const emptyUri = Uri.parse(`untitled: ${fileInfo.path}`)
      const gitUri = toGitUri(uri, fileInfo.commitHash)
      await executeCommand('vscode.diff', emptyUri, gitUri, title)
    }

    // For deleted files, show diff between original file and empty untitled file
    if (fileInfo.status === GIT_STATUS.DELETED) {
      try {
        const previousCommit = await getPreviousCommit(fileInfo.commitHash)

        if (previousCommit) {
          const title = `${getFileNameByPath(fileInfo.path)} (Remove to ${shortHash(previousCommit)})`
          const gitUri = toGitUri(uri, previousCommit)
          const emptyUri = Uri.parse(`untitled: ${fileInfo.path}`)
          await executeCommand('vscode.diff', gitUri, emptyUri, title)
        }
      }
      catch (error) {
        window.showErrorMessage(`Fail to get parent commit: ${error}`)
      }
    }

    // For renamed files, show diff between old file path and new file path
    if (fileInfo.status === GIT_STATUS.RENAMED) {
      try {
        const previousCommit = await getPreviousCommit(fileInfo.commitHash)
        if (previousCommit && fileInfo.oldPath) {
          // Create URI for old file path
          const oldUri = Uri.joinPath(workspaceRoot, fileInfo.oldPath)
          const leftUri = toGitUri(oldUri, previousCommit)
          const rightUri = toGitUri(uri, fileInfo.commitHash)

          const renameTitle = `${getFileNameByPath(fileInfo.oldPath)} → ${getFileNameByPath(fileInfo.path)} (${shortHash(fileInfo.commitHash)})`
          await executeCommand('vscode.diff', leftUri, rightUri, renameTitle)
        }
      }
      catch (error) {
        window.showErrorMessage(`Fail to get parent commit for renamed file: ${error}`)
      }
    }
  }
}
