const state = {
  data: null,
  busy: false,
  mcpServers: [],
  agents: [],
  selectedAgentId: null,
  terminalSessionId: null,
  terminalPoller: null,
  researchJobs: [],
  selectedResearchId: null,
  explorerTree: null,
  selectedExplorerPath: ''
};

const providerSelect = document.getElementById('provider');
const chatList = document.getElementById('chat-list');
const messagesEl = document.getElementById('messages');
const composerInput = document.getElementById('composer-input');
const settingsDialog = document.getElementById('settings-dialog');
const collabDialog = document.getElementById('collab-dialog');
const commandCenterDialog = document.getElementById('command-center-dialog');
const researchDialog = document.getElementById('research-dialog');
const mcpDialog = document.getElementById('mcp-dialog');
const vscodeDialog = document.getElementById('vscode-dialog');
const ggufDialog = document.getElementById('gguf-dialog');
const statusBar = document.getElementById('status-bar');

function setStatus(message) {
  statusBar.textContent = message;
}

function setBusy(nextBusy) {
  state.busy = nextBusy;
  document.getElementById('send-message').disabled = nextBusy;
  document.getElementById('regenerate-last').disabled = nextBusy;
}

function activeChat() {
  return state.data.chats.find((chat) => chat.id === state.data.activeChatId);
}

function selectedAgent() {
  return state.agents.find((agent) => agent.id === state.selectedAgentId) || null;
}

