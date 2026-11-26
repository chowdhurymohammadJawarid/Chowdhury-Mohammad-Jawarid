import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  clearLogs,
  getLogs,
  isEmergencyHalted,
  recordLog,
  setEmergencyHalted,
} from './server/activityLog.ts';
import { collectSystemTelemetry, getHardwareProfile } from './server/systemMonitor.ts';
import {
  createFolder,
  deleteEntry,
  ensureWorkspaceSeeded,
  findDuplicateFiles,
  getPermittedRoots,
  getRecentFiles,
  listDirectory,
  moveOrCopyEntry,
  organizeFolder,
  readFileContent,
  renameEntry,
  RootId,
  searchFiles,
  setActiveRoot,
  setRootPermission,
} from './server/fileManager.ts';
import {
  getWindowsCompanionScript,
  KNOWN_WEBSITES,
  validateExternalUrl,
} from './server/desktopBridge.ts';
import {
  checkOllamaStatus,
  processAssistantCommand,
  synthesizeFemaleSpeech,
  transcribeAudioClip,
} from './server/geminiService.ts';
import {
  controlWindowsApplication,
  discoverInstalledApps,
  executeWindowsSystemControl,
  triggerWindowsCallUri,
} from './server/windowsControl.ts';

const PORT = 3000;

