#!/usr/bin/env node

import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const args = process.argv.slice(2)
const command = args[0]
const { positional, options } = parseArgs(args.slice(1))
const repo = options.repo ?? process.env.GITHUB_REPOSITORY

if (!command || !['print', 'upsert', 'sync-all'].includes(command)) {
  usage()
  process.exit(1)
}

if (command === 'sync-all' && !repo) {
  fail('sync-all requires --repo or GITHUB_REPOSITORY.')
}

if (command === 'sync-all') {
  const limit = Number(options.limit ?? 200)
  syncAllReleaseNotes(repo, Number.isFinite(limit) && limit > 0 ? limit : 200)
  process.exit(0)
}

const tag = positional[0]
if (!tag) {
  usage()
  process.exit(1)
}

if (command === 'print') {
  const notes = buildReleaseNotes(tag, repo)
  process.stdout.write(`${notes}\n`)
  process.exit(0)
}

if (!repo) {
  fail('upsert requires --repo or GITHUB_REPOSITORY.')
}

upsertReleaseNotes(tag, repo)
process.exit(0)

function usage() {
  console.error('Usage:')
  console.error('  node scripts/release-notes.mjs print <tag> [--repo owner/name]')
  console.error('  node scripts/release-notes.mjs upsert <tag> [--repo owner/name]')
  console.error('  node scripts/release-notes.mjs sync-all [--repo owner/name] [--limit 200]')
}

function parseArgs(values) {
  const positional = []
  const options = {}
  for (let i = 0; i < values.length; i += 1) {
    const part = values[i]
    if (!part.startsWith('--')) {
      positional.push(part)
      continue
    }
    const key = part.slice(2)
    const next = values[i + 1]
    if (!next || next.startsWith('--')) {
      options[key] = 'true'
      continue
    }
    options[key] = next
    i += 1
  }
  return { positional, options }
}

function upsertReleaseNotes(tagName, targetRepo) {
  const notes = buildReleaseNotes(tagName, targetRepo)
  const notesFile = writeTempNotes(notes)

  try {
    const existingRaw = run('gh', [
      'release',
      'view',
      tagName,
      '--repo',
      targetRepo,
      '--json',
      'tagName,isDraft,isPrerelease,url'
    ], { allowFailure: true })

    if (!existingRaw) {
      run('gh', [
        'release',
        'create',
        tagName,
        '--repo',
        targetRepo,
        '--verify-tag',
        '--title',
        tagName,
        '--notes-file',
        notesFile
      ])
      console.log(`[ok] release-notes: created ${tagName}`)
      return
    }

    const existing = JSON.parse(existingRaw)
    if (existing.isPrerelease) {
      fail(`release-notes: ${tagName} is a prerelease; refusing to overwrite notes.`)
    }

    run('gh', [
      'release',
      'edit',
      tagName,
      '--repo',
      targetRepo,
      '--title',
      tagName,
      '--notes-file',
      notesFile,
      '--draft=false'
    ])
    console.log(`[ok] release-notes: updated ${tagName}`)
  } finally {
    rmTempNotes(notesFile)
  }
}

function syncAllReleaseNotes(targetRepo, limit) {
  const raw = run('gh', [
    'release',
    'list',
    '--repo',
    targetRepo,
    '--exclude-drafts',
    '--exclude-pre-releases',
    '--limit',
    String(limit),
    '--json',
    'tagName'
  ])

  const releases = JSON.parse(raw)
  const tags = releases
    .map((entry) => String(entry.tagName ?? '').trim())
    .filter((tag) => parseSemverTag(tag) !== null)
    .sort((a, b) => compareSemver(parseSemverTag(a), parseSemverTag(b)))

  if (tags.length === 0) {
    console.log('[ok] release-notes: no semver releases to update.')
    return
  }

  for (const tag of tags) {
    upsertReleaseNotes(tag, targetRepo)
  }
}

