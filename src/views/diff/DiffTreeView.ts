import type { TreeViewNode } from 'reactive-vscode'
import { computed, createSingletonComposable, ref, useTreeView } from 'reactive-vscode'
import { TreeItemCollapsibleState } from 'vscode'

import { CommitNode } from './entity/CommitNode'
import { useFileTreeView } from './FileTreeView'

import type { CommitDetails } from './types'

import { useGitService } from '@/git'
import { EXTENSION_SYMBOL } from '@/constant'

export const useDiffTreeView = createSingletonComposable(() => {
  const git = useGitService()
  const fileTree = useFileTreeView()
  const selectedCommitHashes = ref<string[]>([])
  const commitDetailsList = ref<CommitDetails[]>([])
  const files = ref<TreeViewNode[]>([])

  async function loadCommitDetails(hashes: string[]) {
    try {
      if (hashes.length === 0) {
        commitDetailsList.value = []
        files.value = []
        return null
      }

      const allCommitFiles: Map<string, { files: TreeViewNode[], total: number }> = new Map()
      let totalFiles = 0

      const commitList: CommitDetails[] = await git.getCommitByHash(hashes)

      for (const commit of commitList) {
        const { files: commitFiles, total } = await fileTree.getChildren(commit.hash)

        allCommitFiles.set(commit.hash, { files: commitFiles, total })
        totalFiles += total
      }

      commitDetailsList.value = commitList

      if (hashes.length === 1) {
        files.value = [
          {
            treeItem: new CommitNode(
              'Changed Files',
              `${totalFiles} Files Changed`,
              TreeItemCollapsibleState.Expanded,
              'files',
            ),
            children: allCommitFiles.get(hashes[0])?.files || [],
          },
        ]
      }
      else {
        // Multiple commits view - group files by commit
        const commitNodes: TreeViewNode[] = []

        for (const hash of hashes) {
          const commit = commitList.find(c => c.hash === hash)
          if (!commit)
            continue

          const { files: commitFiles, total } = allCommitFiles.get(hash) || { files: [], total: 0 }
          const shortHash = hash.substring(0, 7)

          commitNodes.push({
            treeItem: new CommitNode(
              `${total} Files Changed`,
              `${shortHash}`,
              TreeItemCollapsibleState.Expanded,
              'git-commit',
            ),
            children: commitFiles,
          })
        }

        files.value = [
          {
            treeItem: new CommitNode(
              'Multiple Commits Selected',
              `${commitDetailsList.value.length} commits`,
              TreeItemCollapsibleState.Expanded,
              'git-commit',
            ),
            children: commitNodes,
          },
        ]
      }
    }
    catch (error) {
      console.error('Error getting commit details:', error)
      commitDetailsList.value = []
      files.value = []
    }
  }

  const treeNodes = computed<TreeViewNode[]>(() => {
    if (commitDetailsList.value.length === 0)
      return []

    if (commitDetailsList.value.length === 1) {
      // Single commit view
      const commit = commitDetailsList.value[0]
      return [
        {
          treeItem: new CommitNode(
            'Author',
            `${commit.authorName} <${commit.authorEmail}>`,
            TreeItemCollapsibleState.None,
            'person',
          ),
        },
        {
          treeItem: new CommitNode(
            'Date',
            new Date(commit.date).toLocaleString(),
            TreeItemCollapsibleState.None,
            'calendar',
          ),
        },
        {
          treeItem: new CommitNode(
            'Hash',
            commit.hash,
            TreeItemCollapsibleState.None,
            'git-commit',
          ),
        },
        ...files.value,
      ]
    }
    else {
      return [
        ...files.value,
      ]
    }
  })

  const tree = useTreeView(
    `${EXTENSION_SYMBOL}.changes`,
    treeNodes,
    {
      showCollapseAll: true,
    },
  )

  async function refresh(hashes: string[] = []) {
    const currentHashes = new Set(selectedCommitHashes.value)
    const newHashes = new Set(hashes)

    if (currentHashes.size === newHashes.size
      && [...currentHashes].every(hash => newHashes.has(hash))) {
      return
    }

    selectedCommitHashes.value = [...hashes]
    await loadCommitDetails(hashes)
  }

  function clearSelection() {
    selectedCommitHashes.value = []
    commitDetailsList.value = []
    refresh()
  }

  return {
    tree,
    selectedCommitHashes,
    refresh,
    clearSelection,
  }
})
