import * as vscode from 'vscode'
import { FileNode } from './FileNode'
import type { GitService } from '@/git'

export class FileTreeProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileNode | undefined | null | void> = new vscode.EventEmitter<FileNode | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<FileNode | undefined | null | void> = this._onDidChangeTreeData.event
  private gitService: GitService
  private commitHash: string = ''

  constructor(gitService: GitService) {
    this.gitService = gitService
  }

  refresh(commitHash: string): void {
    this.commitHash = commitHash
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: FileNode): vscode.TreeItem {
    return element
  }

  async getChildren(): Promise<FileNode[]> {
    if (!this.commitHash)
      return []

    try {
      // Get detailed file changes from the commit
      const showResult = await this.gitService.git.show([
        '--name-status',  // Show only names and status of changed files
        '--pretty=format:', // Don't show commit info
        '-M',             // Detect renames
        '-C',             // Detect copies
        this.commitHash
      ])

      // Parse the output to get file status
      const fileChanges = showResult
        .trim()
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => {
          const [status, ...pathParts] = line.split('\t')
          const path = pathParts.join('\t') // Handle paths with tabs
          return { status, path }
        })

      return fileChanges.map(({ status, path }) => new FileNode(
        path,
        this.parseGitStatus(status),
      ))
    }
    catch (error) {
      console.error('Error getting commit files:', error)
      return []
    }
  }

  private parseGitStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'M': 'M', // Modified
      'A': 'A', // Added
      'D': 'D', // Deleted
      'R': 'R', // Renamed
      'C': 'C', // Copied
      'T': 'M', // Type changed (treated as modified)
      'U': 'U', // Unmerged
    }
    return statusMap[status.charAt(0)] || '?'
  }
}
