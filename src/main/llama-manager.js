/**
 * Llama.cpp統合マネージャー
 * node-llama-cppを使用してモデルのロードと推論を管理
 */

const path = require('path');
const fsSync = require('fs');
const os = require('os');

// node-llama-cppのES Module対応
let llamaModule = null;

// ログファイルパス（app.getPath使用不可のためos.homedirで代替）
const LOG_PATH = path.join(
  os.homedir(), 'Library', 'Application Support', 'AlpaChat', 'model-load.log'
);
function log(msg) {
  const line = `[${new Date().toISOString()}] [llama-manager] ${msg}\n`;
  try {
    fsSync.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fsSync.appendFileSync(LOG_PATH, line);
  } catch (_) {}
  console.log(`[llama-manager] ${msg}`);
}

class LlamaManager {
  constructor() {
    this.llama = null;
    this.model = null;
    this.context = null;
    this.contextSequence = null; // コンテキストシーケンスを保存
    this.session = null;
    this.currentModelPath = null;
    this.isGenerating = false;
    this.initialized = false;

    // Agent機能
    this.agentController = null;
    this.agentEnabled = false;

    // 生成停止用
    this.abortController = null;

    // システムプロンプト
    this.currentSystemPrompt = 'You are a helpful assistant.';
  }

  /**
   * node-llama-cppモジュールを初期化
   */
  async initialize() {
    if (this.initialized) return;

    try {
      log('initialize: importing node-llama-cpp...');
      llamaModule = await import('node-llama-cpp');
      log('initialize: calling getLlama()...');
      this.llama = await llamaModule.getLlama();
      this.initialized = true;
      log('initialize: done');
    } catch (error) {
      log(`initialize FAILED: ${error.message}\n${error.stack}`);
      throw error;
    }
  }

  /**
   * モデルをロード
   * @param {string} modelPath - GGUFモデルファイルのパス
   */
  async loadModel(modelPath) {
    // 初期化チェック
    if (!this.initialized) {
      await this.initialize();
    }

    // 既存のモデルをアンロード
    if (this.model) {
      await this.unloadModel();
    }

    // Step 1: モデルロード（GPU失敗時: llama再初期化→CPUフォールバックの順でリトライ）
    const step1Strategies = [
      { label: 'GPU (default)',          loadOptions: {},                                  reinitLlama: false },
      { label: 'GPU (re-init)',          loadOptions: {},                                  reinitLlama: true  },
      { label: 'CPU (mmap)',             loadOptions: { gpuLayers: 0 },                   reinitLlama: false },
      { label: 'CPU (no-mmap)',          loadOptions: { gpuLayers: 0, useMmap: false },   reinitLlama: false },
    ];

    let step1Error = null;
    for (const strategy of step1Strategies) {
      if (strategy.reinitLlama) {
        log('Step 1: reinitializing llama instance...');
        try { await this.llama.dispose(); } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.llama = await llamaModule.getLlama();
      }

      log(`Step 1: loading model file [${strategy.label}]...`);
      try {
        this.model = await this.llama.loadModel({ modelPath, ...strategy.loadOptions });
        step1Error = null;
        log(`Step 1: done [${strategy.label}]`);
        break;
      } catch (error) {
        log(`Step 1 FAILED [${strategy.label}]: ${error.message}`);
        step1Error = error;
        if (this.model) {
          try { await this.model.dispose(); } catch (_) {}
          this.model = null;
        }
      }
    }

    if (step1Error) {
      log(`Step 1 FAILED all strategies: ${step1Error.message}\n${step1Error.stack}`);
      throw step1Error;
    }

    // Step 2: コンテキスト作成（メモリ不足時はサイズを落としてリトライ）
    const contextSizes = [4096, 2048, 1024];
    let contextCreated = false;
    for (const size of contextSizes) {
      log(`Step 2: creating context (contextSize=${size})...`);
      try {
        this.context = await this.model.createContext({ contextSize: size });
        log(`Step 2: done (contextSize=${size})`);
        contextCreated = true;
        break;
      } catch (error) {
        log(`Step 2 FAILED at contextSize=${size}: ${error.message}`);
        if (this.context) {
          try { await this.context.dispose(); } catch (_) {}
          this.context = null;
        }
      }
    }

    if (!contextCreated) {
      await this.model.dispose();
      this.model = null;
      const err = new Error('Failed to create context at any context size');
      log(`Step 2 FAILED all sizes: ${err.message}`);
      throw err;
    }

    // Step 3: セッション作成
    log('Step 3: creating session...');
    this.contextSequence = this.context.getSequence();
    this.session = new llamaModule.LlamaChatSession({
      contextSequence: this.contextSequence,
      systemPrompt: this.currentSystemPrompt,
    });
    log('Step 3: done');

    this.currentModelPath = modelPath;
    return {
      success: true,
      modelPath: path.basename(modelPath),
    };
  }

