import type * as vscode from 'vscode'

export class StorageService {
  private static readonly COMMITS_KEY = 'git-panel.commits'

  constructor(private context: vscode.ExtensionContext) {}

  saveCommits(commits: any[]) {
    this.context.globalState.update(StorageService.COMMITS_KEY, commits)
  }

  getCommits(): any[] {
    return this.context.globalState.get<any[]>(StorageService.COMMITS_KEY) || []
  }

  clearCommits() {
    this.context.globalState.update(StorageService.COMMITS_KEY, undefined)
  }
}
