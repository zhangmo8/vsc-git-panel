export function normalizeRef(ref: string): string {
  if (!ref)
    return ''

  let cleaned = ref.trim()
  cleaned = cleaned.replace(/^\(+/, '').replace(/\)+$/, '').trim()
  cleaned = cleaned.replace(/^,+/, '').replace(/,+$/, '').trim()

  if (cleaned.startsWith('HEAD -> '))
    cleaned = cleaned.replace('HEAD -> ', '')

  if (cleaned.startsWith('refs/heads/'))
    cleaned = cleaned.substring('refs/heads/'.length)

  if (cleaned.startsWith('refs/remotes/'))
    cleaned = cleaned.substring('refs/remotes/'.length)

  if (cleaned.startsWith('ref:'))
    cleaned = cleaned.substring('ref:'.length)

  return cleaned.replace(/[()]/g, '').trim()
}

export function isBranchRef(ref: string): boolean {
  return ref.includes('refs/heads/')
    || ref.includes('refs/remotes/')
    || ref.startsWith('HEAD -> ')
    || (!ref.includes('refs/') && !ref.includes('tag:'))
}

export function getBranchRefs(refs?: string): string[] {
  if (!refs)
    return []

  return refs
    .split(',')
    .map(ref => ref.trim())
    .filter(isBranchRef)
    .map(ref => normalizeRef(ref))
    .filter(Boolean)
}

export function getPrimaryBranch(refs?: string, fallback = 'main'): string {
  return getBranchRefs(refs)[0] || fallback
}
