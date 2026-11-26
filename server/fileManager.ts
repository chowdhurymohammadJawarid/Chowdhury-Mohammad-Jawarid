import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { recordLog } from './activityLog.ts';

export const WORKSPACE_ROOT = path.resolve(process.cwd(), 'ultron_workspace');

export type RootId = 'workspace' | 'desktop' | 'downloads' | 'documents';

export interface PermittedRoot {
  id: RootId;
  label: string;
  absPath: string;
  enabled: boolean;
  exists: boolean;
}

const rootPermissions: Record<RootId, boolean> = {
  workspace: true,
  desktop: false,
  downloads: false,
  documents: false,
};

let activeRootId: RootId = 'workspace';

function getRootPathMap(): Record<RootId, { label: string; absPath: string }> {
  const home = os.homedir();
  return {
    workspace: { label: 'ULTRON Workspace', absPath: WORKSPACE_ROOT },
    desktop: { label: 'User Desktop', absPath: path.resolve(home, 'Desktop') },
    downloads: { label: 'User Downloads', absPath: path.resolve(home, 'Downloads') },
    documents: { label: 'User Documents', absPath: path.resolve(home, 'Documents') },
  };
}

export function getPermittedRoots(): { activeRootId: RootId; roots: PermittedRoot[] } {
  ensureWorkspaceSeeded();
  const map = getRootPathMap();
  const roots: PermittedRoot[] = (Object.keys(map) as RootId[]).map((id) => ({
    id,
    label: map[id].label,
    absPath: map[id].absPath,
    enabled: rootPermissions[id],
    exists: fs.existsSync(map[id].absPath),
  }));
  return { activeRootId, roots };
}

export function setRootPermission(id: RootId, enabled: boolean): PermittedRoot[] {
  if (id === 'workspace') {
    rootPermissions.workspace = true;
  } else {
    rootPermissions[id] = enabled;
    if (!enabled && activeRootId === id) {
      activeRootId = 'workspace';
    }
    recordLog(
      'action',
      'Security',
      `${enabled ? 'Granted' : 'Revoked'} file access permission for ${id}.`
    );
  }
  return getPermittedRoots().roots;
}

