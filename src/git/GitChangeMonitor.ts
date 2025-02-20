import { type Disposable, extensions } from 'vscode'
import { computed, createSingletonComposable, ref, useFsWatcher } from 'reactive-vscode'

export const useGitChangeMonitor = createSingletonComposable(() => {
  const disposables = ref<Disposable[]>([])
  const retryCount = ref(0)
  let onGitChange = () => { }

  const filesToWatch = computed(() => ['**/.git/index'])
  const fsWatcher = useFsWatcher(filesToWatch)

  fsWatcher.onDidChange(onGitChange)
  fsWatcher.onDidCreate(onGitChange)
  fsWatcher.onDidDelete(onGitChange)

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

  function initializeError(fn: () => void) {
    console.error('Failed to get Git extension API, will retry after 5 seconds...')
    retryCount.value = 0
    setTimeout(() => initialize(fn), 5000)
  }

  async function initialize(fn: () => void) {
    try {
      const git = await getGetInstance()

      if (!git && retryCount.value === 0) {
        initializeError(fn)
        return
      }

      retryCount.value = 0
      onGitChange = fn

      if (!git.repositories || git.repositories.length === 0) {
        disposables.value.push(git.onDidOpenRepository(setupRepository))
      }
      else {
        git.repositories.forEach(setupRepository)
      }
    }
    catch {
      initializeError(fn)
    }
  }

  function dispose() {
    retryCount.value = 0
    disposables.value.forEach(d => d.dispose())
    disposables.value = []
  }

  return {
    dispose,
    initialize,
  }
})
