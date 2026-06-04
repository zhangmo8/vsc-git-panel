import { type Disposable, extensions } from 'vscode'
import { createSingletonComposable, ref, useFsWatcher } from 'reactive-vscode'
import { useGitPanelView } from '@/views/webview'
import { useFileHistoryTreeView } from '@/views/fileHistory'
import { config } from '@/config'
import { useGitService } from '@/git'
import { formatError, logger } from '@/utils'

// Type for VSCode Git API repository
interface GitRepository {
  state: {
    onDidChange: (callback: () => void) => Disposable
  }
}

interface GitAPI {
  repositories: GitRepository[]
  onDidOpenRepository: (callback: (repo: GitRepository) => void) => Disposable
}

export const useGitChangeMonitor = createSingletonComposable(() => {
  const webview = useGitPanelView()
  const fileHistory = useFileHistoryTreeView()
  const git = useGitService()

  const disposables = ref<Disposable[]>([])
  const retryCount = ref(0)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const onGitChange = () => {
    if (disposed) {
      return
    }

    // Clear any existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // Get debounce time from config
    const debounceTime = config['history.refreshDebounce'] ?? 500

    // Clear cache and force refresh after debounce
    debounceTimer = setTimeout(() => {
      if (disposed) {
        return
      }
      git.clearCache()
      webview.refreshHistory(true)
      webview.refreshStashList()
      fileHistory.refresh(true)
    }, debounceTime)
  }

  const fsWatcher = useFsWatcher('**/.git/index')

  fsWatcher.onDidChange(onGitChange)
  fsWatcher.onDidCreate(onGitChange)

  // Also watch the stash log so the stash panel refreshes when stashes are created/dropped
  const stashWatcher = useFsWatcher('**/.git/refs/stash')
  stashWatcher.onDidChange(onGitChange)
  stashWatcher.onDidCreate(onGitChange)
  stashWatcher.onDidDelete(onGitChange)

  async function getGetInstance(): Promise<GitAPI | undefined> {
    try {
      const extension = extensions.getExtension<{ getAPI: (version: number) => GitAPI }>(
        'vscode.git',
      )

      if (extension !== undefined) {
        const gitExtension = extension.isActive
          ? extension.exports
          : await extension.activate()

        const api = gitExtension.getAPI(1)
        return api
      }
    }
    catch (err) {
      logger.error('Error getting git extension:', err)
      throw new Error(`Git extension not found: ${formatError(err)}`)
    }

    return undefined
  }

  function setupRepository(repo: GitRepository) {
    try {
      disposables.value.push(repo.state.onDidChange(onGitChange))
    }
    catch (error) {
      logger.error('Error setting up repository:', error)
    }
  }

  function initializeError() {
    if (disposed) {
      return
    }

    logger.error('Failed to get Git extension API, will retry after 5 seconds...')
    if (retryCount.value === 0) {
      retryCount.value++
      retryTimer = setTimeout(initialize, 5000)
    }
  }

  async function initialize() {
    if (disposed) {
      return
    }

    try {
      const git = await getGetInstance()

      if (!git) {
        initializeError()
        return
      }

      if (disposed) {
        return
      }

      retryCount.value = 0
      if (!git.repositories || git.repositories.length === 0) {
        disposables.value.push(git.onDidOpenRepository(setupRepository))
      }
      else {
        git.repositories.forEach(setupRepository)
      }
    }
    catch {
      initializeError()
    }
  }

  function dispose() {
    disposed = true
    retryCount.value = 0

    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }

    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }

    disposables.value.forEach(d => d.dispose())
    disposables.value = []
  }

  initialize()

  return {
    dispose,
  }
})
