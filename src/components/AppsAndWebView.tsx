import { useState } from 'react';
import {
  Camera,
  Clipboard,
  Download,
  ExternalLink,
  Globe,
  Maximize2,
  Minimize2,
  Monitor,
  Play,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import { AppEntry } from '../types/ultron';

interface AppsAndWebViewProps {
  apps: AppEntry[];
  onAppAction: (appId: string, action: 'open' | 'minimize' | 'maximize' | 'close') => void;
  volume: number;
  onVolumeChange: (val: number) => void;
  brightness: number;
  onBrightnessChange: (val: number) => void;
  onCaptureScreenshot: () => void;
  onSpeak: (text: string) => void;
}

const QUICK_SITES = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Facebook', url: 'https://www.facebook.com' },
  { name: 'GitHub', url: 'https://github.com' },
];

export function AppsAndWebView({
  apps,
  onAppAction,
  volume,
  onVolumeChange,
  brightness,
  onBrightnessChange,
  onCaptureScreenshot,
  onSpeak,
}: AppsAndWebViewProps) {
  const [appQuery, setAppQuery] = useState('');
  const [webInput, setWebInput] = useState('');
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const [clipboardItems, setClipboardItems] = useState<string[]>([
    'ULTRON Core Workspace ready for Boss.',
  ]);
  const [clipInput, setClipInput] = useState('');
  const [webError, setWebError] = useState<string | null>(null);

  const filteredApps = apps.filter(
    (a) =>
      a.name.toLowerCase().includes(appQuery.toLowerCase()) ||
      a.category.toLowerCase().includes(appQuery.toLowerCase())
  );

  const handleStageUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebError(null);
    const raw = webInput.trim();
    if (!raw) return;

    // If not a domain/URL, treat as Google search
    const looksLikeUrl = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw);
    const target = looksLikeUrl
      ? raw
      : `https://www.google.com/search?q=${encodeURIComponent(raw)}`;

    try {
      const res = await fetch('/api/desktop/validate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStagedUrl(data.url);
      onSpeak(`Staged ${data.url} for launch, Boss.`);
    } catch (err) {
      setWebError(err instanceof Error ? err.message : 'Invalid URL');
    }
  };

  const triggerServerAutomation = async (
    action: 'volume_set' | 'brightness_set' | 'screenshot' | 'settings' | 'clipboard_read' | 'clipboard_write',
    value?: number | string
  ) => {
    try {
      const res = await fetch('/api/desktop/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, value }),
      });
      return await res.json();
    } catch {
      return null;
    }
  };

  const handleReadClipboard = async () => {
    const srv = await triggerServerAutomation('clipboard_read');
    if (srv?.executedOnHost && srv?.data?.text) {
      const text = String(srv.data.text);
      setClipboardItems((prev) => [text, ...prev.filter((i) => i !== text)].slice(0, 6));
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setClipboardItems((prev) => [text, ...prev.filter((i) => i !== text)].slice(0, 6));
      }
    } catch {
      onSpeak('Clipboard permission was not granted by the browser, Boss.');
    }
  };

  const handleWriteClipboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clipInput.trim()) return;
    const text = clipInput.trim();
    void triggerServerAutomation('clipboard_write', text);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // keep local history
    }
    setClipboardItems((prev) => [text, ...prev].slice(0, 6));
    setClipInput('');
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/15 pb-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Desktop & Web Control Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Application window control · Safe web navigation · Windows automation & companion bridge
          </p>
        </div>

        <a
          href="/api/desktop/companion-script"
          download="ultron-windows-companion.ps1"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-amber-500/15 text-amber-200 border border-amber-400/30 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Download Windows Companion (.ps1)
        </a>
      </div>

      {/* Application Launcher & Window Manager */}
      <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-cyan-400" />
            Installed Applications & Window Manager
          </h3>
          <input
            type="text"
            value={appQuery}
            onChange={(e) => setAppQuery(e.target.value)}
            placeholder="Search installed software..."
            className="px-3 py-1.5 text-xs rounded-md bg-[#050810] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredApps.map((app) => (
            <div
              key={app.id}
              className="rounded-lg border border-slate-800 bg-[#050810] p-3.5 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-100">{app.name}</div>
                  <div className="text-xs text-slate-400">
                    {app.category} · <span className="text-cyan-300">{app.status}</span>
                  </div>
                </div>
                {app.webFallbackUrl && (
                  <a
                    href={app.webFallbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${app.name} Web`}
                    className="p-1.5 rounded text-slate-400 hover:text-cyan-300"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onAppAction(app.id, 'open')}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/25 cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                  {app.status === 'closed' ? 'Open' : 'Focus'}
                </button>
                <button
                  type="button"
                  onClick={() => onAppAction(app.id, 'minimize')}
                  title="Minimize"
                  className="p-1.5 rounded border border-slate-700 text-slate-300 hover:border-cyan-400/40 cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onAppAction(app.id, 'maximize')}
                  title="Maximize"
                  className="p-1.5 rounded border border-slate-700 text-slate-300 hover:border-cyan-400/40 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onAppAction(app.id, 'close')}
                  title="Close"
                  className="p-1.5 rounded border border-slate-700 text-rose-300 hover:border-rose-400/40 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Website & Search Launcher */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 space-y-4">
          <h3 className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            Web Navigation & Search
          </h3>
          <form onSubmit={handleStageUrl} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={webInput}
                onChange={(e) => setWebInput(e.target.value)}
                placeholder="Enter website URL or Google search query..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-[#050810] border border-cyan-500/25 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 hover:bg-cyan-500/30 cursor-pointer whitespace-nowrap"
            >
              Prepare Link
            </button>
          </form>

          {webError && <p className="text-xs text-rose-300">{webError}</p>}

          {stagedUrl && (
            <div className="p-3 rounded-lg border border-amber-400/30 bg-amber-500/10 flex items-center justify-between gap-3">
              <span className="text-xs text-amber-100 truncate">{stagedUrl}</span>
              <a
                href={stagedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-amber-500/25 text-amber-100 hover:bg-amber-500/35 shrink-0"
              >
                Open Tab
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {QUICK_SITES.map((site) => (
              <a
                key={site.name}
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-700 bg-[#050810] text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200 transition-colors"
              >
                {site.name}
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            ))}
          </div>
        </div>

        {/* Windows Automation: Audio, Display, Screenshot, Clipboard */}
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 space-y-4">
          <h3 className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-amber-400" />
            Audio, Display & Clipboard Automation
          </h3>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Master Output Volume</span>
                <span className="font-mono-tabular">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onVolumeChange(val);
                  void triggerServerAutomation('volume_set', Math.round(val * 100));
                }}
                className="w-full accent-cyan-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Display Brightness Calibration</span>
                <span className="font-mono-tabular">{brightness}%</span>
              </div>
              <input
                type="range"
                min={60}
                max={120}
                step={2}
                value={brightness}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onBrightnessChange(val);
                  void triggerServerAutomation('brightness_set', Math.min(100, val));
                }}
                className="w-full accent-amber-400"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  const res = await triggerServerAutomation('screenshot');
                  if (!res?.executedOnHost) {
                    onCaptureScreenshot();
                  } else {
                    onSpeak('Desktop screenshot saved to your workspace, Boss.');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Take Screenshot
              </button>
              <button
                type="button"
                onClick={() => void triggerServerAutomation('settings')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#050810] border border-slate-700 text-slate-200 hover:border-cyan-400/40 cursor-pointer"
              >
                <Monitor className="w-3.5 h-3.5" />
                Windows Settings
              </button>
              <button
                type="button"
                onClick={handleReadClipboard}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#050810] border border-slate-700 text-slate-200 hover:border-cyan-400/40 cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5" />
                Read Clipboard
              </button>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 space-y-2">
            <form onSubmit={handleWriteClipboard} className="flex gap-2">
              <input
                type="text"
                value={clipInput}
                onChange={(e) => setClipInput(e.target.value)}
                placeholder="Save text to clipboard..."
                className="flex-1 px-3 py-1.5 text-xs rounded bg-[#050810] border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                Copy
              </button>
            </form>
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {clipboardItems.map((item, idx) => (
                <div
                  key={`${idx}-${item.slice(0, 12)}`}
                  className="text-xs text-slate-400 truncate bg-[#050810] px-2.5 py-1 rounded border border-slate-800/80"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
