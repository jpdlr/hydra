#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const distDir = join(process.cwd(), 'dist')
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
const expectedVersion = String(pkg.version ?? '').trim()

if (!expectedVersion) {
  console.error('Artifact validation failed: package.json version is empty.')
  process.exit(1)
}

if (!existsSync(distDir)) {
  console.error(`Artifact validation failed: dist directory not found (${distDir}).`)
  process.exit(1)
}

const files = readdirSync(distDir)
const exeFiles = files.filter((file) => file.endsWith('.exe'))
const blockmapFiles = files.filter((file) => file.endsWith('.blockmap'))
const latestYmlPath = join(distDir, 'latest.yml')

if (exeFiles.length === 0) {
  console.error('Artifact validation failed: no Windows installer (*.exe) found in dist/.')
  process.exit(1)
}

if (blockmapFiles.length === 0) {
  console.error('Artifact validation failed: no blockmap (*.blockmap) found in dist/.')
  process.exit(1)
}

if (!existsSync(latestYmlPath)) {
  console.error('Artifact validation failed: dist/latest.yml is missing.')
  process.exit(1)
}

const latestYml = readFileSync(latestYmlPath, 'utf8')
const versionMatch = latestYml.match(/^version:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)
const pathMatch = latestYml.match(/^path:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)
const shaMatch = latestYml.match(/^sha512:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)

if (!versionMatch) {
  console.error('Artifact validation failed: latest.yml missing "version" field.')
  process.exit(1)
}

if (versionMatch[1] !== expectedVersion) {
  console.error(
    `Artifact validation failed: latest.yml version ${versionMatch[1]} does not match package.json ${expectedVersion}.`
  )
  process.exit(1)
}

if (!pathMatch || !pathMatch[1]) {
  console.error('Artifact validation failed: latest.yml missing "path" field.')
  process.exit(1)
}

if (!shaMatch || !shaMatch[1]) {
  console.error('Artifact validation failed: latest.yml missing "sha512" field.')
  process.exit(1)
}

if (!exeFiles.includes(pathMatch[1])) {
  console.error(
    `Artifact validation failed: latest.yml path "${pathMatch[1]}" does not match any .exe in dist/.`
  )
  process.exit(1)
}

console.log(
  `[ok] Windows updater artifacts validated (${exeFiles.length} exe, ${blockmapFiles.length} blockmap, latest.yml version ${expectedVersion}).`
)
