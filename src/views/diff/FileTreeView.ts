import type { TreeViewNode } from 'reactive-vscode'
import { createSingletonComposable } from 'reactive-vscode'

import { FileNode } from './entity/FileNode'
import { FolderNode } from './entity/FolderNode'

import { type CommitFile, useGitService } from '@/git'
import { parseGitStatus } from '@/utils'
import { GIT_STATUS } from '@/constant'

export const useFileTreeView = createSingletonComposable(() => {
  const git = useGitService()

  function buildFileTree(files: CommitFile[], commitHash: string): TreeViewNode[] {
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
            commitHash,
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
            commitHash,
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
      // 直接从Git获取文件信息
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

          if (type === GIT_STATUS.RENAMED && pathParts.length === 2) {
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
        files: buildFileTree(files, commitHash),
        total: files.length,
      }
    }
    catch (error) {
      console.error('Error getting commit files:', error)
      return { files: [], total: 0 }
    }
  }

  return {
    getChildren,
  }
})