  /**
   * モデルをアンロード
   */
  async unloadModel() {
    try {
      console.log('Unloading model...');

      // セッションをクリア
      if (this.session) {
        this.session = null;
      }

      this.contextSequence = null;

      // コンテキストを先に明示的にdispose
      if (this.context) {
        try {
          await this.context.dispose();
        } catch (e) {
          console.warn('Context dispose warning:', e.message);
        }
        this.context = null;
      }

      // モデルをdispose
      if (this.model) {
        await this.model.dispose();
        this.model = null;
        console.log('Model disposed');
      }

      this.currentModelPath = null;

      // GPUメモリ解放を待つ
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('Failed to unload model:', error);
      throw error;
    }
  }

  /**
   * テキスト生成（ストリーミング）
   * @param {string} prompt - ユーザー入力
   * @param {Function} onToken - トークンコールバック
   * @param {Object} options - 生成オプション
   */
  async generate(prompt, onToken, options = {}) {
    if (!this.session) {
      throw new Error('Model not loaded');
    }

    if (this.isGenerating) {
      throw new Error('Already generating');
    }

    this.abortController = new AbortController();
    this.isGenerating = true;
    let totalTokens = 0;
    let fullResponse = '';

    try {
      // signal を渡してストリーミング中断を有効化
      await this.session.prompt(prompt, {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 2048,
        signal: this.abortController.signal,
        onTextChunk: (chunk) => {
          fullResponse += chunk;
          totalTokens++;
          if (onToken) onToken(chunk);
        },
      });

      return { response: fullResponse, totalTokens: totalTokens || 1, aborted: false };
    } catch (error) {
      // AbortSignal による中断は正常終了として扱う
      if (this.abortController?.signal.aborted) {
        console.log('Generation aborted by user');
        return { response: fullResponse, totalTokens, aborted: true };
      }
      console.error('Generation error:', error);
      throw error;
    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }

  /**
   * 生成を停止
   */
  stopGeneration() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isGenerating = false;
  }

  /**
   * モデルがロード済みかチェック
   */
  isModelLoaded() {
    return this.model !== null && this.session !== null;
  }

  /**
   * 現在のモデル情報を取得
   */
  getCurrentModelInfo() {
    if (!this.currentModelPath) {
      return null;
    }
    return {
      path: this.currentModelPath,
      name: path.basename(this.currentModelPath),
      loaded: this.isModelLoaded(),
    };
  }

  // ==================== Agent機能 ====================

  /**
   * エージェント機能を有効化
   * @param {AgentController} agentController - エージェントコントローラー
   */
  enableAgent(agentController) {
    this.agentController = agentController;
    this.agentEnabled = true;
  }

  /**
   * エージェント機能を無効化
   */
  disableAgent() {
    this.agentEnabled = false;
  }

  /**
   * ツール定義を含むシステムプロンプトを構築
   */
  _buildSystemPromptWithTools(userSystemPrompt) {
    if (!this.agentController) {
      return userSystemPrompt;
    }

    const tools = this.agentController.getToolDefinitions();
    const toolsDescription = tools.map(tool => {
      const params = Object.entries(tool.parameters)
        .map(([name, def]) => {
          const optional = def.optional ? ' (optional)' : '';
          return `  - ${name} (${def.type})${optional}: ${def.description}`;
        })
        .join('\n');

      return `### ${tool.name}\n${tool.description}\nParameters:\n${params}`;
    }).join('\n\n');

    return `${userSystemPrompt}

## Available Tools

You have access to the following tools. Use them proactively to help the user.

To call a tool, output ONLY a JSON object in this exact format (no other text before it):
\`\`\`json
{
  "tool": "tool_name",
  "arguments": {
    "param1": "value1"
  }
}
\`\`\`

**CRITICAL RULES:**
1. **web_search**: You CAN and MUST search the web. When a user asks about current news, latest events, real-time information, recent releases, prices, weather, or anything that may have changed — call web_search IMMEDIATELY. Do NOT say "I cannot search the web." You have this capability via the web_search tool.
2. Use tools for files, system data, code execution, and web search as needed.
3. Use the exact JSON format above — no extra text before the JSON block.
4. One tool call per turn; wait for the result before continuing.
5. After receiving tool results, answer the user naturally in the same language they used.

**WEB SEARCH EXAMPLES:**
- "最新のニュースを教えて" → call web_search with query "最新ニュース 今日"
- "朝日新聞のトップ記事は？" → call web_search with query "朝日新聞 最新ニュース"
- "〇〇の最新バージョンは？" → call web_search with query "〇〇 最新バージョン"

**PATH RULES:**
- ALWAYS use ~ for home directory paths (e.g. ~/Documents, ~/Desktop)

${toolsDescription}

Remember: Use web_search whenever current/real-time information is needed!`;
  }

