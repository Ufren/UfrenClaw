# UfrenClaw

[English](./README.md) | [简体中文](./README_zh-CN.md) | [日本語](./README_ja.md)

![React](https://img.shields.io/badge/React-19.0.0-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-37.4.0-47848F?logo=electron&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.0-38B2AC?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1.2-646CFF?logo=vite&logoColor=white)

**UfrenClaw** は、Electron、React、OpenClaw をベースに構築された**次世代のデスクトップ AI アシスタント**です。

洗練されたユーザーインターフェースを備え、ローカルインテリジェンスの扉を開きます。OpenClaw Gateway との深い統合により、強力な **エージェントワークフロー** をデスクトップ環境にもたらします。UfrenClaw は単なるチャットボットではなく、複雑なタスクを理解し、計画し、実行できる頼れるパートナーです。開発者、クリエイター、そして効率を追求するすべての方へ、UfrenClaw はあなたのワークフローを劇的に進化させます。

## ✨ 主な特徴

- 🚀 **モダンなスタック**: React 19、TypeScript、Vite を採用し、最高のパフォーマンスを実現しました。
- 🎨 **美しい UI**: Tailwind CSS と Framer Motion を融合させ、滑らかで心地よい視覚体験を提供します。
- 🤖 **エージェント AI**: OpenClaw と深く統合し、自律的なタスク計画、実行、ツール使用をサポートします。
- 🧠 **ローカルファースト**: Ollama をネイティブサポート。プライバシーを守りながら、高速で完全ローカルな AI 体験を提供します。
- 🔒 **セキュリティ**: 厳格な Electron セキュリティ基準に準拠し、サンドボックス化されているため、安心して使用できます。

## 🚀 クイックスタート

### 前提条件

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0

### インストールと起動

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd snoopy

# 2. 依存関係をインストール
cd frontend
pnpm install

# 3. 開発サーバーを起動
pnpm dev
```

## 🏗️ アーキテクチャ

```mermaid
graph TD
    User[ユーザー] --> UI[UfrenClaw UI (React 19)]
    UI --> Main[Electron メインプロセス]
    Main --> Gateway[OpenClaw ゲートウェイ]
    Gateway --> LLM[ローカル LLM (Ollama)]
    Gateway --> Tools[システムツール / プラグイン]
```

- **フロントエンド**: React 19, TypeScript, Tailwind CSS, Radix UI
- **コア**: Electron 37
- **状態管理**: Zustand
- **AI エンジン**: OpenClaw (Local & Remote)

## 📄 ライセンス

本プロジェクトは [ISC License](LICENSE) の下で公開されています。

---

**UfrenClaw Team** ❤️
*知性を解き放ち、あなたに力を。*
