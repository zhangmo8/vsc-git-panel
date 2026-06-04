import simpleGit from 'simple-git'
import { createSingletonComposable, useWorkspaceFolders } from 'reactive-vscode'

import type { SimpleGit } from 'simple-git'
import type { Commit, CommitFile, CommitGraph, ExtendedLogResult, GitBranchRef, GitHeadInfo, GitHistoryFilter, GitRefsSummary, GitRemoteRef, StashEntry } from './types'
import {
  buildHistoryLogArgs,
  buildOperations,
  createCacheKey,
  extractBranches,
  isBadRevisionError,
  parseRawGitLog,
} from './historyUtils'
import { parseGitBlameLine, parseGitDiffPreviousLine } from './lineHistoryUtils'
import { logger, parseGitStatus } from '@/utils'
import { config } from '@/config'
import { GIT_STATUS } from '@/constant'

export * from './types'
export * from './utils'
export * from './historyUtils'
export * from './lineHistoryUtils'
export * from './pathUtils'

// Cache interface
interface CacheEntry<T> {
  data: T
  timestamp: number
}

interface ConfiguredRemote {
  name: string
  refs: {
    fetch?: string
    push?: string
  }
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

  async function getHeadInfo(): Promise<GitHeadInfo | null> {
    try {
      const [hashResult, branchResult] = await Promise.all([
        git.raw(['rev-parse', 'HEAD']),
        git.raw(['branch', '--show-current']),
      ])

      const hash = hashResult.trim()
      const branch = branchResult.trim()

      if (!hash) {
        return null
      }

      return {
        hash,
        branch,
      }
    }
    catch (error) {
      logger.error('Failed to get HEAD info:', error)
      return null
    }
  }

  async function getLineHistory(filePath: string, lineNumber: number) {
    try {
      const rawBlame = await git.raw([
        'blame',
        '--line-porcelain',
        '-L',
        `${lineNumber},${lineNumber}`,
        '--',
        filePath,
      ])

      return parseGitBlameLine(rawBlame)
    }
    catch (error) {
      logger.warn(`Failed to get line history for ${filePath}:${lineNumber}:`, error)
      return null
    }
  }

  async function getLineHistoryForHover(filePath: string, lineNumber: number) {
    const lineHistory = await getLineHistory(filePath, lineNumber)
    if (!lineHistory || lineHistory.isUncommitted)
      return lineHistory

    try {
      const previousRef = lineHistory.previousHash || `${lineHistory.hash}^`
      const paths = [lineHistory.filePath || filePath]
      if (lineHistory.previousFilePath && !paths.includes(lineHistory.previousFilePath))
        paths.push(lineHistory.previousFilePath)

      const rawDiff = await git.raw([
        'diff',
        '--unified=0',
        '--find-renames',
        previousRef,
        lineHistory.hash,
        '--',
        ...paths,
      ])

      return {
        ...lineHistory,
        previousLineText: parseGitDiffPreviousLine(rawDiff, lineHistory.originalLine),
      }
    }
    catch (error) {
      logger.warn(`Failed to get previous line text for ${filePath}:${lineNumber}:`, error)
      return lineHistory
    }
  }

  function findRemoteName(branchName: string, remoteNames: string[]): string | undefined {
    return [...remoteNames]
      .sort((a, b) => b.length - a.length)
      .find(remoteName => branchName.startsWith(`${remoteName}/`))
  }