async function startServer() {
  ensureWorkspaceSeeded();
  recordLog('info', 'System', 'ULTRON core server initialized.');

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      halted: isEmergencyHalted(),
      geminiConfigured:
        Boolean(process.env.GEMINI_API_KEY) &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      hardware: getHardwareProfile(),
    });
  });

  app.get('/api/ai/ollama-status', async (_req, res) => {
    const status = await checkOllamaStatus();
    res.json(status);
  });

  app.post('/api/safety/halt', (req, res) => {
    const halted = Boolean(req.body?.halted);
    setEmergencyHalted(halted);
    res.json({ halted: isEmergencyHalted() });
  });

  app.get('/api/logs', (req, res) => {
    const level = typeof req.query.level === 'string' ? req.query.level : 'all';
    res.json({ logs: getLogs(level) });
  });

  app.delete('/api/logs', (_req, res) => {
    clearLogs();
    res.json({ ok: true });
  });

  app.get('/api/system/telemetry', async (_req, res) => {
    try {
      const telemetry = await collectSystemTelemetry();
      res.json(telemetry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordLog('error', 'Telemetry', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/ai/command', async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({
        error: 'Emergency Stop is active. Resume ULTRON systems before issuing commands.',
      });
      return;
    }
    const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
    if (!command || command.length > 2000) {
      res.status(400).json({ error: 'Command must be a non-empty string under 2000 characters.' });
      return;
    }
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const mode =
      req.body?.mode === 'cloud' || req.body?.mode === 'local' || req.body?.mode === 'ollama'
        ? req.body.mode
        : 'hybrid';
    const ollamaModel =
      typeof req.body?.ollamaModel === 'string' ? req.body.ollamaModel : 'llama3.2';

    try {
      const result = await processAssistantCommand(command, history, mode, ollamaModel);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordLog('error', 'AI Brain', msg);
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/ai/tts', async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 1200) {
      res.status(400).json({ error: 'Text is required (max 1200 chars).' });
      return;
    }
    const voice = req.body?.voice === 'Zephyr' ? 'Zephyr' : 'Kore';
    const tone =
      req.body?.tone === 'friendly' ||
      req.body?.tone === 'executive' ||
      req.body?.tone === 'poised'
        ? req.body.tone
        : 'calm';

    try {
      const audio = await synthesizeFemaleSpeech(text, voice, tone);
      res.json(audio);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordLog('warning', 'TTS', msg);
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/ai/transcribe', async (req, res) => {
    const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64 : '';
    const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'audio/webm';
    if (!audioBase64) {
      res.status(400).json({ error: 'Missing audio payload.' });
      return;
    }
    try {
      const transcript = await transcribeAudioClip(audioBase64, mimeType);
      res.json({ transcript });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordLog('error', 'Transcribe', msg);
      res.status(502).json({ error: msg });
    }
  });

  // File Permissions & Root Switching
  app.get('/api/files/roots', (_req, res) => {
    res.json(getPermittedRoots());
  });

  app.post('/api/files/roots/permission', (req, res) => {
    const id = req.body?.id as RootId;
    if (!['workspace', 'desktop', 'downloads', 'documents'].includes(id)) {
      res.status(400).json({ error: 'Invalid directory root ID.' });
      return;
    }
    const enabled = Boolean(req.body?.enabled);
    res.json({ roots: setRootPermission(id, enabled) });
  });

  app.post('/api/files/roots/active', (req, res) => {
    try {
      const id = req.body?.id as RootId;
      const activeRootId = setActiveRoot(id);
      res.json({ activeRootId });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // File Manager APIs
  app.get('/api/files/list', (req, res) => {
    try {
      const rel = typeof req.query.path === 'string' ? req.query.path : '';
      res.json({ path: rel, entries: listDirectory(rel) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/files/search', (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const ext = typeof req.query.ext === 'string' ? req.query.ext : '';
      const dir = typeof req.query.dir === 'string' ? req.query.dir : '';
      res.json({ entries: searchFiles(q, ext, dir) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/files/recent', (_req, res) => {
    try {
      res.json({ entries: getRecentFiles(15) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/files/duplicates', (_req, res) => {
    try {
      res.json({ groups: findDuplicateFiles() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/files/read', (req, res) => {
    try {
      const rel = typeof req.query.path === 'string' ? req.query.path : '';
      res.json(readFileContent(rel));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/files/folder', (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    try {
      const parent = typeof req.body?.parent === 'string' ? req.body.parent : '';
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      res.json({ entry: createFolder(parent, name) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/files/rename', (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    try {
      const rel = typeof req.body?.path === 'string' ? req.body.path : '';
      const newName = typeof req.body?.newName === 'string' ? req.body.newName : '';
      res.json({ entry: renameEntry(rel, newName) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/files/transfer', (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    try {
      const src = typeof req.body?.src === 'string' ? req.body.src : '';
      const destDir = typeof req.body?.destDir === 'string' ? req.body.destDir : '';
      const mode = req.body?.mode === 'copy' ? 'copy' : 'move';
      const overwrite = Boolean(req.body?.overwrite);
      res.json({ entry: moveOrCopyEntry(src, destDir, mode, overwrite) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(msg.startsWith('CONFLICT') ? 409 : 400).json({ error: msg });
    }
  });

  app.post('/api/files/organize', (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    try {
      const folder = typeof req.body?.folder === 'string' ? req.body.folder : 'Downloads';
      res.json(organizeFolder(folder));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/files/entry', (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    if (req.body?.confirmed !== true) {
      res.status(400).json({ error: 'Explicit confirmation required before file deletion.' });
      return;
    }
    try {
      const rel = typeof req.body?.path === 'string' ? req.body.path : '';
      deleteEntry(rel);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Desktop Applications, Window Control & System Automation
  app.get('/api/desktop/apps', async (_req, res) => {
    const apps = await discoverInstalledApps();
    res.json({ apps, knownWebsites: KNOWN_WEBSITES });
  });

  app.post('/api/desktop/launch', async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    const appId = typeof req.body?.appId === 'string' ? req.body.appId : '';
    const operation =
      req.body?.operation === 'close' ||
      req.body?.operation === 'minimize' ||
      req.body?.operation === 'maximize' ||
      req.body?.operation === 'focus'
        ? req.body.operation
        : 'open';
    const apps = await discoverInstalledApps();
    const result = await controlWindowsApplication(appId, operation, apps);
    res.json(result);
  });

  app.post('/api/desktop/automation', async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    const allowedActions = [
      'volume_up',
      'volume_down',
      'volume_mute',
      'volume_set',
      'brightness_set',
      'screenshot',
      'settings',
      'clipboard_read',
      'clipboard_write',
    ] as const;
    const action = req.body?.action;
    if (!allowedActions.includes(action)) {
      res.status(400).json({ error: 'Unsupported automation action.' });
      return;
    }
    const result = await executeWindowsSystemControl(action, req.body?.value);
    res.json(result);
  });

  app.post('/api/desktop/validate-url', (req, res) => {
    const raw = typeof req.body?.url === 'string' ? req.body.url : '';
    const validated = validateExternalUrl(raw);
    if (!validated) {
      res.status(400).json({ error: 'Invalid or unsupported URL scheme.' });
      return;
    }
    recordLog('action', 'Web', `Validated URL launch: ${validated}`);
    res.json({ url: validated });
  });

  app.get('/api/desktop/companion-script', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ultron-windows-companion.ps1"');
    res.send(getWindowsCompanionScript());
  });

  // Communications / Call Audit & Windows Call Trigger
  app.post('/api/comms/call', async (req, res) => {
    if (isEmergencyHalted()) {
      res.status(423).json({ error: 'Emergency Stop active.' });
      return;
    }
    if (req.body?.confirmed !== true) {
      res.status(400).json({ error: 'Call requires explicit Boss confirmation.' });
      return;
    }
    const contact = typeof req.body?.contact === 'string' ? req.body.contact : 'Unknown';
    const targetHandle =
      typeof req.body?.targetHandle === 'string' ? req.body.targetHandle : contact;
    const service =
      req.body?.service === 'WhatsApp' || req.body?.service === 'VoIP'
        ? req.body.service
        : 'Phone Link';
    const callTrigger = await triggerWindowsCallUri(targetHandle, service);
    recordLog('action', 'Comms', `Authorized outgoing call to ${contact} via ${service}.`);
    res.json({
      ok: true,
      contact,
      service,
      uri: callTrigger.uri,
      executedOnHost: callTrigger.executedOnHost,
      initiatedAt: new Date().toISOString(),
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const serverDir = path.dirname(fileURLToPath(import.meta.url));
    const rootCandidates = [
      process.env.ULTRON_ROOT_DIR,
      path.resolve(serverDir, '..'),
      serverDir,
      process.cwd(),
    ].filter(Boolean) as string[];
    const distDir =
      rootCandidates.map((r) => path.join(r, 'dist')).find((d) => fs.existsSync(d)) ||
      path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ULTRON Core listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ULTRON server:', err);
  process.exit(1);
});
