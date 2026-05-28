import simpleGit from 'simple-git'
import { createSingletonComposable, useWorkspaceFolders } from 'reactive-vscode'

import type { SimpleGit } from 'simple-git'
import type { Commit, CommitGraph, ExtendedLogResult, GitHistoryFilter } from './types'
import {
  buildHistoryLogArgs,
  buildOperations,
  createCacheKey,
  extractBranches,
  isBadRevisionError,
  parseRawGitLog,
} from './historyUtils'
import { logger } from '@/utils'
import { config } from '@/config'

export * from './types'
export * from './utils'
export * from './historyUtils'

// Cache interface
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const MAX_HISTORY_CACHE_SIZE = 30

function createEmptyCommitGraph(): CommitGraph {
  return {
    operations: [],
    branches: [],
    logResult: {
      all: [],
      total: 0,
      latest: null,
    } as ExtendedLogResult,
  }
}

export const useGitService = createSingletonComposable(() => {
  const workspaceFolders = useWorkspaceFolders()
  if (!workspaceFolders.value || workspaceFolders.value.length === 0)
    throw new Error('No workspace folder found. Please open a folder first.')

  const rootRepoPath = workspaceFolders.value[0].uri.fsPath

  const git: SimpleGit = simpleGit(rootRepoPath, {
    binary: 'git',
    maxConcurrentProcesses: 10,
  })

  // Initialize cache storage
  const historyCache = new Map<string, CacheEntry<CommitGraph>>()

  // Helper to check if cache is valid
  function isCacheValid<T>(entry: CacheEntry<T>): boolean {
    const cacheTimeout = config['performance.cacheTimeout'] ?? 60000
    return Date.now() - entry.timestamp < cacheTimeout
  }

  function getCachedHistory(cacheKey: string): CommitGraph | undefined {
    const cached = historyCache.get(cacheKey)
    if (!cached) {
      return undefined
    }

    if (!isCacheValid(cached)) {
      historyCache.delete(cacheKey)
      return undefined
    }

    // Refresh insertion order for LRU behavior.
    historyCache.delete(cacheKey)
    historyCache.set(cacheKey, cached)
    return cached.data
  }

  function setCachedHistory(cacheKey: string, data: CommitGraph): void {
    if (historyCache.has(cacheKey)) {
      historyCache.delete(cacheKey)
    }

    historyCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    })

    while (historyCache.size > MAX_HISTORY_CACHE_SIZE) {
      const oldestKey = historyCache.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      historyCache.delete(oldestKey)
    }
  }

  // Helper to clear cache
  function clearCache(): void {
    historyCache.clear()
    logger.info('Git history cache cleared')
  }

  async function getAllBranches(): Promise<string[]> {
    try {
      const branches = await git.branch()
      return branches.all
    }
    catch (error) {
      logger.error('Failed to get all branches:', error)
      return []
    }
  }

  // 获取所有作者
  async function getAllAuthors(): Promise<string[]> {
    try {
      // 使用 git log --format="%an <%ae>" 获取所有作者
      const result = await git.raw(['log', '--format=%an <%ae>'])
      const authors = Array.from(new Set(result.split('\n').map(line => line.trim()).filter(Boolean)))
      return authors
    }
    catch (error) {
      logger.error('Failed to get all authors:', error)
      return []
    }
  }

  async function getHistory(filter?: GitHistoryFilter, forceRefresh: boolean = false): Promise<CommitGraph> {
    try {
      // Check cache if enabled and not forcing refresh
      const enableCache = config['performance.enableCache'] ?? true
      const cacheKey = createCacheKey(filter)

      if (enableCache && !forceRefresh) {
        const cached = getCachedHistory(cacheKey)
        if (cached) {
          logger.info(`Using cached git history for key: ${cacheKey}`)
          return cached
        }
      }

      const startTime = Date.now()
      const logArgs = buildHistoryLogArgs(filter)

      let logResult: ExtendedLogResult
      try {
        const rawLog = await git.raw(['log', ...logArgs])
        logResult = parseRawGitLog(rawLog)
      }
      catch (error: unknown) {
        if (isBadRevisionError(error)) {
          return createEmptyCommitGraph()
        }
        logger.error('Error getting git history:', error)
        throw error
      }

      const result = {
        operations: buildOperations(logResult.all),
        branches: extractBranches(logResult.all),
        logResult,
      }

      // Cache the result if caching is enabled
      if (enableCache) {
        setCachedHistory(cacheKey, result)
        logger.info(`Cached git history for key: ${cacheKey}`)
      }

      const elapsed = Date.now() - startTime
      logger.info(`Git history query completed in ${elapsed}ms`)

      return result
    }
    catch (error) {
      logger.error('Error getting git history:', error)
      throw error
    }
  }

  async function getCommitByHash(commitHashes: string[]): Promise<Commit[]> {
    try {
      if (commitHashes.length === 0) {
        return []
      }

      // 使用 Promise.all 并发查询所有 commit，提高效率
      const logPromises = commitHashes.map(hash =>
        git.log(['--stat', hash, '-1']).catch((error) => {
          logger.warn(`Failed to get commit ${hash}:`, error)
          return null
        }),
      )

      const logResults = await Promise.all(logPromises)

      const hashToCommit = new Map<string, Commit>()
      logResults.forEach((logResult) => {
        if (logResult && logResult.all.length > 0) {
          const commit = logResult.all[0] as Commit
          const { author_email, author_name } = commit
          commit.authorEmail = author_email
          commit.authorName = author_name
          hashToCommit.set(commit.hash, commit)
        }
      })

      const orderedCommits = commitHashes
        .map(hash => hashToCommit.get(hash))
        .filter((commit): commit is Commit => commit !== undefined)

      return orderedCommits
    }
    catch (error) {
      logger.error('Error getting commit by hash:', error)
      return []
    }
  }

  async function getPreviousCommit(commitHash: string): Promise<string | null> {
    try {
      const result = await git.raw(['rev-list', '--parents', '-n', '1', commitHash])
      const [, parentHash] = result.trim().split(' ')
      return parentHash || null
    }
    catch (error) {
      logger.error('Failed to get parent commit:', error)
      return null
    }
  }

  return {
    git,
    rootRepoPath,
    getHistory,
    getCommitByHash,
    getAllBranches,
    getAllAuthors,
    getPreviousCommit,
    clearCache,
  }
})
