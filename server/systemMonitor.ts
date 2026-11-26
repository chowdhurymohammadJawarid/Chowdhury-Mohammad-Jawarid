import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readWindowsSensors } from './windowsControl.ts';

const execFileAsync = promisify(execFile);

interface CpuSample {
  idle: number;
  total: number;
}

let prevCpuSample: CpuSample | null = null;
let lastInternetCheck = {
  checkedAt: 0,
  connected: true,
  latencyMs: null as number | null,
};

function readCpuSample(): CpuSample {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }
  return { idle, total };
}

function computeCpuPercent(): number {
  const current = readCpuSample();
  if (!prevCpuSample) {
    prevCpuSample = current;
    const load1 = os.loadavg()[0] || 0;
    const cores = Math.max(1, os.cpus().length);
    return Math.min(100, Math.max(1, Math.round((load1 / cores) * 100)));
  }
  const idleDelta = current.idle - prevCpuSample.idle;
  const totalDelta = current.total - prevCpuSample.total;
  prevCpuSample = current;
  if (totalDelta <= 0) {
    return 0;
  }
  const pct = (1 - idleDelta / totalDelta) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}

async function probeInternet(): Promise<{ connected: boolean; latencyMs: number | null }> {
  const now = Date.now();
  if (now - lastInternetCheck.checkedAt < 12000) {
    return {
      connected: lastInternetCheck.connected,
      latencyMs: lastInternetCheck.latencyMs,
    };
  }
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const res = await fetch('https://dns.google/resolve?name=example.com&type=A', {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    lastInternetCheck = {
      checkedAt: now,
      connected: res.ok,
      latencyMs: latency,
    };
  } catch {
    lastInternetCheck = {
      checkedAt: now,
      connected: false,
      latencyMs: null,
    };
  }
  return {
    connected: lastInternetCheck.connected,
    latencyMs: lastInternetCheck.latencyMs,
  };
}

function readStorageStats(): { usedGb: number; totalGb: number; percent: number } {
  try {
    const stats = fs.statfsSync(process.cwd());
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const totalGb = Math.round((totalBytes / 1024 ** 3) * 10) / 10;
    const usedGb = Math.round((usedBytes / 1024 ** 3) * 10) / 10;
    const percent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
    return { usedGb, totalGb, percent };
  } catch {
    return { usedGb: 0, totalGb: 0, percent: 0 };
  }
}

function readBatteryInfo(): { available: boolean; percent: number | null; charging: boolean | null } {
  if (os.platform() === 'linux') {
    try {
      const base = '/sys/class/power_supply';
      if (fs.existsSync(base)) {
        const entries = fs.readdirSync(base);
        const bat = entries.find((e) => e.startsWith('BAT'));
        if (bat) {
          const capPath = path.join(base, bat, 'capacity');
          const statusPath = path.join(base, bat, 'status');
          const cap = fs.existsSync(capPath)
            ? Number(fs.readFileSync(capPath, 'utf8').trim())
            : null;
          const status = fs.existsSync(statusPath)
            ? fs.readFileSync(statusPath, 'utf8').trim()
            : '';
          return {
            available: cap !== null && !Number.isNaN(cap),
            percent: cap,
            charging: status.toLowerCase() === 'charging',
          };
        }
      }
    } catch {
      // Ignore unavailable sysfs
    }
  }
  return { available: false, percent: null, charging: null };
}

function readTemperatureInfo(): { available: boolean; celsius: number | null } {
  if (os.platform() === 'linux') {
    try {
      const base = '/sys/class/thermal';
      if (fs.existsSync(base)) {
        const zones = fs.readdirSync(base).filter((e) => e.startsWith('thermal_zone'));
        for (const z of zones) {
          const tempFile = path.join(base, z, 'temp');
          if (fs.existsSync(tempFile)) {
            const raw = Number(fs.readFileSync(tempFile, 'utf8').trim());
            if (!Number.isNaN(raw) && raw > 0) {
              const celsius = raw > 1000 ? Math.round((raw / 1000) * 10) / 10 : raw;
              return { available: true, celsius };
            }
          }
        }
      }
    } catch {
      // Ignore unavailable thermal zone
    }
  }
  return { available: false, celsius: null };
}

async function readProcesses(): Promise<Array<{ pid: number; name: string; cpu: number; memory: number }>> {
  try {
    if (os.platform() === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 2500 });
      const lines = stdout.trim().split(/\r?\n/).slice(0, 12);
      return lines
        .map((line) => {
          const parts = line.split('","').map((p) => p.replace(/^"|"$/g, ''));
          const memKb = Number((parts[4] || '0').replace(/[^0-9]/g, ''));
          const totalMemKb = os.totalmem() / 1024;
          const memPct = totalMemKb > 0 ? Math.round((memKb / totalMemKb) * 1000) / 10 : 0;
          return {
            pid: Number(parts[1]) || 0,
            name: parts[0] || 'unknown',
            cpu: 0,
            memory: memPct,
          };
        })
        .filter((p) => p.pid > 0);
    }

    const { stdout } = await execFileAsync(
      'ps',
      ['-eo', 'pid,pcpu,pmem,comm', '--sort=-pmem'],
      { timeout: 2500 }
    );
    const lines = stdout.trim().split('\n').slice(1, 13);
    return lines
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/);
        if (!match) return null;
        return {
          pid: Number(match[1]),
          cpu: Number(match[2]),
          memory: Number(match[3]),
          name: match[4].trim(),
        };
      })
      .filter((item): item is { pid: number; name: string; cpu: number; memory: number } => item !== null);
  } catch {
    return [
      {
        pid: process.pid,
        name: 'node (ULTRON Core)',
        cpu: 1.4,
        memory: Math.round((process.memoryUsage().rss / os.totalmem()) * 1000) / 10,
      },
    ];
  }
}

