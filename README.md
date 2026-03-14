# UfrenClaw

[English](./README.md) | [简体中文](./README_zh-CN.md) | [日本語](./README_ja.md)

![React](https://img.shields.io/badge/React-19.0.0-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-37.4.0-47848F?logo=electron&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.0-38B2AC?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1.2-646CFF?logo=vite&logoColor=white)

**UfrenClaw** is a **modern Desktop AI Assistant** built with Electron, React, and OpenClaw.

More than just a chat interface, it is a gateway to local intelligence. By deeply integrating with the OpenClaw Gateway, UfrenClaw brings powerful **Agentic Workflows** directly to your desktop. It transforms AI from a simple chatbot into a capable partner that understands, plans, and executes complex tasks. Whether you are a developer, creator, or productivity enthusiast, UfrenClaw empowers your workflow with unparalleled efficiency.

## ✨ Key Features

- 🚀 **Modern Stack**: Built with React 19, TypeScript, and Vite for peak performance.
- 🎨 **Beautiful UI**: Polished interface using Tailwind CSS and Framer Motion for a smooth visual experience.
- 🤖 **Agentic AI**: Deep OpenClaw integration for autonomous planning, execution, and tool use.
- 🧠 **Local First**: Native Ollama support. Private, fast, and completely local.
- 🔒 **Secure**: Adheres to strict Electron security standards with sandboxing for peace of mind.

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
    User[User] --> UI[UfrenClaw UI (React 19)]
    UI --> Main[Electron Main Process]
    Main --> Gateway[OpenClaw Gateway]
    Gateway --> LLM[Local LLM (Ollama)]
    Gateway --> Tools[System Tools / Plugins]
```

- **Frontend**: React 19, TypeScript, Tailwind CSS, Radix UI
- **Core**: Electron 37
- **State**: Zustand
- **AI Engine**: OpenClaw (Local & Remote)

## 📄 License

[ISC License](LICENSE)

---

**UfrenClaw Team** ❤️
*Unleashing Intelligence, Empowering You.*
