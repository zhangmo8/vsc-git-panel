import type { TreeViewNode } from 'reactive-vscode'
import { computed, createSingletonComposable, ref, useTreeView } from 'reactive-vscode'
import { TreeItemCollapsibleState } from 'vscode'

import { CommitNode } from './entity/CommitNode'
import { useFileTreeView } from './FileTreeView'

import type { CommitDetails } from './types'

import { useGitService } from '@/git'
import { useStorage } from '@/storage'
import { EXTENSION_SYMBOL } from '@/constant'

export const useDiffTreeView = createSingletonComposable(() => {
  const git = useGitService()
  const storage = useStorage()
  const fileTree = useFileTreeView()
  const selectedCommitHashes = ref<string[]>([])
  const commitDetailsList = ref<CommitDetails[]>([])
  const files = ref<TreeViewNode[]>([])

  async function loadCommitDetails(hashes: string[]) {
    try {
      if (hashes.length === 0) {
        commitDetailsList.value = []
        files.value = []
        return
      }

      const commitList: CommitDetails[] = []
      const allCommitFiles: Map<string, TreeViewNode[]> = new Map()
      let totalFiles = 0

      for (const hash of hashes) {
        let commit = storage.getCommit(hash)

        if (!commit) {
          const { logResult, operations, branches } = await git.getHistory()
          const historyCommit = logResult.all.find(c => c.hash === hash)
          if (!historyCommit)
            continue

          commit = {
            ...historyCommit,
          }

          storage.saveCommits({ operations, branches, logResult })
        }

        commitList.push(commit)

        const { files: commitFiles, total } = await fileTree.getChildren(hash)

        allCommitFiles.set(hash, commitFiles)
        totalFiles += total
      }

      commitDetailsList.value = commitList

      // Aggregate file changes for all selected commits
      if (hashes.length === 1) {
        // Single commit view - show files directly
        files.value = [
          {
            treeItem: new CommitNode(
              'Changed Files',
              `${totalFiles} Files Changed`,
              TreeItemCollapsibleState.Expanded,
              'files',
            ),
            children: allCommitFiles.get(hashes[0]) || [],
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

          const commitFiles = allCommitFiles.get(hash) || []
          const shortHash = hash.substring(0, 7)

          commitNodes.push({
            treeItem: new CommitNode(
              `${commitFiles.length} Files Changed`,
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
              'Selected Commits',
              `${hashes.length} Commits Selected`,
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
      // Multiple commits view - summary information
      return [
        {
          treeItem: new CommitNode(
            'Multiple Commits Selected',
            `${commitDetailsList.value.length} commits`,
            TreeItemCollapsibleState.None,
            'git-commit',
          ),
        },
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

  async function refresh(hashes: string[]) {
    const currentHashes = new Set(selectedCommitHashes.value)
    const newHashes = new Set(hashes)

    if (currentHashes.size === newHashes.size
      && [...currentHashes].every(hash => newHashes.has(hash))) {
      return
    }

    selectedCommitHashes.value = [...hashes]
    await loadCommitDetails(hashes)
  }

  return {
    tree,
    refresh,
    selectedCommitHashes,
  }
})
