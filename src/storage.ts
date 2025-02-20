import { createSingletonComposable, extensionContext } from 'reactive-vscode'
import type { Commit } from '@/git/types'

const COMMITS_KEY = 'git-panel.commits'

export const useStorage = createSingletonComposable(() => {
  function saveCommits(commits: Commit[]) {
    extensionContext.value?.globalState.update(COMMITS_KEY, commits)
  }

  function updateCommitFiles(commitHash: string, files: Array<{ status: string, path: string }>) {
    const commits = getCommits()
    const commit = commits.find(c => c.hash === commitHash)

    if (commit) {
      commit.files = files
      saveCommits(commits)
    }
  }

  function getCommits(): Commit[] {
    return extensionContext.value?.globalState.get<Commit[]>(COMMITS_KEY) || []
  }

  function getCommit(hash: string): Commit | undefined {
    const commits = getCommits()
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
