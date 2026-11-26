import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recordLog } from './activityLog.ts';
import { WORKSPACE_ROOT } from './fileManager.ts';

const execFileAsync = promisify(execFile);

export interface DiscoveredApp {
  id: string;
  name: string;
  category: 'Browser' | 'Productivity' | 'Development' | 'Media' | 'System';
  launchCommand: string;
  processName?: string;
  webFallbackUrl?: string;
  installed: boolean;
}

const PINNED_APPS: DiscoveredApp[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    category: 'Browser',
    launchCommand: 'chrome.exe',
    processName: 'chrome',
    webFallbackUrl: 'https://www.google.com',
    installed: true,
  },
  {
    id: 'msedge',
    name: 'Microsoft Edge',
    category: 'Browser',
    launchCommand: 'msedge.exe',
    processName: 'msedge',
    webFallbackUrl: 'https://www.bing.com',
    installed: true,
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    category: 'Development',
    launchCommand: 'code',
    processName: 'Code',
    webFallbackUrl: 'https://vscode.dev',
    installed: true,
  },
  {
    id: 'explorer',
    name: 'File Explorer',
    category: 'System',
    launchCommand: 'explorer.exe',
    processName: 'explorer',
    installed: true,
  },
  {
    id: 'terminal',
    name: 'Windows Terminal',
    category: 'Development',
    launchCommand: 'wt.exe',
    processName: 'WindowsTerminal',
    installed: true,
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    category: 'System',
    launchCommand: 'powershell.exe',
    processName: 'powershell',
    installed: true,
  },
  {
    id: 'settings',
    name: 'Windows Settings',
    category: 'System',
    launchCommand: 'ms-settings:',
    processName: 'SystemSettings',
    installed: true,
  },
  {
    id: 'calculator',
    name: 'Calculator',
    category: 'Productivity',
    launchCommand: 'calc.exe',
    processName: 'CalculatorApp',
    installed: true,
  },
  {
    id: 'notepad',
    name: 'Notepad',
    category: 'Productivity',
    launchCommand: 'notepad.exe',
    processName: 'notepad',
    installed: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'Media',
    launchCommand: 'whatsapp:',
    processName: 'WhatsApp',
    webFallbackUrl: 'https://web.whatsapp.com',
    installed: true,
  },
  {
    id: 'phonelink',
    name: 'Windows Phone Link',
    category: 'System',
    launchCommand: 'ms-phone:',
    processName: 'PhoneExperienceHost',
    installed: true,
  },
];

const PROTECTED_PROCESS_NAMES = new Set([
  'system',
  'smss',
  'csrss',
  'wininit',
  'services',
  'lsass',
  'svchost',
  'dwm',
  'explorer',
  'systemd',
  'init',
  'node',
]);

async function runPowerShell(script: string, timeoutMs = 5000): Promise<string> {
  if (os.platform() !== 'win32') {
    throw new Error('Windows host required for native PowerShell execution.');
  }
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { timeout: timeoutMs }
  );
  return stdout.trim();
}

