const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const DB_FILENAME = 'gpt-codex-desktop.json';
const PROJECT_ROOT = process.cwd();

let state = null;
let ggufProcess = null;
const terminalSessions = new Map();

function getDbPath() {
  return path.join(app.getPath('userData'), DB_FILENAME);
}

function makeId() {
  return crypto.randomUUID();
}

function timestamp() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    settings: {
      provider: 'openai',
      systemPrompt: 'You are GPT Codex Desktop, a highly capable coding assistant.',
      temperature: 0.2,
      maxTokens: 2048,
      personality: 'conversational',
      providers: {
        openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
        openaiCompatible: { baseUrl: 'http://localhost:1234/v1', apiKey: 'not-needed', model: 'local-model' },
        ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.1:8b' },
        gguf: {
          binaryPath: '',
          modelPath: '',
          host: '127.0.0.1',
          port: 8080,
          ctxSize: 8192,
          gpuLayers: 0,
          modelAlias: 'gguf-local-model'
        }
      },
      mcpServers: [],
      vscode: { binaryPath: 'code', workspacePath: '', extensionsDir: '' }
    },
    chats: [],
    activeChatId: null,
    agents: [],
    researchJobs: []
  };
}

function normalizeMessage(message) {
  return {
    role: message.role,
    content: message.content ?? '',
    createdAt: message.createdAt ?? timestamp(),
    isError: Boolean(message.isError),
    meta: {
      latencyMs: message.meta?.latencyMs ?? null,
      promptTokensEstimate: message.meta?.promptTokensEstimate ?? null,
      completionTokensEstimate: message.meta?.completionTokensEstimate ?? null,
      totalTokensEstimate: message.meta?.totalTokensEstimate ?? null,
      provider: message.meta?.provider ?? null,
      model: message.meta?.model ?? null
    }
  };
}

function normalizeChat(chat) {
  return {
    id: chat.id ?? makeId(),
    title: chat.title || 'New Chat',
    createdAt: chat.createdAt ?? timestamp(),
    updatedAt: chat.updatedAt ?? timestamp(),
    messages: Array.isArray(chat.messages) ? chat.messages.map(normalizeMessage) : []
  };
}

function normalizeMcpServer(server = {}) {
  return {
    id: server.id ?? makeId(),
    name: server.name ?? 'MCP Server',
    transport: server.transport ?? 'stdio',
    command: server.command ?? '',
    args: Array.isArray(server.args) ? server.args : String(server.args || '').split(' ').filter(Boolean),
    url: server.url ?? '',
    enabled: server.enabled !== false,
    timeoutMs: Number(server.timeoutMs ?? 12000)
  };
}

function normalizeAgent(agent = {}) {
  return {
    id: agent.id ?? makeId(),
    name: agent.name ?? 'New Agent',
    goal: agent.goal ?? '',
    status: agent.status ?? 'idle',
    personality: agent.personality ?? 'conversational',
    branch: agent.branch ?? 'main',
    worktreePath: agent.worktreePath ?? '',
    createdAt: agent.createdAt ?? timestamp(),
    updatedAt: agent.updatedAt ?? timestamp(),
    plan: Array.isArray(agent.plan) ? agent.plan : [],
    logs: Array.isArray(agent.logs) ? agent.logs : [],
    notes: Array.isArray(agent.notes) ? agent.notes : []
  };
}

function normalizeResearchJob(job = {}) {
  return {
    id: job.id ?? makeId(),
    title: job.title ?? 'Research Job',
    objective: job.objective ?? '',
    status: job.status ?? 'idle',
    createdAt: job.createdAt ?? timestamp(),
    updatedAt: job.updatedAt ?? timestamp(),
    findings: Array.isArray(job.findings) ? job.findings : [],
    report: job.report ?? '',
    experiments: Array.isArray(job.experiments) ? job.experiments : [],
    logs: Array.isArray(job.logs) ? job.logs : []
  };
}

