import simpleGit from 'simple-git'
import { createSingletonComposable, useWorkspaceFolders } from 'reactive-vscode'

import type { SimpleGit } from 'simple-git'
import type { Commit, CommitGraph, ExtendedLogResult, GitHistoryFilter, GitOperation } from './types'
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

  async function getHistory(filter?: GitHistoryFilter): Promise<CommitGraph> {
    try {
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

      // 自定义 log format，包含 parents 字段
      const prettyFormat = '--pretty=format:%H%x01%P%x01%an%x01%ae%x01%ad%x01%s%x01%d%x01%b'
      // 参数顺序：分支/--all/作者/分页/搜索... 最后加 --pretty --stat
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
      logArgs.push(prettyFormat, '--stat')

      let logResult: ExtendedLogResult
      try {
        // 用 simple-git 的 raw 获取原始 log 输出，logArgs 前加 'log'
        const rawLog = await git.raw(['log', ...logArgs])
        // 先用 \n 分割，再聚合每个 commit 块
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
          let files: any[] = []
          let summary = ''
          let diff
          if (bodyAndStats) {
            const lines = bodyAndStats.split('\n')
            // 文件明细
            const statLines = lines.filter(l => /\s+[AMDCR]\s+/.test(l) || /^\s*[AMDCR]\s+/.test(l))
            files = statLines.map((l) => {
              const match = l.match(/([AMDCR])\s+(.+)/)
              return match ? { status: match[1], path: match[2] } : null
            }).filter(Boolean)
            // 统计 summary 行
            const summaryLine = lines.find(l => /files changed/.test(l))
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
          } as Commit)
        }
        logResult = {
          all,
          total: all.length,
          latest: all[0] || null,
        } as ExtendedLogResult
      }
      catch (error: any) {
        // 检查是否为 sha 不存在的错误
        const msg = String(error?.message || error)
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
            .map((ref) => {
              const branch = ref.replace('refs/heads/', '')
                .replace('refs/remotes/', '').split('/').slice(1).join('/')
                .replace('HEAD -> ', '')
              return branch
            })
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
        if (commit.refs) {
          const refs = commit.refs.split(',').map(ref => ref.trim())
          const branchRefs = refs
            .filter(ref =>
              ref.includes('refs/heads/')
              || (!ref.includes('refs/') && !ref.includes('tag:')),
            )
            .map(ref => ref.replace('refs/heads/', '').replace('HEAD -> ', ''))
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
        }
      })

      return {
        operations,
        branches,
        logResult,
      }
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
  }
})
