import { execFile } from 'child_process'
import { access, readFile } from 'fs/promises'
import { join } from 'path'
import type { GitStatus, GitCommit, GitBranch, GitFileContents, GitPrDiff, GitPrMetadata, GitDiffStats } from '@shared/types'

function run(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 1024 * 1024, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message))
      } else {
        resolve(stdout)
      }
    })
  })
}

function runGh(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { cwd, maxBuffer: 5 * 1024 * 1024, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message))
      } else {
        resolve(stdout)
      }
    })
  })
}

async function assertGitRepo(projectDir: string): Promise<void> {
  await access(join(projectDir, '.git'))
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', css: 'css', scss: 'scss', html: 'html', md: 'markdown',
  py: 'python', rs: 'rust', go: 'go', yaml: 'yaml', yml: 'yaml',
  sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', xml: 'xml',
  svg: 'xml', toml: 'ini', rb: 'ruby', java: 'java', kt: 'kotlin',
  swift: 'swift', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'plaintext'
}

function parsePrNumber(identifier: string): number {
  const urlMatch = identifier.match(/\/pull\/(\d+)/)
  if (urlMatch) return parseInt(urlMatch[1])
  const cleaned = identifier.replace(/^#/, '').trim()
  const num = parseInt(cleaned)
  if (isNaN(num)) throw new Error(`Invalid PR identifier: ${identifier}`)
  return num
}

function extractFileDiff(fullDiff: string, filePath: string): string {
  const escaped = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`diff --git a/${escaped} b/`)
  const startIdx = fullDiff.search(regex)
  if (startIdx === -1) return ''
  const nextDiff = fullDiff.indexOf('\ndiff --git ', startIdx + 1)
  return nextDiff === -1 ? fullDiff.slice(startIdx) : fullDiff.slice(startIdx, nextDiff)
}

export class GitService {
  // ── Existing methods ────────────────────────────────────────────────────