function mergeSettings(base, incoming = {}) {
  return {
    ...base,
    ...incoming,
    providers: {
      ...base.providers,
      ...(incoming.providers ?? {}),
      openai: { ...base.providers.openai, ...(incoming.providers?.openai ?? {}) },
      openaiCompatible: { ...base.providers.openaiCompatible, ...(incoming.providers?.openaiCompatible ?? {}) },
      ollama: { ...base.providers.ollama, ...(incoming.providers?.ollama ?? {}) },
      gguf: { ...base.providers.gguf, ...(incoming.providers?.gguf ?? {}) }
    },
    vscode: { ...base.vscode, ...(incoming.vscode ?? {}) },
    mcpServers: Array.isArray(incoming.mcpServers)
      ? incoming.mcpServers.map((server) => normalizeMcpServer(server))
      : base.mcpServers
  };
}

function normalizeState(input) {
  const base = defaultState();
  const source = input ?? {};

  return {
    settings: mergeSettings(base.settings, {
      ...source.settings,
      mcpServers: Array.isArray(source.settings?.mcpServers) ? source.settings.mcpServers : base.settings.mcpServers
    }),
    chats: Array.isArray(source.chats) ? source.chats.map(normalizeChat) : [],
    activeChatId: source.activeChatId ?? null,
    agents: Array.isArray(source.agents) ? source.agents.map(normalizeAgent) : [],
    researchJobs: Array.isArray(source.researchJobs) ? source.researchJobs.map(normalizeResearchJob) : []
  };
}

function readState() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    const initialState = defaultState();
    fs.writeFileSync(dbPath, JSON.stringify(initialState, null, 2));
    return initialState;
  }

  try {
    return normalizeState(JSON.parse(fs.readFileSync(dbPath, 'utf8')));
  } catch (error) {
    console.error('Failed to read state. Resetting.', error);
    const initialState = defaultState();
    fs.writeFileSync(dbPath, JSON.stringify(initialState, null, 2));
    return initialState;
  }
}

function saveState(nextState) {
  fs.writeFileSync(getDbPath(), JSON.stringify(nextState, null, 2));
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1550,
    height: 920,
    minWidth: 1220,
    minHeight: 740,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

function createNewChat(title = 'New Chat') {
  return { id: makeId(), title, createdAt: timestamp(), updatedAt: timestamp(), messages: [] };
}

function ensureActiveChat() {
  if (state.chats.length === 0) {
    const chat = createNewChat();
    state.chats.unshift(chat);
    state.activeChatId = chat.id;
  }

  if (!state.chats.find((chat) => chat.id === state.activeChatId)) {
    state.activeChatId = state.chats[0].id;
  }
}

function getActiveChat() {
  ensureActiveChat();
  return state.chats.find((chat) => chat.id === state.activeChatId);
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function tokenEstimate(text) {
  return Math.ceil((text || '').length / 4);
}

function providerModel(settings, provider) {
  if (provider === 'ollama') return settings.providers.ollama.model;
  if (provider === 'gguf') return settings.providers.gguf.modelAlias;
  return provider === 'openai' ? settings.providers.openai.model : settings.providers.openaiCompatible.model;
}

function ggufBaseUrl() {
  const gguf = state.settings.providers.gguf;
  return `http://${gguf.host}:${gguf.port}/v1`;
}

function personalityPrefix() {
  return state.settings.personality === 'terse'
    ? 'Respond tersely and with minimal verbosity.'
    : 'Respond conversationally, explaining key tradeoffs.';
}

async function callModel(messages) {
  const settings = state.settings;
  const provider = settings.provider;

  if (provider === 'ollama') {
    const { baseUrl, model } = settings.providers.ollama;
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
        options: { temperature: settings.temperature }
      })
    });

    if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json();
    return payload.message?.content ?? '';
  }

  const providerSettings =
    provider === 'openai'
      ? settings.providers.openai
      : provider === 'gguf'
        ? { baseUrl: ggufBaseUrl(), apiKey: 'not-needed', model: settings.providers.gguf.modelAlias }
        : settings.providers.openaiCompatible;

  const headers = { 'Content-Type': 'application/json' };
  if (providerSettings.apiKey) headers.Authorization = `Bearer ${providerSettings.apiKey}`;

  const response = await fetch(`${normalizeBaseUrl(providerSettings.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: providerSettings.model,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      temperature: settings.temperature,
      max_tokens: settings.maxTokens
    })
  });

  if (!response.ok) throw new Error(`Provider request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content ?? '';
}

