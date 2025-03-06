import { useGitPanelView } from '@/views/webview'

export default function clearCommand() {
  useGitPanelView().clearSelection()
}
