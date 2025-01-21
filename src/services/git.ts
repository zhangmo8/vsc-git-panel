import simpleGit from 'simple-git'
import type { LogResult, SimpleGit } from 'simple-git'
import * as vscode from 'vscode'

export class GitService {
  private git: SimpleGit
  private readonly rootRepoPath = vscode.workspace.workspaceFolders![0].uri.fsPath

  constructor() {
    try {
      this.git = simpleGit(this.rootRepoPath, {
        binary: 'git',
        maxConcurrentProcesses: 10,
      })
    }
    catch (error) {
      throw new Error(`Fail to init git service: ${error}`)
    }
  }

  async getHistory(): Promise<LogResult> {
    const COMMIT_FORMAT = '%H%n%D%n%aN%n%aE%n%at%n%ct%n%P%n%B'

    try {
      return await this.git.log()
    }
    catch (error) {
      console.error('Error getting git history:', error)
      throw error
    }
  }
}
