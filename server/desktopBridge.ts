import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recordLog } from './activityLog.ts';

const execFileAsync = promisify(execFile);

export interface AppDefinition {
  id: string;
  name: string;
  category: 'Browser' | 'Productivity' | 'Development' | 'Media' | 'System';
  launchCommand: string;
  webFallbackUrl?: string;
}

export const REGISTERED_APPS: AppDefinition[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    category: 'Browser',
    launchCommand: 'chrome.exe',
    webFallbackUrl: 'https://www.google.com',
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    category: 'Development',
    launchCommand: 'code',
    webFallbackUrl: 'https://vscode.dev',
  },
  {
    id: 'explorer',
    name: 'File Explorer',
    category: 'System',
    launchCommand: 'explorer.exe',
  },
  {
    id: 'terminal',
    name: 'Windows Terminal',
    category: 'Development',
    launchCommand: 'wt.exe',
  },
  {
    id: 'settings',
    name: 'Windows Settings',
    category: 'System',
    launchCommand: 'ms-settings:',
  },
  {
    id: 'calculator',
    name: 'Calculator',
    category: 'Productivity',
    launchCommand: 'calc.exe',
  },
  {
    id: 'notepad',
    name: 'Notepad',
    category: 'Productivity',
    launchCommand: 'notepad.exe',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'Media',
    launchCommand: 'whatsapp:',
    webFallbackUrl: 'https://web.whatsapp.com',
  },
  {
    id: 'phonelink',
    name: 'Windows Phone Link',
    category: 'System',
    launchCommand: 'ms-phone:',
  },
];

export const KNOWN_WEBSITES: Record<string, string> = {
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  facebook: 'https://www.facebook.com',
  gmail: 'https://mail.google.com',
  chatgpt: 'https://chatgpt.com',
  github: 'https://github.com',
  wikipedia: 'https://www.wikipedia.org',
};

export function validateExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (KNOWN_WEBSITES[lower]) {
    return KNOWN_WEBSITES[lower];
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function launchWindowsAppIfHost(appId: string): Promise<{
  executedOnHost: boolean;
  app: AppDefinition | null;
  note: string;
}> {
  const app = REGISTERED_APPS.find(
    (a) =>
      a.id === appId.toLowerCase() ||
      a.name.toLowerCase().includes(appId.toLowerCase())
  );
  if (!app) {
    return {
      executedOnHost: false,
      app: null,
      note: `Application "${appId}" is not in the authorized application allowlist.`,
    };
  }

  if (os.platform() === 'win32') {
    try {
      // Safe allowlisted Windows launch without shell interpolation
      const winAllowlist: Record<string, [string, string[]]> = {
        chrome: ['cmd', ['/c', 'start', '', 'chrome']],
        vscode: ['cmd', ['/c', 'start', '', 'code']],
        explorer: ['explorer.exe', []],
        terminal: ['wt.exe', []],
        settings: ['cmd', ['/c', 'start', '', 'ms-settings:']],
        calculator: ['calc.exe', []],
        notepad: ['notepad.exe', []],
        whatsapp: ['cmd', ['/c', 'start', '', 'whatsapp:']],
        phonelink: ['cmd', ['/c', 'start', '', 'ms-phone:']],
      };
      const cmd = winAllowlist[app.id];
      if (cmd) {
        await execFileAsync(cmd[0], cmd[1], { timeout: 3000 });
        recordLog('action', 'Desktop', `Launched native Windows app: ${app.name}`);
        return {
          executedOnHost: true,
          app,
          note: `${app.name} launched directly on Windows host.`,
        };
      }
    } catch (err) {
      recordLog('warning', 'Desktop', `Windows launch fallback for ${app.name}: ${String(err)}`);
    }
  }

  recordLog('action', 'Desktop', `Prepared desktop workspace launch for ${app.name}`);
  return {
    executedOnHost: false,
    app,
    note: `${app.name} staged in Desktop Launcher. Use the Windows Companion Script for native OS control on a local Windows PC.`,
  };
}

export function getWindowsCompanionScript(): string {
  return `# ULTRON Windows Desktop Companion Bridge (PowerShell)
# Run this locally on Windows 10/11 to bridge ULTRON to native Win32 apps, volume, and Phone Link.
param(
  [int]$Port = 3847
)

Write-Host "ULTRON Windows Companion listening on http://127.0.0.1:$Port" -ForegroundColor Cyan
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  $res.Headers.Add("Access-Control-Allow-Origin", "http://localhost:3000")
  $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

  if ($req.HttpMethod -eq "OPTIONS") {
    $res.StatusCode = 204
    $res.Close()
    continue
  }

  $reader = New-Object System.IO.StreamReader($req.InputStream)
  $body = $reader.ReadToEnd() | ConvertFrom-Json
  $status = @{ ok = $true; message = "Executed" }

  switch ($body.action) {
    "open_app" {
      $allowed = @{
        "chrome" = "chrome.exe"
        "notepad" = "notepad.exe"
        "calc" = "calc.exe"
        "explorer" = "explorer.exe"
        "settings" = "ms-settings:"
        "phonelink" = "ms-phone:"
        "whatsapp" = "whatsapp:"
      }
      if ($allowed.ContainsKey($body.target)) {
        Start-Process $allowed[$body.target]
        $status.message = "Launched $($body.target)"
      } else {
        $status.ok = $false
        $status.message = "Application not in allowlist"
      }
    }
    "open_url" {
      if ($body.url -match "^https?://") {
        Start-Process $body.url
        $status.message = "Opened URL"
      }
    }
  }

  $json = $status | ConvertTo-Json
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $res.ContentType = "application/json"
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}
`;
}
