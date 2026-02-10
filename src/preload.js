const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  testConnection: () => ipcRenderer.invoke('provider:test-connection'),

  listMcpServers: () => ipcRenderer.invoke('mcp:list'),
  saveMcpServers: (servers) => ipcRenderer.invoke('mcp:save', servers),
  testMcpServer: (serverId) => ipcRenderer.invoke('mcp:test', serverId),

  launchVsCode: () => ipcRenderer.invoke('vscode:launch'),
  installVsix: () => ipcRenderer.invoke('vscode:pick-vsix-and-install'),

  startGguf: () => ipcRenderer.invoke('gguf:start'),
  stopGguf: () => ipcRenderer.invoke('gguf:stop'),
  ggufStatus: () => ipcRenderer.invoke('gguf:status'),


  listResearchJobs: () => ipcRenderer.invoke('research:list'),
  createResearchJob: (payload) => ipcRenderer.invoke('research:create', payload),
  deleteResearchJob: (jobId) => ipcRenderer.invoke('research:delete', jobId),
  runResearchJob: (jobId) => ipcRenderer.invoke('research:run', jobId),
  promoteResearchToAgent: (jobId) => ipcRenderer.invoke('research:promote-to-agent', jobId),

  listAgents: () => ipcRenderer.invoke('agent:list'),
  createAgent: (payload) => ipcRenderer.invoke('agent:create', payload),
  updateAgent: (payload) => ipcRenderer.invoke('agent:update', payload),
  addAgentLog: (payload) => ipcRenderer.invoke('agent:add-log', payload),
  advanceAgentPlan: (payload) => ipcRenderer.invoke('agent:advance-plan', payload),
  deleteAgent: (agentId) => ipcRenderer.invoke('agent:delete', agentId),
  runAgentCommand: (payload) => ipcRenderer.invoke('agent:terminal-run', payload),

  terminalStart: (payload) => ipcRenderer.invoke('terminal:start', payload),
  terminalWrite: (payload) => ipcRenderer.invoke('terminal:write', payload),
  terminalPoll: (id) => ipcRenderer.invoke('terminal:poll', id),
  terminalStop: (id) => ipcRenderer.invoke('terminal:stop', id),


  explorerTree: (payload) => ipcRenderer.invoke('explorer:tree', payload),
  explorerReadFile: (relPath) => ipcRenderer.invoke('explorer:read-file', relPath),
  explorerWriteFile: (payload) => ipcRenderer.invoke('explorer:write-file', payload),
  explorerCreateFile: (relPath) => ipcRenderer.invoke('explorer:create-file', relPath),
  explorerCreateFolder: (relPath) => ipcRenderer.invoke('explorer:create-folder', relPath),
  explorerRename: (payload) => ipcRenderer.invoke('explorer:rename', payload),
  explorerDelete: (relPath) => ipcRenderer.invoke('explorer:delete', relPath),

  gitStatus: () => ipcRenderer.invoke('git:status'),
  gitBranches: () => ipcRenderer.invoke('git:branches'),
  gitWorktreeList: () => ipcRenderer.invoke('git:worktree-list'),
  gitWorktreeAdd: (payload) => ipcRenderer.invoke('git:worktree-add', payload),
  gitWorktreeRemove: (payload) => ipcRenderer.invoke('git:worktree-remove', payload),

  createChat: () => ipcRenderer.invoke('chat:new'),
  duplicateChat: (chatId) => ipcRenderer.invoke('chat:duplicate', chatId),
  selectChat: (chatId) => ipcRenderer.invoke('chat:select', chatId),
  renameChat: (payload) => ipcRenderer.invoke('chat:rename', payload),
  deleteChat: (chatId) => ipcRenderer.invoke('chat:delete', chatId),
  clearChatMessages: (chatId) => ipcRenderer.invoke('chat:clear-messages', chatId),
  importChat: () => ipcRenderer.invoke('chat:import'),
  exportChat: (chatId) => ipcRenderer.invoke('chat:export', chatId),
  sendMessage: (message) => ipcRenderer.invoke('chat:send', message),
  regenerateLast: () => ipcRenderer.invoke('chat:regenerate-last')
});