async function sendToModel(userMessage) {
  const activeChat = getActiveChat();
  activeChat.messages.push({
    role: 'user',
    content: userMessage,
    createdAt: timestamp(),
    isError: false,
    meta: { provider: state.settings.provider, model: providerModel(state.settings, state.settings.provider) }
  });

  const modelMessages = [
    { role: 'system', content: `${state.settings.systemPrompt}\n${personalityPrefix()}` },
    ...activeChat.messages.map((message) => ({ role: message.role, content: message.content }))
  ];

  activeChat.updatedAt = timestamp();
  saveState(state);

  const started = Date.now();
  const provider = state.settings.provider;
  const model = providerModel(state.settings, provider);
  const promptTokenEstimate = tokenEstimate(modelMessages.map((message) => message.content).join('\n'));

  try {
    const assistantText = await callModel(modelMessages);
    const completionTokenEstimate = tokenEstimate(assistantText);

    activeChat.messages.push({
      role: 'assistant',
      content: assistantText,
      createdAt: timestamp(),
      isError: false,
      meta: {
        latencyMs: Date.now() - started,
        promptTokensEstimate: promptTokenEstimate,
        completionTokensEstimate: completionTokenEstimate,
        totalTokensEstimate: promptTokenEstimate + completionTokenEstimate,
        provider,
        model
      }
    });

    if (activeChat.title === 'New Chat') activeChat.title = userMessage.slice(0, 40) || 'New Chat';
    activeChat.updatedAt = timestamp();
    saveState(state);
    return { ok: true, state };
  } catch (error) {
    activeChat.messages.push({
      role: 'assistant',
      content: `Error: ${error.message}`,
      createdAt: timestamp(),
      isError: true,
      meta: {
        latencyMs: Date.now() - started,
        promptTokensEstimate: promptTokenEstimate,
        provider,
        model
      }
    });

    activeChat.updatedAt = timestamp();
    saveState(state);
    return { ok: false, error: error.message, state };
  }
}

async function providerHealthCheck() {
  const provider = state.settings.provider;

  if (provider === 'ollama') {
    const response = await fetch(`${normalizeBaseUrl(state.settings.providers.ollama.baseUrl)}/api/tags`);
    if (!response.ok) throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    return 'Connected to Ollama';
  }

  const providerSettings =
    provider === 'openai'
      ? state.settings.providers.openai
      : provider === 'gguf'
        ? { baseUrl: ggufBaseUrl(), apiKey: '' }
        : state.settings.providers.openaiCompatible;

  const headers = {};
  if (providerSettings.apiKey) headers.Authorization = `Bearer ${providerSettings.apiKey}`;
  const response = await fetch(`${normalizeBaseUrl(providerSettings.baseUrl)}/models`, { headers });
  if (!response.ok) throw new Error(`Health check failed: ${response.status} ${response.statusText}`);

  return provider === 'gguf' ? 'Connected to GGUF llama.cpp server' : 'Connected to OpenAI-compatible endpoint';
}

function runProcess(command, args = [], opts = {}) {
  return spawn(command, args, { stdio: 'pipe', shell: false, windowsHide: true, ...opts });
}

