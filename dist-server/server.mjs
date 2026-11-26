// server.ts
import "dotenv/config";
import express from "express";
import path4 from "node:path";
import fs4 from "node:fs";
import { fileURLToPath } from "node:url";

// server/activityLog.ts
var MAX_LOGS = 200;
var logs = [];
var emergencyHalted = false;
function recordLog(level, source, message) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    source,
    message
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  return entry;
}
function getLogs(levelFilter) {
  if (!levelFilter || levelFilter === "all") {
    return logs;
  }
  return logs.filter((l) => l.level === levelFilter);
}
function clearLogs() {
  logs.length = 0;
  recordLog("info", "Security", "Activity log buffer cleared by Boss.");
}
function isEmergencyHalted() {
  return emergencyHalted;
}
function setEmergencyHalted(halted) {
  emergencyHalted = halted;
  recordLog(
    halted ? "warning" : "info",
    "Safety",
    halted ? "Emergency Stop engaged. All autonomous task execution suspended." : "ULTRON systems resumed by Boss authorization."
  );
}

// server/systemMonitor.ts
import os3 from "node:os";
import fs3 from "node:fs";
import path3 from "node:path";
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";

// server/windowsControl.ts
import os2 from "node:os";
import fs2 from "node:fs";
import path2 from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// server/fileManager.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
var WORKSPACE_ROOT = path.resolve(process.cwd(), "ultron_workspace");
var rootPermissions = {
  workspace: true,
  desktop: false,
  downloads: false,
  documents: false
};
var activeRootId = "workspace";
function getRootPathMap() {
  const home = os.homedir();
  return {
    workspace: { label: "ULTRON Workspace", absPath: WORKSPACE_ROOT },
    desktop: { label: "User Desktop", absPath: path.resolve(home, "Desktop") },
    downloads: { label: "User Downloads", absPath: path.resolve(home, "Downloads") },
    documents: { label: "User Documents", absPath: path.resolve(home, "Documents") }
  };
}
function getPermittedRoots() {
  ensureWorkspaceSeeded();
  const map = getRootPathMap();
  const roots = Object.keys(map).map((id) => ({
    id,
    label: map[id].label,
    absPath: map[id].absPath,
    enabled: rootPermissions[id],
    exists: fs.existsSync(map[id].absPath)
  }));
  return { activeRootId, roots };
}
function setRootPermission(id, enabled) {
  if (id === "workspace") {
    rootPermissions.workspace = true;
  } else {
    rootPermissions[id] = enabled;
    if (!enabled && activeRootId === id) {
      activeRootId = "workspace";
    }
    recordLog(
      "action",
      "Security",
      `${enabled ? "Granted" : "Revoked"} file access permission for ${id}.`
    );
  }
  return getPermittedRoots().roots;
}
function setActiveRoot(id) {
  const map = getRootPathMap();
  if (!rootPermissions[id]) {
    throw new Error(`Permission denied: Enable access to "${id}" in Settings or File Permissions first.`);
  }
  if (!fs.existsSync(map[id].absPath)) {
    throw new Error(`Folder "${map[id].label}" does not exist on this computer.`);
  }
  activeRootId = id;
  return activeRootId;
}
function getActiveRootDir() {
  const map = getRootPathMap();
  if (!rootPermissions[activeRootId] || !fs.existsSync(map[activeRootId].absPath)) {
    return WORKSPACE_ROOT;
  }
  return map[activeRootId].absPath;
}
var CATEGORY_MAP = {
  pdf: "Documents",
  docx: "Documents",
  txt: "Documents",
  md: "Documents",
  xlsx: "Spreadsheets",
  csv: "Spreadsheets",
  pptx: "Presentations",
  jpg: "Media",
  jpeg: "Media",
  png: "Media",
  mp4: "Media",
  mp3: "Media",
  wav: "Media",
  zip: "Archives",
  json: "Data"
};
function getCategory(ext, isDirectory) {
  if (isDirectory) return "Folder";
  const clean = ext.toLowerCase().replace(/^\./, "");
  return CATEGORY_MAP[clean] || "Other";
}
function safeResolve(relativePath = "", rootOverride) {
  const baseRoot = rootOverride || getActiveRootDir();
  const cleaned = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(baseRoot, cleaned);
  if (resolved !== baseRoot && !resolved.startsWith(baseRoot + path.sep)) {
    throw new Error("Access denied: Path escapes permitted directory boundary.");
  }
  return resolved;
}
function toRelPath(absPath, rootOverride) {
  const baseRoot = rootOverride || getActiveRootDir();
  const rel = path.relative(baseRoot, absPath).replace(/\\/g, "/");
  return rel === "" ? "" : rel;
}
function buildEntry(absPath, rootOverride) {
  const stat = fs.statSync(absPath);
  const name = path.basename(absPath);
  const isDirectory = stat.isDirectory();
  const ext = isDirectory ? "" : path.extname(name).slice(1).toLowerCase();
  return {
    name,
    path: toRelPath(absPath, rootOverride),
    isDirectory,
    size: stat.size,
    extension: ext,
    modifiedAt: stat.mtime.toISOString(),
    category: getCategory(ext, isDirectory)
  };
}
function ensureWorkspaceSeeded() {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  }
  const existing = fs.readdirSync(WORKSPACE_ROOT);
  if (existing.length > 0) return;
  const dirs = ["Projects", "Downloads", "Documents", "Media"];
  for (const d of dirs) {
    fs.mkdirSync(path.join(WORKSPACE_ROOT, d), { recursive: true });
  }
  const sampleFiles = [
    {
      rel: "Projects/ULTRON_Architecture_Brief.txt",
      content: "ULTRON Personal Desktop Assistant Architecture\nPrepared for: Boss\n\nModules:\n1. Holographic Neural Core (Three.js WebGL)\n2. Voice & Three-Clap Acoustic Trigger\n3. Real-Time Hardware Telemetry\n4. Confined Workspace File Engine\n5. Authorized Communications Bridge\n"
    },
    {
      rel: "Projects/Quarterly_Roadmap.pdf",
      content: "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << /Length 58 >> stream\nBT /F1 12 Tf 72 720 Td (ULTRON Quarterly System Roadmap for Boss) Tj ET\nendstream endobj\n%%EOF\n"
    },
    {
      rel: "Projects/System_Calibration_Notes.md",
      content: "# System Calibration Notes\n\n- Preferred Address: Boss\n- Voice Profile: Natural Female (Kore / Zephyr)\n- Three-Clap Window: 320ms to 2100ms\n- Safety Gate: Always confirm before deleting files or placing calls.\n"
    },
    {
      rel: "Documents/Annual_Budget_2026.csv",
      content: "Quarter,Allocation,Status\nQ1,12500,Approved\nQ2,14800,Active\n"
    },
    {
      rel: "Downloads/Project_Proposal_Final.pdf",
      content: "%PDF-1.4\nBT /F1 12 Tf 72 720 Td (Project Proposal Final Edition) Tj ET\n%%EOF\n"
    },
    {
      rel: "Documents/Project_Proposal_Copy.pdf",
      content: "%PDF-1.4\nBT /F1 12 Tf 72 720 Td (Project Proposal Final Edition) Tj ET\n%%EOF\n"
    },
    {
      rel: "Downloads/Desktop_Wallpaper_Hologram.png",
      content: "\x89PNG\r\n\nULTRON_SAMPLE_PNG_METADATA"
    },
    {
      rel: "Downloads/Voice_Memo_01.mp3",
      content: "ID3\0ULTRON_SAMPLE_AUDIO_TRACK"
    },
    {
      rel: "Media/Demo_Capture.mp4",
      content: "\0\0\0ftypmp42ULTRON_SAMPLE_VIDEO"
    },
    {
      rel: "Media/System_Icon_Reference.jpg",
      content: "\xFF\xD8\xFF\xE0JFIFULTRON_SAMPLE_JPEG"
    }
  ];
  for (const item of sampleFiles) {
    const abs = safeResolve(item.rel, WORKSPACE_ROOT);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, item.content, "utf8");
  }
  recordLog("info", "Files", "Initialized ULTRON workspace with sample multi-format files.");
}
function listDirectory(relPath = "") {
  ensureWorkspaceSeeded();
  const abs = safeResolve(relPath);
  if (!fs.existsSync(abs)) {
    throw new Error("Directory does not exist.");
  }
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) {
    throw new Error("Requested path is not a directory.");
  }
  const names = fs.readdirSync(abs);
  const entries = [];
  for (const n of names) {
    try {
      entries.push(buildEntry(path.join(abs, n)));
    } catch {
    }
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}
function walkAllFiles(dirAbs, results = [], depth = 0) {
  if (depth > 4 || results.length > 800) return results;
  let items = [];
  try {
    items = fs.readdirSync(dirAbs);
  } catch {
    return results;
  }
  for (const item of items) {
    if (item.startsWith(".") || item === "node_modules") continue;
    const full = path.join(dirAbs, item);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walkAllFiles(full, results, depth + 1);
      } else {
        results.push(buildEntry(full));
      }
    } catch {
    }
  }
  return results;
}
function searchFiles(query = "", extension = "", dirRel = "") {
  ensureWorkspaceSeeded();
  const startAbs = safeResolve(dirRel);
  if (!fs.existsSync(startAbs)) return [];
  const all = walkAllFiles(startAbs);
  const q = query.trim().toLowerCase();
  const ext = extension.trim().toLowerCase().replace(/^\./, "");
  return all.filter((f) => {
    const matchesQuery = !q || f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    const matchesExt = !ext || f.extension === ext;
    return matchesQuery && matchesExt;
  });
}
function getRecentFiles(limit = 15) {
  ensureWorkspaceSeeded();
  const all = walkAllFiles(getActiveRootDir());
  all.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return all.slice(0, Math.max(1, Math.min(50, limit)));
}
function findDuplicateFiles() {
  ensureWorkspaceSeeded();
  const all = walkAllFiles(getActiveRootDir());
  const byHash = /* @__PURE__ */ new Map();
  for (const file of all) {
    if (file.size > 25 * 1024 * 1024) continue;
    try {
      const abs = safeResolve(file.path);
      const data = fs.readFileSync(abs);
      const hash = crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
      const list = byHash.get(hash) || [];
      list.push(file);
      byHash.set(hash, list);
    } catch {
    }
  }
  const groups = [];
  for (const [hash, files] of byHash.entries()) {
    if (files.length > 1) {
      groups.push({ hash, size: files[0].size, files });
    }
  }
  return groups;
}
function createFolder(parentRel, folderName) {
  ensureWorkspaceSeeded();
  const cleanName = path.basename(folderName.trim());
  if (!cleanName || cleanName === "." || cleanName === "..") {
    throw new Error("Invalid folder name.");
  }
  const targetAbs = safeResolve(parentRel ? `${parentRel}/${cleanName}` : cleanName);
  if (fs.existsSync(targetAbs)) {
    throw new Error(`Folder "${cleanName}" already exists.`);
  }
  fs.mkdirSync(targetAbs, { recursive: true });
  recordLog("action", "Files", `Created folder "${toRelPath(targetAbs)}"`);
  return buildEntry(targetAbs);
}
function renameEntry(relPath, newName) {
  ensureWorkspaceSeeded();
  const baseRoot = getActiveRootDir();
  const srcAbs = safeResolve(relPath);
  if (!fs.existsSync(srcAbs) || srcAbs === baseRoot) {
    throw new Error("Source entry not found.");
  }
  const cleanNew = path.basename(newName.trim());
  if (!cleanNew || cleanNew === "." || cleanNew === "..") {
    throw new Error("Invalid new name.");
  }
  const destAbs = path.resolve(path.dirname(srcAbs), cleanNew);
  if (!destAbs.startsWith(baseRoot + path.sep)) {
    throw new Error("Destination outside permitted boundary.");
  }
  if (fs.existsSync(destAbs)) {
    throw new Error(`An entry named "${cleanNew}" already exists.`);
  }
  fs.renameSync(srcAbs, destAbs);
  recordLog("action", "Files", `Renamed "${relPath}" to "${toRelPath(destAbs)}"`);
  return buildEntry(destAbs);
}
function moveOrCopyEntry(srcRel, destDirRel, mode, overwrite = false) {
  ensureWorkspaceSeeded();
  const baseRoot = getActiveRootDir();
  const srcAbs = safeResolve(srcRel);
  const destDirAbs = safeResolve(destDirRel);
  if (!fs.existsSync(srcAbs) || srcAbs === baseRoot) {
    throw new Error("Source file or folder not found.");
  }
  if (!fs.existsSync(destDirAbs) || !fs.statSync(destDirAbs).isDirectory()) {
    throw new Error("Destination directory does not exist.");
  }
  const destAbs = path.resolve(destDirAbs, path.basename(srcAbs));
  if (!destAbs.startsWith(baseRoot + path.sep)) {
    throw new Error("Destination escapes permitted boundary.");
  }
  let finalDestAbs = destAbs;
  if (srcAbs === destAbs) {
    if (mode === "move") {
      return buildEntry(srcAbs);
    }
    const ext = path.extname(srcAbs);
    const base = path.basename(srcAbs, ext);
    finalDestAbs = path.join(destDirAbs, `${base}_copy${ext}`);
  }
  if (fs.existsSync(finalDestAbs) && !overwrite) {
    throw new Error("CONFLICT: Target file already exists. Confirmation required to overwrite.");
  }
  if (mode === "move") {
    fs.renameSync(srcAbs, finalDestAbs);
    recordLog("action", "Files", `Moved "${srcRel}" to "${toRelPath(finalDestAbs)}"`);
  } else {
    fs.cpSync(srcAbs, finalDestAbs, { recursive: true, force: overwrite });
    recordLog("action", "Files", `Copied "${srcRel}" to "${toRelPath(finalDestAbs)}"`);
  }
  return buildEntry(finalDestAbs);
}
function organizeFolder(targetRel = "Downloads") {
  ensureWorkspaceSeeded();
  const dirAbs = safeResolve(targetRel);
  if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) {
    throw new Error(`Folder "${targetRel}" does not exist.`);
  }
  const items = fs.readdirSync(dirAbs);
  const moves = [];
  for (const name of items) {
    const full = path.join(dirAbs, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) continue;
    const ext = path.extname(name).slice(1).toLowerCase();
    const category = getCategory(ext, false);
    const categoryDir = path.join(dirAbs, category);
    fs.mkdirSync(categoryDir, { recursive: true });
    let dest = path.join(categoryDir, name);
    if (fs.existsSync(dest)) {
      const base = path.basename(name, path.extname(name));
      dest = path.join(categoryDir, `${base}_${Date.now()}${path.extname(name)}`);
    }
    fs.renameSync(full, dest);
    moves.push({ from: toRelPath(full), to: toRelPath(dest) });
  }
  recordLog(
    "action",
    "Files",
    `Organized ${moves.length} file(s) inside "${targetRel || "root"}" by format category.`
  );
  return { movedCount: moves.length, moves };
}
function readZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 67324752) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const rawSlice = buffer.subarray(dataStart, dataStart + compressedSize);
    let data = rawSlice;
    if (compression === 8 && compressedSize > 0) {
      try {
        data = zlib.inflateRawSync(rawSlice);
      } catch {
        data = Buffer.alloc(0);
      }
    }
    entries.push({ name, data });
    offset = dataStart + compressedSize;
  }
  return entries;
}
function stripXmlTags(xml) {
  return xml.replace(/<\/w:p>|<\/a:p>|<\/row>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();
}
function extractPdfText(buffer) {
  const latin = buffer.toString("latin1");
  const matches = latin.match(/\(([^()\\]{2,200})\)\s*Tj/g) || [];
  const extracted = matches.map((m) => m.replace(/^\(/, "").replace(/\)\s*Tj$/, "")).join(" ");
  if (extracted.trim().length > 0) {
    return extracted;
  }
  return `PDF Document (${buffer.length} bytes).`;
}
function readFileContent(relPath) {
  ensureWorkspaceSeeded();
  const abs = safeResolve(relPath);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    throw new Error("File not found.");
  }
  const entry = buildEntry(abs);
  const textExtensions = /* @__PURE__ */ new Set(["txt", "md", "json", "csv", "log", "ts", "tsx", "js", "ps1"]);
  if (textExtensions.has(entry.extension)) {
    const raw = fs.readFileSync(abs, "utf8");
    return {
      entry,
      previewable: true,
      content: raw.slice(0, 65536)
    };
  }
  if (entry.extension === "pdf") {
    const buf = fs.readFileSync(abs);
    return {
      entry,
      previewable: true,
      content: extractPdfText(buf)
    };
  }
  if (["zip", "docx", "xlsx", "pptx"].includes(entry.extension)) {
    const buf = fs.readFileSync(abs);
    const zipItems = readZipEntries(buf);
    if (entry.extension === "zip") {
      const list = zipItems.map((z) => `- ${z.name} (${z.data.length} bytes)`).join("\n");
      return {
        entry,
        previewable: true,
        content: list || `ZIP archive (${entry.size} bytes)`
      };
    }
    const xmlFiles = zipItems.filter(
      (z) => z.name === "word/document.xml" || z.name === "xl/sharedStrings.xml" || /^ppt\/slides\/slide\d+\.xml$/.test(z.name)
    );
    const text = xmlFiles.map((z) => stripXmlTags(z.data.toString("utf8"))).join("\n\n");
    return {
      entry,
      previewable: true,
      content: text || `${entry.extension.toUpperCase()} archive (${entry.size} bytes)`
    };
  }
  return {
    entry,
    previewable: false,
    content: `${entry.extension.toUpperCase() || "DATA"} media/binary file (${entry.size} bytes). Modified ${new Date(
      entry.modifiedAt
    ).toLocaleString()}.`
  };
}
function deleteEntry(relPath) {
  ensureWorkspaceSeeded();
  const baseRoot = getActiveRootDir();
  const abs = safeResolve(relPath);
  if (!fs.existsSync(abs) || abs === baseRoot) {
    throw new Error("Target entry not found or protected.");
  }
  fs.rmSync(abs, { recursive: true, force: false });
  recordLog("warning", "Files", `Deleted "${relPath}" after Boss confirmation.`);
}

