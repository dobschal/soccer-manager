/**
 * Longest voice message the chat accepts. Recording stops itself here so a
 * forgotten finger on the button cannot produce a ten-minute file (#541).
 * Keep in sync with MAX_AUDIO_DURATION_SECONDS in server/routes/chat.js.
 */
export const MAX_RECORDING_SECONDS = 120

/**
 * Container types we ask MediaRecorder for, best first. Browsers disagree:
 * Chrome and Firefox produce WebM/Opus, Safari and iOS only MP4/AAC. Whatever
 * is picked here is what the server stores, so both are on its allow-list.
 * @type {string[]}
 */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus'
]

/**
 * Whether this runtime can record at all.
 *
 * The native Android WebView loads the app from `file://`, which is not a
 * secure context — `navigator.mediaDevices` does not even exist there, so the
 * chat hides its microphone button rather than offering something that cannot
 * work (#541).
 * @returns {boolean}
 */
export function canRecordAudio () {
  return typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    Boolean(navigator?.mediaDevices?.getUserMedia)
}

/**
 * The first container this browser will actually record. Returns '' when the
 * browser accepts none of them explicitly — MediaRecorder then picks its own,
 * which is fine, we read the real type back off the resulting Blob.
 * @returns {string}
 */
export function pickMimeType () {
  if (typeof window?.MediaRecorder?.isTypeSupported !== 'function') return ''
  return PREFERRED_MIME_TYPES.find(type => window.MediaRecorder.isTypeSupported(type)) || ''
}

/**
 * Record a single voice message.
 *
 * Start it, then either `stop()` for the recording or `cancel()` to throw it
 * away. `stop()` resolves with a data URL ready to hand to the server, plus
 * the duration in whole seconds.
 *
 * The microphone track is released on both paths — leaving it open keeps the
 * OS recording indicator lit and, on iOS, ducks other audio.
 *
 * @param {{onTick?: (seconds: number) => void, onAutoStop?: () => void}} [callbacks]
 * @returns {Promise<{stop: () => Promise<{data: string, type: string, duration: number}>, cancel: () => void}>}
 */
export async function startRecording ({ onTick, onAutoStop } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMimeType()
  const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  }
  recorder.start()

  const startedAt = Date.now()
  let stopped = false
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000)

  const releaseStream = () => stream.getTracks().forEach(track => track.stop())

  const ticker = setInterval(() => {
    const seconds = elapsed()
    onTick?.(seconds)
    if (seconds >= MAX_RECORDING_SECONDS && !stopped) {
      onAutoStop?.()
    }
  }, 250)

  const finish = () => {
    stopped = true
    clearInterval(ticker)
    releaseStream()
  }

  return {
    stop () {
      if (stopped) return Promise.resolve(null)
      const duration = Math.max(1, elapsed())
      return new Promise((resolve, reject) => {
        recorder.onstop = () => {
          finish()
          const blob = new Blob(chunks, { type: chunks[0]?.type || mimeType || 'audio/webm' })
          const reader = new FileReader()
          reader.onload = () => resolve({ data: reader.result, type: blob.type, duration })
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        }
        recorder.stop()
      })
    },
    cancel () {
      if (stopped) return
      recorder.onstop = null
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch { /* already stopped — nothing to do */ }
      finish()
    }
  }
}

/**
 * Format a duration in seconds as `m:ss` for the bubble and the live counter.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration (seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}