export function setActiveRoot(id: RootId): RootId {
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

function getActiveRootDir(): string {
  const map = getRootPathMap();
  if (!rootPermissions[activeRootId] || !fs.existsSync(map[activeRootId].absPath)) {
    return WORKSPACE_ROOT;
  }
  return map[activeRootId].absPath;
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

const CATEGORY_MAP: Record<string, string> = {
  pdf: 'Documents',
  docx: 'Documents',
  txt: 'Documents',
  md: 'Documents',
  xlsx: 'Spreadsheets',
  csv: 'Spreadsheets',
  pptx: 'Presentations',
  jpg: 'Media',
  jpeg: 'Media',
  png: 'Media',
  mp4: 'Media',
  mp3: 'Media',
  wav: 'Media',
  zip: 'Archives',
  json: 'Data',
};

function getCategory(ext: string, isDirectory: boolean): string {
  if (isDirectory) return 'Folder';
  const clean = ext.toLowerCase().replace(/^\./, '');
  return CATEGORY_MAP[clean] || 'Other';
}

export function safeResolve(relativePath: string = '', rootOverride?: string): string {
  const baseRoot = rootOverride || getActiveRootDir();
  const cleaned = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(baseRoot, cleaned);
  if (resolved !== baseRoot && !resolved.startsWith(baseRoot + path.sep)) {
    throw new Error('Access denied: Path escapes permitted directory boundary.');
  }
  return resolved;
}

function toRelPath(absPath: string, rootOverride?: string): string {
  const baseRoot = rootOverride || getActiveRootDir();
  const rel = path.relative(baseRoot, absPath).replace(/\\/g, '/');
  return rel === '' ? '' : rel;
}

function buildEntry(absPath: string, rootOverride?: string): FileEntry {
  const stat = fs.statSync(absPath);
  const name = path.basename(absPath);
  const isDirectory = stat.isDirectory();
  const ext = isDirectory ? '' : path.extname(name).slice(1).toLowerCase();
  return {
    name,
    path: toRelPath(absPath, rootOverride),
    isDirectory,
    size: stat.size,
    extension: ext,
    modifiedAt: stat.mtime.toISOString(),
    category: getCategory(ext, isDirectory),
  };
}

export function ensureWorkspaceSeeded(): void {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  }
  const existing = fs.readdirSync(WORKSPACE_ROOT);
  if (existing.length > 0) return;

  const dirs = ['Projects', 'Downloads', 'Documents', 'Media'];
  for (const d of dirs) {
    fs.mkdirSync(path.join(WORKSPACE_ROOT, d), { recursive: true });
  }

  const sampleFiles: Array<{ rel: string; content: string }> = [
    {
      rel: 'Projects/ULTRON_Architecture_Brief.txt',
      content:
        'ULTRON Personal Desktop Assistant Architecture\nPrepared for: Boss\n\nModules:\n1. Holographic Neural Core (Three.js WebGL)\n2. Voice & Three-Clap Acoustic Trigger\n3. Real-Time Hardware Telemetry\n4. Confined Workspace File Engine\n5. Authorized Communications Bridge\n',
    },
    {
      rel: 'Projects/Quarterly_Roadmap.pdf',
      content:
        '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << /Length 58 >> stream\nBT /F1 12 Tf 72 720 Td (ULTRON Quarterly System Roadmap for Boss) Tj ET\nendstream endobj\n%%EOF\n',
    },
    {
      rel: 'Projects/System_Calibration_Notes.md',
      content:
        '# System Calibration Notes\n\n- Preferred Address: Boss\n- Voice Profile: Natural Female (Kore / Zephyr)\n- Three-Clap Window: 320ms to 2100ms\n- Safety Gate: Always confirm before deleting files or placing calls.\n',
    },
    {
      rel: 'Documents/Annual_Budget_2026.csv',
      content: 'Quarter,Allocation,Status\nQ1,12500,Approved\nQ2,14800,Active\n',
    },
    {
      rel: 'Downloads/Project_Proposal_Final.pdf',
      content:
        '%PDF-1.4\nBT /F1 12 Tf 72 720 Td (Project Proposal Final Edition) Tj ET\n%%EOF\n',
    },
    {
      rel: 'Documents/Project_Proposal_Copy.pdf',
      content:
        '%PDF-1.4\nBT /F1 12 Tf 72 720 Td (Project Proposal Final Edition) Tj ET\n%%EOF\n',
    },
    {
      rel: 'Downloads/Desktop_Wallpaper_Hologram.png',
      content: '\x89PNG\r\n\x1a\nULTRON_SAMPLE_PNG_METADATA',
    },
    {
      rel: 'Downloads/Voice_Memo_01.mp3',
      content: 'ID3\x03\x00ULTRON_SAMPLE_AUDIO_TRACK',
    },
    {
      rel: 'Media/Demo_Capture.mp4',
      content: '\x00\x00\x00\x18ftypmp42ULTRON_SAMPLE_VIDEO',
    },
    {
      rel: 'Media/System_Icon_Reference.jpg',
      content: '\xff\xd8\xff\xe0JFIFULTRON_SAMPLE_JPEG',
    },
  ];

  for (const item of sampleFiles) {
    const abs = safeResolve(item.rel, WORKSPACE_ROOT);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, item.content, 'utf8');
  }

  recordLog('info', 'Files', 'Initialized ULTRON workspace with sample multi-format files.');
}

export function listDirectory(relPath: string = ''): FileEntry[] {
  ensureWorkspaceSeeded();
  const abs = safeResolve(relPath);
  if (!fs.existsSync(abs)) {
    throw new Error('Directory does not exist.');
  }
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) {
    throw new Error('Requested path is not a directory.');
  }
  const names = fs.readdirSync(abs);
  const entries: FileEntry[] = [];
  for (const n of names) {
    try {
      entries.push(buildEntry(path.join(abs, n)));
    } catch {
      // Skip locked OS system entries (e.g. desktop.ini / pagefile)
    }
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

function walkAllFiles(dirAbs: string, results: FileEntry[] = [], depth = 0): FileEntry[] {
  if (depth > 4 || results.length > 800) return results;
  let items: string[] = [];
  try {
    items = fs.readdirSync(dirAbs);
  } catch {
    return results;
  }
  for (const item of items) {
    if (item.startsWith('.') || item === 'node_modules') continue;
    const full = path.join(dirAbs, item);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walkAllFiles(full, results, depth + 1);
      } else {
        results.push(buildEntry(full));
      }
    } catch {
      // Ignore permission-restricted OS entries
    }
  }
  return results;
}

