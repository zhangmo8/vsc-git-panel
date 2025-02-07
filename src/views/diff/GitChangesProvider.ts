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
  private selectedCommitHash?: string
  private static instance: GitChangesProvider

  private constructor() {
    this.gitService = new GitService()
    this.fileTreeProvider = new FileTreeProvider(this.gitService)
  }

  static getInstance(): GitChangesProvider {
    if (!GitChangesProvider.instance) {
      GitChangesProvider.instance = new GitChangesProvider()
    }
    return GitChangesProvider.instance
  }

  refresh(commitHash?: string): void {
    this.selectedCommitHash = commitHash
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: CommitNode): vscode.TreeItem {
    return element
  }

  private async getCommitByHash(hash?: string): Promise<CommitDetails | null> {
    try {
      const history = await this.gitService.getHistory()
      if (history.all.length === 0) {
        return null
      }

      const commit = history.all.find(c => c.hash === hash) || history.all[0]
      return {
        hash: commit.hash,
        authorName: commit.author_name,
        authorEmail: commit.author_email,
        date: commit.date,
        stats: commit.stats,
      }
    }
    catch (error) {
      console.error('Error getting commit details:', error)
      return null
    }
  }

  async getChildren(element?: CommitNode): Promise<CommitNode[]> {
    if (!element) {
      const commitDetails = await this.getCommitByHash(this.selectedCommitHash)

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
          `${changedFiles.length} Files Changed`,
          changedFiles.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
          'files',
          changedFiles,
        ),
      ]
    }
    else if (element.children) {
      return element.children as CommitNode[]
    }

    return []
  }
}
