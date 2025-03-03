import simpleGit from 'simple-git'
import { createSingletonComposable, useWorkspaceFolders } from 'reactive-vscode'

import type { SimpleGit } from 'simple-git'
import type { Commit, CommitGraph, ExtendedLogResult, GitOperation } from './types'
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

  async function getHistory(): Promise<CommitGraph> {
    try {
      const logResult = await git.log([
        '--all',
        '--stat',
        '--max-count=50',
      ]) as ExtendedLogResult

      const rawParentsOutput = await git.raw([
        'log',
        '--all',
        '--pretty=format:%H %P',
        '--max-count=50',
      ])

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
            let branch = ref
            if (ref.includes('refs/heads/')) {
              branch = ref.replace('refs/heads/', '')
            }
            else if (ref.includes('refs/remotes/')) {
              branch = ref.replace('refs/remotes/', '').split('/').slice(1).join('/')
            }
            else if (ref.includes('HEAD ->')) {
              branch = ref.replace('HEAD -> ', '')
            }
            return branch
          })
          .filter(Boolean)

        if (branches.length > 0) {
          refToBranch[commit.hash] = branches
          branches.forEach(branch => branchSet.add(branch))
        }
      }
    })

    // 如果没有找到分支信息，使用默认分支名称
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
        if (commit.parents) {
          for (let i = 1; i < commit.parents.length; i++) {
            const parentHash = commit.parents[i]
            if (commitToBranch[parentHash]) {
              sourceBranches.push(commitToBranch[parentHash])
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
        }
      }
      else {
        return {
          type: 'commit',
          branch,
          hash: commit.hash,
          message: commit.message,
          branchChanged: branchChanged[commit.hash],
        }
      }
    })

    return {
      operations,
      branches,
      logResult,
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
    generateCommitGraph,
  }
})
