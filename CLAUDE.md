# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**AlpaChat**: macOS専用のローカルLLMチャットアプリケーション

- **アプリ名**: AlpaChat（パッケージ名: alpachat）
- **技術スタック**: Electron + Node.js + llama.cpp (Metal GPU加速)
- **対象**: macOS 13 (Ventura) 以降
- **用途**: プライバシー重視のローカルAIチャット環境

### 主要機能
- ✅ llama.cppを使用したローカルLLM実行（Metal GPU対応）
- ✅ ChatGPT風のストリーミングチャットUI
- ✅ 複数GGUFモデルの管理と切り替え
- ✅ **HuggingFaceモデルストア** - プリセットモデルの1クリックダウンロード
- ✅ **HuggingFace動的検索** - HF Hub APIによるリアルタイムGGUFモデル検索
- ✅ SQLiteベースの会話履歴管理
- ✅ マークダウン対応（コードブロックのシンタックスハイライト付き）
- ✅ カスタムシステムプロンプト設定
- ✅ **RAG（検索拡張生成）** - WebページとローカルファイルのインデックスとPrompt拡張
- ✅ **Agentモード** - ファイル操作・システム管理・コード実行ツール付きLLMエージェント

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
llamaApp/
├── src/
│   ├── main/                        # メインプロセス（Node.js環境）
│   │   ├── main.js                  # Electronエントリーポイント
│   │   ├── llama-manager.js         # llama.cpp統合・推論管理
│   │   ├── model-manager.js         # GGUFモデルファイル管理
│   │   ├── model-downloader.js      # HuggingFaceダウンロード管理
│   │   ├── hf-search.js             # HF Hub API動的検索
│   │   ├── db-manager.js            # SQLite会話履歴・RAGデータ管理
│   │   ├── rag-manager.js           # RAG統合管理（URL/ファイル/検索）
│   │   ├── web-fetcher.js           # WebページHTTP取得・テキスト抽出
│   │   ├── file-fetcher.js          # ローカルファイル読み込み（TXT/MD）
│   │   ├── chunk-processor.js       # テキストチャンク分割（512トークン）
│   │   └── agent/
│   │       ├── agent-controller.js  # Agentツール定義・実行管理
│   │       └── permission-manager.js# Agentセキュリティ・アクセス制御
│   ├── renderer/                    # レンダラープロセス（ブラウザ環境）
│   │   ├── index.html               # メインHTML
│   │   ├── app.js                   # UIメインロジック
│   │   ├── components/
│   │   │   ├── chat.js              # チャットコンポーネント
│   │   │   ├── settings-panel.js    # 設定パネル
│   │   │   ├── model-store.js       # モデルストアUI
│   │   │   ├── rag-panel.js         # RAGパネルUI
│   │   │   ├── markdown.js          # マークダウンレンダラー
│   │   │   └── agent/
│   │   │       └── agent-indicator.js # Agent実行状態インジケータ
│   │   └── styles/
│   │       ├── main.css             # グローバルスタイル
│   │       ├── chat.css             # チャット専用スタイル
│   │       ├── settings-panel.css   # 設定パネルスタイル
│   │       ├── model-store.css      # モデルストアスタイル
│   │       ├── rag-panel.css        # RAGパネルスタイル
│   │       └── agent/
│   │           └── agent-indicator.css
│   ├── preload.js                   # プリロードスクリプト（セキュアAPI公開）
│   └── shared/
│       ├── constants.js             # 定数・IPC_CHANNELS定義
│       └── preset-models.json       # プリセットモデル定義（10種）
├── build/
│   └── entitlements.mac.plist       # macOSコード署名設定
├── package.json
├── CLAUDE.md
└── README.md
```

## アーキテクチャ

### プロセスモデル

```
┌──────────────────────────────────────────────────────┐
│              Electron Main Process                   │
│  ┌────────────────────────────────────────────────┐  │
│  │   Llama Manager                                │  │
│  │   - node-llama-cpp wrapper (Metal GPU)         │  │
│  │   - Streaming inference via IPC                │  │
│  │   - RAG prompt augmentation                    │  │
│  │   - Agent tool-call loop                       │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │   RAG Manager                                  │  │
│  │   - WebFetcher: HTTP取得 + テキスト抽出         │  │
│  │   - FileFetcher: TXT/MD読み込み                 │  │
│  │   - ChunkProcessor: 512トークン分割             │  │
│  │   - SQLite全文検索（BM25）                      │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │   Agent Controller                             │  │
│  │   - read_file / list_directory / search_files  │  │
│  │   - get_disk_usage / analyze_logs              │  │
│  │   - list_processes / analyze_json / csv        │  │
│  │   - execute_code (Python/Bash, 30s timeout)    │  │
│  │   PermissionManager: ホワイトリスト制御          │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │   Model Manager / Downloader / HF Search       │  │
│  │   - GGUF file discovery & hot-swap             │  │
│  │   - Streaming HTTPS download + .part管理        │  │
│  │   - HF Hub API検索（Q4_K_M優先選択）            │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │   Database Manager (SQLite × 2)                │  │
│  │   - conversations.db: 会話・メッセージ          │  │
│  │   - rag.db: URLページ + チャンク（全文検索）     │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                    ↕ IPC
┌──────────────────────────────────────────────────────┐
│              Renderer Process (UI)                   │
│  Chat UI / Sidebar / Settings Panel                  │
│  Model Store / RAG Panel / Agent Indicator           │
└──────────────────────────────────────────────────────┘
```

### 技術スタック詳細

| 領域 | 技術 | 用途 |
|------|------|------|
| **LLM統合** | node-llama-cpp v3.18 | llama.cppのNode.jsバインディング（Metal対応） |
| **データベース** | better-sqlite3 v12 | 会話履歴・RAGチャンクの永続化（同期API） |
| **HTML解析** | node-html-parser | WebフェッチのHTMLからテキスト抽出 |
| **トークナイザー** | gpt-tokenizer | チャンク分割のトークン数カウント |
| **マークダウン** | marked.js | Markdown → HTML変換 |
| **シンタックスハイライト** | highlight.js | コードブロックの色付け |
| **UUID生成** | uuid | 会話・RAGページIDの一意性保証 |
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
'llama:token'            → { token: string, conversationId: string }
'llama:done'             → { totalTokens: number, conversationId: string }
'llama:error'            → { error: string, conversationId: string }

// ダウンロード進捗
'download:progress'      → { id, progress, speed, eta, downloaded, total }
'download:complete'      → { id, modelPath }
'download:error'         → { id, error }

// RAGインデックス進捗
'rag:indexProgress'      → { pageId, progress: 0-100, status: string }
'rag:indexComplete'      → { pageId, chunkCount, title }
'rag:indexError'         → { pageId, error }

// Agent実行通知
'agent:tool-start'       → { tool, args, timestamp }
'agent:tool-complete'    → { tool, result, timestamp }
'agent:tool-error'       → { tool, error, timestamp }
```

