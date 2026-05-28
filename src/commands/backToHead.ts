import { window } from 'vscode'
import { useGitService } from '@/git'
import { useGitPanelView } from '@/views/webview'
import { logger } from '@/utils'

export default async function backToHeadCommand() {
  try {
    const git = useGitService()
    const webview = useGitPanelView()
    const head = await git.getHeadInfo()

    if (!head) {
      await window.showWarningMessage('Unable to locate HEAD commit')
      return
    }

    await webview.backToHead(head)
    logger.info(`Back to HEAD: ${head.hash}`)
  }
  catch (error) {
    logger.error('Failed to go back to HEAD:', error)
    await window.showErrorMessage('Failed to go back to HEAD')
  }
}
