import simpleGit from 'simple-git'
import { createSingletonComposable, useWorkspaceFolders } from 'reactive-vscode'

import type { SimpleGit } from 'simple-git'
import type { Commit, CommitGraph, ExtendedLogResult, GitHistoryFilter, GitOperation } from './types'
import { logger } from '@/utils'
import { config } from '@/config'

export * from './types'

// Cache interface
interface CacheEntry<T> {
  data: T
  timestamp: number
}

// Create a simple cache key from filter
function createCacheKey(filter?: GitHistoryFilter): string {
  if (!filter)
    return 'default'

  const parts = [
    filter.branches?.sort().join(',') || 'all',
    filter.author || 'any',
    filter.search || '',
    filter.page || 1,
    filter.pageSize || 45,
  ]
  return parts.join('|')
}

function normalizeRef(ref: string) {
  if (!ref)
    return ''

  let cleaned = ref.trim()
  cleaned = cleaned.replace(/^\(+/, '').replace(/\)+$/, '').trim()
  cleaned = cleaned.replace(/^,+/, '').replace(/,+$/, '').trim()
  if (cleaned.startsWith('HEAD -> '))
    cleaned = cleaned.replace('HEAD -> ', '')

  if (cleaned.startsWith('refs/heads/'))
    cleaned = cleaned.substring('refs/heads/'.length)

  if (cleaned.startsWith('refs/remotes/'))
    cleaned = cleaned.substring('refs/remotes/'.length)

  if (cleaned.startsWith('ref:'))
    cleaned = cleaned.substring('ref:'.length)

  return cleaned.replace(/[()]/g, '').trim()
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
        const cached = historyCache.get(cacheKey)
        if (cached && isCacheValid(cached)) {
          logger.info(`Using cached git history for key: ${cacheKey}`)
          return cached.data
        }
      }

      const startTime = Date.now()
      const search = filter?.search?.trim()
      const hashSearch = search && search.length >= 7 && /^[a-f0-9]+$/i.test(search)

      // 构建基础分支参数
      const branchArgs: string[] = []
      if (filter?.branches && filter.branches.length > 0) {
        // 使用特定分支
        filter.branches.forEach((branch) => {
          branchArgs.push(branch)
        })
      }
      else if (!hashSearch) {
        branchArgs.push('--all')
      }

      const prettyFormat = '--pretty=format:%H%x01%P%x01%an%x01%ae%x01%ad%x01%s%x01%d%x01%b'
      const logArgs: string[] = [...branchArgs]
      if (filter?.author) {
        logArgs.push(`--author=${filter.author}`)
      }
      const pageSize = filter?.pageSize || 45
      const page = filter?.page || 1
      const skip = (page - 1) * pageSize
      if (skip > 0) {
        logArgs.push(`--skip=${skip}`)
      }
      if (search) {
        if (hashSearch) {
          logArgs.push('--max-count=1', search)
        }
        else {
          logArgs.push(`--max-count=${pageSize}`, `--grep=${search}`, '--regexp-ignore-case')
        }
      }
      else {
        logArgs.push(`--max-count=${pageSize}`)
      }
      // 最后加 format 和 stat
      logArgs.push('--decorate=full', prettyFormat, '--stat')

      let logResult: ExtendedLogResult
      try {
        const rawLog = await git.raw(['log', ...logArgs])
        const lines = rawLog.split('\n')

        const commitsRaw: string[] = []
        let current = ''
        for (const line of lines) {
          const parts = line.split('\x01')
          const isCommitStart = parts.length > 1 && /^[a-f0-9]{7,40}$/i.test(parts[0])
          if (isCommitStart) {
            if (current)
              commitsRaw.push(current)
            current = line
          }
          else {
            current += (current ? '\n' : '') + line
          }
        }
        if (current)
          commitsRaw.push(current)
        const all: Commit[] = []
        for (const block of commitsRaw) {
          if (!block.trim())
            continue
          const parts = block.split('\x01')
          const [hash, parents, author_name, author_email, date, message, refs] = parts
          const bodyAndStats = parts.slice(7).join('\x01')
          let files: CommitFile[] = []
          let summary = ''
          let diff
          if (bodyAndStats) {
            const lines = bodyAndStats.split('\n')
            // 文件明细
            const statLines = lines.filter(l => /\s+[AMDCR]\s+/.test(l) || /^\s*[AMDCR]\s+/.test(l))
            files = statLines.map((l) => {
              const match = l.match(/([AMDCR])\s+(.+)/)
              return match ? { status: match[1], path: match[2] } : null
            }).filter((f): f is CommitFile => f !== null)
            // 统计 summary 行
            const summaryLine = lines.find(l => /files? changed/.test(l))
            if (summaryLine) {
              summary = summaryLine.trim()
              // 解析数字
              const changed = Number.parseInt((summary.match(/(\d+) files? changed/) || [])[1] || '0', 10)
              const insertions = Number.parseInt((summary.match(/(\d+) insertions?\(\+\)/) || [])[1] || '0', 10)
              const deletions = Number.parseInt((summary.match(/(\d+) deletions?\(-\)/) || [])[1] || '0', 10)
              diff = { changed, insertions, deletions }
            }
          }
          const parentArr = parents ? parents.split(' ').filter(Boolean) : []

          let branchName = ''
          if (refs) {
            const refsArr = refs.split(',').map(r => r.trim())
            const branchRef = refsArr.find(ref =>
              ref.includes('refs/heads/')
              || ref.includes('refs/remotes/')
              || ref.startsWith('HEAD -> ')
              || (!ref.includes('refs/') && !ref.includes('tag:')),
            )

            if (branchRef) {
              branchName = normalizeRef(branchRef)
            }
          }

          all.push({
            hash,
            parents: parentArr,
            author_name,
            author_email,
            date,
            message,
            refs,
            body: bodyAndStats?.split('\n')[0] || '',
            files,
            summary,
            diff,
            isMergeCommit: parentArr.length > 1,
            authorName: author_name,
            authorEmail: author_email,
            branchName,
          } as Commit)
        }
        logResult = {
          all,
          total: all.length,
          latest: all[0] || null,
        } as ExtendedLogResult
      }
      catch (error: unknown) {
        // 检查是否为 sha 不存在的错误
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes('bad revision') || msg.includes('unknown revision') || msg.includes('fatal:')) {
          // 返回空结果，避免 loading 卡死
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
        logger.error('Error getting git history:', error)
        throw error
      }

      // 简化的提交处理
      const branchSet = new Set<string>()

      for (const commit of logResult.all) {
        // 提取分支信息
        if (commit.refs) {
          const refs = commit.refs.split(',').map(ref => ref.trim())
          const branches = refs
            .filter(ref =>
              ref.includes('refs/heads/')
              || ref.includes('refs/remotes/')
              || (!ref.includes('refs/') && !ref.includes('tag:')),
            )
            .map(ref => normalizeRef(ref))
            .filter(Boolean)

          branches.forEach(branch => branchSet.add(branch))
        }
      }

      if (branchSet.size === 0) {
        branchSet.add('main')
      }

      const branches = Array.from(branchSet)

      const operations: GitOperation[] = logResult.all.map((commit) => {
        // 从 refs 中提取主要分支
        let mainBranch = 'main'
        let branchRefs: string[] = []
        if (commit.refs) {
          const refs = commit.refs.split(',').map(ref => ref.trim())
          branchRefs = refs
            .filter(ref =>
              ref.includes('refs/heads/')
              || ref.includes('refs/remotes/')
              || ref.startsWith('HEAD -> ')
              || (!ref.includes('refs/') && !ref.includes('tag:')),
            )
            .map(ref => normalizeRef(ref))
            .filter(Boolean)

          if (branchRefs.length > 0) {
            mainBranch = branchRefs[0]
          }
        }

        return {
          type: commit.isMergeCommit ? 'merge' : 'commit',
          branch: mainBranch,
          hash: commit.hash,
          message: commit.message,
          branchChanged: false, // 简化：不计算分支变化
          branchExplicit: branchRefs.length > 0,
        }
      })

      const result = {
        operations,
        branches,
        logResult,
      }

      // Cache the result if caching is enabled
      if (enableCache) {
        historyCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        })
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
      console.error('Failed to get parent commit:', error)
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