export async function discoverInstalledApps(): Promise<DiscoveredApp[]> {
  if (os.platform() === 'win32') {
    try {
      const ps = `
        $apps = Get-StartApps | Select-Object -First 35 Name, AppID
        $apps | ConvertTo-Json -Compress
      `;
      const raw = await runPowerShell(ps, 6000);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ Name: string; AppID: string }> | { Name: string; AppID: string };
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const discovered: DiscoveredApp[] = arr
          .filter((item) => item?.Name && item?.AppID)
          .map((item) => ({
            id: `win-${item.Name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`,
            name: item.Name,
            category: /chrome|edge|firefox|brave/i.test(item.Name)
              ? 'Browser'
              : /code|terminal|powershell|git|studio/i.test(item.Name)
              ? 'Development'
              : /spotify|vlc|media|whatsapp|teams|zoom/i.test(item.Name)
              ? 'Media'
              : /settings|control|store|task|defender/i.test(item.Name)
              ? 'System'
              : 'Productivity',
            launchCommand: `shell:AppsFolder\\${item.AppID}`,
            processName: item.Name.split(' ')[0],
            installed: true,
          }));
        const seen = new Set(PINNED_APPS.map((a) => a.name.toLowerCase()));
        return [
          ...PINNED_APPS,
          ...discovered.filter((d) => !seen.has(d.name.toLowerCase())),
        ];
      }
    } catch (err) {
      recordLog('warning', 'Desktop', `StartApps discovery fallback: ${String(err)}`);
    }
  } else {
    // Cross-platform Linux host discovery for desktop verification
    try {
      const appsDir = '/usr/share/applications';
      if (fs.existsSync(appsDir)) {
        const files = fs.readdirSync(appsDir).filter((f) => f.endsWith('.desktop')).slice(0, 12);
        const linuxApps: DiscoveredApp[] = [];
        for (const file of files) {
          const content = fs.readFileSync(path.join(appsDir, file), 'utf8');
          const nameMatch = content.match(/^Name=(.+)$/m);
          const execMatch = content.match(/^Exec=([^\s%]+)/m);
          if (nameMatch && execMatch) {
            linuxApps.push({
              id: `linux-${file.replace(/\.desktop$/, '')}`,
              name: nameMatch[1].trim(),
              category: 'Productivity',
              launchCommand: path.basename(execMatch[1].trim()),
              processName: path.basename(execMatch[1].trim()),
              installed: true,
            });
          }
        }
        return [...PINNED_APPS, ...linuxApps];
      }
    } catch {
      // ignore
    }
  }
  return PINNED_APPS;
}

