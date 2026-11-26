import { useState } from 'react';
import {
  Activity,
  Battery,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  ShieldAlert,
  Thermometer,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { PendingConfirmation, SystemProcess, SystemTelemetry } from '../types/ultron';

interface SystemMonitorViewProps {
  telemetry: SystemTelemetry | null;
  history: Array<{ time: string; cpu: number; memory: number }>;
  onRefresh: () => void;
  onRequestConfirmation: (conf: PendingConfirmation) => void;
  onSpeakAdvisory: (text: string) => void;
}

function SparklineChart({
  data,
  color,
  label,
  currentValue,
}: {
  data: number[];
  color: string;
  label: string;
  currentValue: number;
}) {
  const width = 460;
  const height = 110;
  const points = data.length > 1 ? data : [currentValue, currentValue];
  const coords = points.map((val, idx) => {
    const x = (idx / Math.max(1, points.length - 1)) * width;
    const y = height - (Math.max(0, Math.min(100, val)) / 100) * (height - 16) - 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${coords.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className="font-mono-tabular text-xl font-semibold text-slate-100">
          {currentValue.toFixed(1)}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-24 overflow-visible"
        role="img"
        aria-label={`${label} history chart`}
      >
        <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
        <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
        <path d={areaPath} fill={color} fillOpacity="0.14" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function SystemMonitorView({
  telemetry,
  history,
  onRefresh,
  onRequestConfirmation,
  onSpeakAdvisory,
}: SystemMonitorViewProps) {
  const [procFilter, setProcFilter] = useState('');

  if (!telemetry) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        Gathering real-time hardware telemetry...
      </div>
    );
  }

  const cpuSeries = history.map((h) => h.cpu);
  const memSeries = history.map((h) => h.memory);

  const filteredProcesses = telemetry.processes.filter((p) =>
    p.name.toLowerCase().includes(procFilter.toLowerCase())
  );

  const formatUptime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const handleAnalyzeOptimization = () => {
    const top = telemetry.processes[0];
    const message = telemetry.advisory
      ? telemetry.advisory
      : `Boss, system health is balanced. CPU is at ${telemetry.cpuPercent}% and memory is at ${telemetry.memoryPercent}%. Highest memory process is ${top?.name || 'core runtime'} at ${top?.memory ?? 0}%.`;
    onSpeakAdvisory(message);
  };

  const handleRequestInspect = (proc: SystemProcess) => {
    const protectedNames = ['systemd', 'init', 'kernel', 'node', 'tsx', 'wininit', 'csrss', 'lsass', 'svchost'];
    const isProtected = protectedNames.some((n) => proc.name.toLowerCase().includes(n));
    if (isProtected) {
      onSpeakAdvisory(
        `Boss, ${proc.name} (PID ${proc.pid}) is an essential system process. I cannot terminate core OS or runtime services.`
      );
      return;
    }
    onRequestConfirmation({
      id: `proc-${proc.pid}-${Date.now()}`,
      type: 'terminate_process',
      title: `Review Process ${proc.name}`,
      description: `Process "${proc.name}" (PID ${proc.pid}) is using ${proc.memory}% memory and ${proc.cpu}% CPU. Would you like to log an optimization flag for this task?`,
      detailLabel: `PID ${proc.pid} · Memory ${proc.memory}% · CPU ${proc.cpu}%`,
      payload: { pid: proc.pid, name: proc.name },
    });
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/15 pb-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Real-Time System Telemetry
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {telemetry.hardware.cpuModel} · {telemetry.hardware.cpuCores} Logical Cores ·{' '}
            {telemetry.hardware.arch} · Uptime {formatUptime(telemetry.uptimeSeconds)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAnalyzeOptimization}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/30 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            Analyze Optimization
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-cyan-500/15 text-cyan-200 border border-cyan-400/30 hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {telemetry.advisory && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-amber-100">{telemetry.advisory}</div>
        </div>
      )}

      {/* Primary KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Processor Load</span>
            <Cpu className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-mono-tabular text-2xl font-semibold text-slate-100 mt-2">
            {telemetry.cpuPercent.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {telemetry.hardware.cpuCores} cores · {telemetry.hardware.tier}
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Memory Usage</span>
            <MemoryStick className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="font-mono-tabular text-2xl font-semibold text-slate-100 mt-2">
            {telemetry.memoryPercent.toFixed(1)}%
          </div>
          <div className="font-mono-tabular text-xs text-slate-400 mt-1">
            {telemetry.memoryUsedGb} GB / {telemetry.memoryTotalGb} GB
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Storage Volume</span>
            <HardDrive className="w-4 h-4 text-blue-400" />
          </div>
          <div className="font-mono-tabular text-2xl font-semibold text-slate-100 mt-2">
            {telemetry.storagePercent.toFixed(1)}%
          </div>
          <div className="font-mono-tabular text-xs text-slate-400 mt-1">
            {telemetry.storageUsedGb} GB / {telemetry.storageTotalGb} GB
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Network & Sensors</span>
            {telemetry.internetConnected ? (
              <Wifi className="w-4 h-4 text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="font-mono-tabular text-2xl font-semibold text-slate-100 mt-2">
            {telemetry.internetConnected ? 'Online' : 'Offline'}
          </div>
          <div className="font-mono-tabular text-xs text-slate-400 mt-1">
            {telemetry.internetLatencyMs !== null
              ? `Latency ${telemetry.internetLatencyMs} ms`
              : 'Local mode ready'}
          </div>
        </div>
      </div>

      {/* Live animated SVG graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SparklineChart
          data={cpuSeries}
          color="#f59e0b"
          label="CPU Utilization Stream"
          currentValue={telemetry.cpuPercent}
        />
        <SparklineChart
          data={memSeries}
          color="#06b6d4"
          label="Memory Pressure Stream"
          currentValue={telemetry.memoryPercent}
        />
      </div>

      {/* Hardware Independence + Battery / Thermal + Network */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
            <Activity className="w-4 h-4" />
            Adaptive Hardware Profile
          </div>
          <div className="text-xs text-slate-300 space-y-1.5 pt-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Platform / Arch</span>
              <span className="font-mono-tabular">
                {telemetry.hardware.platform} / {telemetry.hardware.arch}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Compute Tier</span>
              <span className="font-mono-tabular text-amber-300">{telemetry.hardware.tier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Hologram Nodes</span>
              <span className="font-mono-tabular">{telemetry.hardware.recommendedParticleCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Telemetry Cadence</span>
              <span className="font-mono-tabular">{telemetry.hardware.recommendedPollingMs} ms</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
            <Battery className="w-4 h-4" />
            Power & Thermal Sensors
          </div>
          <div className="text-xs text-slate-300 space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Battery</span>
              <span className="font-mono-tabular">
                {telemetry.battery.available
                  ? `${telemetry.battery.percent}% (${telemetry.battery.charging ? 'Charging' : 'On Battery'})`
                  : 'AC / No battery sensor'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-slate-400" />
                Thermal Zone
              </span>
              <span className="font-mono-tabular">
                {telemetry.temperature.available
                  ? `${telemetry.temperature.celsius} °C`
                  : 'Sensor unavailable on host'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
            <Wifi className="w-4 h-4" />
            Active Network Interfaces
          </div>
          <div className="text-xs text-slate-300 space-y-1.5 pt-1 max-h-24 overflow-y-auto">
            {telemetry.networkInterfaces.length === 0 ? (
              <p className="text-slate-400">Loopback / Container isolated network</p>
            ) : (
              telemetry.networkInterfaces.map((iface) => (
                <div key={`${iface.name}-${iface.address}`} className="flex justify-between">
                  <span className="text-slate-400">{iface.name}</span>
                  <span className="font-mono-tabular">{iface.address}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Running Processes */}
      <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Running Processes & Resource Consumption
          </h3>
          <input
            type="text"
            value={procFilter}
            onChange={(e) => setProcFilter(e.target.value)}
            placeholder="Filter processes..."
            className="px-3 py-1.5 text-xs rounded-md bg-[#050810] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-4 font-medium">PID</th>
                <th className="py-2 pr-4 font-medium">Process Name</th>
                <th className="py-2 pr-4 font-medium">CPU %</th>
                <th className="py-2 pr-4 font-medium">Memory %</th>
                <th className="py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredProcesses.map((proc) => (
                <tr key={proc.pid} className="hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4 font-mono-tabular text-slate-400">{proc.pid}</td>
                  <td className="py-2.5 pr-4 font-medium text-slate-200">{proc.name}</td>
                  <td className="py-2.5 pr-4 font-mono-tabular text-amber-300">
                    {proc.cpu.toFixed(1)}%
                  </td>
                  <td className="py-2.5 pr-4 font-mono-tabular text-cyan-300">
                    {proc.memory.toFixed(1)}%
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleRequestInspect(proc)}
                      className="px-2.5 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200 transition-colors cursor-pointer"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
