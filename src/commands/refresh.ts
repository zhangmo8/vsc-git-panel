import type { GitPanelViewProvider } from '@/views/webview'

export default function refreshCommand(provider: GitPanelViewProvider) {
  return () => {
    provider.refreshHistory(true)
  }
}
