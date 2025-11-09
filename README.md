# LlamaApp - Local LLM Chat

macOS専用のローカルLLMチャットアプリケーション

## 概要

LlamaAppは、llama.cppを使用してローカルでLLMを実行できるElectronアプリケーションです。Metal GPUアクセラレーションに対応し、プライバシーを完全に保護します。

### 主要機能

- ✅ **ChatGPT風のストリーミングUI** - リアルタイムでトークン表示
- ✅ **HuggingFaceモデルストア** - 13種類のプリセットモデルを1クリックダウンロード
- ✅ **RAG - Web Knowledge** - ウェブページをインデックス化して検索可能に
- ✅ **モデル管理** - ダウンロード、削除、切り替えが簡単
- ✅ **マークダウン対応** - コードブロックのシンタックスハイライト付き
- ✅ **Metal GPU加速** - macOS最適化で高速推論
- ✅ **完全プライベート** - すべてローカルで動作、データは外部送信なし

## 必要環境

- macOS 13 (Ventura) 以降
- Node.js 18以降
- メモリ: 8GB以上（推奨: 16GB）
- ストレージ: モデルごとに1-12GB
- Metal対応GPU（Apple Silicon推奨）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. ネイティブモジュールのリビルド

```bash
npm run rebuild
```

このステップは`node-llama-cpp`のネイティブバインディングをElectron用にビルドするために必要です。

## 使用方法

### アプリの起動

```bash
npm start
```

開発モード（DevTools付き）:
```bash
npm run dev
```

### モデルのダウンロード（推奨）

#### HuggingFaceモデルストアを使う

1. アプリを起動
2. ヘッダーの **🏪 ボタン** をクリック
3. モデルストアから好きなモデルを選択
4. **ダウンロード** ボタンをクリック
5. プログレスバーでダウンロード進捗を確認
6. 完了後、モデルドロップダウンに自動追加

#### プリセットモデル一覧（13種類）

| モデル | サイズ | メモリ | 特徴 | ライセンス |
|--------|--------|--------|------|-----------|
| **超軽量** |
| TinyLlama 1.1B Chat | 669MB | 2GB | 超小型・超高速レスポンス | 商用可 ✅ |
| Gemma 2 2B Instruct | 1.6GB | 3GB | Google製・軽量 | 商用可 ✅ |
| **軽量** |
| Llama 3.2 3B Instruct | 2.0GB | 4GB | 最新・高性能 | 非商用 |
| Phi-3 Mini 4K | 2.2GB | 4GB | Microsoft製 | 商用可 ✅ |
| **中型** |
| Llama 2 7B Chat | 3.8GB | 6GB | 安定版 | 非商用 |
| CodeLlama 7B Instruct | 3.8GB | 6GB | コード特化 | 非商用 |
| Orca 2 7B | 3.8GB | 6GB | 強力な推論 | 非商用 |
| Mistral 7B Instruct | 4.1GB | 6GB | 高性能 | 商用可 ✅ |
| Neural Chat 7B v3 | 4.1GB | 6GB | チャット最適化 | 商用可 ✅ |
| Starling LM 7B Alpha | 4.1GB | 6GB | RLHF訓練済み | 商用可 ✅ |
| Qwen 2.5 7B Instruct | 4.3GB | 6GB | 多言語対応 | 商用可 ✅ |
| Llama 3.1 8B Instruct | 4.9GB | 8GB | 最新・強力 | 非商用 |
| **大型** |
| OpenAI GPT-OSS 20B | 11.6GB | 16GB | 低レイテンシ | 商用可 ✅ |

### 手動でモデルを追加

