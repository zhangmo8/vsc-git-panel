import type * as vscode from 'vscode'
import { Uri, commands } from 'vscode'

import { DiffProvider } from './diff/DiffProvider'

import type { GitService } from '@/git'
import { StorageService } from '@/storage'
import { CHANNEL, WEBVIEW_CHANNEL } from '@/constant'

import type { Commit } from '@/git/types'

export class GitPanelViewProvider implements vscode.WebviewViewProvider {
  private gitService: GitService
  private storageService: StorageService
  private gitChangesProvider: DiffProvider
  public static readonly viewType = 'git-panel.history'
  private _commits: Commit[] = []
  private _view?: vscode.WebviewView

  constructor(
    private readonly _extensionUri: Uri,
    gitService: GitService,
  ) {
    this.gitService = gitService
    this.storageService = StorageService.getInstance()
    this.gitChangesProvider = DiffProvider.getInstance()
    this._commits = this.storageService.getCommits()
  }

  public async refreshHistory(forceRefresh: boolean = false) {
    if (!this._view)
      return

    try {
      if (this._commits.length === 0 || forceRefresh) {
        const history = await this.gitService.getHistory()

        this._commits = history.all.map(commit => ({
          ...commit,
          authorName: commit.author_name,
          authorEmail: commit.author_email,
          body: commit.body || '',
        }))

        this.storageService.saveCommits(this._commits)
      }

      this._view.webview.postMessage({
        command: CHANNEL.HISTORY,
        commits: this._commits,
      })
    }
    catch (error) {
      this._view.webview.postMessage({
        command: 'Failed to get git history',
        message: `${error}`,
      })
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
  ) {
    this._view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(this._extensionUri, '../'),
        Uri.joinPath(this._extensionUri),
      ],
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case WEBVIEW_CHANNEL.GET_HISTORY:
          await this.refreshHistory(message.forceRefresh)
          break

        case WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS:
          try {
            this.gitChangesProvider.refresh(message.commitHash)
            await commands.executeCommand('git.showCommitDetails', message.commitHash)
          }
          catch (error) {
            webviewView.webview.postMessage({
              command: 'Failed to show commit details',
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
    // const scriptUri = process.env.NODE_ENV === 'development'
    //   ? 'http://localhost:5173/src/views/history/index.ts'
    //   : webview.asWebviewUri(
    //     Uri.joinPath(this._extensionUri, 'views.es.js'),
    //   )

    const scriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, 'views.es.js'),
    )

    const styleUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, 'views.css'),
    )

    const nonce = getNonce()

    return `<!doctype html>
            <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Git Panel</title>
                <link rel="stylesheet" type="text/css" href="${styleUri}">
                <style>
                  body {
                    margin: 0;
                    padding: 0;
                  }
                  
                  * {
                    box-sizing: border-box;
                    -moz-box-sizing: border-box;
                    -webkit-box-sizing: border-box;
                  }
                </style>
              </head>
              <body>
                <div id="app"></div>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
              </body>
            </html>`
  }
}

function getNonce() {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  return text
}