// server/windowsControl.ts
var execFileAsync = promisify(execFile);
var PINNED_APPS = [
  {
    id: "chrome",
    name: "Google Chrome",
    category: "Browser",
    launchCommand: "chrome.exe",
    processName: "chrome",
    webFallbackUrl: "https://www.google.com",
    installed: true
  },
  {
    id: "msedge",
    name: "Microsoft Edge",
    category: "Browser",
    launchCommand: "msedge.exe",
    processName: "msedge",
    webFallbackUrl: "https://www.bing.com",
    installed: true
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    category: "Development",
    launchCommand: "code",
    processName: "Code",
    webFallbackUrl: "https://vscode.dev",
    installed: true
  },
  {
    id: "explorer",
    name: "File Explorer",
    category: "System",
    launchCommand: "explorer.exe",
    processName: "explorer",
    installed: true
  },
  {
    id: "terminal",
    name: "Windows Terminal",
    category: "Development",
    launchCommand: "wt.exe",
    processName: "WindowsTerminal",
    installed: true
  },
  {
    id: "powershell",
    name: "PowerShell",
    category: "System",
    launchCommand: "powershell.exe",
    processName: "powershell",
    installed: true
  },
  {
    id: "settings",
    name: "Windows Settings",
    category: "System",
    launchCommand: "ms-settings:",
    processName: "SystemSettings",
    installed: true
  },
  {
    id: "calculator",
    name: "Calculator",
    category: "Productivity",
    launchCommand: "calc.exe",
    processName: "CalculatorApp",
    installed: true
  },
  {
    id: "notepad",
    name: "Notepad",
    category: "Productivity",
    launchCommand: "notepad.exe",
    processName: "notepad",
    installed: true
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "Media",
    launchCommand: "whatsapp:",
    processName: "WhatsApp",
    webFallbackUrl: "https://web.whatsapp.com",
    installed: true
  },
  {
    id: "phonelink",
    name: "Windows Phone Link",
    category: "System",
    launchCommand: "ms-phone:",
    processName: "PhoneExperienceHost",
    installed: true
  }
];
var PROTECTED_PROCESS_NAMES = /* @__PURE__ */ new Set([
  "system",
  "smss",
  "csrss",
  "wininit",
  "services",
  "lsass",
  "svchost",
  "dwm",
  "explorer",
  "systemd",
  "init",
  "node"
]);
async function runPowerShell(script, timeoutMs = 5e3) {
  if (os2.platform() !== "win32") {
    throw new Error("Windows host required for native PowerShell execution.");
  }
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { timeout: timeoutMs }
  );
  return stdout.trim();
}
async function discoverInstalledApps() {
  if (os2.platform() === "win32") {
    try {
      const ps = `
        $apps = Get-StartApps | Select-Object -First 35 Name, AppID
        $apps | ConvertTo-Json -Compress
      `;
      const raw = await runPowerShell(ps, 6e3);
      if (raw) {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const discovered = arr.filter((item) => item?.Name && item?.AppID).map((item) => ({
          id: `win-${item.Name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28)}`,
          name: item.Name,
          category: /chrome|edge|firefox|brave/i.test(item.Name) ? "Browser" : /code|terminal|powershell|git|studio/i.test(item.Name) ? "Development" : /spotify|vlc|media|whatsapp|teams|zoom/i.test(item.Name) ? "Media" : /settings|control|store|task|defender/i.test(item.Name) ? "System" : "Productivity",
          launchCommand: `shell:AppsFolder\\${item.AppID}`,
          processName: item.Name.split(" ")[0],
          installed: true
        }));
        const seen = new Set(PINNED_APPS.map((a) => a.name.toLowerCase()));
        return [
          ...PINNED_APPS,
          ...discovered.filter((d) => !seen.has(d.name.toLowerCase()))
        ];
      }
    } catch (err) {
      recordLog("warning", "Desktop", `StartApps discovery fallback: ${String(err)}`);
    }
  } else {
    try {
      const appsDir = "/usr/share/applications";
      if (fs2.existsSync(appsDir)) {
        const files = fs2.readdirSync(appsDir).filter((f) => f.endsWith(".desktop")).slice(0, 12);
        const linuxApps = [];
        for (const file of files) {
          const content = fs2.readFileSync(path2.join(appsDir, file), "utf8");
          const nameMatch = content.match(/^Name=(.+)$/m);
          const execMatch = content.match(/^Exec=([^\s%]+)/m);
          if (nameMatch && execMatch) {
            linuxApps.push({
              id: `linux-${file.replace(/\.desktop$/, "")}`,
              name: nameMatch[1].trim(),
              category: "Productivity",
              launchCommand: path2.basename(execMatch[1].trim()),
              processName: path2.basename(execMatch[1].trim()),
              installed: true
            });
          }
        }
        return [...PINNED_APPS, ...linuxApps];
      }
    } catch {
    }
  }
  return PINNED_APPS;
}
async function controlWindowsApplication(appIdOrName, operation, appsRegistry) {
  const query = appIdOrName.trim().toLowerCase();
  const app = appsRegistry.find(
    (a) => a.id.toLowerCase() === query || a.name.toLowerCase() === query || a.name.toLowerCase().includes(query)
  );
  if (!app) {
    return {
      ok: false,
      executedOnHost: false,
      message: `Application "${appIdOrName}" is not in the discovered allowlist.`
    };
  }
  if (os2.platform() !== "win32") {
    recordLog("action", "Desktop", `App ${operation} (${app.name}) tracked on ${os2.platform()} host.`);
    return {
      ok: true,
      executedOnHost: false,
      app,
      message: `${app.name} ${operation} registered. Native Win32 window control activates automatically on Windows 10/11.`
    };
  }
  try {
    if (operation === "open") {
      if (app.launchCommand.startsWith("shell:AppsFolder\\")) {
        const appId = app.launchCommand.replace("shell:AppsFolder\\", "");
        if (!/^[A-Za-z0-9_.!\\-]+$/.test(appId)) {
          throw new Error("Invalid AppID format.");
        }
        await execFileAsync("explorer.exe", [`shell:AppsFolder\\${appId}`], { timeout: 4e3 });
      } else if (/^(ms-settings:|ms-phone:|whatsapp:)$/.test(app.launchCommand)) {
        await execFileAsync("cmd", ["/c", "start", "", app.launchCommand], { timeout: 4e3 });
      } else {
        const safeExe = path2.basename(app.launchCommand);
        await execFileAsync("cmd", ["/c", "start", "", safeExe], { timeout: 4e3 });
      }
      recordLog("action", "Windows", `Launched ${app.name}`);
      return { ok: true, executedOnHost: true, app, message: `Opened ${app.name}.` };
    }
    const procName = (app.processName || app.id).replace(/[^A-Za-z0-9_.-]/g, "");
    if (!procName) throw new Error("Invalid process target.");
    if (operation === "close") {
      if (PROTECTED_PROCESS_NAMES.has(procName.toLowerCase())) {
        return {
          ok: false,
          executedOnHost: false,
          app,
          message: `${app.name} is a protected system process and will not be terminated.`
        };
      }
      await runPowerShell(`Get-Process -Name "${procName}" -ErrorAction SilentlyContinue | Stop-Process`);
      recordLog("action", "Windows", `Closed ${app.name}`);
      return { ok: true, executedOnHost: true, app, message: `Closed ${app.name}.` };
    }
    const cmdCode = operation === "minimize" ? 6 : operation === "maximize" ? 3 : 9;
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
    await runPowerShell(win32Script, 5e3);
    recordLog("action", "Windows", `${operation} window for ${app.name}`);
    return { ok: true, executedOnHost: true, app, message: `${operation} applied to ${app.name}.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordLog("error", "Windows", `App control failed for ${app.name}: ${msg}`);
    return { ok: false, executedOnHost: false, app, message: msg };
  }
}
async function executeWindowsSystemControl(action, value) {
  if (action === "screenshot") {
    const shotsDir = path2.join(WORKSPACE_ROOT, "Screenshots");
    fs2.mkdirSync(shotsDir, { recursive: true });
    const fileName = `screenshot_${Date.now()}.png`;
    const destPath = path2.join(shotsDir, fileName);
    if (os2.platform() === "win32") {
      try {
        const ps = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
          $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
          $graphics = [System.Drawing.Graphics]::FromImage($bmp)
          $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
          $bmp.Save("${destPath.replace(/\\/g, "\\\\")}", [System.Drawing.Imaging.ImageFormat]::Png)
          $graphics.Dispose()
          $bmp.Dispose()
        `;
        await runPowerShell(ps, 6e3);
        recordLog("action", "Windows", `Captured desktop screenshot: Screenshots/${fileName}`);
        return {
          ok: true,
          executedOnHost: true,
          message: `Desktop screenshot saved to Screenshots/${fileName}.`,
          data: { path: `Screenshots/${fileName}` }
        };
      } catch (err) {
        return {
          ok: false,
          executedOnHost: false,
          message: `Desktop screenshot failed: ${err instanceof Error ? err.message : String(err)}`
        };
      }
    }
    return {
      ok: true,
      executedOnHost: false,
      message: "Browser canvas snapshot triggered.",
      data: { browserFallback: true }
    };
  }
  if (os2.platform() !== "win32") {
    return {
      ok: true,
      executedOnHost: false,
      message: `Applied "${action}" in workspace mode. Full OS-level hardware hooks activate on Windows 10/11.`
    };
  }
  try {
    if (action === "settings") {
      await execFileAsync("cmd", ["/c", "start", "", "ms-settings:"], { timeout: 3e3 });
      return { ok: true, executedOnHost: true, message: "Opened Windows Settings." };
    }
    if (action === "volume_mute" || action === "volume_up" || action === "volume_down") {
      const keyCode = action === "volume_mute" ? 173 : action === "volume_down" ? 174 : 175;
      const repeat = action === "volume_mute" ? 1 : 4;
      const ps = `
        $wsh = New-Object -ComObject WScript.Shell
        for ($i = 0; $i -lt ${repeat}; $i++) { $wsh.SendKeys([char]${keyCode}) }
      `;
      await runPowerShell(ps, 3500);
      return { ok: true, executedOnHost: true, message: `Executed Windows ${action}.` };
    }
    if (action === "volume_set") {
      const target = Math.max(0, Math.min(100, Number(value ?? 50)));
      const stepsUp = Math.round(target / 2);
      const ps = `
        $wsh = New-Object -ComObject WScript.Shell
        for ($i = 0; $i -lt 50; $i++) { $wsh.SendKeys([char]174) }
        for ($i = 0; $i -lt ${stepsUp}; $i++) { $wsh.SendKeys([char]175) }
      `;
      await runPowerShell(ps, 5e3);
      return { ok: true, executedOnHost: true, message: `Set Windows system volume near ${target}%.` };
    }
    if (action === "brightness_set") {
      const level = Math.max(10, Math.min(100, Number(value ?? 80)));
      const ps = `
        $m = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue
        if ($m) { $m.WmiSetBrightness(1, ${level}) }
      `;
      await runPowerShell(ps, 4e3);
      return { ok: true, executedOnHost: true, message: `Adjusted display brightness to ${level}%.` };
    }
    if (action === "clipboard_read") {
      const text = await runPowerShell("Get-Clipboard -Raw", 3e3);
      return { ok: true, executedOnHost: true, message: "Clipboard read from Windows.", data: { text } };
    }
    if (action === "clipboard_write") {
      const text = String(value || "");
      const b64 = Buffer.from(text, "utf8").toString("base64");
      await runPowerShell(
        `$txt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${b64}")); Set-Clipboard -Value $txt`,
        3e3
      );
      return { ok: true, executedOnHost: true, message: "Copied text to Windows clipboard." };
    }
  } catch (err) {
    return {
      ok: false,
      executedOnHost: false,
      message: err instanceof Error ? err.message : String(err)
    };
  }
  return { ok: false, executedOnHost: false, message: "Unsupported control action." };
}
async function readWindowsSensors() {
  if (os2.platform() !== "win32") {
    return {
      battery: { available: false, percent: null, charging: null },
      temperature: { available: false, celsius: null }
    };
  }
  let battery = { available: false, percent: null, charging: null };
  let temperature = { available: false, celsius: null };
  try {
    const batRaw = await runPowerShell(
      "Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1 EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress",
      3e3
    );
    if (batRaw) {
      const parsed = JSON.parse(batRaw);
      if (typeof parsed.EstimatedChargeRemaining === "number") {
        battery = {
          available: true,
          percent: parsed.EstimatedChargeRemaining,
          charging: parsed.BatteryStatus === 2 || parsed.BatteryStatus === 6
        };
      }
    }
  } catch {
  }
  try {
    const tempRaw = await runPowerShell(
      "Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1 CurrentTemperature | ConvertTo-Json -Compress",
      3e3
    );
    if (tempRaw) {
      const parsed = JSON.parse(tempRaw);
      if (typeof parsed.CurrentTemperature === "number" && parsed.CurrentTemperature > 2e3) {
        temperature = {
          available: true,
          celsius: Math.round((parsed.CurrentTemperature / 10 - 273.15) * 10) / 10
        };
      }
    }
  } catch {
  }
  return { battery, temperature };
}
async function triggerWindowsCallUri(targetHandle, service) {
  const cleanDigits = targetHandle.replace(/[^0-9+]/g, "");
  let uri = `tel:${cleanDigits || encodeURIComponent(targetHandle)}`;
  if (service === "WhatsApp") {
    uri = cleanDigits ? `https://wa.me/${cleanDigits.replace(/^\+/, "")}` : "https://web.whatsapp.com";
  } else if (service === "Phone Link") {
    uri = cleanDigits ? `tel:${cleanDigits}` : "ms-phone:";
  } else if (service === "VoIP") {
    uri = `sip:${encodeURIComponent(targetHandle)}`;
  }
  if (os2.platform() === "win32") {
    try {
      await execFileAsync("cmd", ["/c", "start", "", uri], { timeout: 3500 });
      recordLog("action", "Comms", `Invoked Windows call URI (${service}) for ${targetHandle}`);
      return { executedOnHost: true, uri };
    } catch {
      return { executedOnHost: false, uri };
    }
  }
  return { executedOnHost: false, uri };
}
async function openExternalUrlOnWindows(url) {
  if (os2.platform() !== "win32") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    await execFileAsync("cmd", ["/c", "start", "", url], { timeout: 3500 });
    return true;
  } catch {
    return false;
  }
}