1. [Hugging Face](https://huggingface.co/models?search=gguf) などからGGUFモデルをダウンロード
2. アプリのヘッダーの **+ ボタン** をクリック
3. ダウンロードしたGGUFファイルを選択
4. モデルが自動的にインポートされます

### モデルの削除

1. **🏪 モデルストア** を開く
2. インストール済みモデルの **🗑️ 削除** ボタンをクリック
3. 確認ダイアログで **OK** をクリック

### モデルの切り替え

1. ヘッダーのモデルドロップダウンから選択
2. モデルのロード完了を待つ（20-40秒）
3. チャットを開始！

### チャット機能

- **ストリーミング応答**: リアルタイムでAIの応答を表示
- **マークダウン対応**: コードブロック、リスト、テーブルなど
- **シンタックスハイライト**: プログラミング言語に対応
- **メッセージコピー**: 各メッセージをクリップボードにコピー可能

### RAG機能（Web Knowledge）

RAG（Retrieval Augmented Generation）を使うと、ウェブページの内容をLLMのコンテキストとして利用できます。

#### RAGの使い方

1. **パネルを開く**
   - ヘッダーの **🔍 ボタン** をクリック

2. **URLを追加**
   - 入力欄にウェブページのURLを入力
   - **追加** ボタンをクリック

3. **インデックス化**
   - 追加したURLの **インデックス化** ボタンをクリック
   - プログレスバーで進捗を確認：
     - **fetching**: ページ取得中
     - **chunking**: テキスト分割中
     - **indexing**: データベース保存中
   - 完了すると「完了」ステータスに変わります

4. **RAGを有効化**
   - パネル上部の **RAG有効化** トグルをONにする

5. **チャットで使う**
   - RAGが有効な状態で質問すると、インデックス化したページから関連情報を自動検索
   - 検索結果をコンテキストとしてLLMに渡し、より正確な回答を生成

#### RAGの仕組み

```
質問 → 検索（インデックスから関連チャンク取得）→ コンテキスト生成 → LLM推論 → 回答
```

- **チャンク分割**: 長いテキストを500文字ずつのチャンクに分割
- **検索**: クエリに関連する上位3チャンクを取得（簡易的なキーワードマッチング）
- **コンテキスト拡張**: 検索結果をプロンプトに追加してLLMに渡す

#### 使用例

1. 技術ドキュメントをインデックス化
   - `https://react.dev/reference/react/useState`
   - 「useStateの使い方を教えて」と質問すると、公式ドキュメントの内容を参照

2. ブログ記事をインデックス化
   - 複数の関連記事をインデックス化
   - 記事の内容に基づいた質問に回答

3. ニュース記事をインデックス化
   - 最新ニュースをインデックス化
   - 時事問題について最新情報を元に回答

#### 制限事項

- **検索方式**: 簡易的なキーワードマッチング（ベクトル検索ではない）
- **対応形式**: HTMLのみ（PDF、動画等は非対応）
- **JavaScript**: 静的HTML取得のみ（SPAは内容取得できない場合あり）
- **認証**: ログインが必要なページは取得不可

## モデルの保存場所

ダウンロード・追加したモデルは以下の場所に保存されます：

```
~/Library/Application Support/Llamaapp/models/
```

## 開発

### プロジェクト構造

```
llamaApp/
├── src/
│   ├── main/                    # メインプロセス（Node.js環境）
│   │   ├── main.js              # Electronエントリーポイント
│   │   ├── llama-manager.js     # llama.cpp統合・推論管理
│   │   ├── model-manager.js     # GGUFモデルファイル管理
│   │   ├── model-downloader.js  # HuggingFaceダウンロード管理
│   │   ├── rag-manager.js       # RAG統合マネージャー
│   │   ├── web-fetcher.js       # ウェブページ取得
│   │   ├── chunk-processor.js   # テキストチャンク分割
│   │   ├── db-manager.js        # SQLiteデータベース管理
│   │   └── ipc-handlers.js      # IPC通信ハンドラー
│   ├── renderer/                # レンダラープロセス（ブラウザ環境）
│   │   ├── index.html           # メインHTML
│   │   ├── app.js               # UIメインロジック
│   │   ├── components/
│   │   │   ├── model-store.js   # モデルストアUI
│   │   │   └── rag-panel.js     # RAGパネルUI
│   │   └── styles/
│   │       ├── main.css         # グローバルスタイル
│   │       ├── chat.css         # チャット専用スタイル
│   │       ├── model-store.css  # モデルストアスタイル
│   │       └── rag-panel.css    # RAGパネルスタイル
│   ├── preload.js               # プリロードスクリプト（セキュアAPI公開）
│   └── shared/
│       ├── constants.js         # 定数定義
│       └── preset-models.json   # プリセットモデル定義
├── build/
│   └── entitlements.mac.plist   # macOSコード署名設定
└── package.json
```

### 技術スタック

| 領域 | 技術 | 用途 |
|------|------|------|
| **LLM統合** | node-llama-cpp | llama.cppのNode.jsバインディング（Metal対応） |
| **データベース** | better-sqlite3 | RAGインデックス・会話履歴の永続化 |
| **ウェブスクレイピング** | https (Node.js) | ウェブページ取得 |
| **HTML解析** | cheerio | HTML→テキスト抽出 |
| **マークダウン** | marked.js | Markdown → HTML変換 |
| **シンタックスハイライト** | highlight.js | コードブロックの色付け |
| **ビルド** | electron-builder | macOS DMGパッケージ作成 |

### ビルド（配布用パッケージ作成）

#### 推奨：ワンコマンドパッケージング

```bash
# macOS用DMGファイルを自動生成（クリーンアップ → リビルド → パッケージング）
npm run package:mac
```

#### 個別コマンド

```bash
# 1. ビルド成果物をクリーンアップ
npm run clean

# 2. ネイティブモジュールのリビルド
npm run rebuild

# 3. パッケージング
npm run build:mac        # macOS DMG作成
npm run build:dir        # ディレクトリ形式（テスト用）
npm run build            # 全プラットフォーム対応
```

#### スクリプト一覧

| コマンド | 説明 |
|---------|------|
| `npm start` | アプリケーションを起動 |
| `npm run dev` | デバッグモードで起動（DevTools自動起動） |
| `npm run rebuild` | ネイティブモジュールのリビルド |
| `npm run package:mac` | クリーン→リビルド→macOS DMG作成（推奨） |
| `npm run package:dir` | クリーン→リビルド→ディレクトリ形式 |
| `npm run package` | クリーン→リビルド→全プラットフォーム |
| `npm run clean` | dist/を削除 |

#### 生成されるファイル

ビルドが完了すると、`dist/`ディレクトリに以下のファイルが生成されます:
- `LlamaApp-0.1.0-arm64.dmg` - Apple Silicon専用（M1/M2/M3）
- `LlamaApp-0.1.0-x64.dmg` - Intel Mac専用
- `LlamaApp-0.1.0-mac.zip` - ポータブル版

**注意事項:**
- 初回ビルドは10-20分程度かかります
- ネイティブモジュール（node-llama-cpp）のビルドが含まれます
- 十分なディスク容量（5GB以上）が必要です

## トラブルシューティング

### モデルが読み込めない

- メモリが十分にあるか確認（8GB以上推奨）
- GGUFファイルが破損していないか確認
- `npm run rebuild`を再実行

### ダウンロードが失敗する

- インターネット接続を確認
- ディスク容量が十分にあるか確認
- 一時的にファイアウォールを無効化してみる

### アプリが起動しない

```bash
# キャッシュをクリア
rm -rf node_modules
npm install
npm run rebuild
```

### Metal GPUが使用されているか確認

起動時のログで以下のようなメッセージを確認：
```
ggml_metal_init: loaded kernel
```

## セキュリティ

- **サンドボックス化**: レンダラープロセスはサンドボックス環境で実行
- **コンテキスト分離**: プリロードスクリプトでセキュアにAPI公開
- **CSP準拠**: Content Security Policyに準拠したイベントハンドリング
- **ローカル実行**: すべての処理がローカルで完結、データは外部送信なし

## 実装済み機能

### Phase 1-3.5（現在のバージョン）

- ✅ 基本的なチャットUI
- ✅ llama.cpp統合（Metal GPU対応）
- ✅ ストリーミング応答
- ✅ 複数モデル管理
- ✅ モデル切り替え
- ✅ マークダウンレンダリング
- ✅ シンタックスハイライト
- ✅ HuggingFaceモデルストア（13種類のプリセット）
- ✅ プログレスバー付きダウンロード
- ✅ モデル削除機能
- ✅ ライセンスフィルタリング
- ✅ **RAG（Retrieval Augmented Generation）**
  - ✅ ウェブページのインデックス化
  - ✅ テキストチャンク分割
  - ✅ 簡易的な検索機能
  - ✅ プロンプト拡張（コンテキスト注入）
  - ✅ SQLiteによる永続化

### 今後の予定

- [ ] 会話履歴の保存（Phase 4）
- [ ] 会話の新規作成・削除・切り替え
- [ ] カスタムシステムプロンプト設定（Phase 5）
- [ ] プリセット管理
- [ ] RAG検索の高度化（ベクトル検索、セマンティック検索）

## ライセンス

MIT

## 貢献

バグ報告や機能提案は、GitHubのIssuesでお願いします。

## リソース

- [llama.cpp](https://github.com/ggerganov/llama.cpp)
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp)
- [Electron](https://www.electronjs.org/)
- [Hugging Face](https://huggingface.co/)
