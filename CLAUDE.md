# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**LlamaApp**: macOS専用のローカルLLMチャットアプリケーション

- **技術スタック**: Electron + Node.js + llama.cpp (Metal GPU加速)
- **対象**: macOS 13 (Ventura) 以降
- **用途**: プライバシー重視のローカルAIチャット環境

### 主要機能
- ✅ llama.cppを使用したローカルLLM実行（Metal GPU対応）
- ✅ ChatGPT風のストリーミングチャットUI
- ✅ 複数GGUFモデルの管理と切り替え
- ✅ SQLiteベースの会話履歴管理
- ✅ マークダウン対応（コードブロックのシンタックスハイライト付き）
- ✅ カスタムシステムプロンプト設定

## 開発コマンド

### セットアップ
```bash
npm install
npm run rebuild  # node-llama-cppのネイティブモジュールをリビルド
```

### 開発・実行
```bash
npm start              # アプリケーションを起動
npm run dev            # デバッグモードで起動（DevToolsが自動で開く）
```

### ビルド
```bash
npm run build          # macOS向けにビルド
npm run build:mac      # DMGファイル生成
```

### コード品質
```bash
npm test               # テストを実行
npm run lint           # ESLintでコードをチェック
npm run format         # Prettierでコードをフォーマット
```

## プロジェクト構造

```
llama/
├── src/
│   ├── main/                   # メインプロセス（Node.js環境）
│   │   ├── main.js             # Electronエントリーポイント
│   │   ├── llama-manager.js    # llama.cpp統合・推論管理
│   │   ├── model-manager.js    # GGUFモデルファイル管理
│   │   ├── db-manager.js       # SQLite会話履歴管理
│   │   └── ipc-handlers.js     # IPC通信ハンドラー
│   ├── renderer/               # レンダラープロセス（ブラウザ環境）
│   │   ├── index.html          # メインHTML
│   │   ├── app.js              # UIメインロジック
│   │   ├── components/
│   │   │   ├── chat.js         # チャットコンポーネント
│   │   │   ├── sidebar.js      # 会話履歴サイドバー
│   │   │   ├── settings.js     # 設定パネル
│   │   │   └── markdown.js     # マークダウンレンダラー
│   │   └── styles/
│   │       ├── main.css        # グローバルスタイル
│   │       └── chat.css        # チャット専用スタイル
│   ├── preload.js              # プリロードスクリプト（セキュアAPI公開）
│   └── shared/
│       ├── constants.js        # 定数定義
│       └── types.js            # 型定義（JSDoc用）
├── build/
│   └── entitlements.mac.plist  # macOSコード署名設定
├── package.json
├── CLAUDE.md
└── README.md
```

## アーキテクチャ

### プロセスモデル

```
┌──────────────────────────────────────────┐
│         Electron Main Process            │
│  ┌────────────────────────────────────┐  │
│  │   Llama Manager                    │  │
│  │   - node-llama-cpp wrapper         │  │
│  │   - Metal GPU acceleration         │  │
│  │   - Streaming inference            │  │
│  │   - Memory management              │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │   Model Manager                    │  │
│  │   - GGUF file discovery            │  │
│  │   - Model metadata management      │  │
│  │   - Hot-swap support               │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │   Database Manager (SQLite)        │  │
│  │   - Conversation CRUD              │  │
│  │   - Message persistence            │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
           ↕ IPC (streaming tokens)
┌──────────────────────────────────────────┐
│      Renderer Process (UI)               │
│  ┌────────────────────────────────────┐  │
│  │   Chat UI (ChatGPT-style)          │  │
│  │   - Real-time token display        │  │
│  │   - Markdown rendering (marked.js) │  │
│  │   - Syntax highlight (highlight.js)│  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │   Sidebar (History)                │  │
│  │   - Conversation list              │  │
│  │   - Quick switch                   │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │   Settings Panel                   │  │
│  │   - Model selection dropdown       │  │
│  │   - System prompt editor           │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 技術スタック詳細

| 領域 | 技術 | 用途 |
|------|------|------|
| **LLM統合** | node-llama-cpp | llama.cppのNode.jsバインディング（Metal対応） |
| **データベース** | better-sqlite3 | 会話履歴の永続化（同期API） |
| **マークダウン** | marked.js | Markdown → HTML変換 |
| **シンタックスハイライト** | highlight.js | コードブロックの色付け |
| **UUID生成** | uuid | 会話IDの一意性保証 |
| **ビルド** | electron-builder | macOS DMGパッケージ作成 |

### セキュリティ原則

- `nodeIntegration: false` - レンダラープロセスでのNode.js機能無効化
- `contextIsolation: true` - プリロードとレンダラーの完全分離
- `sandbox: true` - サンドボックス環境での実行
- すべてのIPC通信は`preload.js`の`contextBridge`経由

### IPC通信仕様

**メインプロセス → レンダラー（イベント）**
```javascript
// ストリーミングトークン配信
'llama:token' → { token: string, conversationId: string }
'llama:done' → { totalTokens: number, conversationId: string }
'llama:error' → { error: string, conversationId: string }
```

**レンダラー → メインプロセス（invoke）**
```javascript
// LLM操作
ipcRenderer.invoke('llama:generate', {
  prompt: string,
  systemPrompt?: string,
  conversationId: string
});
ipcRenderer.invoke('llama:stop'); // 生成停止