// server/systemMonitor.ts
var execFileAsync2 = promisify2(execFile2);
var prevCpuSample = null;
var lastInternetCheck = {
  checkedAt: 0,
  connected: true,
  latencyMs: null
};
function readCpuSample() {
  const cpus = os3.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}
function computeCpuPercent() {
  const current = readCpuSample();
  if (!prevCpuSample) {
    prevCpuSample = current;
    const load1 = os3.loadavg()[0] || 0;
    const cores = Math.max(1, os3.cpus().length);
    return Math.min(100, Math.max(1, Math.round(load1 / cores * 100)));
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
async function probeInternet() {
  const now = Date.now();
  if (now - lastInternetCheck.checkedAt < 12e3) {
    return {
      connected: lastInternetCheck.connected,
      latencyMs: lastInternetCheck.latencyMs
    };
  }
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const res = await fetch("https://dns.google/resolve?name=example.com&type=A", {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    lastInternetCheck = {
      checkedAt: now,
      connected: res.ok,
      latencyMs: latency
    };
  } catch {
    lastInternetCheck = {
      checkedAt: now,
      connected: false,
      latencyMs: null
    };
  }
  return {
    connected: lastInternetCheck.connected,
    latencyMs: lastInternetCheck.latencyMs
  };
}
function readStorageStats() {
  try {
    const stats = fs3.statfsSync(process.cwd());
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const totalGb = Math.round(totalBytes / 1024 ** 3 * 10) / 10;
    const usedGb = Math.round(usedBytes / 1024 ** 3 * 10) / 10;
    const percent = totalBytes > 0 ? Math.round(usedBytes / totalBytes * 1e3) / 10 : 0;
    return { usedGb, totalGb, percent };
  } catch {
    return { usedGb: 0, totalGb: 0, percent: 0 };
  }
}
function readBatteryInfo() {
  if (os3.platform() === "linux") {
    try {
      const base = "/sys/class/power_supply";
      if (fs3.existsSync(base)) {
        const entries = fs3.readdirSync(base);
        const bat = entries.find((e) => e.startsWith("BAT"));
        if (bat) {
          const capPath = path3.join(base, bat, "capacity");
          const statusPath = path3.join(base, bat, "status");
          const cap = fs3.existsSync(capPath) ? Number(fs3.readFileSync(capPath, "utf8").trim()) : null;
          const status = fs3.existsSync(statusPath) ? fs3.readFileSync(statusPath, "utf8").trim() : "";
          return {
            available: cap !== null && !Number.isNaN(cap),
            percent: cap,
            charging: status.toLowerCase() === "charging"
          };
        }
      }
    } catch {
    }
  }
  return { available: false, percent: null, charging: null };
}
function readTemperatureInfo() {
  if (os3.platform() === "linux") {
    try {
      const base = "/sys/class/thermal";
      if (fs3.existsSync(base)) {
        const zones = fs3.readdirSync(base).filter((e) => e.startsWith("thermal_zone"));
        for (const z of zones) {
          const tempFile = path3.join(base, z, "temp");
          if (fs3.existsSync(tempFile)) {
            const raw = Number(fs3.readFileSync(tempFile, "utf8").trim());
            if (!Number.isNaN(raw) && raw > 0) {
              const celsius = raw > 1e3 ? Math.round(raw / 1e3 * 10) / 10 : raw;
              return { available: true, celsius };
            }
          }
        }
      }
    } catch {
    }
  }
  return { available: false, celsius: null };
}
async function readProcesses() {
  try {
    if (os3.platform() === "win32") {
      const { stdout: stdout2 } = await execFileAsync2("tasklist", ["/FO", "CSV", "/NH"], { timeout: 2500 });
      const lines2 = stdout2.trim().split(/\r?\n/).slice(0, 12);
      return lines2.map((line) => {
        const parts = line.split('","').map((p) => p.replace(/^"|"$/g, ""));
        const memKb = Number((parts[4] || "0").replace(/[^0-9]/g, ""));
        const totalMemKb = os3.totalmem() / 1024;
        const memPct = totalMemKb > 0 ? Math.round(memKb / totalMemKb * 1e3) / 10 : 0;
        return {
          pid: Number(parts[1]) || 0,
          name: parts[0] || "unknown",
          cpu: 0,
          memory: memPct
        };
      }).filter((p) => p.pid > 0);
    }
    const { stdout } = await execFileAsync2(
      "ps",
      ["-eo", "pid,pcpu,pmem,comm", "--sort=-pmem"],
      { timeout: 2500 }
    );
    const lines = stdout.trim().split("\n").slice(1, 13);
    return lines.map((line) => {
      const match = line.trim().match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        cpu: Number(match[2]),
        memory: Number(match[3]),
        name: match[4].trim()
      };
    }).filter((item) => item !== null);
  } catch {
    return [
      {
        pid: process.pid,
        name: "node (ULTRON Core)",
        cpu: 1.4,
        memory: Math.round(process.memoryUsage().rss / os3.totalmem() * 1e3) / 10
      }
    ];
  }
}
function getHardwareProfile() {
  const cpus = os3.cpus();
  const cores = Math.max(1, cpus.length);
  const totalRamGb = Math.round(os3.totalmem() / 1024 ** 3 * 10) / 10;
  let tier = "Balanced";
  if (cores >= 8 && totalRamGb >= 16) {
    tier = "High-Performance";
  } else if (cores <= 2 || totalRamGb < 4) {
    tier = "Efficiency";
  }
  return {
    platform: os3.platform(),
    arch: os3.arch(),
    cpuModel: cpus[0]?.model?.trim() || "Generic Processor",
    cpuCores: cores,
    totalRamGb,
    tier,
    recommendedPollingMs: tier === "High-Performance" ? 1800 : tier === "Balanced" ? 2500 : 4e3,
    recommendedParticleCount: tier === "High-Performance" ? 1400 : tier === "Balanced" ? 950 : 550
  };
}
async function collectSystemTelemetry() {
  const cpuPercent = computeCpuPercent();
  const totalBytes = os3.totalmem();
  const freeBytes = os3.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const memoryTotalGb = Math.round(totalBytes / 1024 ** 3 * 10) / 10;
  const memoryUsedGb = Math.round(usedBytes / 1024 ** 3 * 10) / 10;
  const memoryPercent = totalBytes > 0 ? Math.round(usedBytes / totalBytes * 1e3) / 10 : 0;
  const storage = readStorageStats();
  const netIfaces = os3.networkInterfaces();
  const networkInterfaces = [];
  for (const [name, addrs] of Object.entries(netIfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === "IPv4") {
        networkInterfaces.push({ name, address: addr.address, family: addr.family });
      }
    }
  }
  const [internet, processes, winSensors] = await Promise.all([
    probeInternet(),
    readProcesses(),
    os3.platform() === "win32" ? readWindowsSensors() : Promise.resolve(null)
  ]);
  const battery = winSensors?.battery.available ? winSensors.battery : readBatteryInfo();
  const temperature = winSensors?.temperature.available ? winSensors.temperature : readTemperatureInfo();
  const hardware = getHardwareProfile();
  let advisory = null;
  if (memoryPercent >= 85) {
    const topProc = processes[0]?.name || "active processes";
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
    uptimeSeconds: Math.round(os3.uptime()),
    battery,
    temperature,
    processes,
    hardware,
    advisory
  };
}

// server/desktopBridge.ts
import { execFile as execFile3 } from "node:child_process";
import { promisify as promisify3 } from "node:util";
var execFileAsync3 = promisify3(execFile3);
var KNOWN_WEBSITES = {
  google: "https://www.google.com",
  youtube: "https://www.youtube.com",
  facebook: "https://www.facebook.com",
  gmail: "https://mail.google.com",
  chatgpt: "https://chatgpt.com",
  github: "https://github.com",
  wikipedia: "https://www.wikipedia.org"
};
function validateExternalUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (KNOWN_WEBSITES[lower]) {
    return KNOWN_WEBSITES[lower];
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
function getWindowsCompanionScript() {
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

// server/geminiService.ts
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
var cachedAi = null;
function getAiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
    return null;
  }
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return cachedAi;
}
async function checkOllamaStatus() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { available: false, models: [] };
    const data = await res.json();
    return {
      available: true,
      models: (data.models || []).map((m) => m.name)
    };
  } catch {
    return { available: false, models: [] };
  }
}
async function queryOllamaChat(command, history, modelName) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8e3);
    const messages = [
      {
        role: "system",
        content: "You are ULTRON, a calm, intelligent, friendly personal desktop AI assistant with a warm female personality. Always address the user as Boss. Keep responses concise (1-3 sentences)."
      },
      ...history.slice(-6).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
      })),
      { role: "user", content: command }
    ];
    const res = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName || "llama3.2", messages, stream: false }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
