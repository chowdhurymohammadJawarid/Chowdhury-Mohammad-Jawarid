import { FunctionDeclaration, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { recordLog } from './activityLog.ts';
import { validateExternalUrl } from './desktopBridge.ts';
import { searchFiles, getRecentFiles, findDuplicateFiles, createFolder } from './fileManager.ts';
import { collectSystemTelemetry } from './systemMonitor.ts';
import {
  controlWindowsApplication,
  discoverInstalledApps,
  executeWindowsSystemControl,
  openExternalUrlOnWindows,
} from './windowsControl.ts';

let cachedAi: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    return null;
  }
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

export async function checkOllamaStatus(): Promise<{ available: boolean; models: string[] }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { available: false, models: [] };
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return {
      available: true,
      models: (data.models || []).map((m) => m.name),
    };
  } catch {
    return { available: false, models: [] };
  }
}

async function queryOllamaChat(
  command: string,
  history: Array<{ role: 'user' | 'ultron'; text: string }>,
  modelName: string
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const messages = [
      {
        role: 'system',
        content:
          'You are ULTRON, a calm, intelligent, friendly personal desktop AI assistant with a warm female personality. Always address the user as Boss. Keep responses concise (1-3 sentences).',
      },
      ...history.slice(-6).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: command },
    ];
    const res = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName || 'llama3.2', messages, stream: false }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

const ULTRON_TOOLS: FunctionDeclaration[] = [
  {
    name: 'open_application',
    description:
      'Open, close, minimize, maximize, or focus an installed desktop application such as Chrome, Edge, VS Code, Terminal, PowerShell, File Explorer, Calculator, Notepad, Settings, WhatsApp, or Phone Link.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: { type: Type.STRING, description: 'Application name, e.g. Chrome, VS Code, Terminal, Calculator' },
        operation: {
          type: Type.STRING,
          description: 'One of: open, close, minimize, maximize, focus',
        },
      },
      required: ['appName'],
    },
  },
  {
    name: 'open_website',
    description:
      'Open a website or perform a web search on Google, YouTube, Gmail, Facebook, ChatGPT, GitHub, or any requested URL.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        site: { type: Type.STRING, description: 'Site name or URL, e.g. youtube, google, gmail, chatgpt, facebook' },
        searchQuery: { type: Type.STRING, description: 'Optional search query to look up on the site' },
      },
      required: ['site'],
    },
  },
  {
    name: 'manage_files',
    description:
      'Search local files by name or extension, find latest/recent files, detect duplicates, organize a folder (like Downloads or Desktop), or create a folder.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: search, recent, duplicates, organize, create_folder, delete_request',
        },
        query: { type: Type.STRING, description: 'Search term or folder name' },
        extension: { type: Type.STRING, description: 'Optional file extension filter like pdf, docx, txt, xlsx, png' },
        folder: { type: Type.STRING, description: 'Target folder such as Downloads or Projects' },
      },
      required: ['action'],
    },
  },
  {
    name: 'system_monitor',
    description:
      'Check live computer performance including CPU usage, memory usage, storage, network status, running processes, and optimization advisories.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        focus: {
          type: Type.STRING,
          description: 'One of: summary, processes, optimization',
        },
      },
      required: ['focus'],
    },
  },
  {
    name: 'system_control',
    description:
      'Control Windows/system settings such as audio volume, brightness, taking a screenshot, opening Windows settings, or managing clipboard.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: volume_up, volume_down, volume_mute, volume_set, brightness_set, screenshot, settings, clipboard_read',
        },
        value: { type: Type.NUMBER, description: 'Optional numeric level 0-100' },
      },
      required: ['action'],
    },
  },
  {
    name: 'initiate_call',
    description:
      'Prepare a phone or VoIP call to a contact via Windows Phone Link, WhatsApp, or VoIP. Always requires user confirmation before dialing.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        contactName: { type: Type.STRING, description: 'Name or phone number of the contact' },
        service: {
          type: Type.STRING,
          description: 'Preferred calling service: Phone Link, WhatsApp, or VoIP',
        },
      },
      required: ['contactName'],
    },
  },
];

