import { execFile } from 'child_process'
import { access } from 'fs/promises'
import { join } from 'path'
import type { GitStatus, GitCommit } from '@shared/types'

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

async function assertGitRepo(projectDir: string): Promise<void> {
  await access(join(projectDir, '.git'))
}

export class GitService {
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

  async getDiff(projectDir: string, filePath?: string): Promise<string> {
    await assertGitRepo(projectDir)
    const args = ['diff']
    if (filePath) args.push('--', filePath)
    const out = await run(projectDir, args)
    return out.slice(0, 100_000) // Cap output size
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
}