  async function getConfiguredRemotes(): Promise<ConfiguredRemote[]> {
    const remoteMap = new Map<string, ConfiguredRemote>()

    function ensureRemote(name: string) {
      const remote = remoteMap.get(name)
      if (remote)
        return remote

      const nextRemote: ConfiguredRemote = {
        name,
        refs: {},
      }
      remoteMap.set(name, nextRemote)
      return nextRemote
    }

    const remotes = await git.getRemotes(true).catch(() => [])
    for (const remote of remotes) {
      const configuredRemote = ensureRemote(remote.name)
      configuredRemote.refs.fetch = remote.refs.fetch || configuredRemote.refs.fetch
      configuredRemote.refs.push = remote.refs.push || configuredRemote.refs.push
    }

    const remoteNames = await git.raw(['remote']).catch(() => '')
    for (const name of remoteNames.split('\n').map(line => line.trim()).filter(Boolean))
      ensureRemote(name)

    const verboseRemotes = await git.raw(['remote', '-v']).catch(() => '')
    for (const line of verboseRemotes.split('\n')) {
      const trimmedLine = line.trim()
      const direction = trimmedLine.endsWith(' (fetch)')
        ? 'fetch'
        : trimmedLine.endsWith(' (push)')
          ? 'push'
          : undefined
      if (!direction)
        continue

      const remoteInfo = trimmedLine.slice(0, -` (${direction})`.length).trimEnd()
      let separatorIndex = -1
      for (let index = 0; index < remoteInfo.length; index++) {
        const char = remoteInfo[index]
        if (char === ' ' || char === '\t') {
          separatorIndex = index
          break
        }
      }

      if (separatorIndex <= 0)
        continue

      const name = remoteInfo.slice(0, separatorIndex)
      const url = remoteInfo.slice(separatorIndex).trimStart()
      const configuredRemote = ensureRemote(name)
      configuredRemote.refs[direction] = url
    }

    return [...remoteMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  async function getRemoteNames(): Promise<string[]> {
    const remotes = await getConfiguredRemotes()
    return remotes.map(remote => remote.name)
  }

  async function getRemoteParts(branch: GitBranchRef): Promise<{ remote: string, name: string }> {
    const remoteNames = await getRemoteNames()
    const remote = branch.remote || findRemoteName(branch.name, remoteNames)
    if (!remote)
      throw new Error(`Unable to resolve remote for "${branch.name}"`)

    const prefix = `${remote}/`
    return {
      remote,
      name: branch.name.startsWith(prefix) ? branch.name.slice(prefix.length) : branch.name,
    }
  }

  async function getAheadBehind(branchName: string, upstream?: string): Promise<{ ahead: number, behind: number } | undefined> {
    if (!upstream)
      return undefined

    try {
      const raw = await git.raw(['rev-list', '--left-right', '--count', `${upstream}...${branchName}`])
      const [behindRaw, aheadRaw] = raw.trim().split(/\s+/)
      return {
        ahead: Number.parseInt(aheadRaw || '0', 10),
        behind: Number.parseInt(behindRaw || '0', 10),
      }
    }
    catch (error) {
      logger.warn(`Failed to get ahead/behind for ${branchName}:`, error)
      return undefined
    }
  }

  async function getGitRefs(): Promise<GitRefsSummary> {
    try {
      const FIELD = String.fromCharCode(0x1F)
      const RECORD = String.fromCharCode(0x1E)
      const format = `%(refname)${FIELD}%(refname:short)${FIELD}%(objectname:short)${FIELD}%(committerdate:iso-strict)${FIELD}%(contents:subject)${FIELD}%(upstream:short)${FIELD}%(HEAD)${RECORD}`

      const [rawRefs, remotes] = await Promise.all([
        git.raw(['for-each-ref', `--format=${format}`, 'refs/heads', 'refs/remotes']),
        getConfiguredRemotes(),
      ])

      const remoteNames = remotes.map(remote => remote.name)
      const records = rawRefs
        .split(RECORD)
        .map(record => record.replace(/^[\r\n]+|[\r\n]+$/g, ''))
        .filter(Boolean)

      const branches: GitBranchRef[] = []

      for (const record of records) {
        const [fullName, shortName, commit, date, subject, upstream, headMarker] = record.split(FIELD)

        if (!fullName || !shortName)
          continue

        if (/^refs\/remotes\/[^/]+\/HEAD$/.test(fullName))
          continue

        const type = fullName.startsWith('refs/remotes/') ? 'remote' : 'local'
        const remote = type === 'remote' ? findRemoteName(shortName, remoteNames) : undefined
        const branch: GitBranchRef = {
          name: shortName,
          fullName,
          type,
          remote,
          current: headMarker === '*',
          upstream: upstream || undefined,
          commit: commit || '',
          subject: subject || '',
          date: date || '',
        }

        branches.push(branch)
      }

      const branchesWithTracking = await Promise.all(
        branches.map(async (branch) => {
          if (branch.type !== 'local' || !branch.upstream)
            return branch

          const tracking = await getAheadBehind(branch.name, branch.upstream)
          return tracking ? { ...branch, ...tracking } : branch
        }),
      )

      const remoteRefs: GitRemoteRef[] = remotes.map((remote) => {
        const remoteBranches = branchesWithTracking
          .filter(branch => branch.type === 'remote' && branch.remote === remote.name)
          .sort((a, b) => a.name.localeCompare(b.name))

        return {
          name: remote.name,
          fetchUrl: remote.refs.fetch,
          pushUrl: remote.refs.push,
          branches: remoteBranches,
        }
      })

      return {
        branches: branchesWithTracking.sort((a, b) => {
          if (a.current !== b.current)
            return a.current ? -1 : 1
          if (a.type !== b.type)
            return a.type === 'local' ? -1 : 1
          return a.name.localeCompare(b.name)
        }),
        remotes: remoteRefs.sort((a, b) => a.name.localeCompare(b.name)),
      }
    }
    catch (error) {
      logger.error('Failed to get git refs:', error)
      throw error
    }
  }

  async function fetchRemote(remoteName: string): Promise<void> {
    const remotes = await getConfiguredRemotes()
    if (!remotes.some(remote => remote.name === remoteName)) {
      throw new Error(`Remote "${remoteName}" does not exist`)
    }

    await git.raw(['fetch', remoteName, '--prune'])
    clearCache()
  }

  async function switchBranch(branch: GitBranchRef): Promise<void> {
    if (branch.type === 'local') {
      await git.checkout(branch.name)
      clearCache()
      return
    }

    const { name } = await getRemoteParts(branch)
    const localBranches = await git.branchLocal()
    if (localBranches.all.includes(name)) {
      await git.checkout(name)
    }
    else {
      await git.raw(['checkout', '--track', '-b', name, branch.name])
    }
    clearCache()
  }

  async function pullBranch(branch: GitBranchRef): Promise<void> {
    if (branch.type === 'remote') {
      const { remote } = await getRemoteParts(branch)
      await fetchRemote(remote)
      return
    }

    if (!branch.upstream)
      throw new Error(`Branch "${branch.name}" has no upstream`)

    await git.checkout(branch.name)
    await git.raw(['pull', '--ff-only'])
    clearCache()
  }

  async function deleteBranch(branch: GitBranchRef): Promise<void> {
    if (branch.current)
      throw new Error('Cannot delete the current branch')

    if (branch.type === 'remote') {
      const { remote, name } = await getRemoteParts(branch)
      await git.raw(['push', remote, '--delete', name])
      await fetchRemote(remote)
      return
    }

    await git.raw(['branch', '-d', branch.name])
    clearCache()
  }

  async function renameBranch(branch: GitBranchRef, newName: string): Promise<void> {
    if (branch.type === 'remote') {
      const { remote, name } = await getRemoteParts(branch)
      await git.raw(['push', remote, `${branch.fullName}:refs/heads/${newName}`])
      await git.raw(['push', remote, '--delete', name])
      await fetchRemote(remote)
      return
    }

    await git.raw(['branch', '-m', branch.name, newName])
    clearCache()
  }

  async function cloneBranch(branch: GitBranchRef, newName: string): Promise<void> {
    if (branch.type === 'remote') {
      await git.raw(['checkout', '--track', '-b', newName, branch.name])
    }
    else {
      await git.checkoutBranch(newName, branch.name)
    }
    clearCache()
  }

  async function pushBranch(branch: GitBranchRef): Promise<void> {
    if (branch.type !== 'local')
      throw new Error('Only local branches can be pushed')

    if (branch.upstream) {
      const remoteNames = await getRemoteNames()
      const remote = findRemoteName(branch.upstream, remoteNames)
      if (!remote)
        throw new Error(`Unable to resolve upstream remote for "${branch.upstream}"`)

      const remoteBranch = branch.upstream.slice(`${remote}/`.length)
      await git.raw(['push', remote, `${branch.name}:${remoteBranch}`])
    }
    else {
      const remoteNames = await getRemoteNames()
      const remote = remoteNames[0]
      if (!remote)
        throw new Error('No remote is configured')

      await git.raw(['push', '-u', remote, branch.name])
    }

    clearCache()
  }

  /**
   * 获取 stash 列表
   * 使用 `git stash list` 配合自定义格式以便稳定解析
   */
  async function getStashList(): Promise<StashEntry[]> {
    try {
      const FIELD = String.fromCharCode(0x1F)
      const RECORD = String.fromCharCode(0x1E)
      // 通过 git 自身的占位符 %x1f / %x1e 让 git 输出 ASCII 控制字符作为分隔符
      const format = `%gd%x1f%H%x1f%h%x1f%gs%x1f%aI%x1f%ar%x1f%an%x1f%ae%x1e`

      const raw = await git.raw(['stash', 'list', `--format=${format}`])

      if (!raw) {
        return []
      }

      const entries: StashEntry[] = []
      const records = raw
        .split(RECORD)
        .map(r => r.replace(/^[\r\n]+|[\r\n]+$/g, ''))
        .filter(r => r.length > 0)

      for (const record of records) {
        const fields = record.split(FIELD)
        if (fields.length < 4)
          continue

        const [ref, hash, shortHash, subject, date, relativeDate, authorName, authorEmail] = fields

        if (!ref || !hash)
          continue

        const indexMatch = ref.match(/stash@\{(\d+)\}/)
        const index = indexMatch ? Number.parseInt(indexMatch[1], 10) : entries.length

        let branch = ''
        let message = subject || ''
        const subjectPrefix = ['WIP on', 'On'].find((prefix) => {
          const rest = subject?.slice(prefix.length)
          return subject?.startsWith(prefix) && rest && rest.trimStart() !== rest
        })
        if (subjectPrefix) {
          const content = subject.slice(subjectPrefix.length).trimStart()
          const separatorIndex = content.indexOf(':')
          if (separatorIndex > 0) {
            branch = content.slice(0, separatorIndex).trim()
            message = content.slice(separatorIndex + 1).trim()
          }
          message = message.replace(/^[0-9a-f]{6,40}\s+/, '')
        }

        entries.push({
          index,
          ref,
          hash,
          shortHash: shortHash || hash.slice(0, 7),
          branch,
          message: message || subject || '(no message)',
          date: date || '',
          relativeDate: relativeDate || '',
          authorName: authorName || '',
          authorEmail: authorEmail || '',
        })
      }

      logger.info(`Loaded ${entries.length} stash entries`)
      return entries
    }
    catch (error) {
      logger.error('Failed to get stash list:', error)
      return []
    }
  }

  /**
   * 应用 stash（保留 stash 项），并尝试用 --index 还原暂存区状态。
   * 当 stash 没有暂存内容时 --index 会失败，此时回退到普通 apply。
   */
  async function applyStash(ref: string): Promise<void> {
    try {
      await git.raw(['stash', 'apply', '--index', ref])
    }
    catch (error) {
      logger.warn('Stash apply --index failed, retrying without --index:', error)
      await git.raw(['stash', 'apply', ref])
    }
  }

  /** 弹出 stash（应用后删除），同样尝试用 --index 还原暂存区状态 */
  async function popStash(ref: string): Promise<void> {
    try {
      await git.raw(['stash', 'pop', '--index', ref])
    }
    catch (error) {
      logger.warn('Stash pop --index failed, retrying without --index:', error)
      await git.raw(['stash', 'pop', ref])
    }
  }

  /** 删除指定 stash */
  async function dropStash(ref: string): Promise<void> {
    await git.raw(['stash', 'drop', ref])
  }

  /** 清空所有 stash */
  async function clearStash(): Promise<void> {
    await git.raw(['stash', 'clear'])
  }

  /** 创建一个新的 stash */
  async function createStash(message?: string, includeUntracked = false): Promise<void> {
    const args = ['stash', 'push']
    if (includeUntracked)
      args.push('-u')
    if (message)
      args.push('-m', message)
    await git.raw(args)
  }

  /** 获取指定 stash 的概览（diff stat） */
  async function getStashStat(ref: string): Promise<string> {
    try {
      return await git.raw(['stash', 'show', '--stat', ref])
    }
    catch (error) {
      logger.error(`Failed to show stash ${ref}:`, error)
      return ''
    }
  }

  /**
   * 获取指定 stash 的文件改动列表（与 history 视图的 file tree 对齐）
   * stash 在 git 内部就是一个 commit，因此可以直接通过 stash 引用作为 commit hash 使用。
   */
  async function getStashFiles(stashRef: string): Promise<CommitFile[]> {
    try {
      const raw = await git.raw([
        'stash',
        'show',
        '--name-status',
        '-M',
        '-C',
        stashRef,
      ])

      if (!raw)
        return []

      return raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [status, ...pathParts] = line.split('\t')
          const { type } = parseGitStatus(status)

          if (type === GIT_STATUS.RENAMED && pathParts.length === 2) {
            const [oldPath, newPath] = pathParts
            return {
              status: type,
              path: newPath,
              oldPath,
            }
          }

          return {
            status: type,
            path: pathParts[0],
          }
        })
    }
    catch (error) {
      logger.error(`Failed to get stash files for ${stashRef}:`, error)
      return []
    }
  }

  /**
   * 把 stash@{N} 解析为真实 commit hash，便于在 diff 等场景复用现有 commit 流程
   */
  async function resolveStashHash(stashRef: string): Promise<string | null> {
    try {
      const out = await git.raw(['rev-parse', stashRef])
      const hash = out.trim()
      return hash || null
    }
    catch (error) {
      logger.error(`Failed to resolve ${stashRef}:`, error)
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
    getHeadInfo,
    getLineHistory,
    getLineHistoryForHover,
    getGitRefs,
    fetchRemote,
    switchBranch,
    pullBranch,
    deleteBranch,
    renameBranch,
    cloneBranch,
    pushBranch,
    clearCache,
    getStashList,
    applyStash,
    popStash,
    dropStash,
    clearStash,
    createStash,
    getStashStat,
    getStashFiles,
    resolveStashHash,
  }
})
