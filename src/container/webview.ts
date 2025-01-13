import path from 'node:path'
import type * as vscode from 'vscode'
import { Uri } from 'vscode'

export class GitPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'git-panel.history'

  constructor(
    private readonly _extensionUri: vscode.Uri,
  ) { }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(this._extensionUri),
      ],
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)
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
