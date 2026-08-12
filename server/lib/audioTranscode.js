import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Containers every target platform can decode.
 *
 * WebM/Opus and Ogg/Opus are what Chrome and Firefox record, and neither can be
 * played by Safari or a WKWebView — an iPhone shows a bare "Error" in the audio
 * player instead of the message (#541). Everything outside this set therefore
 * gets re-wrapped as AAC in an MP4 container, which plays everywhere.
 * @type {Set<string>}
 */
export const UNIVERSAL_AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'aac'])

/** Cached result of the ffmpeg probe — the binary does not appear mid-run. */
let ffmpegAvailable = null

/**
 * Whether an ffmpeg binary is on the PATH. Production ships one in the image;
 * a developer machine may not have it, and there a voice message is stored in
 * whatever the browser recorded rather than being rejected.
 * @returns {Promise<boolean>}
 */
export async function hasFfmpeg () {
  if (ffmpegAvailable !== null) return ffmpegAvailable
  try {
    await execFileAsync('ffmpeg', ['-version'])
    ffmpegAvailable = true
  } catch {
    ffmpegAvailable = false
  }
  return ffmpegAvailable
}

/** Only for tests — forget the cached probe result. */
export function resetFfmpegProbe () {
  ffmpegAvailable = null
}

/**
 * Re-encode an audio file to AAC in an MP4 container next to the original and
 * return the new file's basename. The original is deleted once the conversion
 * succeeded; on any failure the original is kept and `null` is returned, so a
 * voice message is never lost just because the transcode did not work.
 *
 * Mono at 64 kbit/s is plenty for speech and keeps a two-minute message under
 * a megabyte.
 * @param {string} filePath - absolute or cwd-relative path of the stored file
 * @returns {Promise<string|null>} the new basename, or null if nothing changed
 */
export async function transcodeToM4a (filePath) {
  if (!await hasFfmpeg()) return null
  const target = filePath.replace(/\.[^.]+$/, '') + '.m4a'
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', filePath,
      '-vn',
      '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
      '-movflags', '+faststart',
      '-y', target
    ])
  } catch (e) {
    console.error('[chat] voice message transcode failed:', e?.message ?? e)
    // A half-written target would be worse than none at all.
    try { fs.unlinkSync(target) } catch { /* nothing was written */ }
    return null
  }
  try { fs.unlinkSync(filePath) } catch { /* already gone — harmless */ }
  return path.basename(target)
}

/**
 * Make a freshly stored voice message playable on every platform: containers
 * iOS cannot decode are converted, the rest is left untouched.
 * @param {string} uploadDir
 * @param {string} filename - basename inside `uploadDir`
 * @returns {Promise<string>} the basename to store in the database
 */
export async function ensurePlayableAudio (uploadDir, filename) {
  const ext = path.extname(filename).slice(1).toLowerCase()
  if (UNIVERSAL_AUDIO_EXTENSIONS.has(ext)) return filename
  const converted = await transcodeToM4a(path.join(uploadDir, filename))
  return converted ?? filename
}