**レンダラー → メインプロセス（invoke）**
```javascript
// LLM操作
ipcRenderer.invoke('llama:generate', { prompt, systemPrompt?, conversationId });
ipcRenderer.invoke('llama:stop');

// モデル管理
ipcRenderer.invoke('model:list') → Array<ModelInfo>;
ipcRenderer.invoke('model:switch', { modelPath });
ipcRenderer.invoke('model:add', { filePath });
ipcRenderer.invoke('model:delete', { modelId });

// ダウンロード
ipcRenderer.invoke('download:start', { modelId, downloadUrl, filename });
ipcRenderer.invoke('download:cancel', { downloadId });
ipcRenderer.invoke('download:list') → Array<DownloadStatus>;
ipcRenderer.invoke('download:preset-models') → Array<PresetModel>;

// HuggingFace動的検索
ipcRenderer.invoke('hf:searchModels', { search, sort, limit, commercialOnly, author }) → Array<HFModel>;
ipcRenderer.invoke('hf:downloadModel', { hfId, filename, downloadUrl }) → { downloadId };

// 会話管理
ipcRenderer.invoke('conversation:list') → Array<Conversation>;
ipcRenderer.invoke('conversation:load', { id });
ipcRenderer.invoke('conversation:create') → { id };
ipcRenderer.invoke('conversation:delete', { id });

// RAG管理
ipcRenderer.invoke('rag:addUrl', { url }) → PageInfo;
ipcRenderer.invoke('rag:removeUrl', { id });
ipcRenderer.invoke('rag:listUrls') → Array<PageInfo>;
ipcRenderer.invoke('rag:indexUrl', { id });
ipcRenderer.invoke('rag:addFile', { filePath }) → PageInfo;
ipcRenderer.invoke('rag:indexFile', { id });
ipcRenderer.invoke('rag:search', { query, limit? }) → Array<ChunkResult>;
ipcRenderer.invoke('rag:toggle', { enabled });
ipcRenderer.invoke('rag:getStatus') → { enabled, indexedPages, totalChunks };

// Agent管理
ipcRenderer.invoke('agent:executeTool', { tool, arguments }) → { success, result?, error? };
ipcRenderer.invoke('agent:getTools') → Array<ToolDefinition>;
ipcRenderer.invoke('agent:getHistory', { limit? }) → Array<ExecutionRecord>;
ipcRenderer.invoke('agent:toggle', { enabled });
ipcRenderer.invoke('agent:getStatus') → { enabled };

// 設定管理
ipcRenderer.invoke('settings:save', settings);
ipcRenderer.invoke('settings:load') → Settings;
ipcRenderer.invoke('modelsDir:select') → { path };
ipcRenderer.invoke('modelsDir:get') → string;
ipcRenderer.invoke('modelsDir:set', { path });
```

