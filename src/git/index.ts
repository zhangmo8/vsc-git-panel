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

  async function getHistory(filter?: GitHistoryFilter): Promise<CommitGraph> {
    try {
      // 构建基础分支参数（方案1：统一筛选参数）
      const branchArgs: string[] = []
      if (filter?.branches && filter.branches.length > 0) {
        // 使用特定分支
        filter.branches.forEach((branch) => {
          branchArgs.push(branch)
        })
      }
      else {
        // 使用所有分支
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
      logArgs.push(`--max-count=${pageSize}`)

      // 添加搜索参数（方案3：优化 grep 参数）
      if (filter?.search) {
        const search = filter.search.trim()
        if (search) {
          // 支持 commit message 和 commit sha 搜索
          if (search.length >= 7 && /^[a-f0-9]+$/i.test(search)) {
            // 如果看起来像 commit hash，直接搜索
            logArgs.push(`--grep=${search}`, '--regexp-ignore-case')
          }
          else {
            // 否则只搜索 commit message
            logArgs.push(`--grep=${search}`, '--regexp-ignore-case')
          }
        }
      }

      // 构建父子关系查询参数（方案1：使用相同的分支筛选）
      // 注意：父子关系查询需要获取更多数据以确保关系完整性
      const parentArgs = ['log', '--pretty=format:%H %P', ...branchArgs]

      // 对于父子关系，我们需要获取足够的数据来建立完整的关系图
      // 这里获取当前页面数据的两倍范围，确保关系完整
      const extendedCount = Math.max(pageSize * 2, 200)
      const extendedSkip = Math.max(skip - pageSize, 0)

      if (extendedSkip > 0) {
        parentArgs.push(`--skip=${extendedSkip}`)
      }
      parentArgs.push(`--max-count=${extendedCount}`)

      const logResult = await git.log(logArgs) as ExtendedLogResult

      const rawParentsOutput = await git.raw(parentArgs)

      const parentMap: { [hash: string]: string[] } = {}
      rawParentsOutput.split('\n').forEach((line) => {
        const [hash, ...parents] = line.trim().split(' ')
        parentMap[hash] = parents.filter(Boolean)
      })

      const hashToCommit: { [key: string]: Commit } = {}

      for (const commit of logResult.all) {
        const { author_email, author_name } = commit
        commit.authorEmail = author_email
        commit.authorName = author_name

        commit.children = []
        hashToCommit[commit.hash] = commit

        if (parentMap[commit.hash]) {
          commit.parents = parentMap[commit.hash]
          commit.isMergeCommit = commit.parents.length > 1
        }
        else {
          commit.parents = []
          commit.isMergeCommit = false
        }
      }

      logResult.all.forEach((commit) => {
        const parentHashes = commit.parents || []

        parentHashes.forEach((parentHash) => {
          const parentCommit = hashToCommit[parentHash]
          if (parentCommit && parentCommit.children) {
            if (!parentCommit.children.includes(commit.hash)) {
              parentCommit.children.push(commit.hash)
            }
          }
        })
      })

      return generateCommitGraph(logResult)
    }
    catch (error) {
      logger.error('Error getting git history:', error)
      throw error
    }
  }

  function generateCommitGraph(logResult: ExtendedLogResult): CommitGraph {
    if (!logResult.total) {
      return {
        operations: [],
        branches: [],
        logResult,
      }
    }

    const commits = [...logResult.all].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    const branchSet = new Set<string>()
    const refToBranch: { [hash: string]: string[] } = {}

    commits.forEach((commit) => {
      if (commit.refs) {
        const refs = commit.refs.split(',').map(ref => ref.trim())
        const branches = refs
          .filter(ref => ref.includes('refs/heads/') || ref.includes('refs/remotes/') || (!ref.includes('refs/') && !ref.includes('tag:')))
          .map((ref) => {
            const branch = ref.replace('refs/heads/', '')
              .replace('refs/remotes/', '').split('/').slice(1).join('/')
              .replace('HEAD -> ', '')
            return branch
          })
          .filter(Boolean)

        if (branches.length > 0) {
          refToBranch[commit.hash] = branches
          branches.forEach(branch => branchSet.add(branch))
        }
      }
    })

    if (branchSet.size === 0) {
      branchSet.add('master')
    }

    const branches = Array.from(branchSet)

    const commitToBranch: { [hash: string]: string } = {}

    commits.forEach((commit) => {
      if (refToBranch[commit.hash]) {
        const mainBranches = refToBranch[commit.hash].filter(b =>
          b === 'master' || b === 'main' || b === 'develop')

        if (mainBranches.length > 0) {
          commitToBranch[commit.hash] = mainBranches[0]
        }
        else {
          commitToBranch[commit.hash] = refToBranch[commit.hash][0]
        }
      }
    })

    let changed = true
    while (changed) {
      changed = false
      commits.forEach((commit) => {
        if (commitToBranch[commit.hash])
          return

        if (commit.children && commit.children.length > 0) {
          for (const childHash of commit.children) {
            if (commitToBranch[childHash]) {
              commitToBranch[commit.hash] = commitToBranch[childHash]
              changed = true
              break
            }
          }
        }

        if (!commitToBranch[commit.hash] && commit.parents && commit.parents.length > 0) {
          for (const parentHash of commit.parents) {
            if (commitToBranch[parentHash]) {
              commitToBranch[commit.hash] = commitToBranch[parentHash]
              changed = true
              break
            }
          }
        }
      })
    }

    commits.forEach((commit) => {
      if (!commitToBranch[commit.hash]) {
        commitToBranch[commit.hash] = branches[0]
      }
    })

    const branchChanged: { [hash: string]: boolean } = {}
    commits.forEach((commit) => {
      if (commit.parents && commit.parents.length > 0) {
        const currentBranch = commitToBranch[commit.hash]
        let changed = false
        for (const parentHash of commit.parents) {
          if (commitToBranch[parentHash] && commitToBranch[parentHash] !== currentBranch) {
            changed = true
            break
          }
        }
        branchChanged[commit.hash] = changed
      }
      else {
        branchChanged[commit.hash] = true
      }
    })

    const operations: GitOperation[] = commits.map((commit) => {
      const isMerge = commit.isMergeCommit && commit.parents && commit.parents.length > 1
      const branch = commitToBranch[commit.hash]

      if (isMerge) {
        const sourceBranches: string[] = []
        const sourceBranchColors: Record<string, string> = {}

        if (commit.parents) {
          for (let i = 1; i < commit.parents.length; i++) {
            const parentHash: string = commit.parents[i]
            if (commitToBranch[parentHash]) {
              const sourceBranch = commitToBranch[parentHash]
              sourceBranches.push(sourceBranch)
              sourceBranchColors[sourceBranch] = getBranchColor(sourceBranch)
            }
          }
        }

        return {
          type: 'merge',
          branch,
          hash: commit.hash,
          message: commit.message,
          sourceBranches,
          targetBranch: branch,
          branchChanged: branchChanged[commit.hash],
          branchColor: getBranchColor(branch),
          targetBranchColor: getBranchColor(branch),
          sourceBranchColors,
        }
      }
      else {
        let targetBranch: string | undefined
        let targetBranchColor: string | undefined

        if (branchChanged[commit.hash] && commit.parents && commit.parents.length > 0) {
          const parentHash = commit.parents[0]
          if (commitToBranch[parentHash] && commitToBranch[parentHash] !== branch) {
            targetBranch = commitToBranch[parentHash]
            targetBranchColor = getBranchColor(targetBranch)
          }
        }

        return {
          type: 'commit',
          branch,
          hash: commit.hash,
          message: commit.message,
          branchChanged: branchChanged[commit.hash],
          branchColor: getBranchColor(branch),
          targetBranch,
          targetBranchColor,
        }
      }
    })

    return {
      operations,
      branches,
      logResult,
    }
  }

  async function getCommitByHash(commitHashes: string[]): Promise<Commit[]> {
    try {
      if (commitHashes.length === 0) {
        return []
      }

      // 构建查询参数，查询多个 commit
      const logArgs = ['--stat']
      commitHashes.forEach((hash) => {
        logArgs.push(hash)
      })
      logArgs.push(`-${commitHashes.length}`)

      const logResult = await git.log(logArgs) as ExtendedLogResult

      if (logResult.all.length === 0) {
        return []
      }

      // 处理查询结果
      const commits = logResult.all.map((commit) => {
        const { author_email, author_name } = commit
        commit.authorEmail = author_email
        commit.authorName = author_name
        return commit
      })

      // 按照输入的 hash 顺序排序结果
      const hashToCommit = new Map<string, Commit>()
      commits.forEach((commit) => {
        hashToCommit.set(commit.hash, commit)
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
    getPreviousCommit,
    generateCommitGraph,
  }
})
