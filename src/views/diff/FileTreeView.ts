import { FileNode } from './entity/FileNode'
import { FolderNode } from './entity/FolderNode'
import type { CommitFile, GitService } from '@/git'
import type { StorageService } from '@/storage'

export class FileTreeView {
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

  private parseGitStatus(status: string): { type: string, similarity?: number } {
    // 处理重命名状态，例如 "R86" 表示重命名且相似度为 86%
    const match = status.match(/^([A-Z])(\d+)?$/)
    if (match) {
      return {
        type: match[1],
        similarity: match[2] ? Number.parseInt(match[2], 10) : undefined,
      }
    }
    return { type: status }
  }

  private buildFileTree(files: CommitFile[]): Array<FileNode | FolderNode> {
    const root = new Map<string, FolderNode | FileNode>()

    for (const file of files) {
      // 处理可能包含制表符的路径
      const normalizedPath = file.path.replace(/\t/g, '')
      const parts = normalizedPath.split('/')
      const directories = parts.slice(0, -1)

      // 如果是根目录下的文件
      if (directories.length === 0) {
        root.set(normalizedPath, new FileNode(
          normalizedPath,
          file.status,
          'oldPath' in file ? file.oldPath : undefined,
        ))
        continue
      }

      let currentPath = ''
      let currentNode: FolderNode | undefined
      let parentMap = root

      for (let i = 0; i < directories.length; i++) {
        const dirName = directories[i]
        if (!dirName)
          continue

        currentPath = currentPath ? `${currentPath}/${dirName}` : dirName

        let node = parentMap.get(currentPath)
        if (!node) {
          node = new FolderNode(dirName, currentPath)
          parentMap.set(currentPath, node)

          if (currentNode) {
            currentNode.addChild(node)
          }
        }

        if (node instanceof FolderNode) {
          currentNode = node
          parentMap = new Map(
            node.children.map(child => [child.path, child]),
          )
        }
      }

      if (currentNode) {
        const fileNode = new FileNode(
          normalizedPath,
          file.status,
          'oldPath' in file ? file.oldPath : undefined,
        )
        currentNode.addChild(fileNode)
      }
    }

    return Array.from(root.values())
  }

  async getChildren(): Promise<{ files: Array<FileNode | FolderNode>, total: number }> {
    if (!this.commitHash)
      return { files: [], total: 0 }

    try {
      const commit = this.storageService.getCommit(this.commitHash)

      if (commit?.files) {
        return {
          files: this.buildFileTree(commit.files),
          total: commit.files.length,
        }
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
          const { type, similarity } = this.parseGitStatus(status)

          if (type === 'R' && pathParts.length === 2) {
            const [oldPath, newPath] = pathParts
            return {
              status: type,
              path: newPath,
              oldPath,
              similarity,
            }
          }

          return {
            status: type,
            path: pathParts[0],
          }
        })

      this.storageService.updateCommitFiles(this.commitHash, fileChanges)

      return {
        files: this.buildFileTree(fileChanges),
        total: fileChanges.length,
      }
    }
    catch (error) {
      console.error('Error getting commit files:', error)
      return { files: [], total: 0 }
    }
  }
}
