import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { installScripts } from '../../src/main/scripts'

describe('installScripts', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flywheel-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates bin directory and flywheel-open script', () => {
    installScripts(tempDir)
    const binDir = join(tempDir, '.flywheel', 'bin')
    const script = readFileSync(join(binDir, 'flywheel-open'), 'utf-8')
    expect(script).toContain('7770')
    expect(script).toContain('/dev/tty')
  })

  it('makes scripts executable (mode 0o755)', () => {
    installScripts(tempDir)
    const binDir = join(tempDir, '.flywheel', 'bin')
    const stat = statSync(join(binDir, 'flywheel-open'))
    // Check owner-executable bit
    expect(stat.mode & 0o111).toBeGreaterThan(0)
  })

  it('writes open wrapper on darwin', () => {
    installScripts(tempDir, 'darwin')
    const binDir = join(tempDir, '.flywheel', 'bin')
    const script = readFileSync(join(binDir, 'open'), 'utf-8')
    expect(script).toContain('/usr/bin/open')
    expect(script).toContain('7770')
  })

  it('writes xdg-open wrapper on linux', () => {
    installScripts(tempDir, 'linux')
    const binDir = join(tempDir, '.flywheel', 'bin')
    const script = readFileSync(join(binDir, 'xdg-open'), 'utf-8')
    expect(script).toContain('/usr/bin/xdg-open')
    expect(script).toContain('7770')
  })

  it('does not write open wrapper on linux', () => {
    installScripts(tempDir, 'linux')
    const binDir = join(tempDir, '.flywheel', 'bin')
    expect(() => statSync(join(binDir, 'open'))).toThrow()
  })

  it('does not write xdg-open wrapper on darwin', () => {
    installScripts(tempDir, 'darwin')
    const binDir = join(tempDir, '.flywheel', 'bin')
    expect(() => statSync(join(binDir, 'xdg-open'))).toThrow()
  })

  it('overwrites existing scripts idempotently', () => {
    installScripts(tempDir)
    installScripts(tempDir)
    const binDir = join(tempDir, '.flywheel', 'bin')
    const script = readFileSync(join(binDir, 'flywheel-open'), 'utf-8')
    expect(script).toContain('7770')
  })
})