## データ仕様

### データ保存場所
```
~/Library/Application Support/AlpaChat/
  ├── conversations.db   # 会話・メッセージ履歴
  ├── rag.db             # RAGページ・チャンク
  └── models/
      ├── llama-7b-q4_k_m.gguf
      └── custom-model.gguf
```

### SQLiteスキーマ（conversations.db）
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

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

### SQLiteスキーマ（rag.db）
```sql
-- RAGページテーブル（URLまたはファイルパス）
CREATE TABLE rag_pages (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,          -- URLまたはローカルファイルパス
  title TEXT,
  status TEXT DEFAULT 'pending',  -- pending | indexed | error
  chunk_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- チャンクテーブル（全文検索対応）
CREATE VIRTUAL TABLE rag_chunks USING fts5(
  page_id,
  content,
  chunk_index
);
```

## RAG機能（検索拡張生成）

### 概要
WebページまたはローカルファイルをインデックスしてLLMの回答精度を向上させる機能。

### 処理フロー
```
URL/ファイル追加 → インデックス化 → チャンク分割 → SQLite保存
                                                       ↓
ユーザー入力 → 全文検索（BM25）→ コンテキスト構築 → プロンプト拡張 → LLM生成
```

### 主要クラスと責務

| クラス | ファイル | 責務 |
|--------|---------|------|
| `RagManager` | `rag-manager.js` | URL/ファイル管理・インデックス制御・プロンプト拡張 |
| `WebFetcher` | `web-fetcher.js` | HTTPS取得・HTMLからテキスト抽出（node-html-parser） |
| `FileFetcher` | `file-fetcher.js` | TXT/MDファイル読み込み・テキスト正規化（最大10MB） |
| `ChunkProcessor` | `chunk-processor.js` | 512トークン分割・128トークンオーバーラップ（gpt-tokenizer） |

### 制約事項
- 対応ファイル形式: `.txt`, `.md`, `.markdown`のみ
- チャンクサイズ: 512トークン（オーバーラップ128）
- 検索結果: 上位3件をコンテキストに使用
- RAGは明示的にON/OFFできる（`rag:toggle`）

## Agent機能

### 概要
LLMがmacOSのファイルシステム・システム情報・コードを操作できるツール呼び出し機能。

### 実装ツール一覧

| ツール名 | 分類 | 説明 |
|---------|------|------|
| `read_file` | ファイル操作 | テキストファイル読み込み（最大10MB、50000文字で切り詰め） |
| `list_directory` | ファイル操作 | ディレクトリ一覧（最大500件） |
| `search_files` | ファイル操作 | globパターンによるファイル検索（最大100件） |
| `get_file_info` | ファイル操作 | ファイルメタデータ（サイズ・日時・パーミッション） |
| `get_disk_usage` | システム管理 | ディスク使用量分析（`du -sh`、上位20件） |
| `analyze_logs` | システム管理 | エラー/警告/カスタムパターン検出（最大50件ずつ） |
| `list_processes` | システム管理 | 実行中プロセス一覧（`ps aux`、CPU順上位50件） |
| `analyze_json` | データ処理 | JSONファイル構造解析（最大20MB） |
| `analyze_csv` | データ処理 | CSVファイル解析（最大20MB、先頭100行） |
| `execute_code` | コード実行 | Python/Bash実行（タイムアウト最大60秒） |

### セキュリティ（PermissionManager）

```
アクセス制御の優先順位:
1. ブロックリスト（優先）: /System, /private, /Library, /usr, /bin,
   ~/.ssh, ~/Library/Keychains, ~/.aws, ~/.config
2. ホワイトリスト: ~/（ホームディレクトリ以下のみ許可）
3. センシティブファイルブロック: .env, credentials, id_rsa, *.key, *.pem 等
4. 拡張子ブロック: .app, .dmg, .pkg, .sh, .command
```