export interface CommandResult {
  reply: string;
  intent: string;
  engineUsed: 'gemini' | 'local' | 'ollama';
  clientActions: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
  actionCard?: Record<string, unknown>;
}

async function executeToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ resultSummary: string; clientActions: CommandResult['clientActions']; actionCard?: Record<string, unknown> }> {
  const clientActions: CommandResult['clientActions'] = [];

  if (name === 'open_application') {
    const appName = String(args.appName || 'Chrome');
    const rawOp = String(args.operation || 'open').toLowerCase();
    const operation: 'open' | 'close' | 'minimize' | 'maximize' | 'focus' =
      rawOp === 'close' || rawOp === 'minimize' || rawOp === 'maximize' || rawOp === 'focus'
        ? rawOp
        : 'open';

    const registry = await discoverInstalledApps();
    const outcome = await controlWindowsApplication(appName, operation, registry);
    clientActions.push({
      type: 'app_control',
      payload: { appName: outcome.app?.name || appName, appId: outcome.app?.id || appName, operation },
    });
    return {
      resultSummary: outcome.message,
      clientActions,
      actionCard: {
        kind: 'app',
        title: `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${outcome.app?.name || appName}`,
        subtitle: outcome.executedOnHost ? 'Executed on Windows Host' : 'Desktop Application Launcher',
        appName: outcome.app?.name || appName,
      },
    };
  }

  if (name === 'open_website') {
    const site = String(args.site || 'google');
    const searchQuery = args.searchQuery ? String(args.searchQuery) : '';
    let targetUrl = validateExternalUrl(site) || 'https://www.google.com';

    if (searchQuery) {
      if (site.toLowerCase().includes('youtube')) {
        targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
      } else {
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      }
    }

    const launchedOnWin = await openExternalUrlOnWindows(targetUrl);
    clientActions.push({ type: 'stage_website', payload: { url: targetUrl, site, searchQuery } });
    return {
      resultSummary: launchedOnWin
        ? `Opened ${targetUrl} in your default Windows browser.`
        : `Ready to open ${targetUrl}.`,
      clientActions,
      actionCard: {
        kind: 'website',
        title: searchQuery ? `${site} search: "${searchQuery}"` : `Open ${site}`,
        subtitle: targetUrl,
        url: targetUrl,
      },
    };
  }

  if (name === 'manage_files') {
    const action = String(args.action || 'search');
    const query = args.query ? String(args.query) : '';
    const ext = args.extension ? String(args.extension) : '';
    const folder = args.folder ? String(args.folder) : '';

    if (action === 'recent') {
      const files = getRecentFiles(8);
      return {
        resultSummary: `Found ${files.length} recently modified files. Latest is ${files[0]?.name || 'none'}.`,
        clientActions: [{ type: 'navigate_tab', payload: { tab: 'files' } }],
        actionCard: {
          kind: 'files',
          title: 'Recently Modified Files',
          subtitle: `${files.length} entries`,
          files: files.slice(0, 5),
        },
      };
    }

    if (action === 'duplicates') {
      const groups = findDuplicateFiles();
      const dupFiles = groups.flatMap((g) => g.files);
      return {
        resultSummary:
          groups.length > 0
            ? `Detected ${groups.length} duplicate file group(s) (${dupFiles.length} total files).`
            : 'No duplicate files detected in your active folder.',
        clientActions: [{ type: 'navigate_tab', payload: { tab: 'files' } }],
        actionCard: {
          kind: 'files',
          title: 'Duplicate File Scan',
          subtitle: `${groups.length} duplicate group(s) found`,
          files: dupFiles.slice(0, 6),
        },
      };
    }

    if (action === 'create_folder') {
      const folderName = query || folder || 'Projects';
      const created = createFolder('', folderName);
      return {
        resultSummary: `Created folder "${created.name}".`,
        clientActions: [{ type: 'refresh_files', payload: {} }],
        actionCard: {
          kind: 'files',
          title: 'Folder Created',
          subtitle: created.path,
          files: [created],
        },
      };
    }

    if (action === 'organize') {
      const targetFolder = folder || 'Downloads';
      const plan = {
        id: `confirm-${Date.now()}`,
        type: 'organize_files',
        title: `Organize "${targetFolder}" Folder`,
        description: `Sort files inside "${targetFolder}" into Documents, Media, Spreadsheets, Presentations, and Archives subfolders.`,
        detailLabel: `Target directory: ${targetFolder}`,
        payload: { folder: targetFolder },
      };
      return {
        resultSummary: `Prepared organization plan for "${targetFolder}". Awaiting Boss confirmation.`,
        clientActions: [{ type: 'request_confirmation', payload: plan }],
        actionCard: {
          kind: 'files',
          title: `Organize ${targetFolder}`,
          subtitle: 'Confirmation required before moving files',
          confirmation: plan,
        },
      };
    }

    if (action === 'delete_request') {
      const matches = searchFiles(query, ext);
      const target = matches[0];
      if (!target) {
        return {
          resultSummary: `Could not locate a file matching "${query}".`,
          clientActions: [],
        };
      }
      const plan = {
        id: `confirm-${Date.now()}`,
        type: 'delete_file',
        title: `Delete "${target.name}"`,
        description: `Permanently remove "${target.path}"? This cannot be undone.`,
        detailLabel: `Path: ${target.path}`,
        payload: { path: target.path },
      };
      return {
        resultSummary: `Confirmation required to delete ${target.path}.`,
        clientActions: [{ type: 'request_confirmation', payload: plan }],
        actionCard: {
          kind: 'files',
          title: 'Delete Confirmation Required',
          subtitle: target.path,
          confirmation: plan,
        },
      };
    }

    const found = searchFiles(query, ext);
    return {
      resultSummary:
        found.length > 0
          ? `Found ${found.length} matching file(s): ${found.slice(0, 4).map((f) => f.name).join(', ')}.`
          : `No files matched "${query || ext}".`,
      clientActions: [],
      actionCard: {
        kind: 'files',
        title: ext ? `${ext.toUpperCase()} Files` : `Search: ${query || 'All Files'}`,
        subtitle: `${found.length} match(es)`,
        files: found.slice(0, 6),
      },
    };
  }

  if (name === 'system_monitor') {
    const t = await collectSystemTelemetry();
    clientActions.push({ type: 'navigate_tab', payload: { tab: 'system' } });
    return {
      resultSummary: `CPU is at ${t.cpuPercent}%, memory usage is ${t.memoryPercent}% (${t.memoryUsedGb} of ${t.memoryTotalGb} GB), storage is ${t.storagePercent}% used, and internet connection is ${t.internetConnected ? 'online' : 'offline'}. ${t.advisory || ''}`,
      clientActions,
      actionCard: {
        kind: 'system',
        title: 'Live System Performance',
        subtitle: `${t.hardware.cpuCores} cores · ${t.hardware.arch}`,
        telemetrySnapshot: {
          cpuPercent: t.cpuPercent,
          memoryPercent: t.memoryPercent,
          storagePercent: t.storagePercent,
          internetConnected: t.internetConnected,
        },
      },
    };
  }

  if (name === 'system_control') {
    const action = String(args.action || 'settings') as
      | 'volume_up'
      | 'volume_down'
      | 'volume_mute'
      | 'volume_set'
      | 'brightness_set'
      | 'screenshot'
      | 'settings'
      | 'clipboard_read';
    const value = typeof args.value === 'number' ? args.value : undefined;
    const outcome = await executeWindowsSystemControl(action, value);
    clientActions.push({ type: 'system_control', payload: { action, value, data: outcome.data } });
    if (action === 'screenshot') {
      clientActions.push({ type: 'refresh_files', payload: {} });
    }
    return {
      resultSummary: outcome.message,
      clientActions,
    };
  }

  if (name === 'initiate_call') {
    const contactName = String(args.contactName || 'Contact');
    const service = String(args.service || 'Phone Link');
    const plan = {
      id: `confirm-${Date.now()}`,
      type: 'initiate_call',
      title: `Call ${contactName}`,
      description: `Confirm placing an outgoing call to ${contactName} via ${service}.`,
      detailLabel: `Service: ${service}`,
      payload: { contactName, targetHandle: contactName, service },
    };
    return {
      resultSummary: `Prepared call to ${contactName} via ${service}. Awaiting Boss confirmation.`,
      clientActions: [{ type: 'request_confirmation', payload: plan }],
      actionCard: {
        kind: 'call_prompt',
        title: `Call ${contactName}`,
        subtitle: `Via ${service} · Confirmation required`,
        confirmation: plan,
      },
    };
  }

  return { resultSummary: 'Command processed.', clientActions };
}