export function searchFiles(
  query: string = '',
  extension: string = '',
  dirRel: string = ''
): FileEntry[] {
  ensureWorkspaceSeeded();
  const startAbs = safeResolve(dirRel);
  if (!fs.existsSync(startAbs)) return [];
  const all = walkAllFiles(startAbs);
  const q = query.trim().toLowerCase();
  const ext = extension.trim().toLowerCase().replace(/^\./, '');

  return all.filter((f) => {
    const matchesQuery =
      !q || f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    const matchesExt = !ext || f.extension === ext;
    return matchesQuery && matchesExt;
  });
}

export function getRecentFiles(limit: number = 15): FileEntry[] {
  ensureWorkspaceSeeded();
  const all = walkAllFiles(getActiveRootDir());
  all.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return all.slice(0, Math.max(1, Math.min(50, limit)));
}

export function findDuplicateFiles(): DuplicateGroup[] {
  ensureWorkspaceSeeded();
  const all = walkAllFiles(getActiveRootDir());
  const byHash = new Map<string, FileEntry[]>();

  for (const file of all) {
    if (file.size > 25 * 1024 * 1024) continue; // Skip huge >25MB media files for fast hash scan
    try {
      const abs = safeResolve(file.path);
      const data = fs.readFileSync(abs);
      const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
      const list = byHash.get(hash) || [];
      list.push(file);
      byHash.set(hash, list);
    } catch {
      // ignore unreadable locked file
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const [hash, files] of byHash.entries()) {
    if (files.length > 1) {
      groups.push({ hash, size: files[0].size, files });
    }
  }
  return groups;
}

export function createFolder(parentRel: string, folderName: string): FileEntry {
  ensureWorkspaceSeeded();
  const cleanName = path.basename(folderName.trim());
  if (!cleanName || cleanName === '.' || cleanName === '..') {
    throw new Error('Invalid folder name.');
  }
  const targetAbs = safeResolve(parentRel ? `${parentRel}/${cleanName}` : cleanName);
  if (fs.existsSync(targetAbs)) {
    throw new Error(`Folder "${cleanName}" already exists.`);
  }
  fs.mkdirSync(targetAbs, { recursive: true });
  recordLog('action', 'Files', `Created folder "${toRelPath(targetAbs)}"`);
  return buildEntry(targetAbs);
}

export function renameEntry(relPath: string, newName: string): FileEntry {
  ensureWorkspaceSeeded();
  const baseRoot = getActiveRootDir();
  const srcAbs = safeResolve(relPath);
  if (!fs.existsSync(srcAbs) || srcAbs === baseRoot) {
    throw new Error('Source entry not found.');
  }
  const cleanNew = path.basename(newName.trim());
  if (!cleanNew || cleanNew === '.' || cleanNew === '..') {
    throw new Error('Invalid new name.');
  }
  const destAbs = path.resolve(path.dirname(srcAbs), cleanNew);
  if (!destAbs.startsWith(baseRoot + path.sep)) {
    throw new Error('Destination outside permitted boundary.');
  }
  if (fs.existsSync(destAbs)) {
    throw new Error(`An entry named "${cleanNew}" already exists.`);
  }
  fs.renameSync(srcAbs, destAbs);
  recordLog('action', 'Files', `Renamed "${relPath}" to "${toRelPath(destAbs)}"`);
  return buildEntry(destAbs);
}

export function moveOrCopyEntry(
  srcRel: string,
  destDirRel: string,
  mode: 'move' | 'copy',
  overwrite: boolean = false
): FileEntry {
  ensureWorkspaceSeeded();
  const baseRoot = getActiveRootDir();
  const srcAbs = safeResolve(srcRel);
  const destDirAbs = safeResolve(destDirRel);
  if (!fs.existsSync(srcAbs) || srcAbs === baseRoot) {
    throw new Error('Source file or folder not found.');
  }
  if (!fs.existsSync(destDirAbs) || !fs.statSync(destDirAbs).isDirectory()) {
    throw new Error('Destination directory does not exist.');
  }
  const destAbs = path.resolve(destDirAbs, path.basename(srcAbs));
  if (!destAbs.startsWith(baseRoot + path.sep)) {
    throw new Error('Destination escapes permitted boundary.');
  }
  let finalDestAbs = destAbs;
  if (srcAbs === destAbs) {
    if (mode === 'move') {
      return buildEntry(srcAbs);
    }
    const ext = path.extname(srcAbs);
    const base = path.basename(srcAbs, ext);
    finalDestAbs = path.join(destDirAbs, `${base}_copy${ext}`);
  }
  if (fs.existsSync(finalDestAbs) && !overwrite) {
    throw new Error('CONFLICT: Target file already exists. Confirmation required to overwrite.');
  }

  if (mode === 'move') {
    fs.renameSync(srcAbs, finalDestAbs);
    recordLog('action', 'Files', `Moved "${srcRel}" to "${toRelPath(finalDestAbs)}"`);
  } else {
    fs.cpSync(srcAbs, finalDestAbs, { recursive: true, force: overwrite });
    recordLog('action', 'Files', `Copied "${srcRel}" to "${toRelPath(finalDestAbs)}"`);
  }
  return buildEntry(finalDestAbs);
}

export function organizeFolder(targetRel: string = 'Downloads'): {
  movedCount: number;
  moves: Array<{ from: string; to: string }>;
} {
  ensureWorkspaceSeeded();
  const dirAbs = safeResolve(targetRel);
  if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) {
    throw new Error(`Folder "${targetRel}" does not exist.`);
  }

  const items = fs.readdirSync(dirAbs);
  const moves: Array<{ from: string; to: string }> = [];

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
    'action',
    'Files',
    `Organized ${moves.length} file(s) inside "${targetRel || 'root'}" by format category.`
  );
  return { movedCount: moves.length, moves };
}

