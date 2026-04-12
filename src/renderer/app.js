/**
 * レンダラープロセス - UIロジック
 */

// マークダウンユーティリティのインポート
// markdown.jsはHTMLファイル内でscriptタグで読み込まれているため、
// markdownToHtml関数がグローバルに利用可能

// UI要素の取得
const modelSelect = document.getElementById('model-select');
const addModelBtn = document.getElementById('add-model-btn');
const modelStoreBtn = document.getElementById('model-store-btn');
const settingsBtn = document.getElementById('settings-btn');
const agentBtn = document.getElementById('agent-btn');
const ragBtn = document.getElementById('rag-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const inputStatus = document.getElementById('input-status');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// 状態管理
let currentModel = null;
let isGenerating = false;
let currentConversationId = null;
let streamingMessage = null;
let streamingContent = ''; // ストリーミング中のマークダウンコンテンツを蓄積
let renderPending = false;  // RAFによるレンダリング待機フラグ
let agentEnabled = false;
let currentSettings = {
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 2048,
};

/**
 * 初期化
 */
async function initialize() {
  console.log('Initializing app...');

  // イベントリスナー設定
  setupEventListeners();

  // 設定を読み込み
  await loadSettings();

  // モデルストア初期化
  await modelStore.initialize();

  // Agent状態を読み込み
  await loadAgentStatus();

  // サイドバー初期化（会話一覧）
  await window.sidebar.initialize({
    onSelect: handleConversationSelect,
    onDelete: handleConversationDelete,
    onCreate: handleNewConversation,
  });

  // 会話を読み込み（最新or新規作成）
  await loadInitialConversation();

  // モデル一覧をロード
  await loadModels();

  console.log('App initialized');
}

/**
 * イベントリスナー設定
 */
function setupEventListeners() {
  // モデル選択
  modelSelect.addEventListener('change', handleModelChange);

  // モデル追加
  addModelBtn.addEventListener('click', handleAddModel);

  // モデルストア
  modelStoreBtn.addEventListener('click', handleModelStore);

  // Agentトグル
  agentBtn.addEventListener('click', handleAgentToggle);

  // 送信ボタン（生成中は停止ボタンとして機能）
  sendBtn.addEventListener('click', () => {
    if (isGenerating) {
      handleStop();
    } else {
      handleSend();
    }
  });

  // Cmd+Enter (macOS) / Ctrl+Enter (Windows) で送信、Enterは改行
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  });

  // 入力欄の自動リサイズ
  chatInput.addEventListener('input', autoResizeTextarea);

  // IPCイベントリスナー
  window.llamaAPI.onToken(handleToken);
  window.llamaAPI.onDone(handleDone);
  window.llamaAPI.onError(handleError);

  // Agent IPCイベントリスナー
  window.llamaAPI.onToolStart(handleToolStart);
  window.llamaAPI.onToolComplete(handleToolComplete);
  window.llamaAPI.onToolError(handleToolError);

  // テーマ切り替えボタン
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', handleThemeToggle);
  }
}

/**
 * テーマ切り替え処理
 */
async function handleThemeToggle() {
  const newTheme = currentSettings.theme === 'light' ? 'dark' : 'light';
  currentSettings.theme = newTheme;
  applyTheme(newTheme);
  
  try {
    await window.electronAPI.settings.save(currentSettings);
  } catch (error) {
    console.error('Failed to save theme setting:', error);
  }
}

/**
 * テーマ適用
 */
function applyTheme(theme) {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (theme === 'light') {
    document.body.classList.add('theme-light');
    if (themeBtn) themeBtn.textContent = '🌙';
  } else {
    document.body.classList.remove('theme-light');
    if (themeBtn) themeBtn.textContent = '☀️';
  }
}

/**
 * モデル一覧をロード
 */
