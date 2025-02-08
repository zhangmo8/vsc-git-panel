import { FileNode } from './entity/FileNode'
import type { GitService } from '@/git'
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

  async getChildren(): Promise<FileNode[]> {
    if (!this.commitHash)
      return []

    try {
      const commit = this.storageService.getCommit(this.commitHash)

      if (!commit) {
        return []
      }

      if (commit.files && commit.files.length > 0) {
        return commit.files.map(file => new FileNode(file.path, file.status))
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
