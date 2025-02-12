import type { Event, TreeDataProvider, TreeItem } from 'vscode'
import { EventEmitter, TreeItemCollapsibleState } from 'vscode'

import { CommitNode } from './entity/CommitNode'
import { FileTreeView } from './FileTreeView'
import type { CommitDetails } from './types'

import { StorageService } from '@/storage'
import { GitService } from '@/git'

export class DiffTreeView implements TreeDataProvider<CommitNode> {
  private _onDidChangeTreeData: EventEmitter<CommitNode | undefined | null | void> = new EventEmitter<CommitNode | undefined | null | void>()
  readonly onDidChangeTreeData: Event<CommitNode | undefined | null | void> = this._onDidChangeTreeData.event
  private gitService: GitService
  private storageService: StorageService
  private fileTreeProvider: FileTreeView
  private selectedCommitHash?: string
  private static instance: DiffTreeView

  private constructor() {
    this.gitService = new GitService()
    this.storageService = StorageService.getInstance()
    this.fileTreeProvider = new FileTreeView(this.gitService, this.storageService)
  }

  static getInstance(): DiffTreeView {
    if (!DiffTreeView.instance) {
      DiffTreeView.instance = new DiffTreeView()
    }
    return DiffTreeView.instance
  }

  refresh(commitHash?: string): void {
    this.selectedCommitHash = commitHash
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: CommitNode): TreeItem {
    return element
  }

  private async getCommitByHash(hash?: string): Promise<CommitDetails | null> {
    try {
      if (!hash) {
        throw new Error('Commit hash is required')
      }

      // First try to get from cache
      let commit = this.storageService.getCommit(hash)

      if (!commit) {
        // Only fetch all commits if not found in cache
        const history = await this.gitService.getHistory()
        const historyCommit = history.all.find(c => c.hash === hash)
        if (!historyCommit) {
          return null
        }

        commit = {
          hash: historyCommit.hash,
          authorName: historyCommit.author_name,
          authorEmail: historyCommit.author_email,
          date: historyCommit.date,
          message: historyCommit.message,
          body: historyCommit.body,
          stats: historyCommit.stats,
        }
      }

      return commit
    }
    catch (error) {
      console.error('Error getting commit details:', error)
      return null
    }
  }

  async getChildren(element?: CommitNode): Promise<CommitNode[]> {
    if (!element && this.selectedCommitHash) {
      const commitDetails = await this.getCommitByHash(this.selectedCommitHash)

      if (!commitDetails) {
        return []
      }

      this.fileTreeProvider.refresh(commitDetails.hash)

      const changedFiles = await this.fileTreeProvider.getChildren()

      return [
        new CommitNode(
          'Author',
          `${commitDetails.authorName} <${commitDetails.authorEmail}>`,
          TreeItemCollapsibleState.None,
          'person',
        ),
        new CommitNode(
          'Date',
          new Date(commitDetails.date).toLocaleString(),
          TreeItemCollapsibleState.None,
          'calendar',
        ),
        new CommitNode(
          'Hash',
          commitDetails.hash,
          TreeItemCollapsibleState.None,
          'git-commit',
        ),
        new CommitNode(
          'Changed Files',
          `${changedFiles.length} Files Changed`,
          changedFiles.length > 0 ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None,
          'files',
          changedFiles,
        ),
      ]
    }

    return element?.children as CommitNode[] || []
  }

  // Getter for selectedCommitHash
  public getSelectedCommitHash(): string | undefined {
    return this.selectedCommitHash
  }
}