async function loadModels() {
  try {
    showLoading('モデルを読み込み中...');

    const result = await window.llamaAPI.listModels();
    const { models, currentModel: current } = result;

    modelSelect.innerHTML = '';

    if (models.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'モデルがありません（+ で追加）';
      modelSelect.appendChild(option);
      modelSelect.disabled = true;
      chatInput.disabled = true;
      sendBtn.disabled = true;
      setStatus('モデルを追加してください', 'error');
    } else {
      // 空の選択肢を追加
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'モデルを選択してください...';
      modelSelect.appendChild(emptyOption);

      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.path;
        option.textContent = `${model.name} (${model.sizeFormatted})`;
        modelSelect.appendChild(option);
      });

      if (current && current.loaded) {
        modelSelect.value = current.path;
        currentModel = current;
        enableChat();
        setStatus(`モデル読み込み済み: ${current.name}`, 'success');
        hideWelcomeMessage();
      } else {
        modelSelect.disabled = false;
        chatInput.disabled = true;
        sendBtn.disabled = true;
        setStatus('モデルを選択してください');
      }
    }

    hideLoading();
  } catch (error) {
    console.error('Failed to load models:', error);
    hideLoading();
    setStatus('モデルの読み込みに失敗しました', 'error');
  }
}

/**
 * モデル変更ハンドラー
 */
async function handleModelChange() {
  const modelPath = modelSelect.value;
  if (!modelPath) return;

  try {
    showLoading('モデルを読み込み中...');
    modelSelect.disabled = true;

    const result = await window.llamaAPI.switchModel(modelPath);

    if (result.success) {
      currentModel = result;
      enableChat();
      setStatus(`モデル読み込み完了: ${result.modelPath}`, 'success');
      hideWelcomeMessage();
    }

    hideLoading();
    modelSelect.disabled = false;
  } catch (error) {
    console.error('Failed to switch model:', error);
    hideLoading();
    modelSelect.disabled = false;
    setStatus('モデルの読み込みに失敗しました: ' + error.message, 'error');
  }
}

/**
 * モデルストアを開く
 */
function handleModelStore() {
  modelStore.show();
}

/**
 * モデル追加ハンドラー
 */
async function handleAddModel() {
  try {
    const result = await window.llamaAPI.addModel();

    if (result.canceled) {
      return;
    }

    if (result.success) {
      setStatus(`モデルを追加しました: ${result.model.name}`, 'success');
      await loadModels();
    }
  } catch (error) {
    console.error('Failed to add model:', error);
    setStatus('モデルの追加に失敗しました: ' + error.message, 'error');
  }
}

/**
 * 送信ハンドラー
 */
async function handleSend() {
  const message = chatInput.value.trim();
  if (!message || isGenerating) return;

  try {
    // ユーザーメッセージを表示
    addMessage('user', message);
    chatInput.value = '';
    autoResizeTextarea();

    // UI状態更新（送信ボタンを停止ボタンに切り替え）
    isGenerating = true;
    chatInput.disabled = true;
    sendBtn.disabled = false;
    sendBtn.classList.add('stop-mode');
    sendBtn.querySelector('span').textContent = '⏹ 停止';
    setStatus('生成中...');

    // ストリーミング用の状態をリセット
    streamingContent = '';

    // アシスタントメッセージを準備
    streamingMessage = addMessage('assistant', '', true);

    // 生成開始（設定からシステムプロンプトを取得）
    const systemPrompt = currentSettings.systemPrompt || null;
    const temperature = currentSettings.temperature !== undefined ? currentSettings.temperature : 0.7;
    const maxTokens = currentSettings.maxTokens || 2048;
    await window.llamaAPI.generate(message, systemPrompt, currentConversationId, temperature, maxTokens);
  } catch (error) {
    console.error('Generation failed:', error);
    setStatus('生成に失敗しました: ' + error.message, 'error');
    finishGeneration();
  }
}

/**
 * トークン受信ハンドラー
 * RAFでスロットルしてDOMスラッシングを防ぐ
 */
function handleToken(data) {
  if (data.conversationId !== currentConversationId) return;
  if (!streamingMessage) return;

  streamingContent += data.token;

  // まだ描画待ちでなければ次のアニメーションフレームで描画をスケジュール
  if (!renderPending) {
    renderPending = true;
    requestAnimationFrame(renderStreamingContent);
  }
}

/**
 * ストリーミング中の差分レンダリング（RAF経由で呼び出し）
 */
function renderStreamingContent() {
  renderPending = false;
  if (!streamingMessage) return;

  const textEl = streamingMessage.querySelector('.message-text');
  textEl.innerHTML = renderStreamingMarkdown(streamingContent);
  scrollToBottom();
}

