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
    this.session = null;
    this.currentModelPath = null;
    this.isGenerating = false;
    this.initialized = false;

    // Agent機能
    this.agentController = null;
    this.agentEnabled = false;
  }

  /**
   * node-llama-cppモジュールを初期化
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // 動的インポートでES Moduleを読み込む
      llamaModule = await import('node-llama-cpp');
      // getLlama()でLlamaインスタンスを取得
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

      // セッション作成 (新API: contextSequence使用)
      this.session = new llamaModule.LlamaChatSession({
        contextSequence: this.context.getSequence(),
      });

      this.currentModelPath = modelPath;

      return {
        success: true,
        modelPath: path.basename(modelPath),
      };
    } catch (error) {
      console.error('Failed to load model:', error);
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

      // モデルをdisposeすると、関連するcontextも自動的にdisposeされる
      if (this.model) {
        await this.model.dispose();
        this.model = null;
        console.log('Model disposed');
      }

      // 念のためcontextもクリア
      if (this.context) {
        this.context = null;
      }

      this.currentModelPath = null;
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

    try {
      this.isGenerating = true;
      let totalTokens = 0;
      let fullResponse = '';

      // 新API: onTextChunkコールバック使用
      const response = await this.session.prompt(prompt, {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 2048,
        onTextChunk: (chunk) => {
          fullResponse += chunk;
          totalTokens++;

          if (onToken) {
            onToken(chunk);
          }
        },
      });

      // レスポンスの確定
      const finalResponse = fullResponse || response || '';

      this.isGenerating = false;
      return {
        response: finalResponse,
        totalTokens: totalTokens || 1,
      };
    } catch (error) {
      console.error('Generation error:', error);
      this.isGenerating = false;
      throw error;
    }
  }

  /**
   * 生成を停止
   */
  stopGeneration() {
    // node-llama-cppは現在ストリーミング中断をサポートしていない
    // 将来的な実装のためのプレースホルダー
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
- Allowed directories: ~/Documents, ~/Desktop, ~/Downloads
- Examples:
  * "ドキュメントフォルダ" or "Documents folder" → Use path: "~/Documents"
  * "デスクトップ" or "Desktop" → Use path: "~/Desktop"
  * "ダウンロード" or "Downloads" → Use path: "~/Downloads"
- NEVER use paths like "/Users/.../Documents" or "Documents" - ALWAYS use "~/Documents"

${toolsDescription}

Remember: ALWAYS use ~/Documents, ~/Desktop, or ~/Downloads for paths!`;
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

    try {
      this.isGenerating = true;

      let fullResponse = '';
      let totalTokens = 0;
      const maxTurns = 5; // 最大ツール呼び出し回数
      let turn = 0;

      // 初回プロンプト
      let currentPrompt = prompt;

      while (turn < maxTurns) {
        turn++;
        let turnResponse = '';
        let turnHasToolCall = false;

        // LLM推論実行
        await this.session.prompt(currentPrompt, {
          temperature: options.temperature || 0.7,
          maxTokens: options.maxTokens || 2048,
          onTextChunk: (chunk) => {
            turnResponse += chunk;
            totalTokens++;

            // ツール呼び出し検出（このターン中に一度でも検出されたらフラグを立てる）
            const toolCall = this._detectToolCall(turnResponse);
            if (toolCall) {
              turnHasToolCall = true;
            }

            // ツール呼び出しを含むターンではストリーミングしない
            // （ツール実行後の次のターンでのみストリーミング）
            if (!turnHasToolCall && onToken) {
              onToken(chunk);
            }
          },
        });

        // ツール呼び出しチェック
        const toolCall = this._detectToolCall(turnResponse);

        if (toolCall) {
          // ツールを実行
          console.log('Executing tool:', toolCall);
          const toolResult = await this.agentController.executeToolCall(toolCall);

          if (toolResult.success) {
            // ツール結果をLLMに渡す
            const resultText = JSON.stringify(toolResult.result, null, 2);
            currentPrompt = `Tool ${toolCall.tool} returned:\n\`\`\`json\n${resultText}\n\`\`\`\n\nNow provide a helpful response to the user based on this information.`;

            // 次のターンへ
            continue;
          } else {
            // ツール実行失敗
            const errorMsg = `Tool execution failed: ${toolResult.error}`;
            if (onToken) {
              onToken(`\n\n❌ ${errorMsg}\n`);
            }
            fullResponse += `\n\n❌ ${errorMsg}\n`;
            break;
          }
        } else {
          // ツール呼び出しなし = 通常の応答
          fullResponse += turnResponse;
          break;
        }
      }

      this.isGenerating = false;
      return {
        response: fullResponse,
        totalTokens,
      };
    } catch (error) {
      console.error('Agent generation error:', error);
      this.isGenerating = false;
      throw error;
    }
  }

  /**
   * レスポンスからツール呼び出しJSONを検出
   * @param {string} text - LLMのレスポンステキスト
   * @returns {Object|null} - { tool: string, arguments: Object } または null
   */
  _detectToolCall(text) {
    console.log('_detectToolCall called with text length:', text.length);
    console.log('Text content:', text.substring(0, 200));

    // JSONコードブロック内のツール呼び出しを検出
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);

    if (jsonMatch) {
      console.log('Found JSON code block');
      try {
        const json = JSON.parse(jsonMatch[1]);
        if (json.tool && json.arguments) {
          console.log('Tool call detected from code block:', json);
          return {
            tool: json.tool,
            arguments: json.arguments
          };
        }
      } catch (error) {
        console.error('Failed to parse tool call JSON:', error);
      }
    }

    // 直接のJSONオブジェクト検出（コードブロックなし）
    try {
      const lines = text.split('\n');
      console.log('Checking direct JSON, line count:', lines.length);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.includes('"tool"')) {
          console.log('Found potential tool call JSON at line', i);
          // 複数行にまたがる可能性があるので、続きを読む
          let jsonText = line;
          for (let j = i + 1; j < lines.length && !jsonText.includes('}'); j++) {
            jsonText += '\n' + lines[j];
          }

          console.log('Attempting to parse:', jsonText);
          const json = JSON.parse(jsonText);
          if (json.tool && json.arguments) {
            console.log('Tool call detected from direct JSON:', json);
            return {
              tool: json.tool,
              arguments: json.arguments
            };
          }
        }
      }
    } catch (error) {
      console.error('Direct JSON parse error:', error);
    }

    console.log('No tool call detected');
    return null;
  }

  /**
   * エージェント有効状態を取得
   */
  isAgentEnabled() {
    return this.agentEnabled;
  }
}

module.exports = LlamaManager;
