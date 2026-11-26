import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FolderOpen,
  Maximize,
  Mic,
  MicOff,
  Minimize2,
  OctagonAlert,
  Phone,
  RotateCcw,
  Send,
  Settings,
  Terminal,
  Volume2,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { UltronHologram } from './components/UltronHologram';
import { SystemMonitorView } from './components/SystemMonitorView';
import { FileManagerView } from './components/FileManagerView';
import { AppsAndWebView } from './components/AppsAndWebView';
import { CommsView } from './components/CommsView';
import { SettingsView } from './components/SettingsView';
import { UltronAudioEngine } from './services/audioEngine';
import {
  ActivationSettings,
  AiEngineMode,
  AppEntry,
  ChatMessage,
  ContactItem,
  HardwareProfile,
  PendingConfirmation,
  SystemTelemetry,
  ThemePreset,
  UltronState,
  VoiceSettings,
  WorkspaceTab,
} from './types/ultron';

const INITIAL_GREETING =
  'Welcome back, Boss. ULTRON is online. How can I assist you today?';

const INITIAL_CONTACTS: ContactItem[] = [
  {
    id: 'c-1',
    name: 'Alex Mercer',
    role: 'Operations Lead',
    phone: '+1 555 014 2890',
    whatsapp: '+15550142890',
    voipHandle: 'alex.mercer@voip.local',
    preferredService: 'Phone Link',
  },
  {
    id: 'c-2',
    name: 'Maya Lin',
    role: 'Systems Architect',
    phone: '+1 555 019 4412',
    whatsapp: '+15550194412',
    voipHandle: 'maya.lin@voip.local',
    preferredService: 'WhatsApp',
  },
  {
    id: 'c-3',
    name: 'Jordan Vance',
    role: 'Executive Desk',
    phone: '+1 555 011 8834',
    whatsapp: '+15550118834',
    voipHandle: 'jordan.vance@voip.local',
    preferredService: 'VoIP',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('core');
  const [ultronState, setUltronState] = useState<UltronState>('idle');
  const [halted, setHalted] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [theme, setTheme] = useState<ThemePreset>('amber-cyan');
  const [brightness, setBrightness] = useState(100);

  // AI & Voice state
  const [aiMode, setAiMode] = useState<AiEngineMode>('hybrid');
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    engine: 'gemini',
    geminiVoice: 'Kore',
    browserVoiceUri: '',
    tone: 'calm',
    pitch: 1.02,
    rate: 1.0,
    volume: 0.85,
    autoSpeak: true,
  });
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Wake-word & Three-Clap state
  const [activationSettings, setActivationSettings] = useState<ActivationSettings>({
    wakeWordEnabled: true,
    wakePhrases: ['hey ultron', 'ultron', 'my buddy'],
    clapEnabled: true,
    clapSensitivity: 2.2,
    noiseFilterThreshold: 0.06,
    micMuted: false,
  });
  const [micActive, setMicActive] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micTelemetry, setMicTelemetry] = useState({
    inputLevel: 0,
    noiseFloor: 0.015,
    clapCount: 0,
  });

  // Conversation & commands
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-greet',
      role: 'ultron',
      text: INITIAL_GREETING,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [recentCommands, setRecentCommands] = useState<string[]>([
    'Check my computer performance',
    'Find all PDF files',
    'Open YouTube and search for tutorials',
  ]);
  const [commandInput, setCommandInput] = useState('');
  const [audioBars, setAudioBars] = useState<number[]>(new Array(24).fill(0.08));

  // Telemetry & Hardware
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<
    Array<{ time: string; cpu: number; memory: number }>
  >([]);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const lastAdvisorySpokenRef = useRef<number>(0);

  // Apps, Files, Comms
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [fileRefreshSignal, setFileRefreshSignal] = useState(0);
  const [contacts, setContacts] = useState<ContactItem[]>(INITIAL_CONTACTS);
  const [callHistory, setCallHistory] = useState<
    Array<{
      id: string;
      contactName: string;
      service: string;
      timestamp: string;
      status: string;
    }>
  >([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [hasGreetedAudio, setHasGreetedAudio] = useState(false);

  // Refs for stable callbacks
  const audioEngineRef = useRef<UltronAudioEngine | null>(null);
  const audioLevelRef = useRef<number>(0);
  const activationRef = useRef(activationSettings);
  const voiceRef = useRef(voiceSettings);
  const messagesRef = useRef(messages);
  const haltedRef = useRef(halted);
  const aiModeRef = useRef(aiMode);

  activationRef.current = activationSettings;
  voiceRef.current = voiceSettings;
  messagesRef.current = messages;
  haltedRef.current = halted;
  aiModeRef.current = aiMode;

  if (!audioEngineRef.current) {
    audioEngineRef.current = new UltronAudioEngine();
  }

  const speakResponse = useCallback((text: string) => {
    const engine = audioEngineRef.current;
    if (!engine || haltedRef.current) return;
    if (!voiceRef.current.autoSpeak) return;

    void engine.speak(
      text,
      voiceRef.current,
      () => setUltronState('speaking'),
      () => setUltronState((prev) => (prev === 'halted' ? 'halted' : 'idle'))
    );
  }, []);

  const appendMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const handleAppAction = useCallback(
    async (appId: string, action: 'open' | 'minimize' | 'maximize' | 'close') => {
      if (haltedRef.current) return;
      setApps((prev) =>
        prev.map((a) => {
          if (a.id !== appId && !a.name.toLowerCase().includes(appId.toLowerCase())) {
            return a;
          }
          const nextStatus =
            action === 'close'
              ? 'closed'
              : action === 'minimize'
              ? 'minimized'
              : action === 'maximize'
              ? 'maximized'
              : 'running';
          return { ...a, status: nextStatus };
        })
      );

      try {
        await fetch('/api/desktop/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId, operation: action === 'open' ? 'open' : action }),
        });
      } catch {
        // ignore
      }
    },
    []
  );

  const captureScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `ultron-snapshot-${Date.now()}.png`;
      link.click();
      appendMessage({
        role: 'system',
        text: 'Viewport snapshot captured and saved as PNG.',
      });
    }
  }, [appendMessage]);

  const executeClientActions = useCallback(
    (actions: Array<{ type: string; payload: Record<string, unknown> }>) => {
      for (const act of actions) {
        if (act.type === 'navigate_tab' && typeof act.payload.tab === 'string') {
          setActiveTab(act.payload.tab as WorkspaceTab);
        } else if (act.type === 'refresh_files') {
          setFileRefreshSignal((s) => s + 1);
        } else if (act.type === 'request_confirmation') {
          setPendingConfirmation(act.payload as unknown as PendingConfirmation);
        } else if (act.type === 'app_control') {
          const appName = String(act.payload.appName || '');
          const op = (act.payload.operation || 'open') as
            | 'open'
            | 'minimize'
            | 'maximize'
            | 'close';
          void handleAppAction(appName, op);
        } else if (act.type === 'system_control') {
          const action = String(act.payload.action || '');
          const val = typeof act.payload.value === 'number' ? act.payload.value : undefined;
          if (action === 'screenshot') {
            captureScreenshot();
          } else if (action === 'volume_mute') {
            setVoiceSettings((v) => ({ ...v, volume: 0 }));
          } else if (action === 'volume_up') {
            setVoiceSettings((v) => ({ ...v, volume: Math.min(1, v.volume + 0.15) }));
          } else if (action === 'volume_down') {
            setVoiceSettings((v) => ({ ...v, volume: Math.max(0, v.volume - 0.15) }));
          } else if (action === 'volume_set' && val !== undefined) {
            setVoiceSettings((v) => ({ ...v, volume: Math.max(0, Math.min(1, val / 100)) }));
          } else if (action === 'settings') {
            setActiveTab('settings');
          }
        }
      }
    },
    [captureScreenshot, handleAppAction]
  );

  const sendCommand = useCallback(
    async (rawText: string) => {
      const cmd = rawText.trim();
      if (!cmd) return;
      if (haltedRef.current) {
        appendMessage({
          role: 'system',
          text: 'Emergency Stop is active. Resume ULTRON systems before issuing commands.',
        });
        return;
      }

      setHasGreetedAudio(true);
      setRecentCommands((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 8));
      appendMessage({ role: 'user', text: cmd });
      setUltronState('thinking');

      try {
        const historyPayload = messagesRef.current
          .filter((m) => m.role === 'user' || m.role === 'ultron')
          .slice(-8)
          .map((m) => ({
            role: m.role as 'user' | 'ultron',
            text: m.text,
          }));

        const res = await fetch('/api/ai/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: cmd,
            history: historyPayload,
            mode: aiModeRef.current,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Command processing failed');
        }

        appendMessage({
          role: 'ultron',
          text: data.reply,
          intent: data.intent,
          engineUsed: data.engineUsed,
          actionCard: data.actionCard,
        });

        if (Array.isArray(data.clientActions)) {
          executeClientActions(data.clientActions);
        }

        speakResponse(data.reply);
        if (!voiceRef.current.autoSpeak) {
          setUltronState('idle');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to process command.';
        appendMessage({
          role: 'system',
          text: `Boss, an error occurred: ${msg}`,
        });
        setUltronState('idle');
      }
    },
    [appendMessage, executeClientActions, speakResponse]
  );

  // Load initial health, apps, browser female voices
  useEffect(() => {
    const init = async () => {
      try {
        const [healthRes, appsRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/desktop/apps'),
        ]);
        if (healthRes.ok) {
          const h = await healthRes.json();
          setGeminiConfigured(Boolean(h.geminiConfigured));
          setHardware(h.hardware || null);
          setHalted(Boolean(h.halted));
          if (h.halted) setUltronState('halted');
        }
        if (appsRes.ok) {
          const a = await appsRes.json();
          const list = (a.apps || []).map((item: Omit<AppEntry, 'status'>) => ({
            ...item,
            status: 'closed' as const,
          }));
          setApps(list);
        }
      } catch {
        // ignore startup network error
      }
    };
    void init();

    const loadVoices = () => {
      if (audioEngineRef.current) {
        const voices = audioEngineRef.current.getBrowserFemaleVoices();
        setBrowserVoices(voices);
        if (voices.length > 0) {
          setVoiceSettings((prev) =>
            prev.browserVoiceUri ? prev : { ...prev, browserVoiceUri: voices[0].voiceURI }
          );
        }
      }
    };
    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    }

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      }
      audioEngineRef.current?.dispose();
    };
  }, []);

  // Live Telemetry polling adapted to detected hardware tier
  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch('/api/system/telemetry');
      if (!res.ok) return;
      const data = (await res.json()) as SystemTelemetry;
      setTelemetry(data);
      setHardware(data.hardware);
      setTelemetryHistory((prev) => [
        ...prev.slice(-29),
        {
          time: new Date(data.timestamp).toLocaleTimeString(),
          cpu: data.cpuPercent,
          memory: data.memoryPercent,
        },
      ]);

      if (data.advisory && Date.now() - lastAdvisorySpokenRef.current > 120000) {
        lastAdvisorySpokenRef.current = Date.now();
        appendMessage({
          role: 'ultron',
          text: data.advisory,
        });
      }
    } catch {
      // ignore transient poll error
    }
  }, [appendMessage]);

  useEffect(() => {
    void fetchTelemetry();
    const intervalMs = hardware?.recommendedPollingMs || 2500;
    const id = window.setInterval(() => {
      void fetchTelemetry();
    }, intervalMs);
    return () => clearInterval(id);
  }, [fetchTelemetry, hardware?.recommendedPollingMs]);

  // Audio-wave bar & 3D core amplitude animation loop
  useEffect(() => {
    let raf = 0;
    let lastUpdate = 0;
    const loop = (ts: number) => {
      const engine = audioEngineRef.current;
      if (engine) {
        const outLevel = engine.getOutputLevel();
        const combined =
          ultronState === 'speaking'
            ? Math.max(0.18, outLevel)
            : ultronState === 'listening'
            ? Math.max(0.14, micTelemetry.inputLevel * 0.9)
            : ultronState === 'thinking'
            ? 0.22
            : 0.04;
        audioLevelRef.current = combined;

        if (ts - lastUpdate > 65) {
          lastUpdate = ts;
          if (ultronState === 'speaking') {
            setAudioBars(engine.getOutputSpectrum(24));
          } else if (ultronState === 'listening') {
            const lvl = Math.max(0.12, micTelemetry.inputLevel);
            setAudioBars(
              Array.from({ length: 24 }, (_, idx) =>
                Math.min(1, lvl * (0.55 + Math.abs(Math.sin(ts * 0.008 + idx * 0.6)) * 0.65))
              )
            );
          } else if (ultronState === 'thinking') {
            setAudioBars(
              Array.from({ length: 24 }, (_, idx) =>
                0.15 + 0.35 * Math.abs(Math.sin(ts * 0.006 + idx * 0.45))
              )
            );
          } else {
            setAudioBars(
              Array.from({ length: 24 }, (_, idx) =>
                0.06 + 0.05 * Math.abs(Math.sin(ts * 0.002 + idx * 0.4))
              )
            );
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ultronState, micTelemetry.inputLevel]);

  const activateWakeSequence = useCallback(
    (sourceLabel: string) => {
      if (haltedRef.current) return;
      setHasGreetedAudio(true);
      setActiveTab('core');
      setUltronState('listening');
      audioEngineRef.current?.triggerManualListenWindow();
      const ack = "I'm here, Boss. What can I do for you?";
      appendMessage({
        role: 'system',
        text: `Activated via ${sourceLabel}.`,
      });
      appendMessage({
        role: 'ultron',
        text: ack,
      });
      speakResponse(ack);
    },
    [appendMessage, speakResponse]
  );

  const toggleMicMonitor = useCallback(async () => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    if (micActive) {
      engine.stopMicrophoneMonitor();
      engine.stopWakeWordListener();
      setMicActive(false);
      setSpeechActive(false);
      return;
    }

    const ok = await engine.startMicrophoneMonitor(() => activationRef.current, {
      onTelemetry: (data) => setMicTelemetry(data),
      onThreeClaps: () => activateWakeSequence('Three-Clap Detection'),
      onError: (msg) =>
        appendMessage({
          role: 'system',
          text: `Microphone notice: ${msg}`,
        }),
    });

    if (ok) {
      setMicActive(true);
      engine.startWakeWordListener(() => activationRef.current, {
        onWakeWord: (phrase) => activateWakeSequence(`Wake Phrase "${phrase}"`),
        onCommandTranscript: (transcript) => {
          setInterimTranscript('');
          void sendCommand(transcript);
        },
        onInterim: (text) => setInterimTranscript(text),
        onStatusChange: (active) => setSpeechActive(active),
      });
    }
  }, [activateWakeSequence, appendMessage, micActive, sendCommand]);

  const handlePushToTalk = async () => {
    if (haltedRef.current) return;
    const engine = audioEngineRef.current;
    if (!engine) return;

    if (!micActive) {
      await toggleMicMonitor();
    }

    setUltronState('listening');
    engine.triggerManualListenWindow();

    if (!engine.supportsSpeechRecognition()) {
      appendMessage({
        role: 'system',
        text: 'Listening for 4.5 seconds (Audio Transcription Mode)...',
      });
      try {
        const transcript = await engine.recordFallbackCommandClip(4500);
        if (transcript) {
          void sendCommand(transcript);
        } else {
          setUltronState('idle');
        }
      } catch (err) {
        appendMessage({
          role: 'system',
          text: err instanceof Error ? err.message : 'Unable to transcribe audio.',
        });
        setUltronState('idle');
      }
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingConfirmation) return;
    const conf = pendingConfirmation;
    setPendingConfirmation(null);
    audioEngineRef.current?.playChime('confirm');

    try {
      if (conf.type === 'delete_file') {
        const res = await fetch('/api/files/entry', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: conf.payload.path, confirmed: true }),
        });
        if (!res.ok) throw new Error('Delete failed');
        setFileRefreshSignal((s) => s + 1);
        const msg = `Deleted "${conf.payload.path}" as authorized, Boss.`;
        appendMessage({ role: 'ultron', text: msg });
        speakResponse(msg);
      } else if (conf.type === 'overwrite_file') {
        const res = await fetch('/api/files/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...conf.payload, overwrite: true }),
        });
        if (!res.ok) throw new Error('Overwrite failed');
        setFileRefreshSignal((s) => s + 1);
        const msg = 'File transfer completed with overwrite authorization, Boss.';
        appendMessage({ role: 'ultron', text: msg });
        speakResponse(msg);
      } else if (conf.type === 'organize_files') {
        const res = await fetch('/api/files/organize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: conf.payload.folder || 'Downloads' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setFileRefreshSignal((s) => s + 1);
        const msg = `Organization complete, Boss. Sorted ${data.movedCount} file(s) inside ${conf.payload.folder}.`;
        appendMessage({ role: 'ultron', text: msg });
        speakResponse(msg);
      } else if (conf.type === 'initiate_call') {
        const contact = String(conf.payload.contactName || 'Contact');
        const targetHandle = String(conf.payload.targetHandle || contact);
        const service = String(conf.payload.service || 'Phone Link');
        const res = await fetch('/api/comms/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact, targetHandle, service, confirmed: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Call audit failed');
        setCallHistory((prev) => [
          {
            id: `call-${Date.now()}`,
            contactName: contact,
            service,
            timestamp: new Date().toISOString(),
            status: data.executedOnHost ? 'Initiated on Windows' : 'Authorized & Staged',
          },
          ...prev,
        ]);
        const msg = `Calling ${contact} via ${service} now, Boss.`;
        appendMessage({
          role: 'ultron',
          text: msg,
          actionCard: data.uri
            ? {
                kind: 'website',
                title: `Launch ${service} Call`,
                subtitle: data.uri,
                url: data.uri,
              }
            : undefined,
        });
        speakResponse(msg);
      } else if (conf.type === 'terminate_process') {
        const msg = `Logged review flag for ${conf.payload.name} (PID ${conf.payload.pid}), Boss.`;
        appendMessage({ role: 'ultron', text: msg });
        speakResponse(msg);
      }
    } catch (err) {
      appendMessage({
        role: 'system',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    }
  };

  const toggleEmergencyStop = async () => {
    const next = !halted;
    setHalted(next);
    setUltronState(next ? 'halted' : 'idle');
    if (next) {
      audioEngineRef.current?.stopSpeech();
      audioEngineRef.current?.playChime('halt');
      setPendingConfirmation(null);
    } else {
      audioEngineRef.current?.playChime('confirm');
    }
    try {
      await fetch('/api/safety/halt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ halted: next }),
      });
    } catch {
      // ignore
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // ignore fullscreen restrictions in embedded iframe
    }
  };

  const handleGreetBoss = () => {
    setHasGreetedAudio(true);
    audioEngineRef.current?.playChime('activate');
    speakResponse(INITIAL_GREETING);
  };

  const handleSubmitCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    const text = commandInput;
    setCommandInput('');
    void sendCommand(text);
  };

  const stateLabel =
    ultronState === 'halted'
      ? 'Emergency Halted'
      : ultronState === 'speaking'
      ? 'Speaking to Boss'
      : ultronState === 'listening'
      ? 'Listening for Command'
      : ultronState === 'thinking'
      ? 'Processing Intent'
      : 'Standby · Ready';

  const isAmberTheme = theme === 'amber-cyan';
  const hudCardClass = isAmberTheme
    ? 'border-amber-500/25 bg-[#0c0704]/90'
    : 'border-cyan-500/20 bg-[#070c18]/90';
  const hudSubTileClass = isAmberTheme
    ? 'bg-[#070402] border-amber-500/15'
    : 'bg-[#050810] border-slate-800';

  return (
    <div
      className={`h-screen w-screen overflow-hidden text-slate-100 flex flex-col ${
        isAmberTheme ? 'bg-[#070402]' : 'bg-[#050810]'
      }`}
      style={{ filter: `brightness(${brightness}%)` }}
    >
      {/* Top 3-Zone Navigation & Telemetry Bar */}
      <header
        className={`h-14 px-5 border-b flex items-center justify-between gap-6 shrink-0 z-30 ${
          isAmberTheme
            ? 'border-amber-500/25 bg-[#0c0704]'
            : 'border-cyan-500/20 bg-[#070c18]'
        }`}
      >
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('core')}
          className="font-display text-lg font-bold tracking-wider text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
        >
          ULTRON
        </button>

        {/* Zone 2: Primary Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto">
          {(
            [
              { id: 'core', label: 'Core' },
              { id: 'system', label: 'System' },
              { id: 'files', label: 'Files' },
              { id: 'apps', label: 'Apps & Web' },
              { id: 'comms', label: 'Comms' },
              { id: 'settings', label: 'Settings' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? isAmberTheme
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/35'
                    : 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Mic, Connection, Window Controls & Emergency Stop */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleMicMonitor}
            title={micActive ? 'Disable Wake-Word & Clap Mic' : 'Enable Wake-Word & Clap Mic'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              micActive && !activationSettings.micMuted
                ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700 bg-[#050810] text-slate-400 hover:text-slate-200'
            }`}
          >
            {micActive && !activationSettings.micMuted ? (
              <Mic className="w-3.5 h-3.5" />
            ) : (
              <MicOff className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">
              {micActive && !activationSettings.micMuted ? 'Mic Ready' : 'Mic Off'}
            </span>
          </button>

          <div
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300 border border-slate-800 rounded-md bg-[#050810] whitespace-nowrap shrink-0"
            title="Live Host Internet Status"
          >
            {telemetry?.internetConnected ?? true ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{telemetry?.internetConnected ?? true ? 'Online' : 'Local'}</span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen Window"
            className="p-1.5 rounded-md border border-slate-800 bg-[#050810] text-slate-300 hover:border-cyan-400/40 cursor-pointer hidden sm:inline-flex"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize className="w-3.5 h-3.5" />
            )}
          </button>

          {window.ultronDesktop?.isDesktop && (
            <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
              <button
                type="button"
                onClick={() => window.ultronDesktop?.minimize()}
                title="Minimize Window"
                className="p-1.5 rounded-md border border-slate-800 bg-[#050810] text-slate-300 hover:border-cyan-400/40 cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => window.ultronDesktop?.maximizeToggle()}
                title="Maximize / Restore Window"
                className="p-1.5 rounded-md border border-slate-800 bg-[#050810] text-slate-300 hover:border-cyan-400/40 cursor-pointer"
              >
                <Maximize className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => window.ultronDesktop?.close()}
                title="Close ULTRON"
                className="p-1.5 rounded-md border border-slate-800 bg-[#050810] text-rose-300 hover:border-rose-400/40 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={toggleEmergencyStop}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              halted
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 border-rose-400/40 text-rose-200 hover:bg-rose-500/30'
            }`}
          >
            <OctagonAlert className="w-3.5 h-3.5" />
            {halted ? 'Resume' : 'Emergency Stop'}
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="flex-1 relative overflow-hidden">
        {activeTab === 'core' && (
          <div className="relative w-full h-full">
            {/* Full-Viewport 3D Holographic Core */}
            <UltronHologram
              state={ultronState}
              theme={theme}
              zoomScale={zoomScale}
              onZoomChange={setZoomScale}
              audioLevelRef={audioLevelRef}
              particleBudget={hardware?.recommendedParticleCount || 1100}
            />

            {/* Top-Center Compact Status & Audio-Greet Bar */}
            <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 rounded-lg border ${hudCardClass}`}>
              <span className="font-display text-xs font-semibold text-amber-300 whitespace-nowrap">
                {stateLabel}
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-xs text-slate-300 whitespace-nowrap">
                {activationSettings.clapEnabled
                  ? `Clap Trigger ${micTelemetry.clapCount}/3`
                  : 'Clap Trigger Off'}
              </span>
              {!hasGreetedAudio && (
                <button
                  type="button"
                  onClick={handleGreetBoss}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-amber-500/20 text-amber-200 border border-amber-400/35 hover:bg-amber-500/30 cursor-pointer whitespace-nowrap"
                >
                  <Volume2 className="w-3 h-3" />
                  Activate Voice
                </button>
              )}
            </div>

            {/* Left Peripheral Telemetry & Quick Shortcuts */}
            {!hudCollapsed && (
              <aside className="hidden lg:flex flex-col gap-3 w-72 absolute left-4 top-4 bottom-28 z-10 pointer-events-auto">
                <div className={`rounded-lg border p-4 space-y-3 ${hudCardClass}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-display text-xs font-semibold flex items-center gap-1.5 ${isAmberTheme ? 'text-amber-200' : 'text-cyan-200'}`}>
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      System Health
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('system')}
                      className={`text-xs hover:underline cursor-pointer ${isAmberTheme ? 'text-amber-300' : 'text-cyan-300'}`}
                    >
                      Details
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className={`p-2 rounded border ${hudSubTileClass}`}>
                      <div className="text-slate-400">CPU</div>
                      <div className="font-mono-tabular text-sm font-semibold text-amber-300">
                        {telemetry ? `${telemetry.cpuPercent.toFixed(0)}%` : '—'}
                      </div>
                    </div>
                    <div className={`p-2 rounded border ${hudSubTileClass}`}>
                      <div className="text-slate-400">RAM</div>
                      <div className="font-mono-tabular text-sm font-semibold text-cyan-300">
                        {telemetry ? `${telemetry.memoryPercent.toFixed(0)}%` : '—'}
                      </div>
                    </div>
                    <div className={`p-2 rounded border ${hudSubTileClass}`}>
                      <div className="text-slate-400">Disk</div>
                      <div className="font-mono-tabular text-sm font-semibold text-orange-300">
                        {telemetry ? `${telemetry.storagePercent.toFixed(0)}%` : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Launcher & File Shortcut */}
                <div className={`rounded-lg border p-4 space-y-2.5 ${hudCardClass}`}>
                  <div className={`font-display text-xs font-semibold ${isAmberTheme ? 'text-amber-200' : 'text-cyan-200'}`}>
                    Quick Operations
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('files')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs rounded border text-slate-200 hover:border-amber-400/45 cursor-pointer ${hudSubTileClass}`}
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Files
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('apps')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs rounded border text-slate-200 hover:border-amber-400/45 cursor-pointer ${hudSubTileClass}`}
                    >
                      <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      Apps
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('comms')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs rounded border text-slate-200 hover:border-amber-400/45 cursor-pointer ${hudSubTileClass}`}
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      Calls
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('settings')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs rounded border text-slate-200 hover:border-amber-400/45 cursor-pointer ${hudSubTileClass}`}
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      Settings
                    </button>
                  </div>
                </div>

                {/* Recent Commands */}
                <div className={`flex-1 min-h-0 rounded-lg border p-4 flex flex-col ${hudCardClass}`}>
                  <div className={`font-display text-xs font-semibold mb-2.5 ${isAmberTheme ? 'text-amber-200' : 'text-cyan-200'}`}>
                    Recent Commands
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {recentCommands.map((cmd, idx) => (
                      <button
                        key={`${idx}-${cmd}`}
                        type="button"
                        onClick={() => void sendCommand(cmd)}
                        className={`w-full text-left px-2.5 py-2 rounded text-xs border text-slate-300 hover:border-amber-400/45 hover:text-amber-100 transition-colors cursor-pointer truncate ${hudSubTileClass}`}
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            )}

            {/* Right Peripheral Voice Interaction & Response Log */}
            {!hudCollapsed && (
              <aside className={`hidden md:flex flex-col w-80 xl:w-96 absolute right-4 top-4 bottom-28 z-10 rounded-lg border p-4 ${hudCardClass}`}>
                <div className="flex items-center justify-between pb-2.5 border-b border-amber-500/15">
                  <span className={`font-display text-xs font-semibold ${isAmberTheme ? 'text-amber-200' : 'text-cyan-200'}`}>
                    Voice & Conversation Log
                  </span>
                  <span className="text-xs text-slate-400">
                    {aiMode === 'local' ? 'Local Engine' : 'Free Hybrid'}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg p-3 text-xs space-y-2 ${
                        msg.role === 'user'
                          ? 'bg-cyan-500/10 border border-cyan-500/25 text-cyan-50 ml-4'
                          : msg.role === 'system'
                          ? 'bg-amber-500/10 border border-amber-500/25 text-amber-100'
                          : 'bg-[#050810] border border-slate-800 text-slate-200 mr-2'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-medium text-slate-300">
                          {msg.role === 'user'
                            ? 'Boss'
                            : msg.role === 'system'
                            ? 'System'
                            : 'ULTRON'}
                        </span>
                        <span className="font-mono-tabular">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="leading-relaxed text-xs">{msg.text}</p>

                      {msg.actionCard?.kind === 'website' && msg.actionCard.url && (
                        <a
                          href={msg.actionCard.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 hover:bg-cyan-500/30"
                        >
                          {msg.actionCard.title}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}

                      {msg.actionCard?.kind === 'files' &&
                        msg.actionCard.files &&
                        msg.actionCard.files.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-slate-800">
                            {msg.actionCard.files.map((f) => (
                              <div
                                key={f.path}
                                className="flex items-center justify-between text-[11px] text-slate-300"
                              >
                                <span className="truncate">{f.path}</span>
                                <span className="font-mono-tabular text-slate-500 ml-2 shrink-0">
                                  {f.extension.toUpperCase() || 'DIR'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {msg.actionCard?.kind === 'system' &&
                        msg.actionCard.telemetrySnapshot && (
                          <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] font-mono-tabular">
                            <div className="px-2 py-1 rounded bg-[#070c18]">
                              CPU {msg.actionCard.telemetrySnapshot.cpuPercent}%
                            </div>
                            <div className="px-2 py-1 rounded bg-[#070c18]">
                              RAM {msg.actionCard.telemetrySnapshot.memoryPercent}%
                            </div>
                            <div className="px-2 py-1 rounded bg-[#070c18]">
                              Disk {msg.actionCard.telemetrySnapshot.storagePercent}%
                            </div>
                          </div>
                        )}
                    </div>
                  ))}
                  {interimTranscript && (
                    <div className="text-xs italic text-cyan-300 px-2">
                      Hearing: "{interimTranscript}"
                    </div>
                  )}
                </div>
              </aside>
            )}

            {/* Bottom Center Command Bar, Audio-Wave Visualizer & Zoom Controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(860px,95vw)] z-20 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHudCollapsed((c) => !c)}
                  className={`inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md border text-slate-300 hover:text-amber-200 cursor-pointer ${hudCardClass}`}
                >
                  {hudCollapsed ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" /> Show Panels
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" /> Focus Hologram
                    </>
                  )}
                </button>

                {/* Zoom & Reset Controls */}
                <div className={`flex items-center gap-1 px-2 py-1 rounded-md border ${hudCardClass}`}>
                  <button
                    type="button"
                    onClick={() => setZoomScale((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
                    title="Zoom Out"
                    className="p-1 text-slate-300 hover:text-amber-200 cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono-tabular text-xs text-slate-300 px-1.5">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomScale((z) => Math.min(2.2, +(z + 0.15).toFixed(2)))}
                    title="Zoom In"
                    className="p-1 text-slate-300 hover:text-amber-200 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale(1.0)}
                    title="Reset Zoom"
                    className="p-1 text-slate-300 hover:text-amber-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className={`w-full rounded-xl border p-3 space-y-2.5 ${hudCardClass}`}>
                {/* Live Audio-Wave Bars */}
                <div
                  className="flex items-end justify-center gap-1 h-5"
                  aria-label="Audio wave visualizer"
                >
                  {audioBars.map((bar, idx) => (
                    <div
                      key={idx}
                      className={`w-1.5 rounded-sm transition-[height] duration-75 ${
                        ultronState === 'halted'
                          ? 'bg-rose-500/70'
                          : ultronState === 'listening'
                          ? 'bg-cyan-400'
                          : 'bg-amber-400'
                      }`}
                      style={{ height: `${Math.max(15, Math.round(bar * 100))}%` }}
                    />
                  ))}
                </div>

                {/* Voice Push-to-Talk & Natural Language Command Input */}
                <form onSubmit={handleSubmitCommand} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePushToTalk}
                    title="Voice Command (or say Hey ULTRON / clap 3 times)"
                    className={`p-2.5 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                      ultronState === 'listening'
                        ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                        : isAmberTheme
                        ? 'bg-[#070402] border-amber-500/30 text-amber-300 hover:bg-amber-500/15'
                        : 'bg-[#050810] border-cyan-500/30 text-amber-300 hover:bg-cyan-500/15'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder={
                      speechActive
                        ? 'Say "Hey ULTRON", clap 3 times, or type a command, Boss...'
                        : 'Type a natural command for ULTRON, Boss...'
                    }
                    className={`flex-1 px-3.5 py-2.5 text-sm rounded-lg border text-slate-100 placeholder:text-slate-500 focus:outline-none ${
                      isAmberTheme
                        ? 'bg-[#070402] border-amber-500/25 focus:border-amber-400'
                        : 'bg-[#050810] border-cyan-500/25 focus:border-cyan-400'
                    }`}
                  />

                  <button
                    type="submit"
                    disabled={ultronState === 'thinking' || halted}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg border disabled:opacity-50 cursor-pointer shrink-0 ${
                      isAmberTheme
                        ? 'bg-amber-500/20 text-amber-100 border-amber-400/35 hover:bg-amber-500/30'
                        : 'bg-cyan-500/20 text-cyan-100 border-cyan-400/35 hover:bg-cyan-500/30'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <SystemMonitorView
            telemetry={telemetry}
            history={telemetryHistory}
            onRefresh={() => void fetchTelemetry()}
            onRequestConfirmation={setPendingConfirmation}
            onSpeakAdvisory={(txt) => {
              appendMessage({ role: 'ultron', text: txt });
              speakResponse(txt);
            }}
          />
        )}

        {activeTab === 'files' && (
          <FileManagerView
            refreshSignal={fileRefreshSignal}
            onRequestConfirmation={setPendingConfirmation}
            onStatusSpeak={(txt) => {
              appendMessage({ role: 'ultron', text: txt });
              speakResponse(txt);
            }}
          />
        )}

        {activeTab === 'apps' && (
          <AppsAndWebView
            apps={apps}
            onAppAction={handleAppAction}
            volume={voiceSettings.volume}
            onVolumeChange={(v) => {
              setVoiceSettings((prev) => ({ ...prev, volume: v }));
              audioEngineRef.current?.setMasterVolume(v);
            }}
            brightness={brightness}
            onBrightnessChange={setBrightness}
            onCaptureScreenshot={captureScreenshot}
            onSpeak={(txt) => speakResponse(txt)}
          />
        )}

        {activeTab === 'comms' && (
          <CommsView
            contacts={contacts}
            onAddContact={(c) => setContacts((prev) => [c, ...prev])}
            onRequestConfirmation={setPendingConfirmation}
            callHistory={callHistory}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            voiceSettings={voiceSettings}
            onVoiceChange={setVoiceSettings}
            onTestVoice={() =>
              speakResponse(
                'Voice calibration verified, Boss. All systems are operating smoothly.'
              )
            }
            browserVoices={browserVoices}
            activationSettings={activationSettings}
            onActivationChange={setActivationSettings}
            micTelemetry={micTelemetry}
            micActive={micActive}
            onToggleMicMonitor={() => void toggleMicMonitor()}
            aiMode={aiMode}
            onAiModeChange={setAiMode}
            geminiConfigured={geminiConfigured}
            theme={theme}
            onThemeChange={setTheme}
            hardware={hardware}
          />
        )}
      </main>

      {/* Mandatory Safety Confirmation Modal */}
      {pendingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-400/40 bg-[#090f1d] p-5 space-y-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-amber-300">
                Boss Authorization Required
              </div>
              <h3 className="font-display text-lg font-semibold text-slate-100">
                {pendingConfirmation.title}
              </h3>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              {pendingConfirmation.description}
            </p>

            <div className="p-2.5 rounded bg-[#050810] border border-slate-800 text-xs font-mono-tabular text-cyan-200">
              {pendingConfirmation.detailLabel}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingConfirmation(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500/25 border border-amber-400/40 text-amber-100 hover:bg-amber-500/35 cursor-pointer"
              >
                Confirm & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
