import { Uri, env, window } from 'vscode'
import { useGitService } from '@/git'
import { logger } from '@/utils'

export default async function openCommitOnWebCommand(hash?: string) {
  if (!hash) {
    logger.warn('No hash provided to open commit on web')
    return
  }

  try {
    const git = useGitService()
    const url = await git.getCommitWebUrl(hash)

    if (!url) {
      await window.showWarningMessage('No web URL available for this commit (remote not found or unsupported host).')
      return
    }

    await env.openExternal(Uri.parse(url))
    logger.info(`Opened commit on web: ${url}`)
  }
  catch (error) {
    logger.error('Failed to open commit on web:', error)
    await window.showErrorMessage('Failed to open commit on web')
  }
}
