/**
 * Thin client for the OpenRouter chat-completions API.
 *
 * OpenRouter is a router in front of many model providers behind a single
 * OpenAI-compatible endpoint, which is why the model is configurable per call
 * and via env: the cheap models are good enough for flavour text, while a
 * bigger one can be swapped in later without touching call sites.
 *
 * Everything here is deliberately dependency-free — a single fetch with an
 * abort timeout. Callers are expected to treat a throw as "no text this time"
 * and fall back to whatever they rendered before.
 */

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct'
const DEFAULT_TIMEOUT_MS = 45000

/**
 * Whether an API key is configured. Routes use this to fail fast with a
 * translated message instead of letting the request run into a 401.
 * @returns {boolean}
 */
export function isLlmConfigured () {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

/**
 * The model used for generation. Overridable per environment so sandbox can
 * run a cheaper model than production.
 * @returns {string}
 */
export function getLlmModel () {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL
}

/**
 * Send a single-turn prompt and return the assistant's text.
 *
 * @param {object} params
 * @param {string} params.system - System prompt describing role and format.
 * @param {string} params.prompt - The user turn (our compacted match facts).
 * @param {number} [params.maxTokens] - Output cap.
 * @param {string} [params.model] - Overrides OPENROUTER_MODEL.
 * @param {number} [params.timeoutMs]
 * @returns {Promise<string>} The generated text, trimmed.
 * @throws {Error} When unconfigured, on a non-2xx response, or on timeout.
 */
export async function generateText ({
  system,
  prompt,
  maxTokens = 900,
  model = getLlmModel(),
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter attributes requests to an app via these two headers.
        'HTTP-Referer': process.env.PUBLIC_URL || 'https://footballmanager.io',
        'X-Title': 'FootballManager.IO'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ]
      })
    })
  } catch (e) {
    // AbortError surfaces as a plain DOMException; normalise the message so
    // callers log something meaningful.
    if (e?.name === 'AbortError') throw new Error(`LLM request timed out after ${timeoutMs}ms`)
    throw e
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 500)}`)
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string') {
    throw new Error('LLM response contained no text')
  }
  return text.trim()
}
