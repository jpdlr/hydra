#!/usr/bin/env node

import { execSync } from 'child_process'

const requiredEnv = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'CSC_NAME',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID'
]

const missing = requiredEnv.filter((key) => {
  const value = process.env[key]
  return !value || value.trim().length === 0
})

if (missing.length > 0) {
  console.error('Release preflight failed: missing required secrets/env vars:')
  for (const key of missing) {
    console.error(`- ${key}`)
  }
  process.exit(1)
}

function hasCommand(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function safeCheck(name, command) {
  try {
    const output = execSync(command, { encoding: 'utf-8' }).trim()
    console.log(`[ok] ${name}: ${output}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[fail] ${name}: ${message}`)
    process.exit(1)
  }
}

console.log('Release preflight: secrets present.')

if (process.platform === 'darwin') {
  if (!hasCommand('xcrun')) {
    console.error('Release preflight failed: xcrun is required on macOS runners.')
    process.exit(1)
  }
  safeCheck('notarytool', 'xcrun notarytool --version')
  safeCheck('codesign identities', 'security find-identity -v -p codesigning')
} else {
  console.log('Skipping macOS-only checks because platform is not darwin.')
}

console.log('Release preflight passed.')