// Pure-Node ZIP / OOXML parser (reads .zip, .docx, .xlsx, .pptx without external packages)
function readZipEntries(buffer: Buffer): Array<{ name: string; data: Buffer }> {
  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
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

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<\/w:p>|<\/a:p>|<\/row>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function extractPdfText(buffer: Buffer): string {
  const latin = buffer.toString('latin1');
  const matches = latin.match(/\(([^()\\]{2,200})\)\s*Tj/g) || [];
  const extracted = matches
    .map((m) => m.replace(/^\(/, '').replace(/\)\s*Tj$/, ''))
    .join(' ');
  if (extracted.trim().length > 0) {
    return extracted;
  }
  return `PDF Document (${buffer.length} bytes).`;
}

export function readFileContent(relPath: string): {
  entry: FileEntry;
  previewable: boolean;
  content: string;
} {
  ensureWorkspaceSeeded();
  const abs = safeResolve(relPath);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    throw new Error('File not found.');
  }
  const entry = buildEntry(abs);
  const textExtensions = new Set(['txt', 'md', 'json', 'csv', 'log', 'ts', 'tsx', 'js', 'ps1']);
  if (textExtensions.has(entry.extension)) {
    const raw = fs.readFileSync(abs, 'utf8');
    return {
      entry,
      previewable: true,
      content: raw.slice(0, 65536),
    };
  }

  if (entry.extension === 'pdf') {
    const buf = fs.readFileSync(abs);
    return {
      entry,
      previewable: true,
      content: extractPdfText(buf),
    };
  }

  if (['zip', 'docx', 'xlsx', 'pptx'].includes(entry.extension)) {
    const buf = fs.readFileSync(abs);
    const zipItems = readZipEntries(buf);
    if (entry.extension === 'zip') {
      const list = zipItems.map((z) => `- ${z.name} (${z.data.length} bytes)`).join('\n');
      return {
        entry,
        previewable: true,
        content: list || `ZIP archive (${entry.size} bytes)`,
      };
    }
    const xmlFiles = zipItems.filter(
      (z) =>
        z.name === 'word/document.xml' ||
        z.name === 'xl/sharedStrings.xml' ||
        /^ppt\/slides\/slide\d+\.xml$/.test(z.name)
    );
    const text = xmlFiles.map((z) => stripXmlTags(z.data.toString('utf8'))).join('\n\n');
    return {
      entry,
      previewable: true,
      content: text || `${entry.extension.toUpperCase()} archive (${entry.size} bytes)`,
    };
  }

  return {
    entry,
    previewable: false,
    content: `${entry.extension.toUpperCase() || 'DATA'} media/binary file (${entry.size} bytes). Modified ${new Date(
      entry.modifiedAt
    ).toLocaleString()}.`,
  };
}

export function deleteEntry(relPath: string): void {
  ensureWorkspaceSeeded();
  const baseRoot = getActiveRootDir();
  const abs = safeResolve(relPath);
  if (!fs.existsSync(abs) || abs === baseRoot) {
    throw new Error('Target entry not found or protected.');
  }
  fs.rmSync(abs, { recursive: true, force: false });
  recordLog('warning', 'Files', `Deleted "${relPath}" after Boss confirmation.`);
}