- 書き込み操作は現時点で未実装（Phase 2以降）
- コード実行は作業ディレクトリの検証あり

## モデルストア機能

### 概要
HuggingFaceの人気GGUFモデルを簡単にダウンロードできる機能。

### 使い方
1. ヘッダーの🏪ボタンをクリック
2. プリセットモデル一覧から好みのモデルを選択
3. ライセンス・メモリ要件を確認
4. **ダウンロード**ボタンをクリック
5. プログレスバーでダウンロード進捗を確認
6. 完了後、モデルドロップダウンに自動追加

### プリセットモデル（10種類）
| モデル | サイズ | メモリ | 特徴 | ライセンス |
|--------|--------|--------|------|-----------|
| Llama 3.2 3B | 2.0GB | 4GB | 最新・軽量 | 非商用 |
| Mistral 7B | 4.1GB | 6GB | 高性能 | 商用可 ✅ |
| Phi-3 Mini | 2.2GB | 4GB | 小型 | 商用可 ✅ |
| CodeLlama 7B | 3.8GB | 6GB | コード特化 | 非商用 |
| Qwen 2.5 7B | 4.3GB | 6GB | 多言語 | 商用可 ✅ |
| Gemma 2 2B | 1.6GB | 3GB | 超軽量 | 商用可 ✅ |
| Neural Chat 7B | 4.1GB | 6GB | チャット | 商用可 ✅ |
| Orca 2 7B | 3.8GB | 6GB | 推論強力 | 非商用 |
| Starling LM 7B | 4.1GB | 6GB | RLHF | 商用可 ✅ |
| Llama 2 7B | 3.8GB | 6GB | 安定 | 非商用 |

### 技術仕様
- **ダウンロード**: HTTPS直接ダウンロード（Node.js https module）
- **プログレス**: IPC経由のリアルタイム更新（速度・残り時間）
- **一時ファイル**: `.part`ファイルで管理
- **保存先**: `~/Library/Application Support/Llamaapp/models/`
- **エラーハンドリング**: ディスク容量チェック・ネットワークタイムアウト

## 実装ロードマップ

### ✅ Phase 1: コア機能（MVP）
- ✅ node-llama-cppのMetal動作検証
- ✅ 基本的なllama-manager実装
- ✅ シンプルな入力欄 + 出力表示UI
- ✅ 単一モデルでの質問応答動作確認

### ✅ Phase 2: ストリーミング + UI改善
- ✅ IPC経由のリアルタイムトークン配信
- ✅ マークダウンレンダリング（marked.js）
- ✅ シンタックスハイライト（highlight.js）
- ✅ メッセージのコピー・再生成機能

### ✅ Phase 3: モデル管理
- ✅ model-manager実装
- ✅ モデル一覧表示（ドロップダウン）
- ✅ モデル切り替え（ホットスワップ）
- ✅ モデル追加・削除UI

### ✅ Phase 3.5: HuggingFaceモデルストア ⭐NEW
- ✅ プリセットモデル定義（10モデル）
- ✅ model-downloader実装
- ✅ ストリーミングダウンロード
- ✅ プログレスバーUI
- ✅ ライセンス・フィルタリング機能

### ✅ Phase 4: 会話履歴
- ✅ SQLite統合（better-sqlite3）
- ✅ db-manager実装
- ✅ 会話履歴サイドバーUI
- ✅ 会話の新規作成・削除・切り替え

### ✅ Phase 5: 高度な設定
- ✅ カスタムシステムプロンプト設定UI
- ✅ 生成パラメータ調整（temperature / maxTokens）
- ✅ モデルディレクトリのカスタム設定
- ✅ HuggingFace APIトークン設定

### ✅ Phase 6: RAG（検索拡張生成）
- ✅ WebFetcher・FileFetcher実装
- ✅ ChunkProcessor（512トークン・128オーバーラップ）
- ✅ RAG専用SQLite DB（rag.db）
- ✅ RAGパネルUI（URL/ファイル追加・インデックス・ON/OFF）

### ✅ Phase 7: HuggingFace動的検索
- ✅ hf-search.js（HF Hub API連携）
- ✅ Q4_K_M優先のGGUFファイル自動選択
- ✅ ライセンス判定（商用可否）・タグベースフィルタ

### ✅ Phase 8: Agentモード
- ✅ AgentController（10ツール実装）
- ✅ PermissionManager（ホワイトリスト・ブロックリスト）
- ✅ Python/Bash コード実行（タイムアウト制御）
- ✅ Agent実行インジケータUI

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