function selectedResearchJob() {
  return state.researchJobs.find((job) => job.id === state.selectedResearchId) || null;
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMessageContent(text) {
  const escaped = escapeHtml(text || '');
  const withCode = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  const withInlineCode = withCode.replace(/`([^`]+)`/g, '<code>$1</code>');
  const withBold = withInlineCode.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return withBold.replace(/\n/g, '<br />');
}

function renderChats() {
  chatList.innerHTML = '';
  state.data.chats.forEach((chat) => {
    const item = document.createElement('button');
    item.className = `chat-item ${chat.id === state.data.activeChatId ? 'active' : ''}`;
    item.textContent = chat.title;
    item.onclick = async () => {
      state.data = await window.desktopApi.selectChat(chat.id);
      renderAll();
    };
    chatList.append(item);
  });
}

function renderMessages() {
  const chat = activeChat();
  messagesEl.innerHTML = '';
  if (!chat) return;

  chat.messages.forEach((message) => {
    const row = document.createElement('article');
    row.className = `message ${message.role} ${message.isError ? 'error' : ''}`;

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = formatMessageContent(message.content);

    const meta = document.createElement('div');
    meta.className = 'message-meta';

    const detail = [];
    if (message.meta?.provider) detail.push(message.meta.provider);
    if (message.meta?.model) detail.push(message.meta.model);
    if (message.meta?.latencyMs) detail.push(`${message.meta.latencyMs}ms`);
    if (message.meta?.totalTokensEstimate) detail.push(`~${message.meta.totalTokensEstimate} tok`);
    meta.textContent = detail.join(' • ');

    row.append(content);
    if (detail.length > 0) row.append(meta);
    messagesEl.append(row);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderProviderSelect() {
  const options = [
    { value: 'openai', label: 'OpenAI (cloud)' },
    { value: 'openaiCompatible', label: 'OpenAI-Compatible (local/server)' },
    { value: 'ollama', label: 'Ollama (local)' },
    { value: 'gguf', label: 'GGUF llama.cpp (local)' }
  ];

  providerSelect.innerHTML = '';
  options.forEach((option) => {
    const entry = document.createElement('option');
    entry.value = option.value;
    entry.textContent = option.label;
    providerSelect.append(entry);
  });

  providerSelect.value = state.data.settings.provider;
}

function fillSettings() {
  const settings = state.data.settings;
  document.getElementById('system-prompt').value = settings.systemPrompt;
  document.getElementById('temperature').value = settings.temperature;
  document.getElementById('max-tokens').value = settings.maxTokens;

  document.getElementById('openai-base-url').value = settings.providers.openai.baseUrl;
  document.getElementById('openai-api-key').value = settings.providers.openai.apiKey;
  document.getElementById('openai-model').value = settings.providers.openai.model;

  document.getElementById('compat-base-url').value = settings.providers.openaiCompatible.baseUrl;
  document.getElementById('compat-api-key').value = settings.providers.openaiCompatible.apiKey;
  document.getElementById('compat-model').value = settings.providers.openaiCompatible.model;

  document.getElementById('gguf-host').value = settings.providers.gguf.host;
  document.getElementById('gguf-port').value = settings.providers.gguf.port;
  document.getElementById('gguf-alias').value = settings.providers.gguf.modelAlias;

  document.getElementById('ollama-base-url').value = settings.providers.ollama.baseUrl;
  document.getElementById('ollama-model').value = settings.providers.ollama.model;
}

function fillCollab() {
  document.getElementById('personality').value = state.data.settings.personality || 'conversational';
  document.getElementById('steering-note').value = '';
}

function fillVsCode() {
  const cfg = state.data.settings.vscode;
  document.getElementById('vscode-binary').value = cfg.binaryPath;
  document.getElementById('vscode-workspace').value = cfg.workspacePath;
  document.getElementById('vscode-extensions-dir').value = cfg.extensionsDir;
}

function fillGguf() {
  const cfg = state.data.settings.providers.gguf;
  document.getElementById('gguf-binary').value = cfg.binaryPath;
  document.getElementById('gguf-model').value = cfg.modelPath;
  document.getElementById('gguf-ctx').value = cfg.ctxSize;
  document.getElementById('gguf-gpu-layers').value = cfg.gpuLayers;
}

function renderMcpList() {
  const list = document.getElementById('mcp-server-list');
  list.innerHTML = '';

  state.mcpServers.forEach((server) => {
    const row = document.createElement('div');
    row.className = 'mcp-item';
    row.innerHTML = `<strong>${escapeHtml(server.name)}</strong><span>${escapeHtml(server.transport)} (${escapeHtml(
      server.enabled ? 'enabled' : 'disabled'
    )})</span>`;

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.textContent = 'Test';
    testBtn.onclick = async () => {
      const result = await window.desktopApi.testMcpServer(server.id);
      setStatus(result.ok ? result.message : `MCP test failed: ${result.message}`);
    };

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => {
      state.mcpServers = state.mcpServers.filter((item) => item.id !== server.id);
      renderMcpList();
    };

    actions.append(testBtn, removeBtn);
    row.append(actions);
    list.append(row);
  });
}

function renderAgents() {
  const container = document.getElementById('agent-list');
  const logs = document.getElementById('agent-logs');
  container.innerHTML = '';

  state.agents.forEach((agent) => {
    const row = document.createElement('button');
    row.className = `chat-item ${agent.id === state.selectedAgentId ? 'active' : ''}`;
    row.textContent = `${agent.name} [${agent.status}]`;
    row.onclick = () => {
      state.selectedAgentId = agent.id;
      renderAgents();
    };
    container.append(row);
  });

  const agent = selectedAgent();
  if (!agent) {
    logs.textContent = 'No agent selected.';
    return;
  }

  const plan = (agent.plan || []).map((p, i) => `${i + 1}. [${p.status}] ${p.step}`).join('\n');
  logs.textContent = [`Goal: ${agent.goal}`, '', 'Plan:', plan || '(none)', '', 'Logs:', ...(agent.logs || [])].join('\n');
}


function renderResearchJobs() {
  const list = document.getElementById('research-list');
  const report = document.getElementById('research-report');
  list.innerHTML = '';

  state.researchJobs.forEach((job) => {
    const btn = document.createElement('button');
    btn.className = `chat-item ${job.id === state.selectedResearchId ? 'active' : ''}`;
    btn.textContent = `${job.title} [${job.status}]`;
    btn.onclick = () => {
      state.selectedResearchId = job.id;
      renderResearchJobs();
    };
    list.append(btn);
  });

  const job = selectedResearchJob();
  report.textContent = job ? (job.report || (job.findings || []).join('\n')) : 'No research job selected.';
}

async function refreshResearchJobs() {
  state.researchJobs = await window.desktopApi.listResearchJobs();
  if (!state.selectedResearchId && state.researchJobs.length > 0) {
    state.selectedResearchId = state.researchJobs[0].id;
  }
  renderResearchJobs();
}


async function refreshExplorerTree() {
  const result = await window.desktopApi.explorerTree({ path: '.', maxDepth: 5 });
  if (!result.ok) {
    setStatus(`Explorer error: ${result.message}`);
    return;
  }

  state.explorerTree = result.tree;
  renderExplorerTree();
}

function renderExplorerTree() {
  const container = document.getElementById('explorer-tree');
  if (!container) return;
  container.innerHTML = '';

  function renderNode(node, depth) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `explorer-node ${node.type}`;
    button.style.paddingLeft = `${8 + depth * 14}px`;
    button.textContent = `${node.type === 'directory' ? '📁' : '📄'} ${node.name || '.'}`;
    button.onclick = () => {
      state.selectedExplorerPath = node.path;
      document.getElementById('explorer-selected-path').value = node.path;
    };
    container.append(button);

    if (node.type === 'directory' && Array.isArray(node.children)) {
      node.children.forEach((child) => renderNode(child, depth + 1));
    }
  }

  if (state.explorerTree) {
    renderNode(state.explorerTree, 0);
  }
}

async function openSelectedExplorerFile() {
  const relPath = state.selectedExplorerPath;
  if (!relPath) return;
  const result = await window.desktopApi.explorerReadFile(relPath);
  if (!result.ok) {
    setStatus(`Open failed: ${result.message}`);
    return;
  }

  document.getElementById('explorer-editor').value = result.content;
  setStatus(`Opened ${relPath}`);
}

async function saveSelectedExplorerFile() {
  const relPath = state.selectedExplorerPath;
  if (!relPath) return;
  const content = document.getElementById('explorer-editor').value;
  const result = await window.desktopApi.explorerWriteFile({ path: relPath, content });
  if (!result.ok) {
    setStatus(`Save failed: ${result.message}`);
    return;
  }

  setStatus(`Saved ${relPath}`);
  await refreshExplorerTree();
}

function renderAll() {
  renderChats();
  renderMessages();
  renderProviderSelect();
  fillSettings();
}

async function refreshAgents() {
  state.agents = await window.desktopApi.listAgents();
  if (!state.selectedAgentId && state.agents.length > 0) {
    state.selectedAgentId = state.agents[0].id;
  }
  renderAgents();
}

async function refreshGitStatus(mode = 'status') {
  const out = document.getElementById('git-output');
  let result;

  if (mode === 'branches') result = await window.desktopApi.gitBranches();
  else if (mode === 'worktrees') result = await window.desktopApi.gitWorktreeList();
  else result = await window.desktopApi.gitStatus();

  out.textContent = `${result.stdout || ''}${result.stderr || ''}`;
}

async function pollTerminalLoop() {
  if (!state.terminalSessionId) return;
  const out = document.getElementById('terminal-output');
  const result = await window.desktopApi.terminalPoll(state.terminalSessionId);

  if (result.ok && result.output) {
    out.textContent += result.output;
    out.scrollTop = out.scrollHeight;
  }

  if (result.closed) {
    clearInterval(state.terminalPoller);
    state.terminalPoller = null;
    state.terminalSessionId = null;
  }
}

document.getElementById('new-chat').onclick = async () => {
  state.data = await window.desktopApi.createChat();
  renderAll();
};

document.getElementById('import-chat').onclick = async () => {
  const result = await window.desktopApi.importChat();
  state.data = result.state;
  renderAll();
  setStatus(result.imported ? 'Chat imported.' : `Import failed: ${result.reason || 'cancelled'}`);
};

document.getElementById('duplicate-chat').onclick = async () => {
  const chat = activeChat();
  if (!chat) return;
  state.data = await window.desktopApi.duplicateChat(chat.id);
  renderAll();
};

document.getElementById('delete-chat').onclick = async () => {
  const chat = activeChat();
  if (!chat) return;
  if (!window.confirm(`Delete chat "${chat.title}"?`)) return;
  state.data = await window.desktopApi.deleteChat(chat.id);
  renderAll();
};

document.getElementById('clear-chat').onclick = async () => {
  const chat = activeChat();
  if (!chat) return;
  if (!window.confirm(`Clear all messages in "${chat.title}"?`)) return;
  state.data = await window.desktopApi.clearChatMessages(chat.id);
  renderAll();
};

document.getElementById('rename-chat').onclick = async () => {
  const chat = activeChat();
  if (!chat) return;
  const title = window.prompt('Rename chat', chat.title);
  if (!title) return;
  state.data = await window.desktopApi.renameChat({ chatId: chat.id, title });
  renderAll();
};

document.getElementById('test-connection').onclick = async () => {
  setStatus('Testing provider connection...');
  const result = await window.desktopApi.testConnection();
  setStatus(result.ok ? result.message : `Connection failed: ${result.message}`);
};

document.getElementById('export-chat').onclick = async () => {
  const chat = activeChat();
  if (!chat) return;
  const result = await window.desktopApi.exportChat(chat.id);
  if (result.exported) setStatus(`Exported to: ${result.path}`);
};

async function sendCurrentMessage() {
  const value = composerInput.value.trim();
  if (!value || state.busy) return;

  composerInput.value = '';
  setBusy(true);
  setStatus('Sending message...');

  const result = await window.desktopApi.sendMessage(value);
  state.data = result.state;

  setBusy(false);
  renderAll();
  setStatus(result.ok ? 'Response complete.' : `Model error: ${result.error}`);
}

document.getElementById('send-message').onclick = sendCurrentMessage;

document.getElementById('regenerate-last').onclick = async () => {
  if (state.busy) return;
  setBusy(true);
  setStatus('Regenerating last response...');
  const result = await window.desktopApi.regenerateLast();
  state.data = result.state;
  setBusy(false);
  renderAll();
  setStatus(result.ok ? 'Regenerated.' : `Regenerate failed: ${result.error}`);
};

composerInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendCurrentMessage();
  }
});

providerSelect.onchange = async () => {
  state.data.settings = await window.desktopApi.updateSettings({ provider: providerSelect.value });
  renderAll();
  setStatus(`Provider switched to ${providerSelect.value}.`);
};

document.getElementById('open-settings').onclick = () => {
  fillSettings();
  settingsDialog.showModal();
};

document.getElementById('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const next = {
    systemPrompt: document.getElementById('system-prompt').value,
    temperature: Number(document.getElementById('temperature').value),
    maxTokens: Number(document.getElementById('max-tokens').value),
    providers: {
      openai: {
        baseUrl: document.getElementById('openai-base-url').value,
        apiKey: document.getElementById('openai-api-key').value,
        model: document.getElementById('openai-model').value
      },
      openaiCompatible: {
        baseUrl: document.getElementById('compat-base-url').value,
        apiKey: document.getElementById('compat-api-key').value,
        model: document.getElementById('compat-model').value
      },
      gguf: {
        host: document.getElementById('gguf-host').value,
        port: Number(document.getElementById('gguf-port').value),
        modelAlias: document.getElementById('gguf-alias').value
      },
      ollama: {
        baseUrl: document.getElementById('ollama-base-url').value,
        model: document.getElementById('ollama-model').value
      }
    }
  };
  state.data.settings = await window.desktopApi.updateSettings(next);
  settingsDialog.close();
  renderAll();
  setStatus('Settings saved.');
});

document.getElementById('open-collab').onclick = () => {
  fillCollab();
  collabDialog.showModal();
};

document.getElementById('collab-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const personality = document.getElementById('personality').value;
  const steering = document.getElementById('steering-note').value.trim();
  state.data.settings = await window.desktopApi.updateSettings({ personality });
  if (steering) {
    const msg = `[STEERING NOTE]: ${steering}`;
    state.data = (await window.desktopApi.sendMessage(msg)).state;
  }
  collabDialog.close();
  renderAll();
  setStatus('Collaboration settings applied.');
});

document.getElementById('open-command-center').onclick = async () => {
  await refreshAgents();
  await refreshGitStatus();
  commandCenterDialog.showModal();
};

document.getElementById('agent-create').onclick = async () => {
  const payload = {
    name: document.getElementById('agent-name').value || 'Agent',
    goal: document.getElementById('agent-goal').value || 'No goal specified',
    status: 'planning',
    personality: state.data.settings.personality
  };
  state.agents = await window.desktopApi.createAgent(payload);
  state.selectedAgentId = state.agents[0]?.id || null;
  renderAgents();
};

document.getElementById('agent-delete').onclick = async () => {
  if (!state.selectedAgentId) return;
  state.agents = await window.desktopApi.deleteAgent(state.selectedAgentId);
  state.selectedAgentId = state.agents[0]?.id || null;
  renderAgents();
};

document.getElementById('agent-add-step').onclick = async () => {
  const agent = selectedAgent();
  if (!agent) return;
  const addStep = document.getElementById('agent-step').value.trim();
  if (!addStep) return;
  state.agents = await window.desktopApi.advanceAgentPlan({ id: agent.id, addStep });
  renderAgents();
};

document.getElementById('agent-run-step').onclick = async () => {
  const agent = selectedAgent();
  if (!agent) return;
  const command = document.getElementById('agent-command').value.trim();
  if (!command) return;
  const result = await window.desktopApi.runAgentCommand({ id: agent.id, command });
  await window.desktopApi.addAgentLog({ id: agent.id, log: `Result code: ${result.code}` });
  await refreshAgents();
  setStatus(result.ok ? 'Agent command completed.' : `Agent command failed (${result.code}).`);
};

document.getElementById('git-refresh').onclick = async () => refreshGitStatus('status');
document.getElementById('git-branches').onclick = async () => refreshGitStatus('branches');
document.getElementById('git-worktrees').onclick = async () => refreshGitStatus('worktrees');

document.getElementById('worktree-add').onclick = async () => {
  const payload = {
    path: document.getElementById('worktree-path').value,
    branch: document.getElementById('worktree-branch').value
  };
  const result = await window.desktopApi.gitWorktreeAdd(payload);
  document.getElementById('git-output').textContent = `${result.stdout || ''}${result.stderr || ''}`;
};

document.getElementById('worktree-remove').onclick = async () => {
  const payload = { path: document.getElementById('worktree-path').value };
  const result = await window.desktopApi.gitWorktreeRemove(payload);
  document.getElementById('git-output').textContent = `${result.stdout || ''}${result.stderr || ''}`;
};

document.getElementById('terminal-start').onclick = async () => {
  if (state.terminalSessionId) return;
  const session = await window.desktopApi.terminalStart({ command: 'bash' });
  state.terminalSessionId = session.id;
  document.getElementById('terminal-output').textContent = `Started terminal session ${session.id}\n`;
  state.terminalPoller = setInterval(pollTerminalLoop, 700);
};

document.getElementById('terminal-send').onclick = async () => {
  if (!state.terminalSessionId) return;
  const input = document.getElementById('terminal-input').value;
  await window.desktopApi.terminalWrite({ id: state.terminalSessionId, input: `${input}\n` });
};

document.getElementById('terminal-stop').onclick = async () => {
  if (!state.terminalSessionId) return;
  await window.desktopApi.terminalStop(state.terminalSessionId);
};


document.getElementById('explorer-refresh').onclick = async () => {
  await refreshExplorerTree();
};

document.getElementById('explorer-open').onclick = async () => {
  await openSelectedExplorerFile();
};

document.getElementById('explorer-save').onclick = async () => {
  await saveSelectedExplorerFile();
};

document.getElementById('explorer-new-file').onclick = async () => {
  const relPath = window.prompt('New file path (relative to repo root)', 'src/new-file.js');
  if (!relPath) return;
  const result = await window.desktopApi.explorerCreateFile(relPath);
  setStatus(result.ok ? `Created ${relPath}` : `Create file failed: ${result.message}`);
  await refreshExplorerTree();
};

document.getElementById('explorer-new-folder').onclick = async () => {
  const relPath = window.prompt('New folder path (relative to repo root)', 'src/new-folder');
  if (!relPath) return;
  const result = await window.desktopApi.explorerCreateFolder(relPath);
  setStatus(result.ok ? `Created ${relPath}` : `Create folder failed: ${result.message}`);
  await refreshExplorerTree();
};

document.getElementById('explorer-rename').onclick = async () => {
  const oldPath = state.selectedExplorerPath;
  if (!oldPath) return;
  const newPath = window.prompt('Rename/move to path', oldPath);
  if (!newPath || newPath === oldPath) return;
  const result = await window.desktopApi.explorerRename({ oldPath, newPath });
  setStatus(result.ok ? `Renamed to ${newPath}` : `Rename failed: ${result.message}`);
  state.selectedExplorerPath = result.ok ? newPath : oldPath;
  document.getElementById('explorer-selected-path').value = state.selectedExplorerPath;
  await refreshExplorerTree();
};

document.getElementById('explorer-delete').onclick = async () => {
  const relPath = state.selectedExplorerPath;
  if (!relPath) return;
  if (!window.confirm(`Delete ${relPath}?`)) return;
  const result = await window.desktopApi.explorerDelete(relPath);
  setStatus(result.ok ? `Deleted ${relPath}` : `Delete failed: ${result.message}`);
  if (result.ok) {
    state.selectedExplorerPath = '';
    document.getElementById('explorer-selected-path').value = '';
    document.getElementById('explorer-editor').value = '';
  }
  await refreshExplorerTree();
};


document.getElementById('open-research').onclick = async () => {
  await refreshResearchJobs();
  researchDialog.showModal();
};

document.getElementById('research-create').onclick = async () => {
  const payload = {
    title: document.getElementById('research-title').value || 'Research Job',
    objective: document.getElementById('research-objective').value || ''
  };
  state.researchJobs = await window.desktopApi.createResearchJob(payload);
  state.selectedResearchId = state.researchJobs[0]?.id || null;
  renderResearchJobs();
};

document.getElementById('research-run').onclick = async () => {
  if (!state.selectedResearchId) return;
  setStatus('Running research cycle...');
  const result = await window.desktopApi.runResearchJob(state.selectedResearchId);
  setStatus(result.ok ? 'Research completed.' : `Research failed: ${result.message}`);
  await refreshResearchJobs();
};

document.getElementById('research-promote').onclick = async () => {
  if (!state.selectedResearchId) return;
  const result = await window.desktopApi.promoteResearchToAgent(state.selectedResearchId);
  if (result.ok) {
    state.agents = result.agents;
    state.selectedAgentId = result.agent.id;
    renderAgents();
    setStatus('Research promoted to agent plan.');
  } else {
    setStatus(`Promote failed: ${result.message}`);
  }
};

document.getElementById('research-delete').onclick = async () => {
  if (!state.selectedResearchId) return;
  state.researchJobs = await window.desktopApi.deleteResearchJob(state.selectedResearchId);
  state.selectedResearchId = state.researchJobs[0]?.id || null;
  renderResearchJobs();
};

document.getElementById('open-mcp').onclick = async () => {
  state.mcpServers = await window.desktopApi.listMcpServers();
  renderMcpList();
  mcpDialog.showModal();
};

document.getElementById('mcp-add').onclick = () => {
  state.mcpServers.push({
    id: crypto.randomUUID(),
    name: document.getElementById('mcp-name').value || 'MCP Server',
    transport: document.getElementById('mcp-transport').value,
    command: document.getElementById('mcp-command').value,
    args: document.getElementById('mcp-args').value.split(' ').filter(Boolean),
    url: document.getElementById('mcp-url').value,
    enabled: document.getElementById('mcp-enabled').value === 'true'
  });
  renderMcpList();
};

document.getElementById('mcp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.mcpServers = await window.desktopApi.saveMcpServers(state.mcpServers);
  state.data.settings.mcpServers = state.mcpServers;
  mcpDialog.close();
  setStatus('MCP settings saved.');
});

document.getElementById('open-vscode').onclick = () => {
  fillVsCode();
  vscodeDialog.showModal();
};

document.getElementById('vscode-launch').onclick = async () => setStatus((await window.desktopApi.launchVsCode()).message);
document.getElementById('vscode-install-vsix').onclick = async () => setStatus((await window.desktopApi.installVsix()).message);

document.getElementById('vscode-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.data.settings = await window.desktopApi.updateSettings({
    vscode: {
      binaryPath: document.getElementById('vscode-binary').value,
      workspacePath: document.getElementById('vscode-workspace').value,
      extensionsDir: document.getElementById('vscode-extensions-dir').value
    }
  });
  vscodeDialog.close();
  setStatus('VS Code settings saved.');
});

document.getElementById('open-gguf').onclick = async () => {
  fillGguf();
  const status = await window.desktopApi.ggufStatus();
  setStatus(`GGUF status: ${status.running ? 'running' : 'stopped'} @ ${status.endpoint}`);
  ggufDialog.showModal();
};

document.getElementById('gguf-start').onclick = async () => setStatus((await window.desktopApi.startGguf()).message);
document.getElementById('gguf-stop').onclick = async () => setStatus((await window.desktopApi.stopGguf()).message);
document.getElementById('gguf-use-provider').onclick = async () => {
  state.data.settings = await window.desktopApi.updateSettings({ provider: 'gguf' });
  renderAll();
  setStatus('Switched provider to GGUF.');
};

document.getElementById('gguf-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.data.settings = await window.desktopApi.updateSettings({
    providers: {
      gguf: {
        binaryPath: document.getElementById('gguf-binary').value,
        modelPath: document.getElementById('gguf-model').value,
        ctxSize: Number(document.getElementById('gguf-ctx').value),
        gpuLayers: Number(document.getElementById('gguf-gpu-layers').value)
      }
    }
  });
  ggufDialog.close();
  setStatus('GGUF settings saved.');
});

(async function init() {
  state.data = await window.desktopApi.bootstrap();
  state.mcpServers = await window.desktopApi.listMcpServers();
  state.agents = await window.desktopApi.listAgents();
  if (state.agents.length > 0) state.selectedAgentId = state.agents[0].id;
  state.researchJobs = await window.desktopApi.listResearchJobs();
  if (state.researchJobs.length > 0) state.selectedResearchId = state.researchJobs[0].id;
  await refreshExplorerTree();
  renderAll();
})();