  async getStatus(projectDir: string): Promise<GitStatus> {
    await assertGitRepo(projectDir)

    const branchOut = await run(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const branch = branchOut.trim()

    let ahead = 0
    let behind = 0
    try {
      const abOut = await run(projectDir, ['rev-list', '--left-right', '--count', `HEAD...@{upstream}`])
      const parts = abOut.trim().split(/\s+/)
      ahead = parseInt(parts[0]) || 0
      behind = parseInt(parts[1]) || 0
    } catch {
      // No upstream configured
    }

    const porcelain = await run(projectDir, ['status', '--porcelain=v1'])
    const modified: string[] = []
    const staged: string[] = []
    const untracked: string[] = []

    for (const line of porcelain.split('\n')) {
      if (!line) continue
      const x = line[0]
      const y = line[1]
      const file = line.slice(3)

      if (x === '?' && y === '?') {
        untracked.push(file)
      } else {
        if (x !== ' ' && x !== '?') staged.push(file)
        if (y !== ' ' && y !== '?') modified.push(file)
      }
    }

    return { branch, ahead, behind, modified, staged, untracked }
  }

  async getLog(projectDir: string, limit = 20): Promise<GitCommit[]> {
    await assertGitRepo(projectDir)
    const out = await run(projectDir, [
      'log',
      `--max-count=${limit}`,
      '--format=%H%x00%s%x00%an%x00%aI'
    ])

    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, message, author, date] = line.split('\0')
        return { hash: hash.slice(0, 8), message, author, date }
      })
  }

  async getDiffStats(projectDir: string): Promise<GitDiffStats> {
    await assertGitRepo(projectDir)
    let additions = 0
    let deletions = 0
    const changedFiles = new Set<string>()

    try {
      const out = await run(projectDir, ['diff', 'HEAD', '--numstat'])
      for (const line of out.split('\n')) {
        if (!line.trim()) continue
        const [addStr, delStr, ...pathParts] = line.split('\t')
        const add = parseInt(addStr, 10)
        const del = parseInt(delStr, 10)
        if (!Number.isNaN(add)) additions += add
        if (!Number.isNaN(del)) deletions += del
        if (pathParts.length > 0) changedFiles.add(pathParts.join('\t'))
      }
    } catch {
      // Fresh repo with no HEAD — fall back to diff against empty tree
      try {
        const out = await run(projectDir, ['diff', '--numstat'])
        for (const line of out.split('\n')) {
          if (!line.trim()) continue
          const [addStr, delStr, ...pathParts] = line.split('\t')
          const add = parseInt(addStr, 10)
          const del = parseInt(delStr, 10)
          if (!Number.isNaN(add)) additions += add
          if (!Number.isNaN(del)) deletions += del
          if (pathParts.length > 0) changedFiles.add(pathParts.join('\t'))
        }
      } catch {
        // ignore
      }
    }

    // Include untracked files as pure additions (line count each)
    try {
      const untrackedOut = await run(projectDir, ['ls-files', '--others', '--exclude-standard', '-z'])
      const files = untrackedOut.split('\0').filter(Boolean)
      for (const file of files) {
        changedFiles.add(file)
        try {
          const content = await readFile(join(projectDir, file), 'utf8')
          if (content.length === 0) continue
          const lines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
          additions += Math.max(lines, 1)
        } catch {
          // Binary/unreadable — skip
        }
      }
    } catch {
      // ignore
    }

    return { additions, deletions, files: changedFiles.size }
  }

  async getDiff(projectDir: string, filePath?: string): Promise<string> {
    await assertGitRepo(projectDir)
    const args = ['diff']
    if (filePath) args.push('--', filePath)
    const out = await run(projectDir, args)
    return out.slice(0, 100_000)
  }

  async stageAndCommit(projectDir: string, message: string, files?: string[]): Promise<string> {
    await assertGitRepo(projectDir)
    if (files && files.length > 0) {
      await run(projectDir, ['add', '--', ...files])
    } else {
      await run(projectDir, ['add', '-A'])
    }
    await run(projectDir, ['commit', '-m', message])
    const out = await run(projectDir, ['rev-parse', '--short', 'HEAD'])
    return out.trim()
  }

  async push(projectDir: string): Promise<void> {
    await assertGitRepo(projectDir)
    await run(projectDir, ['push'])
  }

  // ── Branch operations ───────────────────────────────────────────────────

  async listBranches(projectDir: string): Promise<GitBranch[]> {
    await assertGitRepo(projectDir)
    const out = await run(projectDir, [
      'branch', '-vv', '--format',
      '%(HEAD)%00%(refname:short)%00%(upstream:short)%00%(upstream:track,nobracket)'
    ])
    const branches: GitBranch[] = []
    for (const line of out.trim().split('\n')) {
      if (!line) continue
      const [head, name, upstream, track] = line.split('\0')
      let aheadOfUpstream = 0
      let behindUpstream = 0
      if (track) {
        const aheadMatch = track.match(/ahead (\d+)/)
        const behindMatch = track.match(/behind (\d+)/)
        if (aheadMatch) aheadOfUpstream = parseInt(aheadMatch[1])
        if (behindMatch) behindUpstream = parseInt(behindMatch[1])
      }
      branches.push({
        name,
        isCurrent: head === '*',
        isRemote: false,
        upstream: upstream || null,
        aheadOfUpstream,
        behindUpstream,
      })
    }
    return branches
  }

  async checkout(projectDir: string, branchName: string): Promise<void> {
    await assertGitRepo(projectDir)
    await run(projectDir, ['checkout', branchName])
  }

  async createBranch(projectDir: string, branchName: string, startPoint?: string): Promise<void> {
    await assertGitRepo(projectDir)
    const args = ['checkout', '-b', branchName]
    if (startPoint) args.push(startPoint)
    await run(projectDir, args)
  }

  // ── File contents for diff viewer ───────────────────────────────────────

  async getFileContents(projectDir: string, filePath: string): Promise<GitFileContents> {
    await assertGitRepo(projectDir)
    let original = ''
    try {
      original = await run(projectDir, ['show', `HEAD:${filePath}`])
    } catch {
      // New file — no HEAD version
    }

    let modified = ''
    try {
      modified = await readFile(join(projectDir, filePath), 'utf-8')
    } catch {
      // Deleted file
    }

    return { original, modified, language: detectLanguage(filePath) }
  }

  // ── PR review (via gh CLI) ──────────────────────────────────────────────

  async fetchPr(projectDir: string, prIdentifier: string): Promise<GitPrDiff> {
    await assertGitRepo(projectDir)
    const prNumber = parsePrNumber(prIdentifier)

    const metaJson = await runGh(projectDir, [
      'pr', 'view', String(prNumber), '--json',
      'number,title,author,state,baseRefName,headRefName,body,url,additions,deletions,changedFiles,createdAt,updatedAt'
    ])
    const raw = JSON.parse(metaJson)
    const metadata: GitPrMetadata = {
      number: raw.number,
      title: raw.title,
      author: raw.author?.login ?? raw.author?.name ?? 'unknown',
      state: raw.state,
      baseRef: raw.baseRefName,
      headRef: raw.headRefName,
      body: raw.body ?? '',
      url: raw.url,
      additions: raw.additions,
      deletions: raw.deletions,
      changedFiles: raw.changedFiles,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }

    const namesOutput = await runGh(projectDir, ['pr', 'diff', String(prNumber), '--name-only'])
    const fullDiff = await runGh(projectDir, ['pr', 'diff', String(prNumber)])

    const fileNames = namesOutput.trim().split('\n').filter(Boolean)
    const files = fileNames.map((path) => {
      const patch = extractFileDiff(fullDiff, path)
      const additions = (patch.match(/^\+[^+]/gm) || []).length
      const deletions = (patch.match(/^-[^-]/gm) || []).length
      let status = 'modified'
      if (patch.includes('new file mode')) status = 'added'
      else if (patch.includes('deleted file mode')) status = 'removed'
      else if (patch.includes('rename from')) status = 'renamed'
      return { path, status, additions, deletions, patch }
    })

    return { metadata, files }
  }

  async getPrFileDiff(projectDir: string, prNumber: number, filePath: string): Promise<string> {
    await assertGitRepo(projectDir)
    const fullDiff = await runGh(projectDir, ['pr', 'diff', String(prNumber)])
    return extractFileDiff(fullDiff, filePath)
  }

  // ── Worktrees ──────────────────────────────────────────────────────────

  /**
   * Create a new git worktree with a new branch based on the current HEAD.
   * Returns { worktreePath, branch }.
   */
  async createWorktree(
    projectDir: string,
    branchName: string
  ): Promise<{ worktreePath: string; branch: string }> {
    await assertGitRepo(projectDir)

    // Get repo root (works from main repo or any worktree)
    const rootOut = await run(projectDir, ['rev-parse', '--show-toplevel'])
    const repoRoot = rootOut.trim()

    // Place worktrees in a sibling `.worktrees/` directory next to repo root
    const worktreesDir = join(repoRoot, '.worktrees')
    const worktreePath = join(worktreesDir, branchName.replace(/\//g, '-'))

    // Create worktree with new branch from current HEAD
    await run(projectDir, ['worktree', 'add', '-b', branchName, worktreePath])

    return { worktreePath, branch: branchName }
  }

  /**
   * Remove a git worktree and optionally delete its branch.
   */
  async removeWorktree(
    projectDir: string,
    worktreePath: string,
    deleteBranch?: string
  ): Promise<void> {
    await assertGitRepo(projectDir)
    await run(projectDir, ['worktree', 'remove', worktreePath, '--force'])
    if (deleteBranch) {
      try {
        await run(projectDir, ['branch', '-D', deleteBranch])
      } catch {
        // Branch may already be deleted or merged
      }
    }
  }
}
