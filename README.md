# UfrenClaw

[English](./README.md) | [简体中文](./README_zh-CN.md) | [日本語](./README_ja.md)

![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-37.4.0-47848F?logo=electron&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1.2-646CFF?logo=vite&logoColor=white)

**UfrenClaw** is a **modern Desktop AI Assistant** built with Electron, React, and OpenClaw.

More than a chat window, UfrenClaw is a gateway to local intelligence. With deep integration into the OpenClaw Gateway, it brings powerful **Agentic Workflows** to the desktop—turning AI from a chatbot into a partner that can understand goals, plan steps, and execute tasks with tools. Whether you are a developer, creator, or productivity enthusiast, UfrenClaw keeps the whole workflow close, fast, and private.

## ✨ Key Features

- 🚀 **Modern Stack**: React 19 + TypeScript + Vite for a fast, clean dev experience.
- 🎨 **Polished UI**: Tailwind CSS + Framer Motion for a crisp, smooth interface.
- 🤖 **Agentic AI**: Deep OpenClaw integration for planning, multi-step execution, and tool use.
- 🧠 **Local First**: Native Ollama support—private, fast, and fully on-device when you want it.
- 🔒 **Secure by Default**: Electron security best practices with sandboxing and isolation.

## 🧩 Modules

> Not “just another chat app”—it is an agent workbench on your desktop. UfrenClaw is built around OpenClaw Gateway with composable modules: models, agents, channels, skills, and scheduled tasks, forming a complete local-first intelligence loop.
>
> 📸 Screenshots below are stored in `./screenshots/`.

- 🧭 **Setup (First-run Wizard)**: environment checks, gateway bootstrap, and base configuration
- 💬 **Chat (Conversation Workbench)**: streaming replies, thinking toggle, and tool results in one place
- 🧪 **Models (Providers & Usage)**: manage providers/models and track recent token usage
- 🧠 **Agents (Agent Hub)**: create and manage agents for different goals and contexts
- 🔌 **Channels (Messaging Integrations)**: connect Telegram / Discord / WhatsApp / DingTalk / Feishu / WeCom / QQ and more
- 🧰 **Skills (Skill Library)**: install, enable, and configure skill packs to extend capabilities
- ⏱️ **Cron (Scheduled Tasks)**: run prompts on a schedule and automate recurring workflows
- ⚙️ **Settings (Control Center)**: appearance, gateway & proxy, updates, and advanced policies

### 🧭 Setup｜First-run Wizard

- ✅ **Runtime checks**: verify required runtime and core services (e.g., gateway)
- 🧷 **Provider setup**: configure AI providers and credentials
- 🔌 **Optional channel connect**: connect messaging apps when needed
- 🧾 **Actionable logs**: view logs and error details during setup

![Setup](./screenshots/setup.png)

### 💬 Chat｜Conversation Workbench

- ⚡ **Streaming output**: responses appear as they are generated
- 🧠 **Thinking toggle**: show/hide model thinking when available
- 🛠️ **Tool call visibility**: tool usage, results, and errors surfaced clearly
- 📎 **Attachments**: add files/images as inputs (depends on gateway + model capability)
- 🧭 **Session & agent controls**: refresh, switch agents, and manage chat state

![Chat](./screenshots/chat.png)

### 🧪 Models｜Providers & Usage

- 🧩 **Provider management**: add and manage multiple provider accounts/models
- 🧯 **Fallback strategy**: configure sensible fallback behavior (as supported)
- 📈 **Token usage tracking**: group by model or time for recent usage
- 🧾 **Traceability**: inspect usage entries by session/agent/model/provider when available

![Models](./screenshots/models.png)

### 🧠 Agents｜Agent Hub

- 🧬 **Create & manage agents**: build agents for different task types
- ⭐ **Default agent**: mark a primary agent for daily use
- 🔌 **Channel binding**: assign agents to channels for scoped delivery
- 🧩 **Context switching**: swap “work modes” per goal—dev, writing, ops, assistant, etc.

![Agents](./screenshots/agents.png)

### 🔌 Channels｜Messaging Integrations

- 🌐 **Unified integrations**: manage all messaging connections in one place
- 🧷 **Guided configuration**: required fields + docs links per platform
- 🧾 **QR / external auth**: scan or open external links when supported
- 🔄 **Clear status**: connect / connected / failed states with refresh & reconnect

![Channels](./screenshots/channels.png)

### 🧰 Skills｜Skill Library

- 🧩 **Skill management**: browse, search, enable/disable, uninstall
- 🔐 **Isolated config**: per-skill API keys and env vars
- 🧾 **Quick access**: jump to Clawhub and open skill docs/edit entry (when available)
- 🧠 **Capability expansion**: plug tools and workflows into your agents

![Skills](./screenshots/skills.png)

### ⏱️ Cron｜Scheduled Tasks

- 🕰️ **Presets + custom cron**: common schedules and custom expressions
- 📨 **Scheduled prompts**: trigger prompts on time; UI-created tasks return results to UfrenClaw chat by default (delivery is handled by the gateway)
- ⏯️ **Enable / pause**: toggle tasks anytime to avoid noise
- 🧾 **Run info**: last/next run info and results when available

![Cron](./screenshots/cron.png)

### ⚙️ Settings｜Control Center

- 🎛️ **Appearance**: theme (light/dark/system), language, launch on startup
- 🔐 **Provider & auth**: manage provider accounts, models, and auth modes
- 🧱 **Gateway & network**: gateway status/port/logs; proxy and bypass rules
- 🧭 **Transport policy**: WS / HTTP / IPC fallback preferences
- 🧬 **Updates**: auto-check / auto-download to stay current

![Settings](./screenshots/settings.png)

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd snoopy

# 2. Install dependencies
cd frontend
pnpm install

# 3. Start Development
pnpm dev
```

## 🏗️ Architecture

```mermaid
graph TD
    User[User] --> UI[UfrenClaw UI (React 18)]
    UI --> Main[Electron Main Process]
    Main --> Gateway[OpenClaw Gateway]
    Gateway --> LLM[LLM Providers]
    Gateway --> Tools[Tools / Skills]
```

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Core**: Electron 37
- **State**: Zustand
- **AI Engine**: OpenClaw Gateway (Local & Remote)

## 📄 License

[ISC License](LICENSE)

---

**UfrenClaw Team** ❤️
*Unleashing Intelligence, Empowering You.*
