import * as vscode from 'vscode'
import { GitService } from '../../git'
import { CommitNode } from './CommitNode'
import { FileTreeProvider } from './FileTreeProvider'
import type { CommitDetails } from './types'

export class GitChangesProvider implements vscode.TreeDataProvider<CommitNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<CommitNode | undefined | null | void> = new vscode.EventEmitter<CommitNode | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<CommitNode | undefined | null | void> = this._onDidChangeTreeData.event
  private gitService: GitService
  private fileTreeProvider: FileTreeProvider

  constructor() {
    this.gitService = new GitService()
    this.fileTreeProvider = new FileTreeProvider(this.gitService)
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: CommitNode): vscode.TreeItem {
    return element
  }

  private async getFirstCommitDetails(): Promise<CommitDetails | null> {
    try {
      const history = await this.gitService.getHistory()
      if (history.all.length === 0) {
        return null
      }

      const firstCommit = history.all[0]
      return {
        hash: firstCommit.hash,
        authorName: firstCommit.author_name,
        authorEmail: firstCommit.author_email,
        date: firstCommit.date,
        stats: firstCommit.stats,
      }
    }
    catch (error) {
      console.error('Error getting first commit details:', error)
      return null
    }
  }

  async getChildren(element?: CommitNode): Promise<CommitNode[]> {
    if (!element) {
      const commitDetails = await this.getFirstCommitDetails()
      if (!commitDetails) {
        return []
      }

      // Refresh the file tree provider with current commit hash
      this.fileTreeProvider.refresh(commitDetails.hash)

      // Get changed files from FileTreeProvider
      const changedFiles = await this.fileTreeProvider.getChildren()

      return [
        new CommitNode(
          'Author',
          `${commitDetails.authorName} <${commitDetails.authorEmail}>`,
          vscode.TreeItemCollapsibleState.None,
          'person',
        ),
        new CommitNode(
          'Date',
          new Date(commitDetails.date).toLocaleString(),
          vscode.TreeItemCollapsibleState.None,
          'calendar',
        ),
        new CommitNode(
          'Hash',
          commitDetails.hash,
          vscode.TreeItemCollapsibleState.None,
          'git-commit',
        ),
        new CommitNode(
          'Changed Files',
          'Changed Files',
          changedFiles.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
          'files',
          changedFiles
        ),
      ]
    }
    else if (element.label === 'Changed Files' && element.children) {
      return element.children as CommitNode[]
    }

    return []
  }
}
