// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { FileSystemService } from './FileSystemService'

const TEST_DIR = join(tmpdir(), 'hydra-fs-test-' + Date.now())

function setup() {
  mkdirSync(join(TEST_DIR, 'src'), { recursive: true })
  mkdirSync(join(TEST_DIR, 'node_modules', 'pkg'), { recursive: true })
  mkdirSync(join(TEST_DIR, '.git'), { recursive: true })
  writeFileSync(join(TEST_DIR, 'README.md'), '# Hello')
  writeFileSync(join(TEST_DIR, 'src', 'index.ts'), 'console.log("hello")')
  writeFileSync(join(TEST_DIR, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}')
}

describe('FileSystemService', () => {
  let service: FileSystemService

  beforeEach(() => {
    service = new FileSystemService()
    setup()
  })

  afterEach(() => {
    service.stopAll()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  describe('readDir', () => {
    it('lists files and directories, excluding ignored names', async () => {
      const entries = await service.readDir('.', TEST_DIR)
      const names = entries.map((e) => e.name)
      expect(names).toContain('src')
      expect(names).toContain('README.md')
      expect(names).not.toContain('node_modules')
      expect(names).not.toContain('.git')
    })

    it('sorts directories before files', async () => {
      const entries = await service.readDir('.', TEST_DIR)
      const firstDir = entries.findIndex((e) => e.isDirectory)
      const firstFile = entries.findIndex((e) => !e.isDirectory)
      if (firstDir !== -1 && firstFile !== -1) {
        expect(firstDir).toBeLessThan(firstFile)
      }
    })

    it('reads subdirectory entries', async () => {
      const entries = await service.readDir('src', TEST_DIR)
      expect(entries).toHaveLength(1)
      expect(entries[0].name).toBe('index.ts')
      expect(entries[0].isDirectory).toBe(false)
    })
  })

  describe('readFile', () => {
    it('reads file content', async () => {
      const result = await service.readFile('README.md', TEST_DIR)
      expect(result.content).toBe('# Hello')
      expect(result.path).toBe('README.md')
    })

    it('reads nested file content', async () => {
      const result = await service.readFile('src/index.ts', TEST_DIR)
      expect(result.content).toBe('console.log("hello")')
    })

    it('rejects binary files', async () => {
      writeFileSync(join(TEST_DIR, 'image.png'), Buffer.from([0x89, 0x50]))
      await expect(service.readFile('image.png', TEST_DIR)).rejects.toThrow('binary')
    })
  })

  describe('writeFile', () => {
    it('writes file content', async () => {
      await service.writeFile('src/index.ts', 'updated content', TEST_DIR)
      const result = await service.readFile('src/index.ts', TEST_DIR)
      expect(result.content).toBe('updated content')
    })
  })

  describe('searchFiles', () => {
    it('finds files matching query', async () => {
      const results = await service.searchFiles('index', TEST_DIR)
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((r) => r.name === 'index.ts')).toBe(true)
    })

    it('is case-insensitive', async () => {
      const results = await service.searchFiles('README', TEST_DIR)
      expect(results.some((r) => r.name === 'README.md')).toBe(true)
    })

    it('excludes ignored directories', async () => {
      const results = await service.searchFiles('pkg', TEST_DIR)
      expect(results.length).toBe(0)
    })

    it('skips binary files', async () => {
      writeFileSync(join(TEST_DIR, 'logo.png'), Buffer.from([0x89, 0x50]))
      const results = await service.searchFiles('logo', TEST_DIR)
      expect(results.length).toBe(0)
    })

    it('respects maxResults', async () => {
      // Create multiple matching files
      mkdirSync(join(TEST_DIR, 'multi'), { recursive: true })
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(TEST_DIR, 'multi', `file${i}.ts`), '')
      }
      const results = await service.searchFiles('file', TEST_DIR, 2)
      expect(results.length).toBe(2)
    })

    it('returns empty array for empty query', async () => {
      const results = await service.searchFiles('', TEST_DIR)
      expect(results).toEqual([])
    })

    it('matches on relative path', async () => {
      const results = await service.searchFiles('src/index', TEST_DIR)
      expect(results.some((r) => r.path === 'src/index.ts')).toBe(true)
    })
  })

  describe('path traversal prevention', () => {
    it('rejects readDir outside project', async () => {
      await expect(service.readDir('..', TEST_DIR)).rejects.toThrow('traversal')
    })

    it('rejects readFile outside project', async () => {
      await expect(service.readFile('../../../etc/passwd', TEST_DIR)).rejects.toThrow('traversal')
    })

    it('rejects writeFile outside project', async () => {
      await expect(
        service.writeFile('../../evil.txt', 'hack', TEST_DIR)
      ).rejects.toThrow('traversal')
    })
  })
})
