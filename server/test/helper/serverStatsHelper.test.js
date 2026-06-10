import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const cpusMock = vi.fn()
const totalmemMock = vi.fn()
const freememMock = vi.fn()
const platformMock = vi.fn()
const execFileMock = vi.fn()
const readFileMock = vi.fn()

vi.mock('os', () => ({
  cpus: cpusMock,
  totalmem: totalmemMock,
  freemem: freememMock,
  platform: platformMock
}))

vi.mock('child_process', () => ({
  execFile: (cmd, args, cb) => execFileMock(cmd, args, cb)
}))

vi.mock('fs/promises', () => ({
  readFile: readFileMock
}))

const { getServerStats } = await import('../../helper/serverStatsHelper.js')

const GB = 1024 ** 3

function cpuTimes (idle, user, sys = 0, nice = 0, irq = 0) {
  return { idle, user, sys, nice, irq }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('serverStatsHelper.getServerStats', () => {
  it('returns CPU per core, memory, swap and disks on linux', async () => {
    let calls = 0
    cpusMock.mockImplementation(() => {
      calls++
      if (calls === 1) {
        return [
          { times: cpuTimes(800, 100, 50, 0, 0) },
          { times: cpuTimes(900, 50, 25, 0, 0) }
        ]
      }
      return [
        { times: cpuTimes(900, 200, 100, 0, 0) },
        { times: cpuTimes(1000, 100, 50, 0, 0) }
      ]
    })
    totalmemMock.mockReturnValue(16 * GB)
    freememMock.mockReturnValue(8 * GB)
    platformMock.mockReturnValue('linux')

    readFileMock.mockResolvedValue([
      'MemTotal:       16384000 kB',
      'SwapTotal:       2097152 kB',
      'SwapFree:        1048576 kB'
    ].join('\n'))

    execFileMock.mockImplementation((_cmd, _args, cb) => {
      const stdout = [
        'Filesystem     1024-blocks      Used  Available Capacity Mounted on',
        '/dev/sda1       104857600  41943040   62914560      40% /',
        'tmpfs              512000      1024     510976       1% /run',
        '/dev/sdb1       209715200 104857600  104857600      50% /data'
      ].join('\n')
      cb(null, { stdout, stderr: '' })
    })

    const promise = getServerStats()
    await vi.advanceTimersByTimeAsync(250)
    const stats = await promise

    expect(stats.cpu).toHaveLength(2)
    // Core 0: idle diff 100 / total diff 250 → 60% used
    expect(stats.cpu[0]).toBeCloseTo(60, 1)
    // Core 1: idle diff 100 / total diff 175 → ~42.9% used
    expect(stats.cpu[1]).toBeCloseTo(42.9, 1)

    expect(stats.memory).toEqual({ totalGb: 16, usedGb: 8, percent: 50 })

    expect(stats.swap).not.toBeNull()
    expect(stats.swap.totalGb).toBeCloseTo(2, 2)
    expect(stats.swap.usedGb).toBeCloseTo(1, 2)
    expect(stats.swap.percent).toBeCloseTo(50, 1)

    expect(stats.disks).toHaveLength(2)
    expect(stats.disks[0]).toMatchObject({ filesystem: '/dev/sda1', mount: '/' })
    expect(stats.disks[0].percent).toBeCloseTo(40, 1)
    expect(stats.disks[1]).toMatchObject({ filesystem: '/dev/sdb1', mount: '/data' })
    expect(stats.disks[1].percent).toBeCloseTo(50, 1)

    expect(stats.platform).toBe('linux')
  })

  it('returns null swap on non-linux platforms', async () => {
    cpusMock.mockReturnValue([{ times: cpuTimes(100, 10) }])
    totalmemMock.mockReturnValue(GB)
    freememMock.mockReturnValue(GB / 2)
    platformMock.mockReturnValue('darwin')

    execFileMock.mockImplementation((_cmd, _args, cb) => {
      cb(null, { stdout: 'Filesystem 1024-blocks Used Available Capacity Mounted on\n', stderr: '' })
    })

    const promise = getServerStats()
    await vi.advanceTimersByTimeAsync(250)
    const stats = await promise

    expect(stats.swap).toBeNull()
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it('returns empty disk list when df fails', async () => {
    cpusMock.mockReturnValue([{ times: cpuTimes(100, 10) }])
    totalmemMock.mockReturnValue(GB)
    freememMock.mockReturnValue(GB)
    platformMock.mockReturnValue('linux')
    readFileMock.mockResolvedValue('SwapTotal: 0 kB\nSwapFree: 0 kB\n')

    execFileMock.mockImplementation((_cmd, _args, cb) => {
      cb(new Error('df missing'), null)
    })

    const promise = getServerStats()
    await vi.advanceTimersByTimeAsync(250)
    const stats = await promise

    expect(stats.disks).toEqual([])
    expect(stats.swap).toEqual({ totalGb: 0, usedGb: 0, percent: 0 })
  })
})
