import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  default: { unlinkSync: vi.fn() },
  unlinkSync: vi.fn()
}))

const execFile = vi.fn()
vi.mock('child_process', () => ({
  default: { execFile: (...args) => execFile(...args) },
  execFile: (...args) => execFile(...args)
}))

import fs from 'fs'
import {
  UNIVERSAL_AUDIO_EXTENSIONS, ensurePlayableAudio, hasFfmpeg, resetFfmpegProbe, transcodeToM4a
} from '../../lib/audioTranscode.js'

/**
 * `promisify(execFile)` calls the mock with a node-style callback appended.
 * @param {Error|null} error
 */
function respondWith (error) {
  execFile.mockImplementation((cmd, args, cb) => cb(error, { stdout: '', stderr: '' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  resetFfmpegProbe()
  respondWith(null)
})

describe('ensurePlayableAudio (#541)', () => {
  it('leaves a container every platform can decode untouched', async () => {
    for (const ext of UNIVERSAL_AUDIO_EXTENSIONS) {
      expect(await ensurePlayableAudio('uploads/chat', `abc.${ext}`)).toBe(`abc.${ext}`)
    }
    expect(execFile).not.toHaveBeenCalled()
  })

  it('converts a WebM recording, because iOS cannot play it', async () => {
    expect(await ensurePlayableAudio('uploads/chat', 'abc.webm')).toBe('abc.m4a')
    const [cmd, args] = execFile.mock.calls.at(-1)
    expect(cmd).toBe('ffmpeg')
    expect(args).toContain('uploads/chat/abc.webm')
    expect(args).toContain('uploads/chat/abc.m4a')
    expect(args).toContain('aac')
  })

  it('converts Ogg too', async () => {
    expect(await ensurePlayableAudio('uploads/chat', 'abc.ogg')).toBe('abc.m4a')
  })

  it('ignores the case of the extension', async () => {
    expect(await ensurePlayableAudio('uploads/chat', 'abc.M4A')).toBe('abc.M4A')
    expect(execFile).not.toHaveBeenCalled()
  })

  it('deletes the original once the conversion worked', async () => {
    await ensurePlayableAudio('uploads/chat', 'abc.webm')
    expect(fs.unlinkSync).toHaveBeenCalledWith('uploads/chat/abc.webm')
  })

  it('keeps the recording when ffmpeg fails rather than losing the message', async () => {
    respondWith(null)
    await hasFfmpeg()
    respondWith(new Error('boom'))
    expect(await ensurePlayableAudio('uploads/chat', 'abc.webm')).toBe('abc.webm')
    // Only the half-written target is removed, never the original.
    expect(fs.unlinkSync).toHaveBeenCalledWith('uploads/chat/abc.m4a')
    expect(fs.unlinkSync).not.toHaveBeenCalledWith('uploads/chat/abc.webm')
  })

  it('keeps the recording on a machine without ffmpeg', async () => {
    respondWith(new Error('ENOENT'))
    expect(await ensurePlayableAudio('uploads/chat', 'abc.webm')).toBe('abc.webm')
    // The probe ran; no conversion was attempted afterwards.
    expect(execFile.mock.calls).toHaveLength(1)
    expect(execFile.mock.calls[0][1]).toEqual(['-version'])
  })
})

describe('hasFfmpeg (#541)', () => {
  it('probes only once', async () => {
    expect(await hasFfmpeg()).toBe(true)
    expect(await hasFfmpeg()).toBe(true)
    expect(execFile).toHaveBeenCalledTimes(1)
  })
})

describe('transcodeToM4a (#541)', () => {
  it('returns null when there is no ffmpeg to run', async () => {
    respondWith(new Error('ENOENT'))
    expect(await transcodeToM4a('uploads/chat/abc.webm')).toBeNull()
  })

  it('swaps the extension rather than appending one', async () => {
    expect(await transcodeToM4a('uploads/chat/abc.webm')).toBe('abc.m4a')
  })
})