/**
 * 生成完了ハンドラー
 */
function handleDone(data) {
  if (data.conversationId !== currentConversationId) return;

  console.log('Generation done. Total tokens:', data.totalTokens);

  if (streamingMessage) {
    const textEl = streamingMessage.querySelector('.message-text');
    // 最終クリーンレンダリング（未完結ブロックの補正なしで完全なmarkdownを表示）
    textEl.innerHTML = markdownToHtml(streamingContent);
    textEl.classList.remove('streaming');
    addCopyButtons(textEl);
  }

  finishGeneration();
  setStatus(`生成完了 (${data.totalTokens} トークン)`, 'success');

  // サイドバーを更新（タイトル自動生成の反映）
  window.sidebar.refresh();
}

/**
 * エラーハンドラー
 */
function handleError(data) {
  if (data.conversationId !== currentConversationId) return;

  console.error('Generation error:', data.error);

  // エラー時も最終クリーンレンダリング（streaming クラスと未完結ブロックを除去）
  if (streamingMessage) {
    const textEl = streamingMessage.querySelector('.message-text');
    textEl.innerHTML = markdownToHtml(streamingContent);
    textEl.classList.remove('streaming');
    addCopyButtons(textEl);
  }

  setStatus('エラー: ' + data.error, 'error');
  finishGeneration();
}

/**
 * 生成停止ハンドラー
 */
async function handleStop() {
  try {
    await window.llamaAPI.stop();
  } catch (error) {
    console.error('Failed to stop generation:', error);
  }
}

/**
 * 生成完了処理
 */
function finishGeneration() {
  isGenerating = false;
  renderPending = false;
  chatInput.disabled = false;
  sendBtn.disabled = false;
  sendBtn.classList.remove('stop-mode');
  sendBtn.querySelector('span').textContent = '送信';
  chatInput.focus();
  streamingMessage = null;
  streamingContent = '';
}

/**
 * メッセージを追加
 */
function addMessage(role, content, streaming = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  const roleDiv = document.createElement('div');
  roleDiv.className = 'message-role';
  roleDiv.textContent = role === 'user' ? 'あなた' : 'AI';

  const textDiv = document.createElement('div');
  textDiv.className = 'message-text' + (streaming ? ' streaming' : '');

  // AI応答にはマークダウンレンダリングを適用
  if (role === 'assistant' && content) {
    textDiv.innerHTML = markdownToHtml(content);
    addCopyButtons(textDiv);
  } else {
    textDiv.textContent = content;
  }

  contentDiv.appendChild(roleDiv);
  contentDiv.appendChild(textDiv);

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);

  chatMessages.appendChild(messageDiv);
  scrollToBottom();

  return messageDiv;
}

/**
 * ウェルカムメッセージを非表示
 */
function hideWelcomeMessage() {
  const welcome = chatMessages.querySelector('.welcome-message');
  if (welcome) {
    welcome.remove();
  }
}

/**
 * チャット入力を有効化
 */
function enableChat() {
  chatInput.disabled = false;
  sendBtn.disabled = false;
  chatInput.focus();
}

/**
 * ステータス表示
 */
function setStatus(message, type = '') {
  inputStatus.textContent = message;
  inputStatus.className = 'input-status' + (type ? ' ' + type : '');
}

/**
 * ローディング表示
 */
function showLoading(message = '処理中...') {
  loadingText.textContent = message;
  loadingOverlay.classList.remove('hidden');
}

/**
 * ローディング非表示
 */
function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

/**
 * チャット最下部にスクロール
 */
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * テキストエリアの自動リサイズ
 */
function autoResizeTextarea() {
  chatInput.style.height = 'auto';
  chatInput.style.height = chatInput.scrollHeight + 'px';
}

/**
 * 設定をロード
 */
async function loadSettings() {
  try {
    const settings = await window.electronAPI.settings.load();
    currentSettings = settings;
    console.log('Settings loaded:', currentSettings);
  } catch (error) {
    console.error('Failed to load settings:', error);
    // エラーの場合はデフォルト設定を使用
    currentSettings = {
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 2048,
      theme: 'dark'
    };
  }
  
  // テーマを適用
  applyTheme(currentSettings.theme || 'dark');
}

