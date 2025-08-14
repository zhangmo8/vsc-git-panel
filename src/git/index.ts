import simpleGit from 'simple-git'
import { createSingletonComposable, useWorkspaceFolders } from 'reactive-vscode'

import type { SimpleGit } from 'simple-git'
import type { Commit, CommitGraph, ExtendedLogResult, GitHistoryFilter, GitOperation } from './types'
import { getBranchColor, logger } from '@/utils'

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

      // 构建 git log 参数（添加 --stat 获取文件变更统计）
      const logArgs = [...branchArgs, '--stat']

      // 分页处理：每页45条数据
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
          // 否则搜索 commit message
          logArgs.push(`--max-count=${pageSize}`, `--grep=${search}`, '--regexp-ignore-case')
        }
      }
      else {
        logArgs.push(`--max-count=${pageSize}`)
      }

      const logResult = await git.log(logArgs) as ExtendedLogResult

      // 简化的提交处理
      const branchSet = new Set<string>()

      for (const commit of logResult.all) {
        const { author_email, author_name } = commit
        commit.authorEmail = author_email
        commit.authorName = author_name

        // 简单的合并提交检测（通过消息判断）
        commit.isMergeCommit = commit.message.toLowerCase().startsWith('merge ')

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
          branchColor: getBranchColor(mainBranch),
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
    getPreviousCommit,
  }
})