var ULTRON_TOOLS = [
  {
    name: "open_application",
    description: "Open, close, minimize, maximize, or focus an installed desktop application such as Chrome, Edge, VS Code, Terminal, PowerShell, File Explorer, Calculator, Notepad, Settings, WhatsApp, or Phone Link.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: { type: Type.STRING, description: "Application name, e.g. Chrome, VS Code, Terminal, Calculator" },
        operation: {
          type: Type.STRING,
          description: "One of: open, close, minimize, maximize, focus"
        }
      },
      required: ["appName"]
    }
  },
  {
    name: "open_website",
    description: "Open a website or perform a web search on Google, YouTube, Gmail, Facebook, ChatGPT, GitHub, or any requested URL.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        site: { type: Type.STRING, description: "Site name or URL, e.g. youtube, google, gmail, chatgpt, facebook" },
        searchQuery: { type: Type.STRING, description: "Optional search query to look up on the site" }
      },
      required: ["site"]
    }
  },
  {
    name: "manage_files",
    description: "Search local files by name or extension, find latest/recent files, detect duplicates, organize a folder (like Downloads or Desktop), or create a folder.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "One of: search, recent, duplicates, organize, create_folder, delete_request"
        },
        query: { type: Type.STRING, description: "Search term or folder name" },
        extension: { type: Type.STRING, description: "Optional file extension filter like pdf, docx, txt, xlsx, png" },
        folder: { type: Type.STRING, description: "Target folder such as Downloads or Projects" }
      },
      required: ["action"]
    }
  },
  {
    name: "system_monitor",
    description: "Check live computer performance including CPU usage, memory usage, storage, network status, running processes, and optimization advisories.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        focus: {
          type: Type.STRING,
          description: "One of: summary, processes, optimization"
        }
      },
      required: ["focus"]
    }
  },
  {
    name: "system_control",
    description: "Control Windows/system settings such as audio volume, brightness, taking a screenshot, opening Windows settings, or managing clipboard.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "One of: volume_up, volume_down, volume_mute, volume_set, brightness_set, screenshot, settings, clipboard_read"
        },
        value: { type: Type.NUMBER, description: "Optional numeric level 0-100" }
      },
      required: ["action"]
    }
  },
  {
    name: "initiate_call",
    description: "Prepare a phone or VoIP call to a contact via Windows Phone Link, WhatsApp, or VoIP. Always requires user confirmation before dialing.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        contactName: { type: Type.STRING, description: "Name or phone number of the contact" },
        service: {
          type: Type.STRING,
          description: "Preferred calling service: Phone Link, WhatsApp, or VoIP"
        }
      },
      required: ["contactName"]
    }
  }
];
async function executeToolCall(name, args) {
  const clientActions = [];
  if (name === "open_application") {
    const appName = String(args.appName || "Chrome");
    const rawOp = String(args.operation || "open").toLowerCase();
    const operation = rawOp === "close" || rawOp === "minimize" || rawOp === "maximize" || rawOp === "focus" ? rawOp : "open";
    const registry = await discoverInstalledApps();
    const outcome = await controlWindowsApplication(appName, operation, registry);
    clientActions.push({
      type: "app_control",
      payload: { appName: outcome.app?.name || appName, appId: outcome.app?.id || appName, operation }
    });
    return {
      resultSummary: outcome.message,
      clientActions,
      actionCard: {
        kind: "app",
        title: `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${outcome.app?.name || appName}`,
        subtitle: outcome.executedOnHost ? "Executed on Windows Host" : "Desktop Application Launcher",
        appName: outcome.app?.name || appName
      }
    };
  }
  if (name === "open_website") {
    const site = String(args.site || "google");
    const searchQuery = args.searchQuery ? String(args.searchQuery) : "";
    let targetUrl = validateExternalUrl(site) || "https://www.google.com";
    if (searchQuery) {
      if (site.toLowerCase().includes("youtube")) {
        targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
      } else {
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      }
    }
    const launchedOnWin = await openExternalUrlOnWindows(targetUrl);
    clientActions.push({ type: "stage_website", payload: { url: targetUrl, site, searchQuery } });
    return {
      resultSummary: launchedOnWin ? `Opened ${targetUrl} in your default Windows browser.` : `Ready to open ${targetUrl}.`,
      clientActions,
      actionCard: {
        kind: "website",
        title: searchQuery ? `${site} search: "${searchQuery}"` : `Open ${site}`,
        subtitle: targetUrl,
        url: targetUrl
      }
    };
  }
  if (name === "manage_files") {
    const action = String(args.action || "search");
    const query = args.query ? String(args.query) : "";
    const ext = args.extension ? String(args.extension) : "";
    const folder = args.folder ? String(args.folder) : "";
    if (action === "recent") {
      const files = getRecentFiles(8);
      return {
        resultSummary: `Found ${files.length} recently modified files. Latest is ${files[0]?.name || "none"}.`,
        clientActions: [{ type: "navigate_tab", payload: { tab: "files" } }],
        actionCard: {
          kind: "files",
          title: "Recently Modified Files",
          subtitle: `${files.length} entries`,
          files: files.slice(0, 5)
        }
      };
    }
    if (action === "duplicates") {
      const groups = findDuplicateFiles();
      const dupFiles = groups.flatMap((g) => g.files);
      return {
        resultSummary: groups.length > 0 ? `Detected ${groups.length} duplicate file group(s) (${dupFiles.length} total files).` : "No duplicate files detected in your active folder.",
        clientActions: [{ type: "navigate_tab", payload: { tab: "files" } }],
        actionCard: {
          kind: "files",
          title: "Duplicate File Scan",
          subtitle: `${groups.length} duplicate group(s) found`,
          files: dupFiles.slice(0, 6)
        }
      };
    }
    if (action === "create_folder") {
      const folderName = query || folder || "Projects";
      const created = createFolder("", folderName);
      return {
        resultSummary: `Created folder "${created.name}".`,
        clientActions: [{ type: "refresh_files", payload: {} }],
        actionCard: {
          kind: "files",
          title: "Folder Created",
          subtitle: created.path,
          files: [created]
        }
      };
    }
    if (action === "organize") {
      const targetFolder = folder || "Downloads";
      const plan = {
        id: `confirm-${Date.now()}`,
        type: "organize_files",
        title: `Organize "${targetFolder}" Folder`,
        description: `Sort files inside "${targetFolder}" into Documents, Media, Spreadsheets, Presentations, and Archives subfolders.`,
        detailLabel: `Target directory: ${targetFolder}`,
        payload: { folder: targetFolder }
      };
      return {
        resultSummary: `Prepared organization plan for "${targetFolder}". Awaiting Boss confirmation.`,
        clientActions: [{ type: "request_confirmation", payload: plan }],
        actionCard: {
          kind: "files",
          title: `Organize ${targetFolder}`,
          subtitle: "Confirmation required before moving files",
          confirmation: plan
        }
      };
    }
    if (action === "delete_request") {
      const matches = searchFiles(query, ext);
      const target = matches[0];
      if (!target) {
        return {
          resultSummary: `Could not locate a file matching "${query}".`,
          clientActions: []
        };
      }
      const plan = {
        id: `confirm-${Date.now()}`,
        type: "delete_file",
        title: `Delete "${target.name}"`,
        description: `Permanently remove "${target.path}"? This cannot be undone.`,
        detailLabel: `Path: ${target.path}`,
        payload: { path: target.path }
      };
      return {
        resultSummary: `Confirmation required to delete ${target.path}.`,
        clientActions: [{ type: "request_confirmation", payload: plan }],
        actionCard: {
          kind: "files",
          title: "Delete Confirmation Required",
          subtitle: target.path,
          confirmation: plan
        }
      };
    }
    const found = searchFiles(query, ext);
    return {
      resultSummary: found.length > 0 ? `Found ${found.length} matching file(s): ${found.slice(0, 4).map((f) => f.name).join(", ")}.` : `No files matched "${query || ext}".`,
      clientActions: [],
      actionCard: {
        kind: "files",
        title: ext ? `${ext.toUpperCase()} Files` : `Search: ${query || "All Files"}`,
        subtitle: `${found.length} match(es)`,
        files: found.slice(0, 6)
      }
    };
  }
  if (name === "system_monitor") {
    const t = await collectSystemTelemetry();
    clientActions.push({ type: "navigate_tab", payload: { tab: "system" } });
    return {
      resultSummary: `CPU is at ${t.cpuPercent}%, memory usage is ${t.memoryPercent}% (${t.memoryUsedGb} of ${t.memoryTotalGb} GB), storage is ${t.storagePercent}% used, and internet connection is ${t.internetConnected ? "online" : "offline"}. ${t.advisory || ""}`,
      clientActions,
      actionCard: {
        kind: "system",
        title: "Live System Performance",
        subtitle: `${t.hardware.cpuCores} cores \xB7 ${t.hardware.arch}`,
        telemetrySnapshot: {
          cpuPercent: t.cpuPercent,
          memoryPercent: t.memoryPercent,
          storagePercent: t.storagePercent,
          internetConnected: t.internetConnected
        }
      }
    };
  }
  if (name === "system_control") {
    const action = String(args.action || "settings");
    const value = typeof args.value === "number" ? args.value : void 0;
    const outcome = await executeWindowsSystemControl(action, value);
    clientActions.push({ type: "system_control", payload: { action, value, data: outcome.data } });
    if (action === "screenshot") {
      clientActions.push({ type: "refresh_files", payload: {} });
    }
    return {
      resultSummary: outcome.message,
      clientActions
    };
  }
  if (name === "initiate_call") {
    const contactName = String(args.contactName || "Contact");
    const service = String(args.service || "Phone Link");
    const plan = {
      id: `confirm-${Date.now()}`,
      type: "initiate_call",
      title: `Call ${contactName}`,
      description: `Confirm placing an outgoing call to ${contactName} via ${service}.`,
      detailLabel: `Service: ${service}`,
      payload: { contactName, targetHandle: contactName, service }
    };
    return {
      resultSummary: `Prepared call to ${contactName} via ${service}. Awaiting Boss confirmation.`,
      clientActions: [{ type: "request_confirmation", payload: plan }],
      actionCard: {
        kind: "call_prompt",
        title: `Call ${contactName}`,
        subtitle: `Via ${service} \xB7 Confirmation required`,
        confirmation: plan
      }
    };
  }
  return { resultSummary: "Command processed.", clientActions };
}
async function parseLocalIntent(command, history = [], ollamaModel) {
  const lower = command.toLowerCase().trim();
  const withoutWake = lower.replace(/^(hey ultron|ultron|my buddy)[,:\s]*/i, "").trim();
  if (withoutWake === "" || /^(hi|hello|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(withoutWake)) {
    return {
      reply: "I'm here, Boss. What can I do for you?",
      intent: "greeting",
      engineUsed: "local",
      clientActions: []
    };
  }
  if (/\b(thank you|thanks|appreciate)\b/.test(lower)) {
    return {
      reply: "Always ready to assist, Boss.",
      intent: "gratitude",
      engineUsed: "local",
      clientActions: []
    };
  }
  const ytMatch = lower.match(/youtube.*(?:search(?:\s+for)?|find|look up)\s+(.+)/i);
  if (ytMatch) {
    const tool = await executeToolCall("open_website", { site: "youtube", searchQuery: ytMatch[1].trim() });
    return {
      reply: `Certainly, Boss. ${tool.resultSummary}`,
      intent: "open_website",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  const siteMatch = lower.match(/\b(google|youtube|facebook|gmail|chatgpt|github)\b/);
  if (siteMatch && /\b(open|launch|go to|visit|browse|show)\b/.test(lower)) {
    const tool = await executeToolCall("open_website", { site: siteMatch[1] });
    return {
      reply: `Certainly, Boss. ${tool.resultSummary}`,
      intent: "open_website",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  const callMatch = withoutWake.match(/\b(?:call|dial|ring)\s+(.+)/i);
  if (callMatch) {
    const contactName = callMatch[1].replace(/\b(via|using|on)\s+(whatsapp|phone link|voip)\b/i, "").trim();
    const service = lower.includes("whatsapp") ? "WhatsApp" : lower.includes("voip") ? "VoIP" : "Phone Link";
    const tool = await executeToolCall("initiate_call", { contactName, service });
    return {
      reply: `Boss, please confirm before I initiate the ${service} call to ${contactName}.`,
      intent: "initiate_call",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  const appMatch = lower.match(
    /\b(chrome|edge|msedge|vs code|vscode|terminal|powershell|explorer|calculator|notepad|settings|whatsapp|phone link)\b/
  );
  if (appMatch) {
    const op = /\bclose\b/.test(lower) ? "close" : /\bminimize\b/.test(lower) ? "minimize" : /\bmaximize\b/.test(lower) ? "maximize" : /\bfocus|switch\b/.test(lower) ? "focus" : "open";
    const tool = await executeToolCall("open_application", { appName: appMatch[1], operation: op });
    return {
      reply: `Certainly, Boss. ${tool.resultSummary}`,
      intent: "open_application",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  if (/\b(create|make|new)\s+(?:a\s+)?folder\s+(?:called|named)?\s*([a-z0-9_\-\s]+)/i.test(lower)) {
    const m = lower.match(/\b(?:create|make|new)\s+(?:a\s+)?folder\s+(?:called|named)?\s*([a-z0-9_\-\s]+)/i);
    const folderName = (m?.[1] || "Projects").trim();
    const tool = await executeToolCall("manage_files", { action: "create_folder", query: folderName });
    return {
      reply: `Done, Boss. ${tool.resultSummary}`,
      intent: "manage_files",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  if (/\borganize\b/.test(lower)) {
    const folder = lower.includes("desktop") ? "Projects" : "Downloads";
    const tool = await executeToolCall("manage_files", { action: "organize", folder });
    return {
      reply: `Boss, I have prepared an organization plan for your ${folder} folder. Please confirm to proceed.`,
      intent: "manage_files",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  if (/\bduplicate/.test(lower)) {
    const tool = await executeToolCall("manage_files", { action: "duplicates" });
    return {
      reply: `Scan complete, Boss. ${tool.resultSummary}`,
      intent: "manage_files",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  if (/\b(latest|recent)\b/.test(lower) && /\b(pdf|file|project|document|work)\b/.test(lower)) {
    const extMatch = lower.match(/\b(pdf|docx|txt|xlsx|pptx|jpg|png|mp4|mp3|zip)\b/);
    if (extMatch) {
      const tool2 = await executeToolCall("manage_files", { action: "search", extension: extMatch[1] });
      return {
        reply: `Boss, ${tool2.resultSummary}`,
        intent: "manage_files",
        engineUsed: "local",
        clientActions: tool2.clientActions,
        actionCard: tool2.actionCard
      };
    }
    const tool = await executeToolCall("manage_files", { action: "recent" });
    return {
      reply: `Boss, ${tool.resultSummary}`,
      intent: "manage_files",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  if (/\b(find|search)\b/.test(lower)) {
    const extMatch = lower.match(/\b(pdf|docx|txt|xlsx|pptx|jpg|png|mp4|mp3|zip)\b/);
    const cleanQuery = lower.replace(/^(ultron|hey ultron|my buddy)[,\s]*/i, "").replace(/\b(find|search|for|all|my|files|file)\b/g, "").trim();
    const tool = await executeToolCall("manage_files", {
      action: "search",
      query: extMatch ? "" : cleanQuery,
      extension: extMatch ? extMatch[1] : ""
    });
    return {
      reply: `Boss, ${tool.resultSummary}`,
      intent: "manage_files",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  if (/\b(performance|cpu|memory|ram|storage|system|battery|health|status)\b/.test(lower)) {
    const tool = await executeToolCall("system_monitor", { focus: "summary" });
    return {
      reply: `Here is your live system telemetry, Boss. ${tool.resultSummary}`,
      intent: "system_monitor",
      engineUsed: "local",
      clientActions: tool.clientActions,
      actionCard: tool.actionCard
    };
  }
  if (/\bscreenshot\b/.test(lower)) {
    const tool = await executeToolCall("system_control", { action: "screenshot" });
    return {
      reply: `Done, Boss. ${tool.resultSummary}`,
      intent: "system_control",
      engineUsed: "local",
      clientActions: tool.clientActions
    };
  }
  if (/\b(mute|volume)\b/.test(lower)) {
    const numMatch = lower.match(/\b(\d{1,3})\b/);
    const action = lower.includes("mute") ? "volume_mute" : numMatch ? "volume_set" : lower.includes("down") || lower.includes("lower") ? "volume_down" : "volume_up";
    const tool = await executeToolCall("system_control", {
      action,
      value: numMatch ? Math.min(100, Number(numMatch[1])) : void 0
    });
    return {
      reply: `Audio level updated, Boss.`,
      intent: "system_control",
      engineUsed: "local",
      clientActions: tool.clientActions
    };
  }
  const ollamaReply = await queryOllamaChat(command, history, ollamaModel || "llama3.2");
  if (ollamaReply) {
    return {
      reply: ollamaReply,
      intent: "conversation",
      engineUsed: "ollama",
      clientActions: []
    };
  }
  return {
    reply: "I heard you, Boss, though I am currently running offline without a local Ollama model and need a clearer task\u2014try asking me to check system performance, find PDF files, open Chrome, take a screenshot, or organize Downloads.",
    intent: "clarification",
    engineUsed: "local",
    clientActions: []
  };
}
async function processAssistantCommand(command, history, mode, ollamaModel) {
  if (mode === "local" || mode === "ollama") {
    const res = await parseLocalIntent(command, history, ollamaModel);
    recordLog("action", res.engineUsed === "ollama" ? "Ollama Local LLM" : "Local Engine", `Processed: "${command}" -> ${res.intent}`);
    return res;
  }
  const ai = getAiClient();
  if (!ai) {
    if (mode === "cloud") {
      throw new Error("GEMINI_API_KEY is not configured in server secrets. Switch to Hybrid/Local mode or configure the key.");
    }
    return parseLocalIntent(command, history, ollamaModel);
  }
  try {
    const systemInstruction = `You are ULTRON, an intelligent, calm, poised, futuristic personal desktop AI assistant with a warm, articulate female personality.
Always address the user naturally as "Boss" (avoid robotic repetition; vary phrasing smoothly).
You control a Windows desktop computer with local file management, live system monitoring, application/website launching, Windows automation, and authorized calling.
When a command maps to a computer operation, call the appropriate tool immediately.
If a command is ambiguous, politely ask Boss a brief clarifying question.
Keep spoken responses concise (1-3 clear sentences) and conversational.`;
    const contents = [
      ...history.slice(-8).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }]
      })),
      { role: "user", parts: [{ text: command }] }
    ];
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        tools: [{ functionDeclarations: ULTRON_TOOLS }]
      }
    });
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const args = call.args || {};
      const toolOutcome = await executeToolCall(call.name || "unknown", args);
      const previousContent = response.candidates?.[0]?.content;
      let finalReply = toolOutcome.resultSummary;
      if (previousContent && call.id) {
        try {
          const followUp = await ai.models.generateContent({
            model: "gemini-4-hydrogen",
            contents: [
              ...contents,
              previousContent,
              {
                role: "user",
                parts: [
                  {
                    functionResponse: {
                      id: call.id,
                      name: call.name || "tool",
                      response: { result: toolOutcome.resultSummary }
                    }
                  }
                ]
              }
            ],
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
            }
          });
          if (followUp.text) {
            finalReply = followUp.text.trim();
          }
        } catch {
          finalReply = `Certainly, Boss. ${toolOutcome.resultSummary}`;
        }
      }
      recordLog("action", "Gemini AI", `Intent "${call.name}" executed for Boss.`);
      return {
        reply: finalReply,
        intent: call.name || "tool",
        engineUsed: "gemini",
        clientActions: toolOutcome.clientActions,
        actionCard: toolOutcome.actionCard
      };
    }
    const text = response.text?.trim() || "I'm ready, Boss. How can I help?";
    recordLog("info", "Gemini AI", `Conversational response delivered.`);
    return {
      reply: text,
      intent: "conversation",
      engineUsed: "gemini",
      clientActions: []
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordLog("error", "Gemini AI", msg);
    if (mode === "hybrid") {
      return parseLocalIntent(command, history, ollamaModel);
    }
    throw err;
  }
}
async function synthesizeFemaleSpeech(text, voiceName = "Kore", tone = "calm") {
  const ai = getAiClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY unavailable for cloud speech synthesis.");
  }
  const styleMap = {
    calm: "Calm, intelligent, poised female personal assistant, warm and confident",
    friendly: "Friendly, bright, conversational female personal assistant",
    executive: "Crisp, articulate, executive female assistant",
    poised: "Futuristic, composed, reassuring female AI assistant"
  };
  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash-lite-tts",
    contents: [
      {
        role: "user",
        parts: [
          {
            text,
            speechMetadata: {
              style: styleMap[tone] || styleMap.calm
            }
          }
        ]
      }
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      }
    }
  });
  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) {
    throw new Error("Speech synthesis returned empty audio payload.");
  }
  return {
    base64Wav: inline.data,
    mimeType: inline.mimeType || "audio/wav"
  };
}
async function transcribeAudioClip(base64Audio, mimeType) {
  const ai = getAiClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY unavailable for audio transcription.");
  }
  const response = await ai.models.generateContent({
    model: "gemini-3.5-transcribe",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType || "audio/webm",
            data: base64Audio
          }
        },
        { text: "Transcribe the user voice command accurately." }
      ]
    }
  });
  return response.text?.trim() || "";
}

