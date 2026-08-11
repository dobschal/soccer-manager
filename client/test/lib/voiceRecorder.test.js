import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  canRecordAudio,
  formatDuration,
  MAX_RECORDING_SECONDS,
  pickMimeType,
  startRecording
} from '../../lib/voiceRecorder.js'

/**
 * A MediaRecorder stand-in that records what it was asked for and lets the
 * test decide when `stop()` completes.
 */
class FakeMediaRecorder {
  constructor (stream, options) {
    this.stream = stream
    this.options = options
    this.state = 'inactive'
    FakeMediaRecorder.last = this
  }
  static supported = ['audio/webm;codecs=opus']
  static isTypeSupported (type) { return FakeMediaRecorder.supported.includes(type) }

  start () { this.state = 'recording' }

  stop () {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

let tracks

beforeEach(() => {
  tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  FakeMediaRecorder.supported = ['audio/webm;codecs=opus']
  FakeMediaRecorder.last = null
  window.MediaRecorder = FakeMediaRecorder
  navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => tracks }) }
})

afterEach(() => {
  vi.useRealTimers()
  delete window.MediaRecorder
  delete navigator.mediaDevices
})

describe('canRecordAudio (#541)', () => {
  it('is true when the browser exposes both pieces', () => {
    expect(canRecordAudio()).toBe(true)
  })

  it('is false without MediaRecorder', () => {
    delete window.MediaRecorder
    expect(canRecordAudio()).toBe(false)
  })

  it('is false without mediaDevices — the file:// Android WebView case', () => {
    delete navigator.mediaDevices
    expect(canRecordAudio()).toBe(false)
  })

  it('is false when mediaDevices exists but cannot capture', () => {
    navigator.mediaDevices = {}
    expect(canRecordAudio()).toBe(false)
  })
})

describe('pickMimeType (#541)', () => {
  it('prefers Opus in WebM where it is available', () => {
    expect(pickMimeType()).toBe('audio/webm;codecs=opus')
  })

  it('falls back to the MP4 container Safari records', () => {
    FakeMediaRecorder.supported = ['audio/mp4']
    expect(pickMimeType()).toBe('audio/mp4')
  })

  it('returns an empty string when nothing on the list is supported', () => {
    FakeMediaRecorder.supported = []
    expect(pickMimeType()).toBe('')
  })
})

describe('startRecording (#541)', () => {
  it('asks for the microphone and starts recording', async () => {
    await startRecording()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(FakeMediaRecorder.last.state).toBe('recording')
  })

  it('resolves with a data URL and its type', async () => {
    const recorder = await startRecording()
    const result = await recorder.stop()

    expect(result.data).toMatch(/^data:audio\/webm/)
    expect(result.type).toBe('audio/webm')
    expect(result.duration).toBeGreaterThanOrEqual(1)
  })

  it('releases the microphone after stopping', async () => {
    const recorder = await startRecording()
    await recorder.stop()
    for (const track of tracks) expect(track.stop).toHaveBeenCalled()
  })

  it('releases the microphone when cancelled', async () => {
    const recorder = await startRecording()
    recorder.cancel()
    for (const track of tracks) expect(track.stop).toHaveBeenCalled()
  })

  it('never reports a zero-second recording', async () => {
    const recorder = await startRecording()
    expect((await recorder.stop()).duration).toBe(1)
  })

  it('ignores a second stop', async () => {
    const recorder = await startRecording()
    await recorder.stop()
    expect(await recorder.stop()).toBe(null)
  })

  it('survives a cancel after stopping', async () => {
    const recorder = await startRecording()
    await recorder.stop()
    expect(() => recorder.cancel()).not.toThrow()
  })
})

// Fake timers are confined to this block: they stop jsdom's FileReader from
// ever completing, so anything that awaits `stop()` has to stay outside.
describe('startRecording timing (#541)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reports elapsed seconds while recording', async () => {
    const onTick = vi.fn()
    await startRecording({ onTick })
    vi.advanceTimersByTime(2000)
    expect(onTick).toHaveBeenCalledWith(2)
  })

  it('signals the caller once the cap is reached', async () => {
    const onAutoStop = vi.fn()
    await startRecording({ onAutoStop })
    vi.advanceTimersByTime(MAX_RECORDING_SECONDS * 1000)
    expect(onAutoStop).toHaveBeenCalled()
  })

  it('does not signal the cap before it is reached', async () => {
    const onAutoStop = vi.fn()
    await startRecording({ onAutoStop })
    vi.advanceTimersByTime((MAX_RECORDING_SECONDS - 5) * 1000)
    expect(onAutoStop).not.toHaveBeenCalled()
  })
})

describe('formatDuration (#541)', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(7)).toBe('0:07')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(120)).toBe('2:00')
  })

  it('copes with missing or negative input', () => {
    expect(formatDuration(undefined)).toBe('0:00')
    expect(formatDuration(null)).toBe('0:00')
    expect(formatDuration(-3)).toBe('0:00')
  })
})