function runShellCommand(command, cwd = PROJECT_ROOT) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function listMcpToolsStdIo(server) {
  return new Promise((resolve, reject) => {
    const child = runProcess(server.command, server.args || []);
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out while talking to MCP server: ${server.name}`));
    }, server.timeoutMs || 12000);

    function send(payload) {
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    }

    function handleLine(line) {
      if (!line.trim()) return;

      try {
        const msg = JSON.parse(line);
        if (msg.id === 1 && !msg.error) {
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
          return;
        }

        if (msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          if (msg.error) {
            reject(new Error(msg.error.message || 'MCP tools/list failed'));
            return;
          }

          const tools = msg.result?.tools || [];
          resolve(tools.map((tool) => ({ name: tool.name, description: tool.description || '' })));
        }
      } catch {
        // ignore
      }
    }

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      const lines = stdout.split('\n');
      stdout = lines.pop() || '';
      lines.forEach(handleLine);
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('exit', (code) => {
      if (code !== null && code !== 0 && code !== -15) {
        clearTimeout(timer);
        reject(new Error(stderr || `MCP process exited with code ${code}`));
      }
    });

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'gpt-codex-desktop', version: '1.0.0' }
      }
    });
  });
}

async function testMcpServer(server) {
  if (server.transport === 'stdio') {
    if (!server.command) throw new Error('Missing command for stdio MCP server');
    const tools = await listMcpToolsStdIo(server);
    return { ok: true, message: `Connected: ${server.name} (${tools.length} tools)`, tools };
  }

  if (server.transport === 'sse') {
    if (!server.url) throw new Error('Missing URL for SSE MCP server');
    const response = await fetch(server.url, { method: 'GET' });
    if (!response.ok) throw new Error(`Unable to reach SSE server (${response.status})`);
    return { ok: true, message: `Reachable SSE endpoint: ${server.url}`, tools: [] };
  }

  throw new Error(`Unsupported transport: ${server.transport}`);
}

function ggufStatus() {
  return { running: Boolean(ggufProcess), pid: ggufProcess?.pid ?? null, endpoint: ggufBaseUrl() };
}

function startGgufServer() {
  if (ggufProcess) return { ok: true, status: ggufStatus(), message: 'GGUF server already running.' };

  const cfg = state.settings.providers.gguf;
  if (!cfg.binaryPath || !cfg.modelPath) {
    return { ok: false, message: 'Configure GGUF binary path and model path first.' };
  }

  const args = [
    '--model',
    cfg.modelPath,
    '--host',
    cfg.host,
    '--port',
    String(cfg.port),
    '--ctx-size',
    String(cfg.ctxSize),
    '--alias',
    cfg.modelAlias
  ];

  if (Number(cfg.gpuLayers) > 0) args.push('--n-gpu-layers', String(cfg.gpuLayers));

  try {
    ggufProcess = runProcess(cfg.binaryPath, args);
    ggufProcess.on('exit', () => {
      ggufProcess = null;
    });
    return { ok: true, status: ggufStatus(), message: 'GGUF server started.' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function stopGgufServer() {
  if (!ggufProcess) return { ok: true, status: ggufStatus(), message: 'GGUF server is not running.' };
  ggufProcess.kill();
  ggufProcess = null;
  return { ok: true, status: ggufStatus(), message: 'GGUF server stopped.' };
}

function resolveCodeBinary() {
  return state.settings.vscode.binaryPath?.trim() || 'code';
}

function buildVsCodeArgs(extraArgs = []) {
  const cfg = state.settings.vscode;
  const args = [];
  if (cfg.extensionsDir) args.push('--extensions-dir', cfg.extensionsDir);
  if (cfg.workspacePath) args.push(cfg.workspacePath);
  return [...args, ...extraArgs];
}

function launchVsCode() {
  const binary = resolveCodeBinary();
  const child = runProcess(binary, buildVsCodeArgs(), { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true, message: `Launched VS Code via '${binary}'.` };
}

function installVsix(vsixPath) {
  const binary = resolveCodeBinary();
  return new Promise((resolve) => {
    const child = runProcess(binary, buildVsCodeArgs(['--install-extension', vsixPath, '--force']));
    let stderr = '';

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, message: `Installed VSIX: ${path.basename(vsixPath)}` });
      } else {
        resolve({ ok: false, message: stderr || `VSIX install failed with code ${code}` });
      }
    });
  });
}

function getAgents() {
  state.agents = state.agents.map((agent) => normalizeAgent(agent));
  return state.agents;
}

function terminalStart(command, cwd) {
  const id = makeId();
  const child = spawn(command || 'bash', { cwd: cwd || PROJECT_ROOT, shell: true, windowsHide: true });
  const session = { id, child, buffer: '', closed: false, exitCode: null };

  function append(chunk) {
    session.buffer += chunk;
    if (session.buffer.length > 64000) {
      session.buffer = session.buffer.slice(-64000);
    }
  }

  child.stdout.on('data', (d) => append(d.toString()));
  child.stderr.on('data', (d) => append(d.toString()));
  child.on('close', (code) => {
    session.closed = true;
    session.exitCode = code;
    append(`\n[process exited with code ${code}]\n`);
  });

  terminalSessions.set(id, session);
  return { id };
}

function terminalWrite(id, input) {
  const session = terminalSessions.get(id);
  if (!session || session.closed) return { ok: false };
  session.child.stdin.write(input);
  return { ok: true };
}

function terminalPoll(id) {
  const session = terminalSessions.get(id);
  if (!session) return { ok: false, output: '', closed: true, exitCode: null };
  const output = session.buffer;
  session.buffer = '';
  return { ok: true, output, closed: session.closed, exitCode: session.exitCode };
}

function terminalStop(id) {
  const session = terminalSessions.get(id);
  if (!session) return { ok: false };
  session.child.kill();
  session.closed = true;
  return { ok: true };
}


function getResearchJobs() {
  state.researchJobs = (state.researchJobs || []).map((job) => normalizeResearchJob(job));
  return state.researchJobs;
}

function repoSnapshotForResearch() {
  return Promise.all([
    runShellCommand('rg --files | head -n 200', PROJECT_ROOT),
    runShellCommand('git status --short --branch', PROJECT_ROOT),
    runShellCommand('git worktree list', PROJECT_ROOT)
  ]).then(([files, gitStatus, worktrees]) => ({
    files: files.stdout || files.stderr,
    gitStatus: gitStatus.stdout || gitStatus.stderr,
    worktrees: worktrees.stdout || worktrees.stderr,
    readme: fs.existsSync(path.join(PROJECT_ROOT, 'README.md'))
      ? fs.readFileSync(path.join(PROJECT_ROOT, 'README.md'), 'utf8').slice(0, 6000)
      : ''
  }));
}

async function runResearchJob(jobId) {
  const idx = (state.researchJobs || []).findIndex((job) => job.id === jobId);
  if (idx === -1) return { ok: false, message: 'Research job not found' };

  const job = normalizeResearchJob(state.researchJobs[idx]);
  job.status = 'running';
  job.updatedAt = timestamp();
  job.logs.push(`[${timestamp()}] Started research cycle.`);
  state.researchJobs[idx] = job;
  saveState(state);

  const snapshot = await repoSnapshotForResearch();
  const prompt = [
    'You are a software research strategist helping an IDE self-evolve.',
    `Research Objective: ${job.objective || job.title}`,
    'Analyze the repository snapshot and propose a structured evolution plan.',
    'Return plain markdown with sections: Findings, Gaps, Experiments, Suggested Implementation Plan, Risks.',
    '',
    'Repository files sample:',
    snapshot.files,
    '',
    'Git status:',
    snapshot.gitStatus,
    '',
    'Worktrees:',
    snapshot.worktrees,
    '',
    'README excerpt:',
    snapshot.readme
  ].join('\n');

  let report = '';
  try {
    report = await callModel([
      { role: 'system', content: `${state.settings.systemPrompt}
${personalityPrefix()}` },
      { role: 'user', content: prompt }
    ]);
  } catch (error) {
    report = `Model unavailable during research. Fallback report.

Potential next steps:
- Run test suites
- Compare feature parity with target spec
- Add measurable benchmarks

Error: ${error.message}`;
  }

const findings = report
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ') || line.match(/^\d+\./))
    .slice(0, 20);

  job.findings = findings;
  job.report = report;
  job.status = 'completed';
  job.updatedAt = timestamp();
  job.logs.push(`[${timestamp()}] Completed research cycle with ${findings.length} extracted findings.`);
  state.researchJobs[idx] = job;
  saveState(state);

  return { ok: true, job };
}


function safeResolvedPath(relPath = '') {
  const full = path.resolve(PROJECT_ROOT, relPath || '.');
  const root = path.resolve(PROJECT_ROOT);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new Error('Path escapes project root');
  }
  return full;
}

function toRelative(fullPath) {
  return path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
}

function listDirNode(absPath, depth = 0, maxDepth = 4) {
  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) {
    return {
      name: path.basename(absPath),
      path: toRelative(absPath),
      type: 'file'
    };
  }

  const entries = fs
    .readdirSync(absPath, { withFileTypes: true })
    .filter((entry) => !['node_modules', '.git', 'dist'].includes(entry.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  const children = depth >= maxDepth
    ? []
    : entries.map((entry) => listDirNode(path.join(absPath, entry.name), depth + 1, maxDepth));

  return {
    name: depth === 0 ? path.basename(PROJECT_ROOT) : path.basename(absPath),
    path: toRelative(absPath),
    type: 'directory',
    children
  };
}

function explorerTree(relPath = '.', maxDepth = 4) {
  const abs = safeResolvedPath(relPath);
  return listDirNode(abs, 0, Number(maxDepth || 4));
}

function explorerReadFile(relPath) {
  const abs = safeResolvedPath(relPath);
  const stat = fs.statSync(abs);
  if (!stat.isFile()) throw new Error('Not a file');
  return fs.readFileSync(abs, 'utf8');
}

function explorerWriteFile(relPath, content) {
  const abs = safeResolvedPath(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content ?? '', 'utf8');
  return { ok: true, path: toRelative(abs) };
}

function explorerCreateFile(relPath) {
  const abs = safeResolvedPath(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, '', 'utf8');
  return { ok: true, path: toRelative(abs) };
}

function explorerCreateFolder(relPath) {
  const abs = safeResolvedPath(relPath);
  fs.mkdirSync(abs, { recursive: true });
  return { ok: true, path: toRelative(abs) };
}

function explorerRename(oldRelPath, newRelPath) {
  const oldAbs = safeResolvedPath(oldRelPath);
  const newAbs = safeResolvedPath(newRelPath);
  fs.mkdirSync(path.dirname(newAbs), { recursive: true });
  fs.renameSync(oldAbs, newAbs);
  return { ok: true, oldPath: toRelative(oldAbs), newPath: toRelative(newAbs) };
}

function explorerDelete(relPath) {
  const abs = safeResolvedPath(relPath);
  fs.rmSync(abs, { recursive: true, force: true });
  return { ok: true, path: toRelative(abs) };
}

app.whenReady().then(() => {
  state = readState();
  ensureActiveChat();
  saveState(state);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (ggufProcess) ggufProcess.kill();
  for (const session of terminalSessions.values()) {
    if (!session.closed) session.child.kill();
  }
});

ipcMain.handle('app:bootstrap', () => {
  ensureActiveChat();
  return { ...state, runtime: { gguf: ggufStatus() } };
});

ipcMain.handle('settings:update', (_event, nextSettings) => {
  state.settings = mergeSettings(state.settings, nextSettings);
  saveState(state);
  return state.settings;
});

ipcMain.handle('provider:test-connection', async () => {
  try {
    return { ok: true, message: await providerHealthCheck() };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('mcp:list', () => state.settings.mcpServers || []);
ipcMain.handle('mcp:save', (_event, servers) => {
  state.settings.mcpServers = (servers || []).map((server) => normalizeMcpServer(server));
  saveState(state);
  return state.settings.mcpServers;
});
ipcMain.handle('mcp:test', async (_event, serverId) => {
  const server = (state.settings.mcpServers || []).find((item) => item.id === serverId);
  if (!server) return { ok: false, message: 'Server not found', tools: [] };
  try {
    return await testMcpServer(server);
  } catch (error) {
    return { ok: false, message: error.message, tools: [] };
  }
});

ipcMain.handle('vscode:launch', async () => {
  try {
    return launchVsCode();
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('vscode:pick-vsix-and-install', async () => {
  const open = await dialog.showOpenDialog({
    title: 'Select VSIX Extension',
    filters: [{ name: 'VS Code Extension', extensions: ['vsix'] }],
    properties: ['openFile']
  });

  if (open.canceled || !open.filePaths[0]) return { ok: false, message: 'Cancelled.' };
  return installVsix(open.filePaths[0]);
});

ipcMain.handle('gguf:start', () => {
  const result = startGgufServer();
  saveState(state);
  return result;
});
ipcMain.handle('gguf:stop', () => stopGgufServer());
ipcMain.handle('gguf:status', () => ggufStatus());

ipcMain.handle('agent:list', () => getAgents());
ipcMain.handle('agent:create', (_event, payload) => {
  const agent = normalizeAgent(payload);
  state.agents.unshift(agent);
  saveState(state);
  return getAgents();
});
ipcMain.handle('agent:update', (_event, payload) => {
  state.agents = state.agents.map((agent) =>
    agent.id === payload.id ? normalizeAgent({ ...agent, ...payload, updatedAt: timestamp() }) : agent
  );
  saveState(state);
  return getAgents();
});
ipcMain.handle('agent:add-log', (_event, payload) => {
  state.agents = state.agents.map((agent) => {
    if (agent.id !== payload.id) return agent;
    const logs = [...(agent.logs || []), `[${timestamp()}] ${payload.log}`];
    return { ...agent, logs: logs.slice(-200), updatedAt: timestamp() };
  });
  saveState(state);
  return getAgents();
});
ipcMain.handle('agent:advance-plan', (_event, payload) => {
  state.agents = state.agents.map((agent) => {
    if (agent.id !== payload.id) return agent;
    const plan = [...(agent.plan || [])];
    if (payload.addStep) {
      plan.push({ step: payload.addStep, status: 'pending' });
    }
    if (typeof payload.index === 'number' && plan[payload.index]) {
      plan[payload.index].status = payload.status;
    }
    return { ...agent, plan, updatedAt: timestamp() };
  });
  saveState(state);
  return getAgents();
});
ipcMain.handle('agent:delete', (_event, agentId) => {
  state.agents = state.agents.filter((agent) => agent.id !== agentId);
  saveState(state);
  return getAgents();
});

ipcMain.handle('research:list', () => getResearchJobs());
ipcMain.handle('research:create', (_event, payload) => {
  const job = normalizeResearchJob(payload);
  state.researchJobs.unshift(job);
  saveState(state);
  return getResearchJobs();
});
ipcMain.handle('research:delete', (_event, jobId) => {
  state.researchJobs = (state.researchJobs || []).filter((job) => job.id !== jobId);
  saveState(state);
  return getResearchJobs();
});
ipcMain.handle('research:run', async (_event, jobId) => {
  try {
    return await runResearchJob(jobId);
  } catch (error) {
    return { ok: false, message: error.message };
  }
});
ipcMain.handle('research:promote-to-agent', (_event, jobId) => {
  const job = (state.researchJobs || []).find((item) => item.id === jobId);
  if (!job) return { ok: false, message: 'Research job not found' };

  const agent = normalizeAgent({
    name: `Research Agent: ${job.title}`,
    goal: job.objective || job.title,
    status: 'planning',
    plan: (job.findings || []).slice(0, 8).map((step) => ({ step: step.replace(/^[-\d.\s]+/, ''), status: 'pending' })),
    logs: [`Promoted from research job ${job.id}`]
  });

  state.agents.unshift(agent);
  saveState(state);
  return { ok: true, agent, agents: getAgents() };
});
ipcMain.handle('agent:terminal-run', async (_event, payload) => {
  const result = await runShellCommand(payload.command, payload.cwd || PROJECT_ROOT);
  state.agents = state.agents.map((agent) => {
    if (agent.id !== payload.id) return agent;
    const line = `[${timestamp()}] command: ${payload.command}\n${result.stdout}${result.stderr}`;
    return { ...agent, logs: [...(agent.logs || []), line].slice(-200), updatedAt: timestamp() };
  });
  saveState(state);
  return result;
});

ipcMain.handle('terminal:start', (_event, payload) => terminalStart(payload?.command, payload?.cwd));
ipcMain.handle('terminal:write', (_event, payload) => terminalWrite(payload.id, payload.input));
ipcMain.handle('terminal:poll', (_event, id) => terminalPoll(id));
ipcMain.handle('terminal:stop', (_event, id) => terminalStop(id));

ipcMain.handle('git:status', async () => runShellCommand('git status --short --branch', PROJECT_ROOT));
ipcMain.handle('git:branches', async () => runShellCommand('git branch --all', PROJECT_ROOT));
ipcMain.handle('git:worktree-list', async () => runShellCommand('git worktree list', PROJECT_ROOT));
ipcMain.handle('git:worktree-add', async (_event, payload) =>
  runShellCommand(`git worktree add ${payload.path} ${payload.branch}`, PROJECT_ROOT)
);
ipcMain.handle('git:worktree-remove', async (_event, payload) =>
  runShellCommand(`git worktree remove ${payload.path} --force`, PROJECT_ROOT)
);


ipcMain.handle('explorer:tree', async (_event, payload) => {
  try {
    return { ok: true, tree: explorerTree(payload?.path || '.', payload?.maxDepth || 4) };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});
ipcMain.handle('explorer:read-file', async (_event, relPath) => {
  try {
    return { ok: true, content: explorerReadFile(relPath) };
  } catch (error) {
    return { ok: false, message: error.message, content: '' };
  }
});
ipcMain.handle('explorer:write-file', async (_event, payload) => {
  try {
    return explorerWriteFile(payload.path, payload.content);
  } catch (error) {
    return { ok: false, message: error.message };
  }
});
ipcMain.handle('explorer:create-file', async (_event, relPath) => {
  try {
    return explorerCreateFile(relPath);
  } catch (error) {
    return { ok: false, message: error.message };
  }
});
ipcMain.handle('explorer:create-folder', async (_event, relPath) => {
  try {
    return explorerCreateFolder(relPath);
  } catch (error) {
    return { ok: false, message: error.message };
  }
});
ipcMain.handle('explorer:rename', async (_event, payload) => {
  try {
    return explorerRename(payload.oldPath, payload.newPath);
  } catch (error) {
    return { ok: false, message: error.message };
  }
});
ipcMain.handle('explorer:delete', async (_event, relPath) => {
  try {
    return explorerDelete(relPath);
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('chat:new', () => {
  const chat = createNewChat();
  state.chats.unshift(chat);
  state.activeChatId = chat.id;
  saveState(state);
  return state;
});
ipcMain.handle('chat:duplicate', (_event, chatId) => {
  const chat = state.chats.find((entry) => entry.id === chatId);
  if (!chat) return state;

  const cloned = {
    ...chat,
    id: makeId(),
    title: `${chat.title} (Copy)`,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    messages: chat.messages.map((message) => normalizeMessage(message))
  };

  state.chats.unshift(cloned);
  state.activeChatId = cloned.id;
  saveState(state);
  return state;
});
ipcMain.handle('chat:select', (_event, chatId) => {
  if (state.chats.find((chat) => chat.id === chatId)) {
    state.activeChatId = chatId;
    saveState(state);
  }
  return state;
});
ipcMain.handle('chat:rename', (_event, payload) => {
  state.chats = state.chats.map((chat) =>
    chat.id === payload.chatId ? { ...chat, title: payload.title.trim() || chat.title, updatedAt: timestamp() } : chat
  );
  saveState(state);
  return state;
});
ipcMain.handle('chat:delete', (_event, chatId) => {
  state.chats = state.chats.filter((chat) => chat.id !== chatId);
  ensureActiveChat();
  saveState(state);
  return state;
});
ipcMain.handle('chat:clear-messages', (_event, chatId) => {
  state.chats = state.chats.map((chat) =>
    chat.id === chatId ? { ...chat, messages: [], updatedAt: timestamp() } : chat
  );
  saveState(state);
  return state;
});
ipcMain.handle('chat:import', async () => {
  const openResult = await dialog.showOpenDialog({
    title: 'Import Chat JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (openResult.canceled || !openResult.filePaths[0]) return { imported: false, reason: 'canceled', state };

  try {
    const imported = normalizeChat(JSON.parse(fs.readFileSync(openResult.filePaths[0], 'utf8')));
    imported.id = makeId();
    imported.title = `${imported.title} (Imported)`;
    imported.updatedAt = timestamp();
    state.chats.unshift(imported);
    state.activeChatId = imported.id;
    saveState(state);
    return { imported: true, state };
  } catch (error) {
    return { imported: false, reason: error.message, state };
  }
});
ipcMain.handle('chat:export', async (_event, chatId) => {
  const chat = state.chats.find((entry) => entry.id === chatId);
  if (!chat) throw new Error('Chat not found');

  const result = await dialog.showSaveDialog({
    title: 'Export Chat',
    defaultPath: `${chat.title.replace(/[^a-z0-9-_ ]/gi, '_').trim() || 'chat'}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) return { exported: false };
  fs.writeFileSync(result.filePath, JSON.stringify(chat, null, 2));
  return { exported: true, path: result.filePath };
});
ipcMain.handle('chat:send', async (_event, userMessage) => sendToModel(userMessage));
ipcMain.handle('chat:regenerate-last', async () => {
  const chat = getActiveChat();
  const lastUser = [...chat.messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) return { ok: false, error: 'No user message found to regenerate from.', state };

  while (chat.messages.length > 0 && chat.messages[chat.messages.length - 1].role === 'assistant') {
    chat.messages.pop();
  }

  saveState(state);
  return sendToModel(lastUser.content);
});
