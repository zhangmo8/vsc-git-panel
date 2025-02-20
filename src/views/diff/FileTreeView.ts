import type { TreeViewNode } from 'reactive-vscode'
import { createSingletonComposable, ref } from 'reactive-vscode'
import { FileNode } from './entity/FileNode'
import { FolderNode } from './entity/FolderNode'
import { EXTENSION_SYMBOL } from '@/constant'
import { type CommitFile, useGitService } from '@/git'
import { useStorage } from '@/storage'
import { parseGitStatus } from '@/utils'

export const useFileTreeView = createSingletonComposable(() => {
  const git = useGitService()
  const storage = useStorage()

  function buildFileTree(files: CommitFile[]): TreeViewNode[] {
    const root = new Map<string, TreeViewNode>()
    const folderChildren = new Map<string, TreeViewNode[]>()

    for (const file of files) {
      const normalizedPath = file.path.replace(/\t/g, '')
      const parts = normalizedPath.split('/')
      const directories = parts.slice(0, -1)

      if (directories.length === 0) {
        root.set(normalizedPath, {
          treeItem: new FileNode(
            normalizedPath,
            file.status,
            'oldPath' in file ? file.oldPath : undefined,
          ),
        })
        continue
      }

      let currentPath = ''
      let currentNode: TreeViewNode | undefined
      let parentMap = root

      for (let i = 0; i < directories.length; i++) {
        const dirName = directories[i]
        if (!dirName)
          continue

        currentPath = currentPath ? `${currentPath}/${dirName}` : dirName

        let node = parentMap.get(currentPath)
        if (!node) {
          const folderNode = new FolderNode(dirName, currentPath)
          const children: TreeViewNode[] = []
          folderChildren.set(currentPath, children)
          
          node = {
            treeItem: folderNode,
            children,
          }
          parentMap.set(currentPath, node)

          if (currentNode) {
            const parentChildren = folderChildren.get((currentNode.treeItem as FolderNode).path)
            if (parentChildren)
              parentChildren.push(node)
          }
        }

        currentNode = node
        parentMap = new Map(
          (folderChildren.get(currentPath) || []).map(child => [
            (child.treeItem as FolderNode | FileNode).path,
            child,
          ]),
        )
      }

      if (currentNode) {
        const fileNode: TreeViewNode = {
          treeItem: new FileNode(
            normalizedPath,
            file.status,
            'oldPath' in file ? file.oldPath : undefined,
          ),
        }
        const currentChildren = folderChildren.get((currentNode.treeItem as FolderNode).path)
        if (currentChildren)
          currentChildren.push(fileNode)
      }
    }

    return Array.from(root.values())
  }

  async function getChildren(commitHash: string): Promise<{ files: TreeViewNode[], total: number }> {
    if (!commitHash)
      return { files: [], total: 0 }

    try {
      const commit = storage.getCommit(commitHash)

      if (commit?.files) {
        return {
          files: buildFileTree(commit.files),
          total: commit.files.length,
        }
      }

      const showResult = await git.git.show([
        '--name-status',
        '--pretty=format:',
        '-M',
        '-C',
        commitHash,
      ])

      if (!showResult)
        return { files: [], total: 0 }

      const files = showResult
        .trim()
        .split('\n')
        .filter(Boolean)
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

      return {
        files: buildFileTree(files),
        total: files.length,
      }
    }
    catch (error) {
      console.error('Error getting commit files:', error)
      return { files: [], total: 0 }
    }
  }

  const refresh = (commitHash: string) => {
    getChildren(commitHash)
  }

  return {
    getChildren,
    refresh,
  }
})

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
