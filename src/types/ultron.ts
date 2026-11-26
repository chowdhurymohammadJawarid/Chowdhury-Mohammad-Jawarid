export type UltronState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'halted';

export type WorkspaceTab = 'core' | 'system' | 'files' | 'apps' | 'comms' | 'settings';

export type ThemePreset = 'amber-cyan' | 'pure-cyan' | 'cobalt-ice';

export type AiEngineMode = 'hybrid' | 'cloud' | 'local' | 'ollama';

export interface PermittedRoot {
  id: 'workspace' | 'desktop' | 'downloads' | 'documents';
  label: string;
  absPath: string;
  enabled: boolean;
  exists: boolean;
}

declare global {
  interface Window {
    ultronDesktop?: {
      isDesktop: boolean;
      minimize: () => void;
      maximizeToggle: () => void;
      close: () => void;
      onWakeFromTray: (callback: () => void) => void;
    };
  }
}

export interface VoiceSettings {
  engine: 'gemini' | 'browser';
  geminiVoice: 'Kore' | 'Zephyr';
  browserVoiceUri: string;
  tone: 'calm' | 'friendly' | 'executive' | 'poised';
  pitch: number; // 0.7 - 1.3
  rate: number; // 0.75 - 1.4
  volume: number; // 0 - 1
  autoSpeak: boolean;
}

export interface ActivationSettings {
  wakeWordEnabled: boolean;
  wakePhrases: string[];
  clapEnabled: boolean;
  clapSensitivity: number; // 1.2 - 3.5
  noiseFilterThreshold: number; // 0.02 - 0.25
  micMuted: boolean;
}

export interface SystemProcess {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

export interface HardwareProfile {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGb: number;
  tier: 'High-Performance' | 'Balanced' | 'Efficiency';
  recommendedPollingMs: number;
  recommendedParticleCount: number;
  gpuRenderer?: string;
}

export interface SystemTelemetry {
  timestamp: number;
  cpuPercent: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  memoryPercent: number;
  storageUsedGb: number;
  storageTotalGb: number;
  storagePercent: number;
  networkInterfaces: Array<{ name: string; address: string; family: string }>;
  internetConnected: boolean;
  internetLatencyMs: number | null;
  uptimeSeconds: number;
  battery: {
    available: boolean;
    percent: number | null;
    charging: boolean | null;
  };
  temperature: {
    available: boolean;
    celsius: number | null;
  };
  processes: SystemProcess[];
  hardware: HardwareProfile;
  advisory: string | null;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  extension: string;
  modifiedAt: string;
  category: string;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: FileEntry[];
}

export interface ContactItem {
  id: string;
  name: string;
  role: string;
  phone: string;
  whatsapp: string;
  voipHandle: string;
  preferredService: 'Phone Link' | 'WhatsApp' | 'VoIP';
}

export interface AppEntry {
  id: string;
  name: string;
  category: 'Browser' | 'Productivity' | 'Development' | 'Media' | 'System';
  launchCommand: string;
  webFallbackUrl?: string;
  status: 'closed' | 'running' | 'minimized' | 'maximized';
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  level: 'info' | 'action' | 'warning' | 'error';
  source: string;
  message: string;
}

export interface PendingConfirmation {
  id: string;
  type: 'delete_file' | 'overwrite_file' | 'organize_files' | 'initiate_call' | 'terminate_process' | 'system_action';
  title: string;
  description: string;
  detailLabel: string;
  payload: Record<string, unknown>;
}

export interface ActionCardData {
  kind: 'website' | 'files' | 'system' | 'call_prompt' | 'app' | 'clipboard' | 'advisory';
  title: string;
  subtitle?: string;
  url?: string;
  files?: FileEntry[];
  appName?: string;
  telemetrySnapshot?: {
    cpuPercent: number;
    memoryPercent: number;
    storagePercent: number;
    internetConnected: boolean;
  };
  confirmation?: PendingConfirmation;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ultron' | 'system';
  text: string;
  timestamp: string;
  intent?: string;
  engineUsed?: 'gemini' | 'local';
  actionCard?: ActionCardData;
}