/**
 * 起動時の初期会話をセット（最新orを新規作成）
 */
async function loadInitialConversation() {
  try {
    const conversations = await window.llamaAPI.listConversations();
    if (conversations.length > 0) {
      await handleConversationSelect(conversations[0].id);
    } else {
      await handleNewConversation();
    }
  } catch (error) {
    console.error('Failed to load initial conversation:', error);
    // フォールバック: IDなしで動作継続
    currentConversationId = 'default';
  }
}

/**
 * 会話を選択（履歴をUI + LLMセッションに復元）
 * @param {string} id
 */
async function handleConversationSelect(id) {
  if (id === currentConversationId) return;

  currentConversationId = id;
  window.sidebar.setActive(id);

  // チャットをクリア
  chatMessages.innerHTML = '';

  try {
    const result = await window.llamaAPI.loadConversation(id);
    if (result && result.messages.length > 0) {
      result.messages.forEach(msg => addMessage(msg.role, msg.content));
    }
  } catch (error) {
    console.error('Failed to load conversation:', error);
  }
}

/**
 * 新しい会話を作成
 */
async function handleNewConversation() {
  try {
    const conv = await window.llamaAPI.createConversation();
    currentConversationId = conv.id;
    chatMessages.innerHTML = '';
    await window.sidebar.refresh();
    window.sidebar.setActive(conv.id);
  } catch (error) {
    console.error('Failed to create conversation:', error);
  }
}

/**
 * 会話を削除
 * @param {string} id
 */
async function handleConversationDelete(id) {
  const wasActive = id === currentConversationId;
  try {
    await window.llamaAPI.deleteConversation(id);
    await window.sidebar.refresh();

    if (wasActive) {
      const conversations = await window.llamaAPI.listConversations();
      if (conversations.length > 0) {
        await handleConversationSelect(conversations[0].id);
      } else {
        await handleNewConversation();
      }
    }
  } catch (error) {
    console.error('Failed to delete conversation:', error);
  }
}

/**
 * Agent状態をロード
 */
async function loadAgentStatus() {
  try {
    const status = await window.llamaAPI.getAgentStatus();
    agentEnabled = status.enabled;
    updateAgentButton();
  } catch (error) {
    console.error('Failed to load agent status:', error);
    agentEnabled = false;
    updateAgentButton();
  }
}

/**
 * Agentトグルハンドラー
 */
async function handleAgentToggle() {
  try {
    const newStatus = !agentEnabled;
    const result = await window.llamaAPI.toggleAgent(newStatus);

    if (result.enabled !== undefined) {
      agentEnabled = result.enabled;
      updateAgentButton();

      const statusMsg = agentEnabled
        ? 'Agent機能を有効にしました'
        : 'Agent機能を無効にしました';
      setStatus(statusMsg, 'success');
    }
  } catch (error) {
    console.error('Failed to toggle agent:', error);
    setStatus('Agent機能の切り替えに失敗しました', 'error');
  }
}

/**
 * Agentボタンの表示を更新
 */
function updateAgentButton() {
  if (agentEnabled) {
    agentBtn.classList.add('active');
    agentBtn.title = 'Agent (有効) - クリックで無効化';
  } else {
    agentBtn.classList.remove('active');
    agentBtn.title = 'Agent (無効) - クリックで有効化';
  }
}

/**
 * ツール実行開始ハンドラー
 */
function handleToolStart(data) {
  console.log('Tool started:', data);
  if (window.agentIndicator) {
    window.agentIndicator.show(data.tool, data.arguments);
  }
}

/**
 * ツール実行完了ハンドラー
 */
function handleToolComplete(data) {
  console.log('Tool completed:', data);
  if (window.agentIndicator) {
    window.agentIndicator.complete(data.tool, data.result);
  }
}

/**
 * ツール実行エラーハンドラー
 */
function handleToolError(data) {
  console.error('Tool error:', data);
  if (window.agentIndicator) {
    window.agentIndicator.error(data.tool, data.error);
  }
}

// アプリ初期化
document.addEventListener('DOMContentLoaded', initialize);
