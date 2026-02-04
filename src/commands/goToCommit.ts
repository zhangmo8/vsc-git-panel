import { window } from 'vscode'
import { useGitPanelView } from '@/views/webview'
import { logger } from '@/utils'

export default async function goToCommitCommand() {
  try {
    const webview = useGitPanelView()

    // Ask user for commit hash
    const hash = await window.showInputBox({
      prompt: 'Enter commit hash (minimum 7 characters)',
      placeHolder: 'e.g., abc1234',
      validateInput: (value) => {
        if (!value || value.length < 7) {
          return 'Commit hash must be at least 7 characters'
        }
        if (!/^[a-f0-9]+$/i.test(value)) {
          return 'Commit hash must contain only hexadecimal characters'
        }
        return undefined
      },
    })

    if (!hash) {
      return // User cancelled
    }

    // Refresh history with the commit hash
    await webview.refreshHistory(true, { search: hash })
    logger.info(`Navigated to commit: ${hash}`)
  }
  catch (error) {
    logger.error('Failed to navigate to commit:', error)
    await window.showErrorMessage('Failed to navigate to commit')
  }
}
