# LlamaApp - Local LLM Chat

macOS専用のローカルLLMチャットアプリケーション

## 概要

LlamaAppは、llama.cppを使用してローカルでLLMを実行できるElectronアプリケーションです。Metal GPUアクセラレーションに対応し、プライバシーを完全に保護します。

## 必要環境

- macOS 13 (Ventura) 以降
- Node.js 18以降
- 8GB以上のメモリ（推奨: 16GB）
- Metal対応GPU

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

### 3. モデルの準備

GGUFフォーマットのLLMモデルを用意してください。以下のような場所からダウンロードできます：

- [Hugging Face](https://huggingface.co/models?search=gguf)
- [TheBloke's models](https://huggingface.co/TheBloke)

推奨モデル：
- 7B Q4量子化（約4GB）
- 7B Q5量子化（約5GB）

## 使用方法

### アプリの起動

```bash
npm start
```

開発モード（DevTools付き）:
```bash
npm run dev
```

### 初回セットアップ

1. アプリを起動
2. ヘッダーの「+ ボタン」をクリック
3. ダウンロードしたGGUFファイルを選択
4. モデルドロップダウンから追加したモデルを選択
5. モデルのロード完了を待つ（20-40秒）
6. チャットを開始！

### モデルの保存場所

追加したモデルは以下の場所にコピーされます：

```
~/Library/Application Support/Llamaapp/models/
```

## 開発

### プロジェクト構造

```
src/
├── main/           # メインプロセス（Node.js）
├── renderer/       # レンダラープロセス（UI）
├── preload.js      # セキュアAPI公開
└── shared/         # 共通定数
```

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
| `npm run package:mac` | クリーン→リビルド→macOS DMG作成（推奨） |
| `npm run package:dir` | クリーン→リビルド→ディレクトリ形式 |
| `npm run package` | クリーン→リビルド→全プラットフォーム |
| `npm run clean` | dist/を削除 |
| `npm run rebuild` | ネイティブモジュールのリビルド |

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

## Phase 1 (MVP) の機能

現在実装されている機能：

- ✅ 基本的なチャットUI
- ✅ llama.cpp統合（Metal GPU対応）
- ✅ ストリーミング応答
- ✅ 複数モデル管理
- ✅ モデル切り替え

## 今後の予定

- [ ] マークダウンレンダリング（Phase 2）
- [ ] 会話履歴の保存（Phase 4）
- [ ] システムプロンプト設定（Phase 5）

## ライセンス

MIT
