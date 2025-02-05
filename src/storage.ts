import type { ListLogLine } from 'simple-git'
import type * as vscode from 'vscode'

export class StorageService {
  private static readonly COMMITS_KEY = 'git-panel.commits'

  constructor(private context: vscode.ExtensionContext) {}

  saveCommits(commits: ListLogLine[]) {
    this.context.globalState.update(StorageService.COMMITS_KEY, commits)
  }

  getCommits(): ListLogLine[] {
    return this.context.globalState.get<ListLogLine[]>(StorageService.COMMITS_KEY) || []
  }

  clearCommits() {
    this.context.globalState.update(StorageService.COMMITS_KEY, undefined)
  }
}
