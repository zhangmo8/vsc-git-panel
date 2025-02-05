import type * as vscode from 'vscode'
import { Uri } from 'vscode'
import type { ListLogLine } from 'simple-git'
import { GitService } from '@/git'
import { StorageService } from '@/storage'

export class GitPanelViewProvider implements vscode.WebviewViewProvider {
  private gitService: GitService
  private storageService: StorageService
  public static readonly viewType = 'git-panel.history'
  private _view?: vscode.WebviewView

  constructor(
    private readonly _extensionUri: Uri,
    context: vscode.ExtensionContext,
  ) {
    this.gitService = new GitService()
    this.storageService = new StorageService(context)
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
  ) {
    this._view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(this._extensionUri),
      ],
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'getHistory':
          try {
            // Try to get commits from storage first
            let commits = this.storageService.getCommits()
            // If no stored commits or force refresh, get from git
            if (commits.length === 0 || message.forceRefresh) {
              const history = await this.gitService.getHistory()

              // 确保只传递可序列化的数据
              commits = history.all.map(commit => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author_name: commit.author_name,
                author_email: commit.author_email,
              }) as ListLogLine)

              // Store the new commits
              this.storageService.saveCommits(commits)
            }

            webviewView.webview.postMessage({
              command: 'history',
              data: commits,
            })
          }
          catch (error) {
            webviewView.webview.postMessage({
              command: 'Failed to get git history',
              message: `${error}`,
            })
          }
          break

        case 'clearHistory':
          this.storageService.clearCommits()
          break
      }
    })
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      Uri.joinPath(
        this._extensionUri,
        'views.es.js',
      ),
    )

    return `<!doctype html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Git Panel</title>
                </head>
                <body>
                  <div id="app"></div>
                  <script crossorigin type="module" src="${scriptUri}"></script>
                </body>
              </html>
              `
  }
}
