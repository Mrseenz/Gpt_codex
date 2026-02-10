# GPT Codex Desktop (Windows)

A Windows-focused Electron app that now includes a **Codex-style command center** with multi-agent orchestration, collaborative steering, Git/worktree tooling, integrated terminal operations, MCP server management, VS Code integration, and local GGUF model runtime support.

## Major capabilities

### 1) Agentic & long-horizon workflows

- Create and manage multiple agents in parallel.
- Give each agent a goal, plan steps, notes, and persistent logs.
- Execute shell commands per agent for long-running, multi-step refactors and migrations.
- Keep agent context/state persisted across app restarts.

### 2) Interactive collaboration & real-time steering

- Change assistant interaction style via **personality**:
  - `conversational`
  - `terse`
- Apply steering notes while working to nudge direction without losing context.

### 3) Command center

- Dedicated control center UI for:
  - Agent list + plan/log management
  - Git status/branches/worktree listing
  - Worktree add/remove operations
  - Integrated terminal session start/write/poll/stop
  - VS Code-inspired file explorer for creating, browsing, opening, editing, renaming, and deleting files/folders

### 3b) Self-Evolution Research Lab

- Create research jobs tied to strategic improvement goals.
- Run automated repository research cycles (codebase snapshot + model-generated evolution report).
- Extract findings, experiments, and implementation plans from research output.
- Promote completed research jobs directly into agent plans for execution.

### 4) LLM providers

- OpenAI
- OpenAI-compatible endpoints (LM Studio / vLLM / llama.cpp OpenAI mode)
- Ollama
- GGUF via managed local llama.cpp server runtime

### 5) MCP, VS Code, GGUF integrations

- MCP server save/list/test support (`stdio` and `sse`).
- VS Code launch and VSIX extension install from desktop UI.
- GGUF server process controls (start/stop/status) from app.

## Quick start

```bash
npm install
npm run dev
```

## Build Windows installer

```bash
npm run dist:win
```

## Notes

- App state is stored in Electron user data (`gpt-codex-desktop.json`).
- External tools must exist in your environment for full functionality:
  - MCP server binaries/endpoints
  - VS Code CLI (`code`) and/or configured path
  - `llama-server` binary + `.gguf` model files
