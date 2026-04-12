/**
 * Llama.cpp統合マネージャー
 * node-llama-cppを使用してモデルのロードと推論を管理
 */

const path = require('path');

// node-llama-cppのES Module対応
let llamaModule = null;

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
      // 動的インポートでES Moduleを読み込む
      llamaModule = await import('node-llama-cpp');
      // getLlama()でLlamaインスタンスを取得（詳細ログ有効）
      this.llama = await llamaModule.getLlama();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize LlamaManager:', error);
      throw error;
    }
  }

  /**
   * モデルをロード
   * @param {string} modelPath - GGUFモデルファイルのパス
   */
  async loadModel(modelPath) {
    try {
      // 初期化チェック
      if (!this.initialized) {
        await this.initialize();
      }

      // 既存のモデルをアンロード
      if (this.model) {
        await this.unloadModel();
      }

      // モデルをロード (新API)
      this.model = await this.llama.loadModel({
        modelPath: modelPath,
      });

      // コンテキスト作成 (新API)
      this.context = await this.model.createContext({
        contextSize: 4096,
      });

      // コンテキストシーケンスを取得して保存
      this.contextSequence = this.context.getSequence();

      // セッション作成 (新API: contextSequence使用)
      this.session = new llamaModule.LlamaChatSession({
        contextSequence: this.contextSequence,
        systemPrompt: this.currentSystemPrompt,
      });

      this.currentModelPath = modelPath;

      return {
        success: true,
        modelPath: path.basename(modelPath),
      };
    } catch (error) {
      console.error('=== Model load error ===');
      console.error('message:', error.message);
      console.error('name:', error.name);
      console.error('cause:', error.cause);
      console.error('stack:', error.stack);
      throw error;
    }
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

You have access to the following tools to help answer user queries. To use a tool, respond with a JSON object in this exact format:
\`\`\`json
{
  "tool": "tool_name",
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
\`\`\`

**IMPORTANT RULES:**
1. Use tools when you need to access files, analyze data, or get system information
2. Always use the exact JSON format above
3. Only use one tool at a time
4. Wait for the tool result before responding to the user
5. After receiving tool results, provide a natural language response to the user

**PATH RULES - CRITICAL:**
- ALWAYS use ~ (tilde) for paths in the user's home directory
- Allowed directories: Any directory under your home folder (~)
- Examples:
  * "ドキュメントフォルダ" or "Documents folder" → Use path: "~/Documents"
  * "プロジェクト" or "Project" → Use path: "~/project"
- NEVER use paths like "/Users/.../Documents" or "Documents" - ALWAYS use "~/Documents"

${toolsDescription}

Remember: ALWAYS use ~ for paths in the home directory!`;
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
