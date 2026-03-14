# UfrenClaw

[English](./README.md) | [简体中文](./README_zh-CN.md) | [日本語](./README_ja.md)

![React](https://img.shields.io/badge/React-19.0.0-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-37.4.0-47848F?logo=electron&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.0-38B2AC?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1.2-646CFF?logo=vite&logoColor=white)

**UfrenClaw** 是一款基于 Electron、React 和 OpenClaw 构建的**现代化桌面 AI 助手**。

它不仅拥有精致优雅的用户界面，更是一把开启本地智能时代的钥匙。通过深度集成 OpenClaw Gateway，UfrenClaw 将强大的 **Agentic Workflow（智能体工作流）** 带入您的桌面，让 AI 不再仅仅是聊天机器人，而是能够理解、规划并执行复杂任务的得力伙伴。无论您是开发者、创作者还是效率追求者，UfrenClaw 都能让您的工作流如虎添翼。

## ✨ 核心特性

- 🚀 **现代技术栈**: 采用 React 19、TypeScript 和 Vite 构建，带来极致的性能体验。
- 🎨 **优雅 UI**: 融合 Tailwind CSS 与 Framer Motion，打造丝滑流畅的视觉享受。
- 🤖 **Agentic AI**: 深度集成 OpenClaw，支持自主任务规划、多步执行与工具调用。
- 🧠 **本地优先**: 原生支持 Ollama，本地大模型隐私无忧，响应极速。
- 🔒 **安全可靠**: 遵循 Electron 最高安全标准，采用沙箱隔离，让您安心使用。

## 🚀 快速开始

### 环境要求

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0

### 安装与启动

```bash
# 1. 克隆仓库
git clone <repository-url>
cd snoopy

# 2. 安装依赖
cd frontend
pnpm install

# 3. 启动开发环境
pnpm dev
```

## 🏗️ 技术架构

```mermaid
graph TD
    User[用户] --> UI[UfrenClaw UI (React 19)]
    UI --> Main[Electron 主进程]
    Main --> Gateway[OpenClaw 网关]
    Gateway --> LLM[本地 LLM (Ollama)]
    Gateway --> Tools[系统工具 / 插件]
```

- **前端**: React 19, TypeScript, Tailwind CSS, Radix UI
- **核心**: Electron 37
- **状态管理**: Zustand
- **AI 引擎**: OpenClaw (Local & Remote)

## 📄 许可证

本项目采用 [ISC License](LICENSE) 许可证。

---

**UfrenClaw Team** ❤️
*释放智能，赋能予你。*
