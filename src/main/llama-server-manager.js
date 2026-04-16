/**
 * llama-server プロセス管理
 * Vision モデル用の llama.cpp サーバーを子プロセスとして管理する
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// パッケージ済みアプリと開発環境でバイナリパスを解決
function getServerBinaryPath() {
  const binName = 'llama-server';
  // asar.unpacked からのパス（パッケージ済みアプリ）
  const unpackedPath = path.join(
    process.resourcesPath || '',
    'app.asar.unpacked',
    'src', 'resources', 'bin', binName
  );
  if (fs.existsSync(unpackedPath)) return unpackedPath;

  // 開発環境パス
  const devPath = path.join(__dirname, '..', 'resources', 'bin', binName);
  if (fs.existsSync(devPath)) return devPath;

  return null;
}

const DEFAULT_PORT = 8765;
const HEALTH_CHECK_INTERVAL = 500;  // ms
const STARTUP_TIMEOUT = 60_000;     // ms

class LlamaServerManager {
  constructor() {
    this.process = null;
    this.port = DEFAULT_PORT;
    this.modelPath = null;
    this.mmprojPath = null;
    this.isRunning = false;
  }

  /**
   * llama-server を起動する
   * @param {string} modelPath  - メインモデル (.gguf)
   * @param {string} mmprojPath - 画像エンコーダモデル (.gguf)
   */
  async start(modelPath, mmprojPath) {
    if (this.isRunning) await this.stop();

    const binaryPath = getServerBinaryPath();
    if (!binaryPath) throw new Error('llama-server バイナリが見つかりません');

    // 空きポートを取得
    this.port = await this._findFreePort(DEFAULT_PORT);

    const args = [
      '--model', modelPath,
      '--port', String(this.port),
      '--host', '127.0.0.1',
      '--ctx-size', '4096',
      '--n-gpu-layers', '99',
      '--no-webui',
    ];
    if (mmprojPath) {
      args.splice(2, 0, '--mmproj', mmprojPath);
    }

    console.log(`[llama-server] Starting: ${binaryPath} ${args.join(' ')}`);

    this.process = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.process.stdout.on('data', (d) => console.log(`[llama-server] ${d.toString().trim()}`));
    this.process.stderr.on('data', (d) => console.log(`[llama-server] ${d.toString().trim()}`));
    this.process.on('exit', (code) => {
      console.log(`[llama-server] Exited with code ${code}`);
      this.isRunning = false;
      this.process = null;
    });

    this.modelPath = modelPath;
    this.mmprojPath = mmprojPath;

    // ヘルスチェックでサーバー起動を待機
    await this._waitUntilReady();
    this.isRunning = true;
    console.log(`[llama-server] Ready on port ${this.port}`);
  }

  /** llama-server を停止する */
  async stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.isRunning = false;
    this.modelPath = null;
    this.mmprojPath = null;
  }

  /**
   * 画像＋テキストをサーバーに送信してストリーミングレスポンスを取得
   * @param {string} prompt        - テキストプロンプト
   * @param {string[]} imageBase64 - Base64 エンコードされた画像配列
   * @param {string} systemPrompt
   * @param {Function} onToken     - トークンコールバック (token: string) => void
   * @param {AbortSignal} signal   - 中断シグナル
   */
  async generateWithImages({ prompt, imageBase64 = [], systemPrompt = '', onToken, signal }) {
    if (!this.isRunning) throw new Error('llama-server が起動していません');

    // OpenAI 互換フォーマットで画像を含むメッセージを組み立てる
    const content = [
      ...imageBase64.map((b64) => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
      { type: 'text', text: prompt },
    ];

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content });

    const body = JSON.stringify({
      model: 'local',
      messages,
      stream: true,
      max_tokens: 2048,
    });

    const response = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`llama-server error: ${response.status} ${err}`);
    }

    // SSE ストリームを読み取る
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 未完行を保持

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content;
          if (token) onToken(token);
        } catch {
          // JSON パースエラーは無視
        }
      }
    }
  }

  // --- Private helpers ---

  _waitUntilReady() {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + STARTUP_TIMEOUT;
      const check = () => {
        if (Date.now() > deadline) {
          reject(new Error('llama-server 起動タイムアウト'));
          return;
        }
        const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
          if (res.statusCode === 200) resolve();
          else setTimeout(check, HEALTH_CHECK_INTERVAL);
        });
        req.on('error', () => setTimeout(check, HEALTH_CHECK_INTERVAL));
        req.end();
      };
      setTimeout(check, 1000); // 最初の起動待ち
    });
  }

  _findFreePort(startPort) {
    return new Promise((resolve) => {
      const server = require('net').createServer();
      server.listen(startPort, '127.0.0.1', () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      });
      server.on('error', () => resolve(this._findFreePort(startPort + 1)));
    });
  }
}

module.exports = LlamaServerManager;
