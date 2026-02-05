import { window } from 'vscode'
import { useGitService } from '@/git'
import { logger } from '@/utils'

export default async function showStatsCommand() {
  try {
    const git = useGitService()

    // Get repository statistics
    const [branches, authors] = await Promise.all([
      git.getAllBranches(),
      git.getAllAuthors(),
    ])

    // Get total commits count
    const totalCommitsResult = await git.git.raw(['rev-list', '--count', 'HEAD'])
    const totalCommits = Number.parseInt(totalCommitsResult.trim(), 10)

    // Show stats in a QuickPick
    const stats = [
      `📊 Repository Statistics`,
      ``,
      `Total Commits: ${totalCommits}`,
      `Total Branches: ${branches.length}`,
      `Total Authors: ${authors.length}`,
    ].join('\n')

    await window.showInformationMessage(stats, { modal: false })
    logger.info('Showed repository statistics')
  }
  catch (error) {
    logger.error('Failed to get repository statistics:', error)
    await window.showErrorMessage('Failed to get repository statistics')
  }
}
