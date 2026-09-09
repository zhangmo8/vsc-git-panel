import { describe, expect, it } from 'vitest'
import { getMainWorktreeBranch, normalizeWorktreePath, parseWorktreeList, shortenBranch } from '../src/git/worktreeUtils'

describe('normalizeWorktreePath', () => {
  it('normalizes separators and trailing slash', () => {
    expect(normalizeWorktreePath('/a/b/c/')).toBe('/a/b/c')
    expect(normalizeWorktreePath('C:\\Users\\x\\repo')).toBe('c:/Users/x/repo')
    expect(normalizeWorktreePath('/')).toBe('/')
    expect(normalizeWorktreePath('')).toBe('')
  })
})

describe('shortenBranch', () => {
  it('strips ref prefixes', () => {
    expect(shortenBranch('refs/heads/main')).toBe('main')
    expect(shortenBranch('refs/heads/feature/x')).toBe('feature/x')
    expect(shortenBranch('refs/remotes/origin/main')).toBe('origin/main')
    expect(shortenBranch('main')).toBe('main')
  })
})

describe('parseWorktreeList', () => {
  it('parses main and linked worktrees', () => {
    const raw = [
      'worktree /home/u/repo',
      'HEAD 1234567890abcdef1234567890abcdef12345678',
      'branch refs/heads/main',
      '',
      'worktree /home/u/repo-feature',
      'HEAD abcdef1234567890abcdef1234567890abcdef12',
      'branch refs/heads/feature/login',
      '',
    ].join('\n')

    const worktrees = parseWorktreeList(raw, '/home/u/repo')
    expect(worktrees).toHaveLength(2)

    const [main, feature] = worktrees
    expect(main.isMain).toBe(true)
    expect(main.isCurrent).toBe(true)
    expect(main.branch).toBe('main')
    expect(main.shortHead).toBe('1234567')
    expect(main.detached).toBe(false)

    expect(feature.isMain).toBe(false)
    expect(feature.isCurrent).toBe(false)
    expect(feature.branch).toBe('feature/login')
  })

  it('handles detached, bare, locked and prunable states', () => {
    const raw = [
      'worktree /home/u/repo',
      'HEAD 1111111111111111111111111111111111111111',
      'bare',
      '',
      'worktree /home/u/detached',
      'HEAD 2222222222222222222222222222222222222222',
      'detached',
      'locked broken drive',
      '',
      'worktree /home/u/gone',
      'HEAD 3333333333333333333333333333333333333333',
      'branch refs/heads/gone',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n')

    const worktrees = parseWorktreeList(raw, '/home/u/repo')
    expect(worktrees).toHaveLength(3)

    expect(worktrees[0].bare).toBe(true)

    expect(worktrees[1].detached).toBe(true)
    expect(worktrees[1].branch).toBeUndefined()
    expect(worktrees[1].locked).toBe(true)
    expect(worktrees[1].lockReason).toBe('broken drive')

    expect(worktrees[2].prunable).toBe(true)
    expect(worktrees[2].prunableReason).toContain('non-existent')
  })

  it('handles locked without a reason', () => {
    const raw = [
      'worktree /home/u/repo',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree /home/u/wt',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/wt',
      'locked',
      '',
    ].join('\n')

    const worktrees = parseWorktreeList(raw)
    expect(worktrees[1].locked).toBe(true)
    expect(worktrees[1].lockReason).toBeUndefined()
  })

  it('matches current worktree across path separators', () => {
    const raw = [
      'worktree C:/Users/x/repo',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
    ].join('\n')

    const worktrees = parseWorktreeList(raw, 'C:\\Users\\x\\repo')
    expect(worktrees[0].isCurrent).toBe(true)
  })

  it('returns empty for empty input', () => {
    expect(parseWorktreeList('')).toEqual([])
  })

  it('parses NUL-delimited (-z) output', () => {
    // In `-z` form each attribute is NUL-terminated and records are separated
    // by an extra NUL.
    const raw = [
      'worktree /home/u/repo',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree /home/u/wt',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/wt',
      '',
    ].join('\0')

    const worktrees = parseWorktreeList(raw, '/home/u/repo')
    expect(worktrees).toHaveLength(2)
    expect(worktrees[0].isMain).toBe(true)
    expect(worktrees[0].branch).toBe('main')
    expect(worktrees[1].branch).toBe('wt')
  })

  it('preserves paths containing spaces and trailing whitespace', () => {
    const raw = [
      'worktree /home/u/my repo ',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
    ].join('\0')

    const worktrees = parseWorktreeList(raw)
    // Exact path preserved (no trim), so a trailing space survives.
    expect(worktrees[0].path).toBe('/home/u/my repo ')
  })

  it('parses a path containing a newline in -z form', () => {
    const raw = [
      'worktree /home/u/line\nbreak',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
    ].join('\0')

    const worktrees = parseWorktreeList(raw)
    expect(worktrees).toHaveLength(1)
    expect(worktrees[0].path).toBe('/home/u/line\nbreak')
  })
})

describe('getMainWorktreeBranch', () => {
  it('returns the main worktree branch', () => {
    const raw = [
      'worktree /home/u/repo',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/develop',
      '',
      'worktree /home/u/wt',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/wt',
      '',
    ].join('\n')

    expect(getMainWorktreeBranch(parseWorktreeList(raw))).toBe('develop')
  })
})
