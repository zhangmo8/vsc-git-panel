import { Uri, window } from 'vscode'
import { executeCommand } from 'reactive-vscode'

import { useGitService } from '@/git'
import { getFileNameByPath, logger, shortHash, toGitUri } from '@/utils'

interface CommitDiffArgs {
  /** Commit the hovered line is attributed to */
  hash: string
  /** File path (relative to repo root) as it exists at `hash` */
  filePath: string
}

export default async function openCommitDiffCommand(args?: CommitDiffArgs) {
  if (!args?.hash || !args.filePath) {
    logger.warn('Missing arguments to open commit diff')
    return
  }

  try {
    const { getFileChangeRefs, rootRepoPath } = useGitService()
    const root = Uri.file(rootRepoPath)

    // Resolve this file's own previous commit (follows renames), not the
    // parent of `hash` — the parent may be a merge or may not touch the file.
    const refs = await getFileChangeRefs(args.hash, args.filePath)
    if (!refs) {
      await window.showWarningMessage('No commit history found for this file.')
      return
    }

    const { current, previous } = refs
    const fileName = getFileNameByPath(current.path)
    const rightUri = toGitUri(Uri.joinPath(root, current.path), current.commit)

    // First commit for this file — diff against an empty document (full add)
    if (!previous) {
      const emptyUri = Uri.parse(`untitled:${current.path}`)
      await executeCommand('vscode.diff', emptyUri, rightUri, `${fileName} (Added in ${shortHash(current.commit)})`)
      return
    }

    const leftUri = toGitUri(Uri.joinPath(root, previous.path), previous.commit)
    const title = `${fileName} (${shortHash(previous.commit)} → ${shortHash(current.commit)})`
    await executeCommand('vscode.diff', leftUri, rightUri, title)
    logger.info(`Opened commit diff: ${title}`)
  }
  catch (error) {
    logger.error('Failed to open commit diff:', error)
    await window.showErrorMessage('Failed to open commit diff')
  }
}
