import { useEffect, useState } from 'react';
import {
  Cpu,
  Hand,
  Mic,
  MicOff,
  Palette,
  RefreshCw,
  Shield,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  ActivationSettings,
  ActivityLogItem,
  AiEngineMode,
  HardwareProfile,
  ThemePreset,
  VoiceSettings,
} from '../types/ultron';

interface SettingsViewProps {
  voiceSettings: VoiceSettings;
  onVoiceChange: (next: VoiceSettings) => void;
  onTestVoice: () => void;
  browserVoices: SpeechSynthesisVoice[];
  activationSettings: ActivationSettings;
  onActivationChange: (next: ActivationSettings) => void;
  micTelemetry: { inputLevel: number; noiseFloor: number; clapCount: number };
  micActive: boolean;
  onToggleMicMonitor: () => void;
  aiMode: AiEngineMode;
  onAiModeChange: (mode: AiEngineMode) => void;
  geminiConfigured: boolean;
  theme: ThemePreset;
  onThemeChange: (t: ThemePreset) => void;
  hardware: HardwareProfile | null;
}

export function SettingsView({
  voiceSettings,
  onVoiceChange,
  onTestVoice,
  browserVoices,
  activationSettings,
  onActivationChange,
  micTelemetry,
  micActive,
  onToggleMicMonitor,
  aiMode,
  onAiModeChange,
  geminiConfigured,
  theme,
  onThemeChange,
  hardware,
}: SettingsViewProps) {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'action' | 'warning' | 'error'>('all');
  const [ollamaInfo, setOllamaInfo] = useState<{ available: boolean; models: string[] }>({
    available: false,
    models: [],
  });

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/logs?level=${logFilter}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void fetchLogs();
    fetch('/api/ai/ollama-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setOllamaInfo(d);
      })
      .catch(() => {});
  }, [logFilter]);

  const handleClearLogs = async () => {
    await fetch('/api/logs', { method: 'DELETE' });
    void fetchLogs();
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="border-b border-cyan-500/15 pb-4">
        <h2 className="font-display text-xl font-semibold text-slate-100">
          Settings, Voice & Security
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Completely free operation · Local & Cloud hybrid engine · Customizable female voice & three-clap calibration
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Female Voice System */}
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-amber-400" />
              Female Voice System
            </h3>
            <button
              type="button"
              onClick={onTestVoice}
              className="px-3 py-1.5 text-xs font-medium rounded bg-amber-500/20 text-amber-200 border border-amber-400/30 hover:bg-amber-500/30 cursor-pointer"
            >
              Test Voice
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1.5">
              <span className="text-slate-400 block">Voice Synthesis Engine</span>
              <select
                value={voiceSettings.engine}
                onChange={(e) =>
                  onVoiceChange({
                    ...voiceSettings,
                    engine: e.target.value as 'gemini' | 'browser',
                  })
                }
                className="w-full px-3 py-2 rounded bg-[#050810] border border-cyan-500/25 text-slate-100"
              >
                <option value="gemini">Neural Female Voice (Free Tier)</option>
                <option value="browser">Local Offline Female Voice</option>
              </select>
            </label>

            {voiceSettings.engine === 'gemini' ? (
              <label className="space-y-1.5">
                <span className="text-slate-400 block">Female Voice Persona</span>
                <select
                  value={voiceSettings.geminiVoice}
                  onChange={(e) =>
                    onVoiceChange({
                      ...voiceSettings,
                      geminiVoice: e.target.value as 'Kore' | 'Zephyr',
                    })
                  }
                  className="w-full px-3 py-2 rounded bg-[#050810] border border-cyan-500/25 text-slate-100"
                >
                  <option value="Kore">Kore (Calm & Intelligent)</option>
                  <option value="Zephyr">Zephyr (Warm & Conversational)</option>
                </select>
              </label>
            ) : (
              <label className="space-y-1.5">
                <span className="text-slate-400 block">System Female Voice</span>
                <select
                  value={voiceSettings.browserVoiceUri}
                  onChange={(e) =>
                    onVoiceChange({ ...voiceSettings, browserVoiceUri: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded bg-[#050810] border border-cyan-500/25 text-slate-100"
                >
                  {browserVoices.length === 0 ? (
                    <option value="">Default System Voice</option>
                  ) : (
                    browserVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}
          </div>

          <label className="block text-xs space-y-1.5">
            <span className="text-slate-400 block">Conversational Tone</span>
            <div className="grid grid-cols-4 gap-1.5">
              {(['calm', 'friendly', 'executive', 'poised'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onVoiceChange({ ...voiceSettings, tone: t })}
                  className={`py-1.5 rounded text-xs capitalize border cursor-pointer ${
                    voiceSettings.tone === t
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                      : 'bg-[#050810] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </label>

          <div className="space-y-3 text-xs pt-1">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Pitch</span>
                <span className="font-mono-tabular">{voiceSettings.pitch.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.75}
                max={1.3}
                step={0.05}
                value={voiceSettings.pitch}
                onChange={(e) =>
                  onVoiceChange({ ...voiceSettings, pitch: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Speaking Speed</span>
                <span className="font-mono-tabular">{voiceSettings.rate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.75}
                max={1.4}
                step={0.05}
                value={voiceSettings.rate}
                onChange={(e) =>
                  onVoiceChange({ ...voiceSettings, rate: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Voice Volume</span>
                <span className="font-mono-tabular">{Math.round(voiceSettings.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={voiceSettings.volume}
                onChange={(e) =>
                  onVoiceChange({ ...voiceSettings, volume: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </div>
          </div>

          <label className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs cursor-pointer">
            <span className="text-slate-300">Auto-speak ULTRON responses</span>
            <input
              type="checkbox"
              checked={voiceSettings.autoSpeak}
              onChange={(e) =>
                onVoiceChange({ ...voiceSettings, autoSpeak: e.target.checked })
              }
              className="accent-cyan-400 w-4 h-4"
            />
          </label>
        </div>

        {/* Wake-Word & Three-Clap Activation */}
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Hand className="w-4 h-4 text-cyan-400" />
              Wake-Word & Three-Clap Activation
            </h3>
            <button
              type="button"
              onClick={onToggleMicMonitor}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                micActive
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              {micActive ? 'Acoustic Sensor Active' : 'Enable Microphone'}
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-center justify-between p-2.5 rounded bg-[#050810] border border-slate-800 cursor-pointer">
              <div>
                <div className="text-slate-200 font-medium">Wake-Word Detection</div>
                <div className="text-slate-400">
                  Phrases: "Hey ULTRON", "ULTRON", "My buddy"
                </div>
              </div>
              <input
                type="checkbox"
                checked={activationSettings.wakeWordEnabled}
                onChange={(e) =>
                  onActivationChange({
                    ...activationSettings,
                    wakeWordEnabled: e.target.checked,
                  })
                }
                className="accent-cyan-400 w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded bg-[#050810] border border-slate-800 cursor-pointer">
              <div>
                <div className="text-slate-200 font-medium">Three-Clap Activation</div>
                <div className="text-slate-400">
                  Local bandpass transient detector (3 consecutive claps)
                </div>
              </div>
              <input
                type="checkbox"
                checked={activationSettings.clapEnabled}
                onChange={(e) =>
                  onActivationChange({
                    ...activationSettings,
                    clapEnabled: e.target.checked,
                  })
                }
                className="accent-amber-400 w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded bg-[#050810] border border-slate-800 cursor-pointer">
              <div>
                <div className="text-slate-200 font-medium">Microphone Privacy Mute</div>
                <div className="text-slate-400">Immediately suspends all audio capture</div>
              </div>
              <input
                type="checkbox"
                checked={activationSettings.micMuted}
                onChange={(e) =>
                  onActivationChange({
                    ...activationSettings,
                    micMuted: e.target.checked,
                  })
                }
                className="accent-rose-400 w-4 h-4"
              />
            </label>
          </div>

          <div className="space-y-3 text-xs pt-1">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Clap Sensitivity</span>
                <span className="font-mono-tabular">
                  {activationSettings.clapSensitivity.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={1.2}
                max={3.5}
                step={0.1}
                value={activationSettings.clapSensitivity}
                onChange={(e) =>
                  onActivationChange({
                    ...activationSettings,
                    clapSensitivity: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Background Noise Filter</span>
                <span className="font-mono-tabular">
                  {Math.round(activationSettings.noiseFilterThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.25}
                step={0.01}
                value={activationSettings.noiseFilterThreshold}
                onChange={(e) =>
                  onActivationChange({
                    ...activationSettings,
                    noiseFilterThreshold: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Live Acoustic Calibration Meter */}
            <div className="p-3 rounded-lg bg-[#050810] border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Live Clap Bandpass Level</span>
                <span className="font-mono-tabular text-amber-300">
                  Clap Sequence: {micTelemetry.clapCount} / 3
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-amber-400 transition-[width] duration-75"
                  style={{ width: `${Math.min(100, Math.round(micTelemetry.inputLevel * 100))}%` }}
                />
              </div>
              <div className="text-xs font-mono-tabular text-slate-500">
                Adaptive noise floor: {(micTelemetry.noiseFloor * 100).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* AI Engine & Hardware Independence */}
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-5 space-y-4">
          <h3 className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            AI Brain & Hardware Configuration
          </h3>

          <div className="space-y-2 text-xs">
            <span className="text-slate-400 block">Processing Mode (100% Free)</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'hybrid', label: 'Hybrid Auto' },
                  { id: 'cloud', label: 'Cloud Free' },
                  { id: 'ollama', label: 'Local Ollama' },
                  { id: 'local', label: 'Offline Engine' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onAiModeChange(m.id)}
                  className={`py-2 px-2 rounded border text-xs font-medium cursor-pointer whitespace-nowrap ${
                    aiMode === m.id
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                      : 'bg-[#050810] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-slate-400 pt-1">
              {aiMode === 'ollama'
                ? ollamaInfo.available
                  ? `Ollama detected on localhost (${ollamaInfo.models.join(', ') || 'ready'}).`
                  : 'Ollama not running on localhost:11434 yet. Using zero-dependency Local Engine.'
                : geminiConfigured
                ? 'Server-side Gemini free-tier NLU is active with automatic Local Engine offline fallback.'
                : 'Running Local Offline NLU Engine. Basic computer, file, and telemetry operations work without cloud access.'}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-2">
            <h4 className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              Holographic Interface Theme
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'amber-cyan', label: 'Amber & Cyan' },
                  { id: 'pure-cyan', label: 'Electric Cyan' },
                  { id: 'cobalt-ice', label: 'Cobalt Ice' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onThemeChange(preset.id)}
                  className={`py-2 px-2 rounded border text-xs font-medium cursor-pointer ${
                    theme === preset.id
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                      : 'bg-[#050810] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {hardware && (
            <div className="pt-2 border-t border-slate-800 text-xs text-slate-400 space-y-1">
              <div>
                Auto-detected Host: <span className="text-slate-200">{hardware.cpuModel}</span>
              </div>
              <div className="font-mono-tabular">
                {hardware.cpuCores} cores · {hardware.totalRamGb} GB RAM · Profile: {hardware.tier}
              </div>
            </div>
          )}
        </div>

        {/* Security, Activity & Error Logs */}
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              Security Activity & Error Logs
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={fetchLogs}
                className="p-1.5 rounded border border-slate-700 text-slate-300 hover:border-cyan-400/40 cursor-pointer"
                title="Refresh Logs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                className="p-1.5 rounded border border-slate-700 text-rose-300 hover:border-rose-400/40 cursor-pointer"
                title="Clear Logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded bg-[#050810] border border-slate-800 w-fit">
            {(['all', 'action', 'warning', 'error'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLogFilter(lvl)}
                className={`px-2.5 py-1 text-xs rounded capitalize cursor-pointer ${
                  logFilter === lvl
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-400">No entries recorded.</p>
            ) : (
              logs.map((l) => (
                <div
                  key={l.id}
                  className="p-2.5 rounded bg-[#050810] border border-slate-800/80 text-xs flex items-start justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="text-slate-200">{l.message}</div>
                    <div className="text-slate-500">
                      {l.source} · {l.level.toUpperCase()}
                    </div>
                  </div>
                  <span className="font-mono-tabular text-slate-500 shrink-0">
                    {new Date(l.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
