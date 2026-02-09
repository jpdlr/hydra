#!/usr/bin/env node

import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'

const tag = process.argv[2]
const repo = process.env.GITHUB_REPOSITORY

if (!tag || !tag.trim()) {
  console.error('Usage: node scripts/release-guard.mjs <tag>')
  process.exit(1)
}

if (!repo || !repo.trim()) {
  console.error('Release guard failed: GITHUB_REPOSITORY is required.')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = String(pkg.version ?? '').trim()
const current = parseSemver(version)

if (!current) {
  console.error(`Release guard failed: package.json version "${version}" is not strict semver (x.y.z).`)
  process.exit(1)
}

if (!new RegExp(`^v${escapeRegex(version)}(?:$|[-+])`).test(tag)) {
  console.error(
    `Release guard failed: tag "${tag}" must start with "v${version}" so updater metadata matches the release.`
  )
  process.exit(1)
}

const releases = listPublishedReleases(repo)
const prior = releases
  .filter((entry) => entry.tagName !== tag)
  .map((entry) => ({ tagName: entry.tagName, semver: parseTagSemver(entry.tagName) }))
  .filter((entry) => entry.semver !== null)

if (prior.length === 0) {
  console.log(`[ok] release-guard: first published release for semver tracking (${version}).`)
  process.exit(0)
}

const latestPrior = prior.reduce((max, next) => {
  if (!max) return next
  return compareSemver(next.semver, max.semver) > 0 ? next : max
}, null)

if (!latestPrior) {
  console.log('[ok] release-guard: no prior semver releases found.')
  process.exit(0)
}

const cmp = compareSemver(current, latestPrior.semver)
if (cmp <= 0) {
  console.error(
    `Release guard failed: package version ${version} must be greater than previous published ${formatSemver(latestPrior.semver)} (${latestPrior.tagName}).`
  )
  process.exit(1)
}

console.log(
  `[ok] release-guard: ${version} is newer than previous published ${formatSemver(latestPrior.semver)}.`
)

function listPublishedReleases(targetRepo) {
  try {
    const raw = execFileSync(
      'gh',
      [
        'release',
        'list',
        '--repo',
        targetRepo,
        '--exclude-drafts',
        '--exclude-pre-releases',
        '--limit',
        '200',
        '--json',
        'tagName'
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim()
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Release guard failed while listing releases: ${message}`)
    process.exit(1)
  }
}

function parseTagSemver(tagName) {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(tagName)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function parseSemver(raw) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

function formatSemver(v) {
  return `${v[0]}.${v[1]}.${v[2]}`
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