  /**
   * エージェント対応のテキスト生成
   * @param {string} prompt - ユーザー入力
   * @param {Function} onToken - トークンコールバック
   * @param {Object} options - 生成オプション
   */
  async generateWithAgent(prompt, onToken, options = {}) {
    if (!this.session) {
      throw new Error('Model not loaded');
    }

    if (!this.agentEnabled || !this.agentController) {
      // エージェント無効の場合は通常の生成
      return this.generate(prompt, onToken, options);
    }

    if (this.isGenerating) {
      throw new Error('Already generating');
    }

    this.abortController = new AbortController();
    this.isGenerating = true;
    let fullResponse = '';
    let totalTokens = 0;

    try {
      const maxTurns = 5;
      let turn = 0;
      let currentPrompt = prompt;

      while (turn < maxTurns) {
        // ループ開始前に中断チェック
        if (this.abortController.signal.aborted) break;

        turn++;
        let turnResponse = '';
        let turnHasToolCall = false;

        await this.session.prompt(currentPrompt, {
          temperature: options.temperature || 0.7,
          maxTokens: options.maxTokens || 2048,
          signal: this.abortController.signal,
          onTextChunk: (chunk) => {
            turnResponse += chunk;
            totalTokens++;

            if (!turnHasToolCall) {
              if (turnResponse.includes('```json') ||
                  /\n\s*\{\s*"tool"\s*:/i.test(turnResponse)) {
                turnHasToolCall = true;
              }
            }

            if (!turnHasToolCall && onToken) {
              onToken(chunk);
            }
          },
        });

        const toolCall = this._detectToolCall(turnResponse);

        if (toolCall) {
          const toolResult = await this.agentController.executeToolCall(toolCall);

          if (toolResult.success) {
            const resultText = JSON.stringify(toolResult.result, null, 2);
            currentPrompt = `Tool ${toolCall.tool} returned:\n\`\`\`json\n${resultText}\n\`\`\`\n\nNow provide a helpful response to the user based on this information.`;
            continue;
          } else {
            const errorMsg = `Tool execution failed: ${toolResult.error}`;
            if (onToken) onToken(`\n\n❌ ${errorMsg}\n`);
            fullResponse += `\n\n❌ ${errorMsg}\n`;
            break;
          }
        } else {
          fullResponse += turnResponse;
          break;
        }
      }

      return { response: fullResponse, totalTokens, aborted: false };
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        console.log('Agent generation aborted by user');
        return { response: fullResponse, totalTokens, aborted: true };
      }
      console.error('Agent generation error:', error);
      throw error;
    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }

  /**
   * レスポンスからツール呼び出しJSONを検出
   * コードフェンス（```json）と生のJSONオブジェクトの両方に対応。
   * ブレース計数でネスト構造を正しく解析する。
   * @param {string} text - LLMのレスポンステキスト
   * @returns {{ tool: string, arguments: Object }|null}
   */
  _detectToolCall(text) {
    // マークダウンのコードフェンスを除去してフラットなテキストにする
    const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '');

    let depth = 0;
    let inString = false;
    let escape = false;
    let start = -1;

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (inString) {
        if (char === '\\') escape = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (char === '}') {
        if (depth > 0) depth--;
        if (depth === 0 && start !== -1) {
          // トップレベルの } に到達 → 候補JSONとしてパース試行
          try {
            const json = JSON.parse(cleaned.substring(start, i + 1));
            if (json.tool && json.arguments !== undefined) {
              return { tool: json.tool, arguments: json.arguments };
            }
          } catch {
            // パース失敗 → 次の { から再スキャン
          }
          start = -1;
        }
      }
    }

    return null;
  }

  /**
   * 会話履歴をセッションに復元
   * @param {Array<{role: string, content: string}>} messages - DBから取得したメッセージ配列
   */
  restoreHistory(messages) {
    if (!this.session || !messages || messages.length === 0) return;

    const chatHistory = messages.map(msg => {
      if (msg.role === 'user') {
        return { type: 'user', text: msg.content };
      } else {
        return { type: 'model', response: [msg.content] };
      }
    });

    try {
      this.session.setChatHistory(chatHistory);
      console.log(`Restored chat history: ${chatHistory.length} messages`);
    } catch (error) {
      console.warn('setChatHistory failed:', error.message);
    }
  }

  /**
   * エージェント有効状態を取得
   */
  isAgentEnabled() {
    return this.agentEnabled;
  }

  /**
   * システムプロンプトを設定（セッション再作成が必要）
   * @param {string} systemPrompt - 新しいシステムプロンプト
   */
  async setSystemPrompt(systemPrompt) {
    this.currentSystemPrompt = systemPrompt || 'You are a helpful assistant.';

    // セッションが存在する場合は、コンテキストとセッションを再作成
    // （システムプロンプト変更は会話履歴のクリアを伴う）
    if (this.session && this.context && this.model) {
      console.log('Recreating context and session with new system prompt');

      // 古いコンテキストをdispose
      await this.context.dispose();

      // 新しいコンテキストを作成
      this.context = await this.model.createContext({
        contextSize: 4096,
      });

      // 新しいコンテキストシーケンスを取得
      this.contextSequence = this.context.getSequence();

      // 新しいセッションを作成
      this.session = new llamaModule.LlamaChatSession({
        contextSequence: this.contextSequence,
        systemPrompt: this.currentSystemPrompt,
      });
    }
  }

  /**
   * 現在のシステムプロンプトを取得
   */
  getCurrentSystemPrompt() {
    return this.currentSystemPrompt;
  }
}

module.exports = LlamaManager;