// モデル管理
ipcRenderer.invoke('model:list') → Array<ModelInfo>;
ipcRenderer.invoke('model:switch', { modelPath: string });
ipcRenderer.invoke('model:add', { filePath: string });
ipcRenderer.invoke('model:delete', { modelId: string });

// 会話管理
ipcRenderer.invoke('conversation:list') → Array<Conversation>;
ipcRenderer.invoke('conversation:load', { id: string });
ipcRenderer.invoke('conversation:create') → { id: string };
ipcRenderer.invoke('conversation:delete', { id: string });
```

## データ仕様

### モデル保存場所
```
~/Library/Application Support/Llamaapp/models/
  ├── llama-7b-q4_k_m.gguf
  ├── llama-7b-q8_0.gguf
  └── custom-model.gguf
```

### SQLiteスキーマ
```sql
-- 会話テーブル
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  system_prompt TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- メッセージテーブル
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

## 実装ロードマップ

### Phase 1: コア機能（MVP） - 1-2週間
- [ ] node-llama-cppのMetal動作検証
- [ ] 基本的なllama-manager実装
- [ ] シンプルな入力欄 + 出力表示UI
- [ ] 単一モデルでの質問応答動作確認

### Phase 2: ストリーミング + UI改善 - 1週間
- [ ] IPC経由のリアルタイムトークン配信
- [ ] マークダウンレンダリング（marked.js）
- [ ] シンタックスハイライト（highlight.js）
- [ ] メッセージのコピー・再生成機能

### Phase 3: モデル管理 - 1週間
- [ ] model-manager実装
- [ ] モデル一覧表示（ドロップダウン）
- [ ] モデル切り替え（ホットスワップ）
- [ ] モデル追加・削除UI

### Phase 4: 会話履歴 - 1週間
- [ ] SQLite統合（better-sqlite3）
- [ ] db-manager実装
- [ ] 会話履歴サイドバーUI
- [ ] 会話の新規作成・削除・切り替え

### Phase 5: 高度な設定 - 3-5日
- [ ] カスタムシステムプロンプト設定UI
- [ ] プリセット管理
- [ ] 生成パラメータ調整（オプション）

## 開発時の注意点

### パフォーマンス
- 7Bモデル（Q4量子化）で約4-8GBメモリ使用
- 初回モデルロードに20-40秒かかる（Metal初期化含む）
- ストリーミング時のIPC頻度に注意（バッファリング推奨）

### llama.cppバインディング
- `npm run rebuild`でネイティブモジュール再ビルド必須
- Metal対応はmacOS 13以降で自動有効化
- モデル切り替え時はメモリ解放を確実に実行

### セキュリティ
- レンダラープロセスから直接Node.jsモジュールにアクセス禁止
- すべてのファイルシステム操作はメインプロセス経由
- ユーザー入力の適切なサニタイゼーション

### デバッグ
- `npm run dev`でChrome DevTools使用可能
- メインプロセスは`console.log`でターミナル出力
- レンダラープロセスはDevToolsのConsole確認

## 技術的リスク

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| node-llama-cpp Metal対応不完全 | 高 | Phase 1で早期検証 |
| メモリ不足（8GB未満Mac） | 中 | 起動時メモリチェック・警告表示 |
| 初回モデルロード時間長い | 中 | プログレス表示・バックグラウンドプリロード |
| ストリーミングIPC遅延 | 低 | バッファリング最適化 |

## システム要件

- **OS**: macOS 13 (Ventura) 以降
- **メモリ**: 最小8GB、推奨16GB以上
- **ストレージ**: モデルごとに4-8GB
- **GPU**: Metal対応GPU（Apple Silicon or Intel with Metal）
- **推奨モデル**: 7B Q4/Q5量子化（4-6GB）
