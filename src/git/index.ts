import simpleGit from 'simple-git'
import { createSingletonComposable, useWorkspaceFolders } from 'reactive-vscode'

import type { Uri } from 'vscode'
import type { SimpleGit } from 'simple-git'
import type { ExtendedLogResult } from './types'
import { logger } from '@/utils'

export * from './types'

export const useGitService = createSingletonComposable(() => {
  const workspaceFolders = useWorkspaceFolders()
  if (!workspaceFolders.value || workspaceFolders.value.length === 0)
    throw new Error('No workspace folder found. Please open a folder first.')

  const rootRepoPath = workspaceFolders.value[0].uri.fsPath

  const git: SimpleGit = simpleGit(rootRepoPath, {
    binary: 'git',
    maxConcurrentProcesses: 10,
  })

  async function getHistory(): Promise<ExtendedLogResult> {
    try {
      const logResult = await git.log([
        '--all',
        '--stat',
        '--max-count=100',
      ]) as ExtendedLogResult

      for (const commit of logResult.all) {
        try {
          const { diff, author_email, author_name } = commit
          commit.authorEmail = author_email
          commit.authorName = author_name

          commit.stats = {
            files: diff?.changed || 0,
            additions: diff?.insertions || 0,
            deletions: diff?.deletions || 0,
          }
        }
        catch (error) {
          logger.warn(`Failed to get stats for commit ${commit.hash}:`, error)
          commit.stats = { files: 0, additions: 0, deletions: 0 }
        }
      }

      return logResult
    }
    catch (error) {
      logger.error('Error getting git history:', error)
      throw error
    }
  }

  async function getPreviousCommit(commitHash: string): Promise<string | null> {
    try {
      const result = await git.raw(['rev-list', '--parents', '-n', '1', commitHash])
      const [, parentHash] = result.trim().split(' ')
      return parentHash || null
    }
    catch (error) {
      console.error('Failed to get parent commit:', error)
      return null
    }
  }

  return {
    git,
    rootRepoPath,
    getHistory,
    getPreviousCommit,
  }
})