export function getHardwareProfile() {
  const cpus = os.cpus();
  const cores = Math.max(1, cpus.length);
  const totalRamGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
  let tier: 'High-Performance' | 'Balanced' | 'Efficiency' = 'Balanced';
  if (cores >= 8 && totalRamGb >= 16) {
    tier = 'High-Performance';
  } else if (cores <= 2 || totalRamGb < 4) {
    tier = 'Efficiency';
  }
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model?.trim() || 'Generic Processor',
    cpuCores: cores,
    totalRamGb,
    tier,
    recommendedPollingMs: tier === 'High-Performance' ? 1800 : tier === 'Balanced' ? 2500 : 4000,
    recommendedParticleCount: tier === 'High-Performance' ? 1400 : tier === 'Balanced' ? 950 : 550,
  };
}

export async function collectSystemTelemetry() {
  const cpuPercent = computeCpuPercent();
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const memoryTotalGb = Math.round((totalBytes / 1024 ** 3) * 10) / 10;
  const memoryUsedGb = Math.round((usedBytes / 1024 ** 3) * 10) / 10;
  const memoryPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;

  const storage = readStorageStats();
  const netIfaces = os.networkInterfaces();
  const networkInterfaces: Array<{ name: string; address: string; family: string }> = [];
  for (const [name, addrs] of Object.entries(netIfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === 'IPv4') {
        networkInterfaces.push({ name, address: addr.address, family: addr.family });
      }
    }
  }

  const [internet, processes, winSensors] = await Promise.all([
    probeInternet(),
    readProcesses(),
    os.platform() === 'win32' ? readWindowsSensors() : Promise.resolve(null),
  ]);
  const battery = winSensors?.battery.available ? winSensors.battery : readBatteryInfo();
  const temperature = winSensors?.temperature.available
    ? winSensors.temperature
    : readTemperatureInfo();
  const hardware = getHardwareProfile();

  let advisory: string | null = null;
  if (memoryPercent >= 85) {
    const topProc = processes[0]?.name || 'active processes';
    advisory = `Boss, your system is experiencing unusually high memory usage (${memoryPercent}%). Top consumer appears to be ${topProc}. Would you like me to review active processes?`;
  } else if (cpuPercent >= 85) {
    advisory = `Boss, processor utilization has reached ${cpuPercent}%. I recommend inspecting background workloads or switching ULTRON graphics to Efficiency mode.`;
  } else if (storage.percent >= 90) {
    advisory = `Boss, primary storage is at ${storage.percent}% capacity. I can run a duplicate file scan in your workspace to help free space.`;
  }

  return {
    timestamp: Date.now(),
    cpuPercent,
    memoryUsedGb,
    memoryTotalGb,
    memoryPercent,
    storageUsedGb: storage.usedGb,
    storageTotalGb: storage.totalGb,
    storagePercent: storage.percent,
    networkInterfaces,
    internetConnected: internet.connected,
    internetLatencyMs: internet.latencyMs,
    uptimeSeconds: Math.round(os.uptime()),
    battery,
    temperature,
    processes,
    hardware,
    advisory,
  };
}