export async function parseLocalIntent(
  command: string,
  history: Array<{ role: 'user' | 'ultron'; text: string }> = [],
  ollamaModel?: string
): Promise<CommandResult> {
  const lower = command.toLowerCase().trim();
  const withoutWake = lower
    .replace(/^(hey ultron|ultron|my buddy)[,:\s]*/i, '')
    .trim();

  if (
    withoutWake === '' ||
    /^(hi|hello|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(withoutWake)
  ) {
    return {
      reply: "I'm here, Boss. What can I do for you?",
      intent: 'greeting',
      engineUsed: 'local',
      clientActions: [],
    };
  }

  if (/\b(thank you|thanks|appreciate)\b/.test(lower)) {
    return {
      reply: 'Always ready to assist, Boss.',
      intent: 'gratitude',
      engineUsed: 'local',
      clientActions: [],
    };
  }

  const ytMatch = lower.match(/youtube.*(?:search(?:\s+for)?|find|look up)\s+(.+)/i);
  if (ytMatch) {
    const tool = await executeToolCall('open_website', { site: 'youtube', searchQuery: ytMatch[1].trim() });
    return {
      reply: `Certainly, Boss. ${tool.resultSummary}`,
      intent: 'open_website',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  const siteMatch = lower.match(/\b(google|youtube|facebook|gmail|chatgpt|github)\b/);
  if (siteMatch && /\b(open|launch|go to|visit|browse|show)\b/.test(lower)) {
    const tool = await executeToolCall('open_website', { site: siteMatch[1] });
    return {
      reply: `Certainly, Boss. ${tool.resultSummary}`,
      intent: 'open_website',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  const callMatch = withoutWake.match(/\b(?:call|dial|ring)\s+(.+)/i);
  if (callMatch) {
    const contactName = callMatch[1]
      .replace(/\b(via|using|on)\s+(whatsapp|phone link|voip)\b/i, '')
      .trim();
    const service = lower.includes('whatsapp')
      ? 'WhatsApp'
      : lower.includes('voip')
      ? 'VoIP'
      : 'Phone Link';
    const tool = await executeToolCall('initiate_call', { contactName, service });
    return {
      reply: `Boss, please confirm before I initiate the ${service} call to ${contactName}.`,
      intent: 'initiate_call',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  const appMatch = lower.match(
    /\b(chrome|edge|msedge|vs code|vscode|terminal|powershell|explorer|calculator|notepad|settings|whatsapp|phone link)\b/
  );
  if (appMatch) {
    const op = /\bclose\b/.test(lower)
      ? 'close'
      : /\bminimize\b/.test(lower)
      ? 'minimize'
      : /\bmaximize\b/.test(lower)
      ? 'maximize'
      : /\bfocus|switch\b/.test(lower)
      ? 'focus'
      : 'open';
    const tool = await executeToolCall('open_application', { appName: appMatch[1], operation: op });
    return {
      reply: `Certainly, Boss. ${tool.resultSummary}`,
      intent: 'open_application',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  if (/\b(create|make|new)\s+(?:a\s+)?folder\s+(?:called|named)?\s*([a-z0-9_\-\s]+)/i.test(lower)) {
    const m = lower.match(/\b(?:create|make|new)\s+(?:a\s+)?folder\s+(?:called|named)?\s*([a-z0-9_\-\s]+)/i);
    const folderName = (m?.[1] || 'Projects').trim();
    const tool = await executeToolCall('manage_files', { action: 'create_folder', query: folderName });
    return {
      reply: `Done, Boss. ${tool.resultSummary}`,
      intent: 'manage_files',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  if (/\borganize\b/.test(lower)) {
    const folder = lower.includes('desktop') ? 'Projects' : 'Downloads';
    const tool = await executeToolCall('manage_files', { action: 'organize', folder });
    return {
      reply: `Boss, I have prepared an organization plan for your ${folder} folder. Please confirm to proceed.`,
      intent: 'manage_files',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  if (/\bduplicate/.test(lower)) {
    const tool = await executeToolCall('manage_files', { action: 'duplicates' });
    return {
      reply: `Scan complete, Boss. ${tool.resultSummary}`,
      intent: 'manage_files',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  if (/\b(latest|recent)\b/.test(lower) && /\b(pdf|file|project|document|work)\b/.test(lower)) {
    const extMatch = lower.match(/\b(pdf|docx|txt|xlsx|pptx|jpg|png|mp4|mp3|zip)\b/);
    if (extMatch) {
      const tool = await executeToolCall('manage_files', { action: 'search', extension: extMatch[1] });
      return {
        reply: `Boss, ${tool.resultSummary}`,
        intent: 'manage_files',
        engineUsed: 'local',
        clientActions: tool.clientActions,
        actionCard: tool.actionCard,
      };
    }
    const tool = await executeToolCall('manage_files', { action: 'recent' });
    return {
      reply: `Boss, ${tool.resultSummary}`,
      intent: 'manage_files',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  if (/\b(find|search)\b/.test(lower)) {
    const extMatch = lower.match(/\b(pdf|docx|txt|xlsx|pptx|jpg|png|mp4|mp3|zip)\b/);
    const cleanQuery = lower
      .replace(/^(ultron|hey ultron|my buddy)[,\s]*/i, '')
      .replace(/\b(find|search|for|all|my|files|file)\b/g, '')
      .trim();
    const tool = await executeToolCall('manage_files', {
      action: 'search',
      query: extMatch ? '' : cleanQuery,
      extension: extMatch ? extMatch[1] : '',
    });
    return {
      reply: `Boss, ${tool.resultSummary}`,
      intent: 'manage_files',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  if (/\b(performance|cpu|memory|ram|storage|system|battery|health|status)\b/.test(lower)) {
    const tool = await executeToolCall('system_monitor', { focus: 'summary' });
    return {
      reply: `Here is your live system telemetry, Boss. ${tool.resultSummary}`,
      intent: 'system_monitor',
      engineUsed: 'local',
      clientActions: tool.clientActions,
      actionCard: tool.actionCard,
    };
  }

  if (/\bscreenshot\b/.test(lower)) {
    const tool = await executeToolCall('system_control', { action: 'screenshot' });
    return {
      reply: `Done, Boss. ${tool.resultSummary}`,
      intent: 'system_control',
      engineUsed: 'local',
      clientActions: tool.clientActions,
    };
  }

  if (/\b(mute|volume)\b/.test(lower)) {
    const numMatch = lower.match(/\b(\d{1,3})\b/);
    const action = lower.includes('mute')
      ? 'volume_mute'
      : numMatch
      ? 'volume_set'
      : lower.includes('down') || lower.includes('lower')
      ? 'volume_down'
      : 'volume_up';
    const tool = await executeToolCall('system_control', {
      action,
      value: numMatch ? Math.min(100, Number(numMatch[1])) : undefined,
    });
    return {
      reply: `Audio level updated, Boss.`,
      intent: 'system_control',
      engineUsed: 'local',
      clientActions: tool.clientActions,
    };
  }

  // Try free local Ollama model if running on localhost:11434
  const ollamaReply = await queryOllamaChat(command, history, ollamaModel || 'llama3.2');
  if (ollamaReply) {
    return {
      reply: ollamaReply,
      intent: 'conversation',
      engineUsed: 'ollama',
      clientActions: [],
    };
  }

  return {
    reply:
      'I heard you, Boss, though I am currently running offline without a local Ollama model and need a clearer task—try asking me to check system performance, find PDF files, open Chrome, take a screenshot, or organize Downloads.',
    intent: 'clarification',
    engineUsed: 'local',
    clientActions: [],
  };
}

export async function processAssistantCommand(
  command: string,
  history: Array<{ role: 'user' | 'ultron'; text: string }>,
  mode: 'hybrid' | 'cloud' | 'local' | 'ollama',
  ollamaModel?: string
): Promise<CommandResult> {
  if (mode === 'local' || mode === 'ollama') {
    const res = await parseLocalIntent(command, history, ollamaModel);
    recordLog('action', res.engineUsed === 'ollama' ? 'Ollama Local LLM' : 'Local Engine', `Processed: "${command}" -> ${res.intent}`);
    return res;
  }

  const ai = getAiClient();
  if (!ai) {
    if (mode === 'cloud') {
      throw new Error('GEMINI_API_KEY is not configured in server secrets. Switch to Hybrid/Local mode or configure the key.');
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
        role: m.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: m.text }],
      })),
      { role: 'user' as const, parts: [{ text: command }] },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        tools: [{ functionDeclarations: ULTRON_TOOLS }],
      },
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const args = (call.args || {}) as Record<string, unknown>;
      const toolOutcome = await executeToolCall(call.name || 'unknown', args);

      const previousContent = response.candidates?.[0]?.content;
      let finalReply = toolOutcome.resultSummary;
      if (previousContent && call.id) {
        try {
          const followUp = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: [
              ...contents,
              previousContent,
              {
                role: 'user',
                parts: [
                  {
                    functionResponse: {
                      id: call.id,
                      name: call.name || 'tool',
                      response: { result: toolOutcome.resultSummary },
                    },
                  },
                ],
              },
            ],
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          if (followUp.text) {
            finalReply = followUp.text.trim();
          }
        } catch {
          finalReply = `Certainly, Boss. ${toolOutcome.resultSummary}`;
        }
      }

      recordLog('action', 'Gemini AI', `Intent "${call.name}" executed for Boss.`);
      return {
        reply: finalReply,
        intent: call.name || 'tool',
        engineUsed: 'gemini',
        clientActions: toolOutcome.clientActions,
        actionCard: toolOutcome.actionCard,
      };
    }

    const text = response.text?.trim() || "I'm ready, Boss. How can I help?";
    recordLog('info', 'Gemini AI', `Conversational response delivered.`);
    return {
      reply: text,
      intent: 'conversation',
      engineUsed: 'gemini',
      clientActions: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordLog('error', 'Gemini AI', msg);
    if (mode === 'hybrid') {
      return parseLocalIntent(command, history, ollamaModel);
    }
    throw err;
  }
}

export async function synthesizeFemaleSpeech(
  text: string,
  voiceName: 'Kore' | 'Zephyr' = 'Kore',
  tone: 'calm' | 'friendly' | 'executive' | 'poised' = 'calm'
): Promise<{ base64Wav: string; mimeType: string }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY unavailable for cloud speech synthesis.');
  }

  const styleMap: Record<string, string> = {
    calm: 'Calm, intelligent, poised female personal assistant, warm and confident',
    friendly: 'Friendly, bright, conversational female personal assistant',
    executive: 'Crisp, articulate, executive female assistant',
    poised: 'Futuristic, composed, reassuring female AI assistant',
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: {
              style: styleMap[tone] || styleMap.calm,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) {
    throw new Error('Speech synthesis returned empty audio payload.');
  }
  return {
    base64Wav: inline.data,
    mimeType: inline.mimeType || 'audio/wav',
  };
}

export async function transcribeAudioClip(base64Audio: string, mimeType: string): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY unavailable for audio transcription.');
  }
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType || 'audio/webm',
            data: base64Audio,
          },
        },
        { text: 'Transcribe the user voice command accurately.' },
      ],
    },
  });
  return response.text?.trim() || '';
}