function buildReleaseNotes(tagName, targetRepo) {
  const semver = parseSemverTag(tagName)
  if (!semver) {
    fail(`release-notes: tag "${tagName}" is not in vX.Y.Z format.`)
  }

  const allTags = listSemverTags()
  const tagPresent = allTags.includes(tagName)
  const priorTag = tagPresent
    ? findPreviousTag(tagName, allTags)
    : findPreviousAvailableTag(tagName, allTags)
  const range = tagPresent ? (priorTag ? `${priorTag}..${tagName}` : tagName) : null
  const commits = range ? listCommits(range) : []
  const categorized = categorizeCommits(commits)
  const compareUrl = tagPresent && priorTag && targetRepo
    ? `https://github.com/${targetRepo}/compare/${priorTag}...${tagName}`
    : null

  const lines = []
  lines.push(`Hydra ${tagName} release.`)
  if (!tagPresent) {
    lines.push('Historical release metadata found, but this git tag is missing locally; commit diff details are unavailable.')
  } else if (priorTag) {
    lines.push(`Changes since ${priorTag}.`)
  } else {
    lines.push('Initial tracked release notes for this repository.')
  }
  lines.push('')

  if (compareUrl) {
    lines.push(`Compare: ${compareUrl}`)
    lines.push('')
  }

  appendSection(lines, 'Features', categorized.features)
  appendSection(lines, 'Fixes', categorized.fixes)
  appendSection(lines, 'Improvements', categorized.improvements)
  appendSection(lines, 'Tests', categorized.tests)
  appendSection(lines, 'Maintenance', categorized.maintenance)
  appendSection(lines, 'Other Changes', categorized.other)

  if (commits.length === 0) {
    lines.push('## Changes')
    lines.push('- No commit metadata available for this release tag.')
    lines.push('')
  }

  lines.push('## Build Artifacts')
  lines.push('- Windows installer (`hydra-<version>-x64.exe`)')
  lines.push('- Differential update map (`*.blockmap`)')
  lines.push('- Updater metadata (`latest.yml`)')
  lines.push('')

  return lines.join('\n')
}

function appendSection(lines, title, entries) {
  if (entries.length === 0) return
  lines.push(`## ${title}`)
  for (const entry of entries) {
    lines.push(`- ${entry}`)
  }
  lines.push('')
}

function listSemverTags() {
  const raw = run('git', ['tag', '--list', 'v*'])
  return raw
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter((tag) => parseSemverTag(tag) !== null)
    .sort((a, b) => compareSemver(parseSemverTag(a), parseSemverTag(b)))
}

function findPreviousTag(currentTag, sortedTags) {
  let previous = null
  for (const tag of sortedTags) {
    if (tag === currentTag) return previous
    previous = tag
  }
  fail(`release-notes: tag "${currentTag}" was not found in local git tags.`)
}

function findPreviousAvailableTag(currentTag, sortedTags) {
  const current = parseSemverTag(currentTag)
  if (!current) return null
  let previous = null
  for (const tag of sortedTags) {
    const semver = parseSemverTag(tag)
    if (!semver) continue
    if (compareSemver(semver, current) < 0) {
      previous = tag
      continue
    }
    break
  }
  return previous
}

function listCommits(range) {
  const raw = run('git', ['log', '--reverse', '--no-merges', '--format=%h%x09%s', range], { allowFailure: true }) ?? ''
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split('\t')
      return { hash, subject: rest.join('\t').trim() }
    })
}

function categorizeCommits(commits) {
  const groups = {
    features: [],
    fixes: [],
    improvements: [],
    tests: [],
    maintenance: [],
    other: []
  }

  for (const commit of commits) {
    const parsed = parseConventionalSubject(commit.subject)
    const suffix = commit.hash ? ` (${commit.hash})` : ''

    if (!parsed) {
      groups.other.push(`${commit.subject}${suffix}`)
      continue
    }

    const text = `${parsed.scope ? `${parsed.scope}: ` : ''}${parsed.description}${suffix}`
    switch (parsed.type) {
      case 'feat':
        groups.features.push(text)
        break
      case 'fix':
        groups.fixes.push(text)
        break
      case 'perf':
      case 'refactor':
        groups.improvements.push(text)
        break
      case 'test':
        groups.tests.push(text)
        break
      case 'build':
      case 'chore':
      case 'ci':
      case 'docs':
        groups.maintenance.push(text)
        break
      default:
        groups.other.push(`${commit.subject}${suffix}`)
    }
  }

  return groups
}

function parseConventionalSubject(subject) {
  const match = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject)
  if (!match) return null
  return {
    type: match[1],
    scope: match[2] ?? null,
    breaking: Boolean(match[3]),
    description: match[4]
  }
}

function parseSemverTag(tagName) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tagName)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(a, b) {
  if (!a || !b) return 0
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

function writeTempNotes(content) {
  const tempDir = mkdtempSync(join(tmpdir(), 'hydra-release-notes-'))
  const filePath = join(tempDir, 'notes.md')
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

function rmTempNotes(filePath) {
  try {
    rmSync(dirname(filePath), { recursive: true, force: true })
  } catch {
    // best effort cleanup
  }
}

function run(command, commandArgs, options = {}) {
  try {
    const output = execFileSync(command, commandArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return output.trim()
  } catch (error) {
    if (options.allowFailure) return null
    const stderr = error instanceof Error && 'stderr' in error
      ? String(error.stderr ?? '').trim()
      : ''
    const stdout = error instanceof Error && 'stdout' in error
      ? String(error.stdout ?? '').trim()
      : ''
    const message = [stderr, stdout].filter(Boolean).join('\n') || String(error)
    fail(`${command} ${commandArgs.join(' ')} failed:\n${message}`)
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
