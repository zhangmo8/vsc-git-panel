import type { ExtensionContext } from 'vscode'

import type { Commit } from '@/git/types'

export class StorageService {
  private static readonly COMMITS_KEY = 'git-panel.commits'
  private static instance: StorageService
  private context: ExtensionContext

  private constructor(context: ExtensionContext) {
    this.context = context
  }

  static initialize(context: ExtensionContext): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService(context)
    }
    return StorageService.instance
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      throw new Error('StorageService must be initialized with context first')
    }
    return StorageService.instance
  }

  saveCommits(commits: Commit[]) {
    this.context.globalState.update(StorageService.COMMITS_KEY, commits)
  }

  updateCommitFiles(commitHash: string, files: Array<{ status: string, path: string }>) {
    const commits = this.getCommits()
    const commit = commits.find(c => c.hash === commitHash)
    if (commit) {
      commit.files = files
      this.saveCommits(commits)
    }
  }

  getCommits(): Commit[] {
    return this.context.globalState.get<Commit[]>(StorageService.COMMITS_KEY) || []
  }

  getCommit(hash: string): Commit | undefined {
    const commits = this.getCommits()
    return commits.find(commit => commit.hash === hash)
  }

  clearCommits() {
    this.context.globalState.update(StorageService.COMMITS_KEY, undefined)
  }
}