// server.ts
var PORT = 3e3;
async function startServer() {
  ensureWorkspaceSeeded();
  recordLog("info", "System", "ULTRON core server initialized.");
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      halted: isEmergencyHalted(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY",
      hardware: getHardwareProfile()
    });
  });
  app.get("/api/ai/ollama-status", async (_req, res) => {
    const status = await checkOllamaStatus();
    res.json(status);
  });
  app.post("/api/safety/halt", (req, res) => {
    const halted = Boolean(req.body?.halted);
    setEmergencyHalted(halted);
    res.json({ halted: isEmergencyHalted() });
  });
  app.get("/api/logs", (req, res) => {
    const level = typeof req.query.level === "string" ? req.query.level : "all";
    res.json({ logs: getLogs(level) });
  });
  app.delete("/api/logs", (_req, res) => {
    clearLogs();
    res.json({ ok: true });
  });
  app.get("/api/system/telemetry", async (_req, res) => {
    try {
      const telemetry = await collectSystemTelemetry();
      res.json(telemetry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordLog("error", "Telemetry", msg);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/ai/command", async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({
        error: "Emergency Stop is active. Resume ULTRON systems before issuing commands."
      });
      return;
    }
    const command = typeof req.body?.command === "string" ? req.body.command.trim() : "";
    if (!command || command.length > 2e3) {
      res.status(400).json({ error: "Command must be a non-empty string under 2000 characters." });
      return;
    }
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const mode = req.body?.mode === "cloud" || req.body?.mode === "local" || req.body?.mode === "ollama" ? req.body.mode : "hybrid";
    const ollamaModel = typeof req.body?.ollamaModel === "string" ? req.body.ollamaModel : "llama3.2";
    try {
      const result = await processAssistantCommand(command, history, mode, ollamaModel);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordLog("error", "AI Brain", msg);
      res.status(502).json({ error: msg });
    }
  });
  app.post("/api/ai/tts", async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 1200) {
      res.status(400).json({ error: "Text is required (max 1200 chars)." });
      return;
    }
    const voice = req.body?.voice === "Zephyr" ? "Zephyr" : "Kore";
    const tone = req.body?.tone === "friendly" || req.body?.tone === "executive" || req.body?.tone === "poised" ? req.body.tone : "calm";
    try {
      const audio = await synthesizeFemaleSpeech(text, voice, tone);
      res.json(audio);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordLog("warning", "TTS", msg);
      res.status(502).json({ error: msg });
    }
  });
  app.post("/api/ai/transcribe", async (req, res) => {
    const audioBase64 = typeof req.body?.audioBase64 === "string" ? req.body.audioBase64 : "";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "audio/webm";
    if (!audioBase64) {
      res.status(400).json({ error: "Missing audio payload." });
      return;
    }
    try {
      const transcript = await transcribeAudioClip(audioBase64, mimeType);
      res.json({ transcript });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordLog("error", "Transcribe", msg);
      res.status(502).json({ error: msg });
    }
  });
  app.get("/api/files/roots", (_req, res) => {
    res.json(getPermittedRoots());
  });
  app.post("/api/files/roots/permission", (req, res) => {
    const id = req.body?.id;
    if (!["workspace", "desktop", "downloads", "documents"].includes(id)) {
      res.status(400).json({ error: "Invalid directory root ID." });
      return;
    }
    const enabled = Boolean(req.body?.enabled);
    res.json({ roots: setRootPermission(id, enabled) });
  });
  app.post("/api/files/roots/active", (req, res) => {
    try {
      const id = req.body?.id;
      const activeRootId2 = setActiveRoot(id);
      res.json({ activeRootId: activeRootId2 });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/files/list", (req, res) => {
    try {
      const rel = typeof req.query.path === "string" ? req.query.path : "";
      res.json({ path: rel, entries: listDirectory(rel) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/files/search", (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const ext = typeof req.query.ext === "string" ? req.query.ext : "";
      const dir = typeof req.query.dir === "string" ? req.query.dir : "";
      res.json({ entries: searchFiles(q, ext, dir) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/files/recent", (_req, res) => {
    try {
      res.json({ entries: getRecentFiles(15) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/files/duplicates", (_req, res) => {
    try {
      res.json({ groups: findDuplicateFiles() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/files/read", (req, res) => {
    try {
      const rel = typeof req.query.path === "string" ? req.query.path : "";
      res.json(readFileContent(rel));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post("/api/files/folder", (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    try {
      const parent = typeof req.body?.parent === "string" ? req.body.parent : "";
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      res.json({ entry: createFolder(parent, name) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post("/api/files/rename", (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    try {
      const rel = typeof req.body?.path === "string" ? req.body.path : "";
      const newName = typeof req.body?.newName === "string" ? req.body.newName : "";
      res.json({ entry: renameEntry(rel, newName) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post("/api/files/transfer", (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    try {
      const src = typeof req.body?.src === "string" ? req.body.src : "";
      const destDir = typeof req.body?.destDir === "string" ? req.body.destDir : "";
      const mode = req.body?.mode === "copy" ? "copy" : "move";
      const overwrite = Boolean(req.body?.overwrite);
      res.json({ entry: moveOrCopyEntry(src, destDir, mode, overwrite) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(msg.startsWith("CONFLICT") ? 409 : 400).json({ error: msg });
    }
  });
  app.post("/api/files/organize", (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    try {
      const folder = typeof req.body?.folder === "string" ? req.body.folder : "Downloads";
      res.json(organizeFolder(folder));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.delete("/api/files/entry", (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    if (req.body?.confirmed !== true) {
      res.status(400).json({ error: "Explicit confirmation required before file deletion." });
      return;
    }
    try {
      const rel = typeof req.body?.path === "string" ? req.body.path : "";
      deleteEntry(rel);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/desktop/apps", async (_req, res) => {
    const apps = await discoverInstalledApps();
    res.json({ apps, knownWebsites: KNOWN_WEBSITES });
  });
  app.post("/api/desktop/launch", async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    const appId = typeof req.body?.appId === "string" ? req.body.appId : "";
    const operation = req.body?.operation === "close" || req.body?.operation === "minimize" || req.body?.operation === "maximize" || req.body?.operation === "focus" ? req.body.operation : "open";
    const apps = await discoverInstalledApps();
    const result = await controlWindowsApplication(appId, operation, apps);
    res.json(result);
  });
  app.post("/api/desktop/automation", async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    const allowedActions = [
      "volume_up",
      "volume_down",
      "volume_mute",
      "volume_set",
      "brightness_set",
      "screenshot",
      "settings",
      "clipboard_read",
      "clipboard_write"
    ];
    const action = req.body?.action;
    if (!allowedActions.includes(action)) {
      res.status(400).json({ error: "Unsupported automation action." });
      return;
    }
    const result = await executeWindowsSystemControl(action, req.body?.value);
    res.json(result);
  });
  app.post("/api/desktop/validate-url", (req, res) => {
    const raw = typeof req.body?.url === "string" ? req.body.url : "";
    const validated = validateExternalUrl(raw);
    if (!validated) {
      res.status(400).json({ error: "Invalid or unsupported URL scheme." });
      return;
    }
    recordLog("action", "Web", `Validated URL launch: ${validated}`);
    res.json({ url: validated });
  });
  app.get("/api/desktop/companion-script", (_req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ultron-windows-companion.ps1"');
    res.send(getWindowsCompanionScript());
  });
  app.post("/api/comms/call", async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: "Emergency Stop active." });
      return;
    }
    if (req.body?.confirmed !== true) {
      res.status(400).json({ error: "Call requires explicit Boss confirmation." });
      return;
    }
    const contact = typeof req.body?.contact === "string" ? req.body.contact : "Unknown";
    const targetHandle = typeof req.body?.targetHandle === "string" ? req.body.targetHandle : contact;
    const service = req.body?.service === "WhatsApp" || req.body?.service === "VoIP" ? req.body.service : "Phone Link";
    const callTrigger = await triggerWindowsCallUri(targetHandle, service);
    recordLog("action", "Comms", `Authorized outgoing call to ${contact} via ${service}.`);
    res.json({
      ok: true,
      contact,
      service,
      uri: callTrigger.uri,
      executedOnHost: callTrigger.executedOnHost,
      initiatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const serverDir = path4.dirname(fileURLToPath(import.meta.url));
    const rootCandidates = [
      process.env.ULTRON_ROOT_DIR,
      path4.resolve(serverDir, ".."),
      serverDir,
      process.cwd()
    ].filter(Boolean);
    const distDir = rootCandidates.map((r) => path4.join(r, "dist")).find((d) => fs4.existsSync(d)) || path4.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      const indexFile = path4.join(distDir, "index.html");
      if (fs4.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Build output not found. Run npm run build first.");
      }
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ULTRON Core listening on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start ULTRON server:", err);
  process.exit(1);
});
