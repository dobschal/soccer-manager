import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../../util/emblemGenerator.js', () => ({
  parseEmblemParams: vi.fn(),
  generateEmblem: vi.fn(() => '<svg class="emblem"></svg>')
}))

import { renderEmblem } from '../../partials/emblem.js'
import { parseEmblemParams, generateEmblem } from '../../util/emblemGenerator.js'

describe('emblem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('renderEmblem', () => {
    it('renders emblem with parsed params', () => {
      const team = {
        name: 'Test FC',
        color: '#FF0000',
        emblem: '{"shape":"circle","pattern":"stripes","color":"#00FF00"}'
      }
      parseEmblemParams.mockReturnValue({
        shape: 'circle',
        pattern: 'stripes',
        color: '#00FF00'
      })

      renderEmblem(team, 100)

      expect(generateEmblem).toHaveBeenCalledWith({
        shape: 'circle',
        pattern: 'stripes',
        color: '#00FF00',
        teamName: 'Test FC',
        size: 100
      })
    })

    it('uses default size of 200 when not specified', () => {
      const team = {
        name: 'Default FC',
        color: '#0000FF',
        emblem: '{"shape":"shield","pattern":"solid","color":"#0000FF"}'
      }
      parseEmblemParams.mockReturnValue({
        shape: 'shield',
        pattern: 'solid',
        color: '#0000FF'
      })

      renderEmblem(team)

      expect(generateEmblem).toHaveBeenCalledWith(
        expect.objectContaining({ size: 200 })
      )
    })

    it('uses fallback when emblem params cannot be parsed', () => {
      const team = {
        name: 'Old FC',
        color: '#123456',
        emblem: null
      }
      parseEmblemParams.mockReturnValue(null)

      renderEmblem(team, 150)

      expect(generateEmblem).toHaveBeenCalledWith({
        shape: 'shield',
        pattern: 'solid',
        color: '#123456',
        teamName: 'Old FC',
        size: 150
      })
    })

    it('uses default color when team has no color', () => {
      const team = {
        name: 'No Color FC',
        color: undefined,
        emblem: null
      }
      parseEmblemParams.mockReturnValue(null)

      renderEmblem(team, 100)

      expect(generateEmblem).toHaveBeenCalledWith(
        expect.objectContaining({ color: '#1a5f7a' })
      )
    })

    it('returns the generated SVG string', () => {
      const team = {
        name: 'Test FC',
        emblem: null
      }
      parseEmblemParams.mockReturnValue(null)
      generateEmblem.mockReturnValue('<svg>test</svg>')

      const result = renderEmblem(team)

      expect(result).toBe('<svg>test</svg>')
    })
  })
})
