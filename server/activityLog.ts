export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'action' | 'warning' | 'error';
  source: string;
  message: string;
}

const MAX_LOGS = 200;
const logs: LogEntry[] = [];
let emergencyHalted = false;

export function recordLog(
  level: LogEntry['level'],
  source: string,
  message: string
): LogEntry {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  return entry;
}

export function getLogs(levelFilter?: string): LogEntry[] {
  if (!levelFilter || levelFilter === 'all') {
    return logs;
  }
  return logs.filter((l) => l.level === levelFilter);
}

export function clearLogs(): void {
  logs.length = 0;
  recordLog('info', 'Security', 'Activity log buffer cleared by Boss.');
}

export function isEmergencyHalted(): boolean {
  return emergencyHalted;
}

export function setEmergencyHalted(halted: boolean): void {
  emergencyHalted = halted;
  recordLog(
    halted ? 'warning' : 'info',
    'Safety',
    halted
      ? 'Emergency Stop engaged. All autonomous task execution suspended.'
      : 'ULTRON systems resumed by Boss authorization.'
  );
}
