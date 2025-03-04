import { createSingletonComposable, extensionContext } from 'reactive-vscode'
import type { Commit, CommitGraph } from '@/git/types'

const COMMITS_KEY = 'git-panel.commits'

export const useStorage = createSingletonComposable(() => {
  function saveCommits(commits: CommitGraph) {
    extensionContext.value?.globalState.update(COMMITS_KEY, commits)
  }

  function updateCommitFiles(commitHash: string, files: Array<{ status: string, path: string }>) {
    const { operations, branches, logResult } = getCommits()
    const commit = logResult.all.find(c => c.hash === commitHash)

    if (commit) {
      commit.files = files
      saveCommits({ operations, branches, logResult })
    }
  }

  function getCommits(): CommitGraph {
    return extensionContext.value?.globalState.get<CommitGraph>(COMMITS_KEY) || ({
      operations: [],
      branches: [],
      logResult: {
        all: [],
        total: 0,
      },
    }) as unknown as CommitGraph
  }

  function getCommit(hash: string): Commit | undefined {
    const { logResult: { all: commits } } = getCommits()
    if (!commits)
      return
    return commits.find(commit => commit.hash === hash)
  }

  function clearCommits() {
    extensionContext.value?.globalState.update(COMMITS_KEY, undefined)
  }

  return {
    saveCommits,
    updateCommitFiles,
    getCommits,
    getCommit,
    clearCommits,
  }
})
