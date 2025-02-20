import type { Event, TreeDataProvider, TreeItem } from 'vscode'
import { EventEmitter, TreeItemCollapsibleState } from 'vscode'
import { computed, createSingletonComposable, ref, useTreeView } from 'reactive-vscode'

import { CommitNode } from './entity/CommitNode'
import { FileTreeView } from './FileTreeView'
import type { CommitDetails } from './types'
import { useGitService } from '@/git'
import { useStorage } from '@/storage'
import { EXTENSION_SYMBOL } from '@/constant'

export class DiffTreeView implements TreeDataProvider<CommitNode> {
  private readonly _onDidChangeTreeData: EventEmitter<CommitNode | undefined | null | void> = new EventEmitter<CommitNode | undefined | null | void>()
  readonly onDidChangeTreeData: Event<CommitNode | undefined | null | void> = this._onDidChangeTreeData.event
  private storage = useStorage()
  private fileTreeProvider: FileTreeView
  private selectedCommitHash?: string
  private static instance: DiffTreeView

  private constructor() {
    this.fileTreeProvider = new FileTreeView()
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
      let commit = this.storage.getCommit(hash)

      if (!commit) {
        // Only fetch all commits if not found in cache
        const { getHistory } = useGitService()
        const history = await getHistory()
        const historyCommit = history.all.find(c => c.hash === hash)
        if (!historyCommit) {
          return null
        }

        commit = {
          ...historyCommit,
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

      const { files, total } = await this.fileTreeProvider.getChildren()

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
          `${total} Files Changed`,
          total > 0 ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None,
          'files',
          files,
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

// export const useDiffTreeView = createSingletonComposable(() => {
//   const { git, parseGitStatus } = useGitService()
//   const selectedCommitHash = ref<string[]>([])

//   const tree = useTreeView(
//     `${EXTENSION_SYMBOL}.changes`,
//     [],
//     {
//       canSelectMany: false,
//     },
//   )

//   const treeData = computed(() => {
//     if (selectedCommitHash.value.length === 1) {
//       const commitDetail = selectedCommitHash.value[0]
//       return [
//         new CommitNode(
//           'Author',
//           `${commitDetail.authorName} <${commitDetail.authorEmail}>`,
//           TreeItemCollapsibleState.None,
//           'person',
//         ),
//         new CommitNode(
//           'Date',
//           new Date(commitDetail.date).toLocaleString(),
//           TreeItemCollapsibleState.None,
//           'calendar',
//         ),
//         new CommitNode(
//           'Hash',
//           commitDetail.hash,
//           TreeItemCollapsibleState.None,
//           'git-commit',
//         ),
//         new CommitNode(
//           'Changed Files',
//           `${total} Files Changed`,
//           total > 0 ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None,
//           'files',
//           files,
//         ),
//       ]
//     }
//     return selectedCommitHash.value.map(hash => tree.getItem(hash))
//   })

//   const refresh = (commitsHash: string[]) => {
//     selectedCommitHash.value = commitsHash
//     tree.refresh()
//   }

//   const getCommitByHash = async (hash?: string): Promise<CommitDetails | null> => {
//     try {
//       if (!hash) {
//         throw new Error('Commit hash is required')
//       }

//       // First try to get from cache
//       let commit = storageService.getCommit(hash)

//       if (!commit) {
//         // Only fetch all commits if not found in cache
//         const history = await git.getHistory()
//         const historyCommit = history.all.find(c => c.hash === hash)
//         if (!historyCommit) {
//           return null
//         }

//         commit = {
//           hash: historyCommit.hash,
//           authorName: historyCommit.author_name,
//           authorEmail: historyCommit.author_email,
//           date: historyCommit.date,
//           message: historyCommit.message,
//           body: historyCommit.body,
//           stats: historyCommit.stats,
//         }
//       }

//       return commit
//     }
//     catch (error) {
//       console.error('Error getting commit details:', error)
//       return null
//     }
//   }

//   const getFiles = async () => {
//     try {
//       const status = await git.status()
//     }
//     catch (error) {
//       console.error('Error getting files:', error)
//     }
//   }

//   return {
//     diffTreeView: tree,
//     selectedCommitHash,
//     refresh,
//   }
// })
