/**
 * レンダラープロセス - UIロジック
 */

// UI要素の取得
const modelSelect = document.getElementById('model-select');
const addModelBtn = document.getElementById('add-model-btn');
const settingsBtn = document.getElementById('settings-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const inputStatus = document.getElementById('input-status');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// 状態管理
let currentModel = null;
let isGenerating = false;
let currentConversationId = 'default';
let streamingMessage = null;

/**
 * 初期化
 */
async function initialize() {
  console.log('Initializing app...');

  // イベントリスナー設定
  setupEventListeners();

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

  // 送信ボタン
  sendBtn.addEventListener('click', handleSend);

  // Enterキーで送信（Shift+Enterで改行）
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

    // UI状態更新
    isGenerating = true;
    chatInput.disabled = true;
    sendBtn.disabled = true;
    setStatus('生成中...');

    // アシスタントメッセージを準備
    streamingMessage = addMessage('assistant', '', true);

    // 生成開始
    await window.llamaAPI.generate(message, null, currentConversationId);
  } catch (error) {
    console.error('Generation failed:', error);
    setStatus('生成に失敗しました: ' + error.message, 'error');
    finishGeneration();
  }
}

/**
 * トークン受信ハンドラー
 */
function handleToken(data) {
  if (data.conversationId !== currentConversationId) return;

  if (streamingMessage) {
    const textEl = streamingMessage.querySelector('.message-text');
    textEl.textContent += data.token;
    scrollToBottom();
  }
}

/**
 * 生成完了ハンドラー
 */
function handleDone(data) {
  if (data.conversationId !== currentConversationId) return;

  console.log('Generation done. Total tokens:', data.totalTokens);

  if (streamingMessage) {
    const textEl = streamingMessage.querySelector('.message-text');
    textEl.classList.remove('streaming');
  }

  finishGeneration();
  setStatus(`生成完了 (${data.totalTokens} トークン)`, 'success');
}

/**
 * エラーハンドラー
 */
function handleError(data) {
  if (data.conversationId !== currentConversationId) return;

  console.error('Generation error:', data.error);
  setStatus('エラー: ' + data.error, 'error');
  finishGeneration();
}

/**
 * 生成完了処理
 */
function finishGeneration() {
  isGenerating = false;
  chatInput.disabled = false;
  sendBtn.disabled = false;
  chatInput.focus();
  streamingMessage = null;
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
  textDiv.textContent = content;

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

// アプリ初期化
document.addEventListener('DOMContentLoaded', initialize);
