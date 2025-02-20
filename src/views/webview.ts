import type { Webview, WebviewView, WebviewViewProvider } from 'vscode'
import { ExtensionMode, Uri } from 'vscode'
import { extensionContext as context, executeCommand } from 'reactive-vscode'

import { DiffTreeView } from './diff/DiffTreeView'

import { useGitService } from '@/git'
import { useStorage } from '@/storage'
import { CHANNEL, EXTENSION_SYMBOL, WEBVIEW_CHANNEL } from '@/constant'

import type { Commit } from '@/git'

export class GitPanelViewProvider implements WebviewViewProvider {
  private git = useGitService()
  private storage = useStorage()
  private gitChangesProvider: DiffTreeView
  public static readonly viewType = `${EXTENSION_SYMBOL}.history`
  private _commits: Commit[] = []
  private _view?: WebviewView

  constructor(
    private readonly _extensionUri: Uri,
  ) {
    this.gitChangesProvider = DiffTreeView.getInstance()
    this._commits = this.storage.getCommits()
  }

  public async refreshHistory(forceRefresh: boolean = false) {
    if (!this._view)
      return

    try {
      if (this._commits.length === 0 || forceRefresh) {
        const history = await this.git.getHistory()
        this._commits = Array.from(history.all)

        this.storage.saveCommits(this._commits)
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
    webviewView: WebviewView,
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
          }
          catch (error) {
            webviewView.webview.postMessage({
              command: 'Failed to show commit details',
              message: `${error}`,
            })
          }
          break
        case WEBVIEW_CHANNEL.SHOW_CHANGES_PANEL:
          await executeCommand('git-panel.changes.focus')
          break

        case 'clearHistory':
          this.storage.clearCommits()
          break
      }
    })
  }

  private _getHtmlForWebview(webview: Webview) {
    const isDev = context.value?.extensionMode === ExtensionMode.Development

    const scriptUri = isDev
      ? 'http://localhost:5173/src/views/history/index.ts'
      : webview.asWebviewUri(
        Uri.joinPath(this._extensionUri, 'views.es.js'),
      )

    const styleUri = isDev
      ? null
      : webview.asWebviewUri(
        Uri.joinPath(this._extensionUri, 'views.css'),
      )

    const nonce = getNonce()

    return `<!doctype html>
            <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Git Panel</title>
                ${isDev ? '' : `<link rel="stylesheet" type="text/css" href="${styleUri}">`}
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
