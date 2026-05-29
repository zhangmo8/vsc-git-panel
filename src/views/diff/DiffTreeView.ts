import type { TreeViewNode } from 'reactive-vscode'
import { computed, createSingletonComposable, ref, useTreeView } from 'reactive-vscode'
import { TreeItemCollapsibleState } from 'vscode'

import { CommitNode } from './entity/CommitNode'
import { useFileTreeView } from './FileTreeView'

import type { CommitDetails } from './types'

import { useGitService } from '@/git'
import { EXTENSION_SYMBOL } from '@/constant'
import { logger } from '@/utils'

interface StashViewState {
  ref: string
  hash: string
  message: string
  branch: string
  date: string
  authorName: string
  authorEmail: string
}

export const useDiffTreeView = createSingletonComposable(() => {
  const git = useGitService()
  const fileTree = useFileTreeView()
  const selectedCommitHashes = ref<string[]>([])
  const commitDetailsList = ref<CommitDetails[]>([])
  const files = ref<TreeViewNode[]>([])
  const stashState = ref<StashViewState | null>(null)
  const stashFiles = ref<TreeViewNode[]>([])

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
              undefined,
              undefined,
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
              undefined,
              hash,
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
              undefined,
              undefined,
            ),
            children: commitNodes,
          },
        ]
      }
    }
    catch (error) {
      logger.error('Error getting commit details:', error)
      commitDetailsList.value = []
      files.value = []
    }
  }

  const treeNodes = computed<TreeViewNode[]>(() => {
    // Stash view takes precedence when active
    if (stashState.value) {
      const s = stashState.value
      const totalFiles = stashFiles.value.length

      return [
        {
          treeItem: new CommitNode(
            'Stash',
            `${s.ref}${s.branch ? ` · ${s.branch}` : ''}`,
            TreeItemCollapsibleState.None,
            'archive',
            undefined,
            undefined,
          ),
        },
        ...(s.message
          ? [{
              treeItem: new CommitNode(
                'Message',
                s.message,
                TreeItemCollapsibleState.None,
                'comment',
                undefined,
                undefined,
              ),
            }]
          : []),
        ...(s.authorName
          ? [{
              treeItem: new CommitNode(
                'Author',
                s.authorEmail ? `${s.authorName} <${s.authorEmail}>` : s.authorName,
                TreeItemCollapsibleState.None,
                'person',
                undefined,
                undefined,
              ),
            }]
          : []),
        ...(s.date
          ? [{
              treeItem: new CommitNode(
                'Date',
                new Date(s.date).toLocaleString(),
                TreeItemCollapsibleState.None,
                'calendar',
                undefined,
                undefined,
              ),
            }]
          : []),
        {
          treeItem: new CommitNode(
            'Hash',
            s.hash,
            TreeItemCollapsibleState.None,
            'git-commit',
            undefined,
            s.hash,
          ),
        },
        {
          treeItem: new CommitNode(
            'Changed Files',
            `${totalFiles} File${totalFiles === 1 ? '' : 's'} Changed`,
            TreeItemCollapsibleState.Expanded,
            'files',
            undefined,
            undefined,
          ),
          children: stashFiles.value,
        },
      ]
    }

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
            undefined,
            undefined,
          ),
        },
        {
          treeItem: new CommitNode(
            'Date',
            new Date(commit.date).toLocaleString(),
            TreeItemCollapsibleState.None,
            'calendar',
            undefined,
            undefined,
          ),
        },
        {
          treeItem: new CommitNode(
            'Hash',
            commit.hash,
            TreeItemCollapsibleState.None,
            'git-commit',
            undefined,
            commit.hash,
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
      && [...currentHashes].every(hash => newHashes.has(hash))
      && !stashState.value) {
      return
    }

    // 退出 stash 视图
    stashState.value = null
    stashFiles.value = []

    selectedCommitHashes.value = [...hashes]
    await loadCommitDetails(hashes)
  }

  /**
   * 切换到 stash 视图：把 Git Changes 面板替换为指定 stash 的内容
   */
  async function refreshStash(payload: {
    ref: string
    message?: string
    branch?: string
    date?: string
    authorName?: string
    authorEmail?: string
  }) {
    try {
      // Drop normal commit selection
      commitDetailsList.value = []
      files.value = []

      // Resolve stash@{N} to a real commit hash so we can reuse diff plumbing
      const realHash = await git.resolveStashHash(payload.ref)
      if (!realHash) {
        stashState.value = null
        stashFiles.value = []
        selectedCommitHashes.value = []
        return
      }

      const stashFileList = await git.getStashFiles(payload.ref)

      stashState.value = {
        ref: payload.ref,
        hash: realHash,
        message: payload.message || '',
        branch: payload.branch || '',
        date: payload.date || '',
        authorName: payload.authorName || '',
        authorEmail: payload.authorEmail || '',
      }

      // The diff command short-circuits when selectedCommitHashes is empty.
      // Set the stash's real commit hash so file clicks resolve to a normal diff.
      selectedCommitHashes.value = [realHash]

      // Reuse buildFileTree; FileNode's commitHash drives git diff on the right side.
      stashFiles.value = fileTree.buildFileTree(stashFileList, realHash)
    }
    catch (error) {
      logger.error('Error loading stash details:', error)
      stashState.value = null
      stashFiles.value = []
      selectedCommitHashes.value = []
    }
  }

  function clearSelection() {
    selectedCommitHashes.value = []
    commitDetailsList.value = []
    stashState.value = null
    stashFiles.value = []
    refresh()
  }

  return {
    tree,
    selectedCommitHashes,
    refresh,
    refreshStash,
    clearSelection,
  }
})
