import { FileNode } from './entity/FileNode'
import { FolderNode } from './entity/FolderNode'
import type { CommitFile, GitService } from '@/git'
import type { StorageService } from '@/storage'

export class FileTreeProvider {
  private gitService: GitService
  private storageService: StorageService
  private commitHash: string = ''

  constructor(gitService: GitService, storageService: StorageService) {
    this.gitService = gitService
    this.storageService = storageService
  }

  refresh(commitHash: string): void {
    if (commitHash === this.commitHash) {
      return
    }
    this.commitHash = commitHash
  }

  private buildFileTree(files: CommitFile[]): Array<FileNode | FolderNode> {
    const topLevelNodes = new Map<string, FolderNode | FileNode>()

    for (const file of files) {
      const parts = file.path.split('/')

      if (parts.length === 1) {
        topLevelNodes.set(file.path, new FileNode(file.path, file.status))
        continue
      }

      const topLevelName = parts[0]
      let currentNode: FolderNode

      if (!topLevelNodes.has(topLevelName)) {
        currentNode = new FolderNode(topLevelName, topLevelName)
        topLevelNodes.set(topLevelName, currentNode)
      }
      else {
        currentNode = topLevelNodes.get(topLevelName)! as FolderNode
      }

      for (let i = 1; i < parts.length - 1; i++) {
        const part = parts[i]
        const currentPath = parts.slice(0, i + 1).join('/')

        let folderNode = currentNode.children.find(
          child => child instanceof FolderNode && child.name === part,
        ) as FolderNode

        if (!folderNode) {
          folderNode = new FolderNode(part, currentPath)
          currentNode.addChild(folderNode)
        }

        currentNode = folderNode
      }

      currentNode.addChild(new FileNode(file.path, file.status))
    }

    return Array.from(topLevelNodes.values())
  }

  async getChildren(): Promise<Array<FileNode | FolderNode>> {
    if (!this.commitHash)
      return []

    try {
      const commit = this.storageService.getCommit(this.commitHash)

      if (!commit) {
        return []
      }

      if (commit.files && commit.files.length > 0) {
        return this.buildFileTree(commit.files)
      }

      const showResult = await this.gitService.git.show([
        '--name-status',
        '--pretty=format:',
        '-M',
        '-C',
        this.commitHash,
      ])

      const fileChanges = showResult
        .trim()
        .split('\n')
        .filter(line => line.length > 0)
        .map((line) => {
          const [status, ...pathParts] = line.split('\t')
          const path = pathParts.join('\t') // Handle paths with tabs
          return { status, path }
        })

      this.storageService.updateCommitFiles(this.commitHash, fileChanges)

      return this.buildFileTree(fileChanges)
    }
    catch (error) {
      console.error('Error getting commit files:', error)
      return []
    }
  }

  private parseGitStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      M: 'M', // Modified
      A: 'A', // Added
      D: 'D', // Deleted
      R: 'R', // Renamed
      C: 'C', // Copied
      T: 'M', // Type changed (treated as modified)
      U: 'U', // Unmerged
    }
    return statusMap[status.charAt(0)] || '?'
  }
}
