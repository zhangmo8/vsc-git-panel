import type * as vscode from 'vscode'
import { Uri, commands } from 'vscode'

import { DiffViewService } from './diff/DiffViewService'

import type { GitService } from '@/git'
import { StorageService } from '@/storage'
import { CHANNEL, WEBVIEW_CHANNEL } from '@/channel/constant'

import type { Commit } from '@/git/types'

export class GitPanelViewProvider implements vscode.WebviewViewProvider {
  private gitService: GitService
  private storageService: StorageService
  private diffViewService: DiffViewService
  public static readonly viewType = 'git-panel.history'
  private _view?: vscode.WebviewView

  constructor(
    private readonly _extensionUri: Uri,
    context: vscode.ExtensionContext,
    gitService: GitService,
  ) {
    this.gitService = gitService
    this.storageService = new StorageService(context)
    this.diffViewService = DiffViewService.getInstance()
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
          try {
            let commits = this.storageService.getCommits()
            if (commits.length === 0 || message.forceRefresh) {
              const history = await this.gitService.getHistory()

              commits = history.all.map(commit => ({
                ...commit,
                authorName: commit.author_name,
                authorEmail: commit.author_email,
              }) as Commit)

              this.storageService.saveCommits(commits)
            }

            webviewView.webview.postMessage({
              command: CHANNEL.HISTORY,
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

        case WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS:
          try {
            this.diffViewService.showCommitFiles(message.commit.hash)
            await commands.executeCommand('git.showCommitDetails', message.commit.hash)
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

  private _getHtmlForWebview(_webview: vscode.Webview) {
    // const scriptUri = process.env.NODE_ENV === 'development'
    //   ? 'http://localhost:5173/src/views/history/index.ts'
    //   : webview.asWebviewUri(
    //     Uri.joinPath(this._extensionUri, 'views.es.js'),
    //   )
    const scriptUri = 'http://localhost:5173/src/views/history/index.ts'

    return `<!doctype html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Git Panel</title>
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
                  <script crossorigin type="module" src="${scriptUri}"></script>
                </body>
              </html>
              `
  }
}
