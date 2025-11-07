/**
 * プリロードスクリプト
 * セキュアなAPIをレンダラープロセスに公開
 */

const { contextBridge, ipcRenderer } = require('electron');

// IPC チャンネル名（constants.jsから直接コピー）
const IPC_CHANNELS = {
  // Llama操作
  LLAMA_GENERATE: 'llama:generate',
  LLAMA_STOP: 'llama:stop',
  LLAMA_TOKEN: 'llama:token',
  LLAMA_DONE: 'llama:done',
  LLAMA_ERROR: 'llama:error',

  // モデル管理
  MODEL_LIST: 'model:list',
  MODEL_SWITCH: 'model:switch',
  MODEL_ADD: 'model:add',
  MODEL_DELETE: 'model:delete',

  // 会話管理
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_LOAD: 'conversation:load',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_DELETE: 'conversation:delete',
};

// セキュアなAPIをwindow.llamaAPIとして公開
contextBridge.exposeInMainWorld('llamaAPI', {
  // Llama操作
  generate: (prompt, systemPrompt, conversationId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLAMA_GENERATE, {
      prompt,
      systemPrompt,
      conversationId
    }),

  onToken: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.LLAMA_TOKEN, (event, data) => callback(data)),

  onDone: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.LLAMA_DONE, (event, data) => callback(data)),

  onError: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.LLAMA_ERROR, (event, data) => callback(data)),

  // モデル管理
  listModels: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_LIST),

  switchModel: (modelPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_SWITCH, { modelPath }),

  addModel: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_ADD),

  deleteModel: (modelId) =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_DELETE, { modelId }),

  // 会話管理（将来の実装用）
  listConversations: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LIST),

  loadConversation: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LOAD, { id }),

  createConversation: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CREATE),

  deleteConversation: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, { id }),
});
