import { createSingletonComposable } from 'reactive-vscode'
import { FileNode } from './entity/FileNode'
import { FolderNode } from './entity/FolderNode'
import { EXTENSION_SYMBOL } from '@/constant'
import { type CommitFile, useGitService } from '@/git'
import { useStorage } from '@/storage'
import { parseGitStatus } from '@/utils'

export class FileTreeView {
  private gitService = useGitService()
  private storage = useStorage()
  private commitHash: string = ''

  constructor() {}

  refresh(commitHash: string): void {
    if (commitHash === this.commitHash) {
      return
    }
    this.commitHash = commitHash
  }

  private buildFileTree(files: CommitFile[]): Array<FileNode | FolderNode> {
    const root = new Map<string, FolderNode | FileNode>()

    for (const file of files) {
      const normalizedPath = file.path.replace(/\t/g, '')
      const parts = normalizedPath.split('/')
      const directories = parts.slice(0, -1)

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
      const commit = this.storage.getCommit(this.commitHash)

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
          const { type, similarity } = parseGitStatus(status)

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

      this.storage.updateCommitFiles(this.commitHash, fileChanges)

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

// const useDiffTreeView = createSingletonComposable(() => {
//   const selectedCommitHash = ref<string[]>([])

//   const tree = useTreeView(
//     `${EXTENSION_SYMBOL}.changes`,
//     [],
//     {
//       canSelectMany: false,
//     },
//   )

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
//         const history = await gitService.getHistory()
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

//   return {
//     diffTreeView: tree,
//     selectedCommitHash,
//     refresh,
//   }
// })
