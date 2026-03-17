# UfrenClaw

[English](./README.md) | [简体中文](./README_zh-CN.md) | [日本語](./README_ja.md)

![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-37.4.0-47848F?logo=electron&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1.2-646CFF?logo=vite&logoColor=white)

**UfrenClaw** 是一款基于 Electron、React 和 OpenClaw 构建的**现代化桌面 AI 助手**。

它不仅拥有精致优雅的用户界面，更是一把开启本地智能时代的钥匙。通过深度集成 OpenClaw Gateway，UfrenClaw 将强大的 **Agentic Workflow（智能体工作流）** 带入您的桌面，让 AI 不再仅仅是聊天机器人，而是能够理解、规划并执行复杂任务的得力伙伴。无论您是开发者、创作者还是效率追求者，UfrenClaw 都能让您的工作流如虎添翼。

## ✨ 核心特性

- 🚀 **现代技术栈**：采用 React 19、TypeScript 与 Vite 构建，性能与工程体验兼得。
- 🎨 **优雅 UI**：融合 Tailwind CSS 与 Framer Motion，兼顾质感与动效。
- 🤖 **Agentic AI**：深度集成 OpenClaw，支持多步规划、执行与工具调用。
- 🧠 **本地优先**：原生支持 Ollama，让隐私与速度都落在本地。
- 🔒 **安全可靠**：遵循 Electron 安全最佳实践，默认沙箱与隔离策略。

## 🧩 功能模块

> 不是“多一个聊天窗口”，而是“把智能体工作台搬到桌面”。UfrenClaw 围绕 OpenClaw Gateway 构建了一套可组合的模块体系：从模型与智能体，到渠道接入、技能扩展与定时任务，形成完整的本地智能闭环。
>
> 📷 下方展示对应页面截图（图片来自 `./screenshots/`）。

- 🧭 **Setup（首次启动向导）**：一键完成环境检查、网关启动与基础配置
- 💬 **Chat（对话工作台）**：流式对话、思考过程、工具调用结果一屏掌控
- 🧪 **Models（模型与用量）**：管理 AI 提供商/模型，追踪 Token 消耗与成本
- 🧠 **Agents（智能体中心）**：创建/管理 Agent，面向不同目标切换“工作人格”
- 🔌 **Channels（渠道连接）**：接入 Telegram / Discord / WhatsApp / 钉钉 / 飞书 / 企业微信 / QQ 等
- 🧰 **Skills（技能库）**：安装/启用/配置技能包，扩展工具能力与工作流
- ⏱️ **Cron（定时任务）**：让 Agent “按时上班”，自动执行周期任务与提醒
- ⚙️ **Settings（设置中枢）**：主题与语言、网关与代理、更新与高级策略统一管理

### 🧭 Setup｜首次启动向导

- ✅ **环境体检**：检查运行时与核心组件状态（如网关服务等）
- 🧷 **提供商配置**：选择 AI 提供商并完成授权/密钥配置
- 🔌 **渠道可选接入**：按需连接消息平台，让助手在你常用的应用里“出现”
- 🧾 **可视化日志**：关键步骤可查看日志与错误信息，便于定位问题

![Setup](./screenshots/setup.png)

### 💬 Chat｜对话工作台

- ⚡ **流式输出**：边生成边显示，响应更“即时”
- 🧠 **思考过程**：可切换显示/隐藏模型思考（当后端提供对应信息时）
- 🛠️ **工具调用可视化**：工具使用、结果回传、错误信息集中呈现
- 📎 **附件与多模态**：支持添加文件/图片等输入（取决于网关与模型能力）
- 🧭 **会话与对象**：在工具栏中刷新、选择对话对象（Agent）并管理状态

![Chat](./screenshots/chat.png)

### 🧪 Models｜模型与用量

- 🧩 **AI 提供商管理**：添加/管理多个 Provider 账户与模型配置
- 🧯 **回退与兜底**：为模型调用设置合理的回退策略（按配置生效）
- 📈 **Token 用量追踪**：按模型或按时间聚合展示最近 Token 消耗
- 🧾 **记录可追溯**：查看会话/Agent/模型/提供商维度的用量记录（取决于网关上报）

![Models](./screenshots/models.png)

### 🧠 Agents｜智能体中心

- 🧬 **创建与管理 Agent**：为不同任务场景建立不同的 Agent
- ⭐ **默认 Agent**：支持设置/标识默认 Agent，作为主要对话对象
- 🔌 **渠道绑定**：将 Agent 分配到不同消息渠道，实现“分工协作”
- 🧩 **面向目标切换**：开发、写作、运营、助理等场景一键切换工作模式

![Agents](./screenshots/agents.png)

### 🔌 Channels｜渠道连接

- 🌐 **多平台接入**：在一个页面统一管理各类消息平台连接
- 🧷 **配置向导**：按平台提供必要字段、引导与文档链接
- 🧾 **二维码与授权**：部分平台支持扫码/外链方式完成登录与授权
- 🔄 **状态可视化**：连接中/已连接/失败状态清晰呈现，并支持刷新与重连

![Channels](./screenshots/channels.png)

### 🧰 Skills｜技能库

- 🧩 **技能管理**：浏览、搜索、启用/禁用、卸载技能
- 🔐 **配置隔离**：为技能配置 API Key 与环境变量（按技能需要）
- 🧾 **一键打开**：支持跳转 Clawhub 页面与打开技能 README/编辑入口（按可用性）
- 🧠 **能力扩展**：把工具链与工作流能力“装进”你的 Agent

![Skills](./screenshots/skills.png)

### ⏱️ Cron｜定时任务

- 🕰️ **周期执行**：分钟/小时/每日/每周/每月等常用预设，亦支持自定义表达式
- 📨 **定时触发提示词**：到点自动触发一段消息/提示词，默认推送回 UfrenClaw 对话（投递能力由网关负责）
- ⏯️ **启用/暂停**：任务可随时开关，避免打扰
- 🧾 **运行状态**：展示上次/下次执行信息与结果反馈（按记录可用性）

![Cron](./screenshots/cron.png)

### ⚙️ Settings｜设置中枢

- 🎛️ **外观与体验**：主题（浅色/深色/跟随系统）、语言、开机自启等
- 🔐 **提供商与密钥**：集中管理 AI Provider 的账号、模型与授权方式
- 🧱 **网关与网络**：查看网关状态、端口与日志；配置代理与绕过规则
- 🧭 **传输策略**：WS / HTTP / IPC 回退等访问策略按需调整
- 🧬 **更新与维护**：自动检查/下载更新，保持应用最新状态

![Settings](./screenshots/settings.png)

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
    User[用户] --> UI[UfrenClaw UI (React 18)]
    UI --> Main[Electron 主进程]
    Main --> Gateway[OpenClaw 网关]
    Gateway --> LLM[LLM 提供商]
    Gateway --> Tools[工具 / 技能]
```

- **前端**: React 18, TypeScript, Tailwind CSS, shadcn/ui
- **核心**: Electron 37
- **状态管理**: Zustand
- **AI 引擎**: OpenClaw Gateway (本地 & 远程)

## 📄 许可证

本项目采用 [ISC License](LICENSE) 许可证。

---

**UfrenClaw Team** ❤️
*释放智能，赋能予你。*
