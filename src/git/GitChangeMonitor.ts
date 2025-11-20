import { type Disposable, extensions } from 'vscode'
import { createSingletonComposable, ref, useFsWatcher } from 'reactive-vscode'
import { useGitPanelView } from '@/views/webview'

export const useGitChangeMonitor = createSingletonComposable(() => {
  const webview = useGitPanelView()

  const disposables = ref<Disposable[]>([])
  const retryCount = ref(0)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const onGitChange = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      webview.refreshHistory(true)
    }, 500)
  }

  const fsWatcher = useFsWatcher('**/.git/index')

  fsWatcher.onDidChange(onGitChange)
  fsWatcher.onDidCreate(onGitChange)

  async function getGetInstance() {
    try {
      const extension = extensions.getExtension(
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
      console.error('Error getting git extension:', err)
      throw new Error(`Git extension not found: ${err}`)
    }

    return undefined
  }

  function setupRepository(repo: any) {
    try {
      disposables.value.push(repo.state.onDidChange(onGitChange))
    }
    catch (error) {
      console.error('Error setting up repository:', error)
    }
  }

  function initializeError() {
    console.error('Failed to get Git extension API, will retry after 5 seconds...')
    if (retryCount.value === 0) {
      retryCount.value++
      setTimeout(initialize, 5000)
    }
  }

  async function initialize() {
    try {
      const git = await getGetInstance()

      if (!git) {
        initializeError()
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
    retryCount.value = 0
    disposables.value.forEach(d => d.dispose())
    disposables.value = []
  }

  initialize()

  return {
    dispose,
  }
})
