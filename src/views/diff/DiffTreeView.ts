import { TreeItemCollapsibleState } from 'vscode'
import type { TreeViewNode } from 'reactive-vscode'
import { computed, createSingletonComposable, ref, useTreeView } from 'reactive-vscode'

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
  const selectedCommitHash = ref('')
  const commitDetails = ref<CommitDetails | null>(null)
  const files = ref<TreeViewNode[]>([])

  async function loadCommitDetails(hash: string) {
    try {
      let commit = storage.getCommit(hash)

      if (!commit) {
        const { logResult } = await git.getHistory()
        const historyCommit = logResult.all.find(c => c.hash === hash)
        if (!historyCommit)
          return

        commit = {
          ...historyCommit,
        }

        storage.saveCommits(Array.from(logResult.all))
      }

      commitDetails.value = commit
      const { files: commitFiles, total } = await fileTree.getChildren(hash)

      files.value = [
        {
          treeItem: new CommitNode(
            'Changed Files',
            `${total} Files Changed`,
            total > 0 ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None,
            'files',
          ),
          children: commitFiles,
        },
      ]
    }
    catch (error) {
      console.error('Error getting commit details:', error)
      commitDetails.value = null
      files.value = []
    }
  }

  const treeNodes = computed<TreeViewNode[]>(() => {
    if (!commitDetails.value)
      return []

    return [
      {
        treeItem: new CommitNode(
          'Author',
          `${commitDetails.value.authorName} <${commitDetails.value.authorEmail}>`,
          TreeItemCollapsibleState.None,
          'person',
        ),
      },
      {
        treeItem: new CommitNode(
          'Date',
          new Date(commitDetails.value.date).toLocaleString(),
          TreeItemCollapsibleState.None,
          'calendar',
        ),
      },
      {
        treeItem: new CommitNode(
          'Hash',
          commitDetails.value.hash,
          TreeItemCollapsibleState.None,
          'git-commit',
        ),
      },
      ...files.value,
    ]
  })

  const tree = useTreeView(
    `${EXTENSION_SYMBOL}.changes`,
    treeNodes,
    {
      showCollapseAll: true,
    },
  )

  async function refresh(hash: string) {
    if (hash === selectedCommitHash.value)
      return

    selectedCommitHash.value = hash
    fileTree.refresh(hash)
    await loadCommitDetails(hash)
  }

  return {
    tree,
    refresh,
    selectedCommitHash,
  }
})
