import { cpus, totalmem, freemem, platform } from 'os'
import { promisify } from 'util'
import { execFile } from 'child_process'
import { readFile } from 'fs/promises'

const execFileAsync = promisify(execFile)
const CPU_SAMPLE_MS = 200
const GB = 1024 ** 3

function round2 (value) {
  return Math.round(value * 100) / 100
}

function percent1 (value) {
  return Math.round(value * 1000) / 10
}

async function getCpuUsagePerCore () {
  const sample1 = cpus()
  await new Promise(resolve => setTimeout(resolve, CPU_SAMPLE_MS))
  const sample2 = cpus()
  return sample1.map((cpu1, idx) => {
    const t1 = cpu1.times
    const t2 = sample2[idx].times
    const idleDiff = t2.idle - t1.idle
    const totalDiff =
      (t2.user - t1.user) +
      (t2.nice - t1.nice) +
      (t2.sys - t1.sys) +
      (t2.idle - t1.idle) +
      (t2.irq - t1.irq)
    if (totalDiff <= 0) return 0
    return percent1(1 - idleDiff / totalDiff)
  })
}

function getMemoryUsage () {
  const total = totalmem()
  const free = freemem()
  const used = Math.max(0, total - free)
  return {
    totalGb: round2(total / GB),
    usedGb: round2(used / GB),
    percent: total > 0 ? percent1(used / total) : 0
  }
}

async function getSwapUsage () {
  if (platform() !== 'linux') return null
  try {
    const content = await readFile('/proc/meminfo', 'utf8')
    const totalMatch = content.match(/SwapTotal:\s+(\d+)\s*kB/)
    const freeMatch = content.match(/SwapFree:\s+(\d+)\s*kB/)
    if (!totalMatch || !freeMatch) return null
    const totalBytes = Number(totalMatch[1]) * 1024
    const freeBytes = Number(freeMatch[1]) * 1024
    const usedBytes = Math.max(0, totalBytes - freeBytes)
    return {
      totalGb: round2(totalBytes / GB),
      usedGb: round2(usedBytes / GB),
      percent: totalBytes > 0 ? percent1(usedBytes / totalBytes) : 0
    }
  } catch {
    return null
  }
}

const SKIP_FS_PREFIXES = ['tmpfs', 'devtmpfs', 'shm', 'devfs', 'map ', 'overlay']
const SKIP_MOUNT_PREFIXES = ['/proc', '/sys', '/dev', '/run', '/var/lib/docker']

async function getDiskUsage () {
  try {
    const { stdout } = await execFileAsync('df', ['-P', '-k'])
    const lines = stdout.trim().split('\n').slice(1)
    return lines
      .map(line => {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 6) return null
        const filesystem = parts[0]
        const totalKb = Number(parts[1])
        const usedKb = Number(parts[2])
        const mount = parts.slice(5).join(' ')
        if (!Number.isFinite(totalKb) || totalKb <= 0) return null
        if (SKIP_FS_PREFIXES.some(p => filesystem.startsWith(p))) return null
        if (SKIP_MOUNT_PREFIXES.some(p => mount.startsWith(p))) return null
        const totalBytes = totalKb * 1024
        const usedBytes = usedKb * 1024
        return {
          filesystem,
          mount,
          totalGb: round2(totalBytes / GB),
          usedGb: round2(usedBytes / GB),
          percent: percent1(usedBytes / totalBytes)
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Collect current host stats: CPU usage per core, memory, swap, and per-disk
 * usage. CPU values are percentages (0–100, one decimal). Memory/swap/disks
 * report both absolute GB and percent. `swap` is `null` on non-Linux hosts
 * where /proc/meminfo is not available.
 * @returns {Promise<{
 *   cpu: number[],
 *   memory: { totalGb: number, usedGb: number, percent: number },
 *   swap: { totalGb: number, usedGb: number, percent: number } | null,
 *   disks: Array<{ filesystem: string, mount: string, totalGb: number, usedGb: number, percent: number }>,
 *   platform: string
 * }>}
 */
export async function getServerStats () {
  const [cpu, swap, disks] = await Promise.all([
    getCpuUsagePerCore(),
    getSwapUsage(),
    getDiskUsage()
  ])
  return {
    cpu,
    memory: getMemoryUsage(),
    swap,
    disks,
    platform: platform()
  }
}
