import { useGitPanelView } from '@/views/webview'

export default function refreshCommand() {
  useGitPanelView().forceRefresh()
}
