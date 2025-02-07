import * as vscode from 'vscode'
import { FileTreeProvider } from './FileTreeProvider'
import type { GitService } from '@/git'

export class DiffViewService {
  private static instance: DiffViewService
  private fileTreeProvider: FileTreeProvider
  private treeView?: vscode.TreeView<any>

  private constructor(gitService: GitService) {
    this.fileTreeProvider = new FileTreeProvider(gitService)
    this.treeView = vscode.window.createTreeView('git-panel.changes', {
      treeDataProvider: this.fileTreeProvider,
      showCollapseAll: true,
    })
  }

  static initialize(gitService: GitService): DiffViewService {
    if (!DiffViewService.instance) {
      DiffViewService.instance = new DiffViewService(gitService)
    }
    return DiffViewService.instance
  }

  static getInstance(): DiffViewService {
    if (!DiffViewService.instance) {
      throw new Error('DiffViewService not initialized')
    }
    return DiffViewService.instance
  }

  showCommitFiles(commitHash: string): void {
    this.fileTreeProvider.refresh(commitHash)
  }

  dispose(): void {
    this.treeView?.dispose()
  }
}
