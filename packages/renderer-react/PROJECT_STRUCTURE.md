# 前端项目结构文档

本文档提供了 `renderer-react` 包的前端项目结构概览。旨在帮助开发人员理解代码库的组织方式、各个目录的用途以及所采用的架构模式。

## 架构概览

本项目遵循受 **Feature-Sliced Design (FSD)** 启发的架构。这意味着代码库主要按**业务特性（Features）**而非技术层（如 components, hooks, utils）进行组织。这种方法提高了可维护性、可扩展性和代码导航效率。

### 关键目录

- **`src/app`**: 全局应用设置、Provider 和全局布局配置。
- **`src/entries`**: 不同 Electron 窗口或视图的入口点。
- **`src/features`**: 核心业务逻辑，按领域组织。
- **`src/pages`**: 路由组件，负责将特性（Features）组合成视图（Views）。
- **`src/shared`**: 跨特性复用的工具、UI 组件和 API 辅助函数。

---

## 目录详情

### 1. `src/features` (业务逻辑)
这是大部分应用逻辑所在的地方。每个文件夹代表一个独特的业务领域。

| 特性 (Feature) | 描述 |
| :--- | :--- |
| **`auth`** | 认证逻辑（登录、注册、Token 管理）。 |
| **`chat`** | 核心聊天功能（消息、会话、模型、流式传输）。 |
| **`image-gen`** | 文生图功能。 |
| **`knowledge`** | 知识库文件管理（本地 RAG）。 |
| **`mcp-market`** | Model Context Protocol (MCP) 工具市场。 |
| **`model-market`** | AI 模型市场与管理。 |
| **`todo`** | 待办事项管理功能。 |

#### 标准特性结构
每个特性目录通常包含：
- **`api/`**: 该特性专用的 API 定义和 HTTP/IPC 调用。
- **`hooks/`**: 用于状态管理和业务逻辑的 React Hooks。
- **`types/`**: TypeScript 类型定义。
- **`components/`** (可选): 该特性专用的 UI 组件。
- **`lib/`** (可选): 辅助函数和转换器。

### 2. `src/pages` (视图)
Pages 是连接路由和特性的薄封装层。它们应主要包含布局代码，并调用来自 `features` 的 Hooks。

- **`auth/`**: `LoginPage`, `RegisterPage`
- **`chat/`**: `ChatPage` (主聊天界面)
- **`image-gen/`**: `ImageGenPage`
- **`knowledge/`**: `KnowledgePage`
- **`mcp-market/`**: `McpMarketPage`
- **`model-market/`**: `ModelMarketPage`
- **`todo/`**: `TodoWindowPage`
- **`selection/`**: `SelectionOverlayPage` (统一划词工具)

### 3. `src/shared` (公共模块)
被多个特性共同使用的代码。

- **`api/`**:
    - `http.ts`: 用于 HTTP 请求的 Axios/Fetch 封装。
    - `ipc.ts`: Electron IPC 通信辅助函数。
    - `apiProxy.ts`: 通过主进程路由请求的代理。
- **`ui/`**: 基于 Shadcn/UI 或自定义设计的通用 UI 组件（按钮、输入框等）。
- **`lib/`**: 通用工具函数（日期格式化、字符串处理等）。

### 4. `src/entries` (入口点)
多窗口 Electron 应用的不同入口点。

- **`main.tsx`**: 主应用窗口入口。
- **`floating-ball.tsx`**: 悬浮球窗口入口。
- **`code-execution.tsx`**: 代码执行环境入口。
- **`unified-selection.tsx`**: 划词覆盖层窗口入口。

---

## 开发指南

1.  **添加新特性**:
    - 在 `src/features/<feature-name>` 中创建一个新文件夹。
    - 在该文件夹内实现 `api`、`hooks` 和 `types`。
    - 在 `src/pages/<feature-name>/` 中创建页面组件。
    - 在 `src/app/AppRoutes.tsx` 中添加路由。

2.  **状态管理**:
    - 优先在 `features` 内部使用局部状态或 Hooks 管理特性特定的状态。
    - 仅将真正的全局状态或工具放入 `src/shared`。

3.  **API 调用**:
    - 所有 API 调用应在 `src/features/<feature>/api/` 中定义。
    - 不要在组件中直接进行 `fetch` 或 `ipcRenderer` 调用；应使用封装好的 API 函数。

4.  **引用导入**:
    - 使用路径别名（例如 `@/shared/ui/button`）代替相对路径（例如 `../../shared/ui/button`）。

## 代码参考示例

- **聊天特性 API**: [`src/features/chat/api/chat.ts`](src/features/chat/api/chat.ts)
- **认证逻辑 Hook**: [`src/features/auth/hooks/useLoginForm.ts`](src/features/auth/hooks/useLoginForm.ts)
- **共享 HTTP 客户端**: [`src/shared/api/http.ts`](src/shared/api/http.ts)
