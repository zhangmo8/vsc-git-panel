import * as vscode from 'vscode'

export class GitChangeMonitor {
  private disposables: vscode.Disposable[] = []
  private fileWatcher: vscode.FileSystemWatcher | undefined
  private retryCount = 0

  constructor(private readonly onGitChange: () => void) {
    this.initialize()
    this.setupFileSystemWatcher()
  }

  private setupFileSystemWatcher() {
    try {
      this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/.git/index')

      this.disposables.push(
        this.fileWatcher.onDidChange(() => {
          this.onGitChange()
        }),
        this.fileWatcher.onDidCreate(() => {
          this.onGitChange()
        }),
        this.fileWatcher.onDidDelete(() => {
          this.onGitChange()
        }),
      )
    }
    catch (error) {
      console.error('Error setting up file watcher:', error)
    }
  }

  async getGitExtension() {
    try {
      const extension = vscode.extensions.getExtension(
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

  private async initialize() {
    try {
      const git = await this.getGitExtension()

      if (!git && this.retryCount === 0) {
        console.error('Failed to get Git extension API, will retry after 5 seconds...')
        setTimeout(() => this.initialize(), 5000)
        return
      }

      if (!git.repositories || git.repositories.length === 0) {
        this.disposables.push(git.onDidOpenRepository((repo: any) => {
          this.setupRepository(repo)
        }))
      }
      else {
        git.repositories.forEach((repo: any) => this.setupRepository(repo))
      }
    }
    catch (error) {
      console.error('Error in initialize:', error)
      // 如果出错，5秒后重试
      setTimeout(() => this.initialize(), 5000)
    }
  }

  private setupRepository(repo: any) {
    try {
      this.disposables.push(repo.state.onDidChange(() => {
        this.onGitChange()
      }))
    }
    catch (error) {
      console.error('Error setting up repository:', error)
    }
  }

  dispose() {
    this.disposables.forEach(d => d.dispose())
    this.disposables = []
    if (this.fileWatcher) {
      this.fileWatcher.dispose()
      this.fileWatcher = undefined
    }
  }
}