export async function controlWindowsApplication(
  appIdOrName: string,
  operation: 'open' | 'close' | 'minimize' | 'maximize' | 'focus',
  appsRegistry: DiscoveredApp[]
): Promise<{ ok: boolean; executedOnHost: boolean; message: string; app?: DiscoveredApp }> {
  const query = appIdOrName.trim().toLowerCase();
  const app = appsRegistry.find(
    (a) =>
      a.id.toLowerCase() === query ||
      a.name.toLowerCase() === query ||
      a.name.toLowerCase().includes(query)
  );

  if (!app) {
    return {
      ok: false,
      executedOnHost: false,
      message: `Application "${appIdOrName}" is not in the discovered allowlist.`,
    };
  }

  if (os.platform() !== 'win32') {
    recordLog('action', 'Desktop', `App ${operation} (${app.name}) tracked on ${os.platform()} host.`);
    return {
      ok: true,
      executedOnHost: false,
      app,
      message: `${app.name} ${operation} registered. Native Win32 window control activates automatically on Windows 10/11.`,
    };
  }

  try {
    if (operation === 'open') {
      if (app.launchCommand.startsWith('shell:AppsFolder\\')) {
        const appId = app.launchCommand.replace('shell:AppsFolder\\', '');
        if (!/^[A-Za-z0-9_.!\\-]+$/.test(appId)) {
          throw new Error('Invalid AppID format.');
        }
        await execFileAsync('explorer.exe', [`shell:AppsFolder\\${appId}`], { timeout: 4000 });
      } else if (/^(ms-settings:|ms-phone:|whatsapp:)$/.test(app.launchCommand)) {
        await execFileAsync('cmd', ['/c', 'start', '', app.launchCommand], { timeout: 4000 });
      } else {
        const safeExe = path.basename(app.launchCommand);
        await execFileAsync('cmd', ['/c', 'start', '', safeExe], { timeout: 4000 });
      }
      recordLog('action', 'Windows', `Launched ${app.name}`);
      return { ok: true, executedOnHost: true, app, message: `Opened ${app.name}.` };
    }

    const procName = (app.processName || app.id).replace(/[^A-Za-z0-9_.-]/g, '');
    if (!procName) throw new Error('Invalid process target.');

    if (operation === 'close') {
      if (PROTECTED_PROCESS_NAMES.has(procName.toLowerCase())) {
        return {
          ok: false,
          executedOnHost: false,
          app,
          message: `${app.name} is a protected system process and will not be terminated.`,
        };
      }
      await runPowerShell(`Get-Process -Name "${procName}" -ErrorAction SilentlyContinue | Stop-Process`);
      recordLog('action', 'Windows', `Closed ${app.name}`);
      return { ok: true, executedOnHost: true, app, message: `Closed ${app.name}.` };
    }

    // minimize | maximize | focus via Win32 ShowWindowAsync
    const cmdCode = operation === 'minimize' ? 6 : operation === 'maximize' ? 3 : 9;
    const win32Script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinCtrl {
          [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
          [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        }
"@
      $procs = Get-Process -Name "${procName}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
      foreach ($p in $procs) {
        [WinCtrl]::ShowWindowAsync($p.MainWindowHandle, ${cmdCode}) | Out-Null
        if (${cmdCode} -ne 6) { [WinCtrl]::SetForegroundWindow($p.MainWindowHandle) | Out-Null }
      }
    `;
    await runPowerShell(win32Script, 5000);
    recordLog('action', 'Windows', `${operation} window for ${app.name}`);
    return { ok: true, executedOnHost: true, app, message: `${operation} applied to ${app.name}.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordLog('error', 'Windows', `App control failed for ${app.name}: ${msg}`);
    return { ok: false, executedOnHost: false, app, message: msg };
  }
}

export async function executeWindowsSystemControl(
  action: 'volume_up' | 'volume_down' | 'volume_mute' | 'volume_set' | 'brightness_set' | 'screenshot' | 'settings' | 'clipboard_read' | 'clipboard_write',
  value?: number | string
): Promise<{ ok: boolean; executedOnHost: boolean; message: string; data?: unknown }> {
  if (action === 'screenshot') {
    const shotsDir = path.join(WORKSPACE_ROOT, 'Screenshots');
    fs.mkdirSync(shotsDir, { recursive: true });
    const fileName = `screenshot_${Date.now()}.png`;
    const destPath = path.join(shotsDir, fileName);

    if (os.platform() === 'win32') {
      try {
        const ps = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
          $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
          $graphics = [System.Drawing.Graphics]::FromImage($bmp)
          $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
          $bmp.Save("${destPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
          $graphics.Dispose()
          $bmp.Dispose()
        `;
        await runPowerShell(ps, 6000);
        recordLog('action', 'Windows', `Captured desktop screenshot: Screenshots/${fileName}`);
        return {
          ok: true,
          executedOnHost: true,
          message: `Desktop screenshot saved to Screenshots/${fileName}.`,
          data: { path: `Screenshots/${fileName}` },
        };
      } catch (err) {
        return {
          ok: false,
          executedOnHost: false,
          message: `Desktop screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
    return {
      ok: true,
      executedOnHost: false,
      message: 'Browser canvas snapshot triggered.',
      data: { browserFallback: true },
    };
  }

  if (os.platform() !== 'win32') {
    return {
      ok: true,
      executedOnHost: false,
      message: `Applied "${action}" in workspace mode. Full OS-level hardware hooks activate on Windows 10/11.`,
    };
  }

  try {
    if (action === 'settings') {
      await execFileAsync('cmd', ['/c', 'start', '', 'ms-settings:'], { timeout: 3000 });
      return { ok: true, executedOnHost: true, message: 'Opened Windows Settings.' };
    }

    if (action === 'volume_mute' || action === 'volume_up' || action === 'volume_down') {
      const keyCode = action === 'volume_mute' ? 173 : action === 'volume_down' ? 174 : 175;
      const repeat = action === 'volume_mute' ? 1 : 4;
      const ps = `
        $wsh = New-Object -ComObject WScript.Shell
        for ($i = 0; $i -lt ${repeat}; $i++) { $wsh.SendKeys([char]${keyCode}) }
      `;
      await runPowerShell(ps, 3500);
      return { ok: true, executedOnHost: true, message: `Executed Windows ${action}.` };
    }

    if (action === 'volume_set') {
      const target = Math.max(0, Math.min(100, Number(value ?? 50)));
      // Step down to 0 then step up using standard Windows 2-unit increments
      const stepsUp = Math.round(target / 2);
      const ps = `
        $wsh = New-Object -ComObject WScript.Shell
        for ($i = 0; $i -lt 50; $i++) { $wsh.SendKeys([char]174) }
        for ($i = 0; $i -lt ${stepsUp}; $i++) { $wsh.SendKeys([char]175) }
      `;
      await runPowerShell(ps, 5000);
      return { ok: true, executedOnHost: true, message: `Set Windows system volume near ${target}%.` };
    }

    if (action === 'brightness_set') {
      const level = Math.max(10, Math.min(100, Number(value ?? 80)));
      const ps = `
        $m = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue
        if ($m) { $m.WmiSetBrightness(1, ${level}) }
      `;
      await runPowerShell(ps, 4000);
      return { ok: true, executedOnHost: true, message: `Adjusted display brightness to ${level}%.` };
    }

    if (action === 'clipboard_read') {
      const text = await runPowerShell('Get-Clipboard -Raw', 3000);
      return { ok: true, executedOnHost: true, message: 'Clipboard read from Windows.', data: { text } };
    }

    if (action === 'clipboard_write') {
      const text = String(value || '');
      const b64 = Buffer.from(text, 'utf8').toString('base64');
      await runPowerShell(
        `$txt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${b64}")); Set-Clipboard -Value $txt`,
        3000
      );
      return { ok: true, executedOnHost: true, message: 'Copied text to Windows clipboard.' };
    }
  } catch (err) {
    return {
      ok: false,
      executedOnHost: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return { ok: false, executedOnHost: false, message: 'Unsupported control action.' };
}

export async function readWindowsSensors(): Promise<{
  battery: { available: boolean; percent: number | null; charging: boolean | null };
  temperature: { available: boolean; celsius: number | null };
}> {
  if (os.platform() !== 'win32') {
    return {
      battery: { available: false, percent: null, charging: null },
      temperature: { available: false, celsius: null },
    };
  }

  let battery = { available: false, percent: null as number | null, charging: null as boolean | null };
  let temperature = { available: false, celsius: null as number | null };

  try {
    const batRaw = await runPowerShell(
      'Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1 EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress',
      3000
    );
    if (batRaw) {
      const parsed = JSON.parse(batRaw) as { EstimatedChargeRemaining?: number; BatteryStatus?: number };
      if (typeof parsed.EstimatedChargeRemaining === 'number') {
        battery = {
          available: true,
          percent: parsed.EstimatedChargeRemaining,
          charging: parsed.BatteryStatus === 2 || parsed.BatteryStatus === 6,
        };
      }
    }
  } catch {
    // desktop PC without battery
  }

  try {
    const tempRaw = await runPowerShell(
      'Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1 CurrentTemperature | ConvertTo-Json -Compress',
      3000
    );
    if (tempRaw) {
      const parsed = JSON.parse(tempRaw) as { CurrentTemperature?: number };
      if (typeof parsed.CurrentTemperature === 'number' && parsed.CurrentTemperature > 2000) {
        temperature = {
          available: true,
          celsius: Math.round((parsed.CurrentTemperature / 10 - 273.15) * 10) / 10,
        };
      }
    }
  } catch {
    // thermal zone restricted without admin
  }

  return { battery, temperature };
}

export async function triggerWindowsCallUri(
  targetHandle: string,
  service: 'Phone Link' | 'WhatsApp' | 'VoIP'
): Promise<{ executedOnHost: boolean; uri: string }> {
  const cleanDigits = targetHandle.replace(/[^0-9+]/g, '');
  let uri = `tel:${cleanDigits || encodeURIComponent(targetHandle)}`;

  if (service === 'WhatsApp') {
    uri = cleanDigits
      ? `https://wa.me/${cleanDigits.replace(/^\+/, '')}`
      : 'https://web.whatsapp.com';
  } else if (service === 'Phone Link') {
    uri = cleanDigits ? `tel:${cleanDigits}` : 'ms-phone:';
  } else if (service === 'VoIP') {
    uri = `sip:${encodeURIComponent(targetHandle)}`;
  }

  if (os.platform() === 'win32') {
    try {
      await execFileAsync('cmd', ['/c', 'start', '', uri], { timeout: 3500 });
      recordLog('action', 'Comms', `Invoked Windows call URI (${service}) for ${targetHandle}`);
      return { executedOnHost: true, uri };
    } catch {
      return { executedOnHost: false, uri };
    }
  }
  return { executedOnHost: false, uri };
}

export async function openExternalUrlOnWindows(url: string): Promise<boolean> {
  if (os.platform() !== 'win32') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    await execFileAsync('cmd', ['/c', 'start', '', url], { timeout: 3500 });
    return true;
  } catch {
    return false;
  }
}
