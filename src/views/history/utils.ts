let _vscode: WebviewApi<State>
export function getVscodeApi() {
  if (!_vscode) {
    _vscode = acquireVsCodeApi()
  }
  return _vscode
}
