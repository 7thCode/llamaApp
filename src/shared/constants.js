/**
 * アプリケーション全体で使用する定数
 */

const path = require('path');
const os = require('os');

// アプリケーション名
const APP_NAME = 'Llamaapp';

// モデル保存ディレクトリ
const MODELS_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  APP_NAME,
  'models'
);

// データベース保存ディレクトリ
const DB_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  APP_NAME
);

// データベースファイルパス
const DB_PATH = path.join(DB_DIR, 'conversations.db');

// RAG用データベースファイルパス
const RAG_DB_PATH = path.join(DB_DIR, 'rag.db');

// IPC チャンネル名
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

  // モデルダウンロード
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_LIST: 'download:list',
  DOWNLOAD_PRESET_MODELS: 'download:preset-models',
  DOWNLOAD_PROGRESS: 'download:progress',
  DOWNLOAD_COMPLETE: 'download:complete',
  DOWNLOAD_ERROR: 'download:error',

  // 会話管理
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_LOAD: 'conversation:load',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_DELETE: 'conversation:delete',

  // RAG管理
  RAG_ADD_URL: 'rag:addUrl',
  RAG_REMOVE_URL: 'rag:removeUrl',
  RAG_LIST_URLS: 'rag:listUrls',
  RAG_INDEX_URL: 'rag:indexUrl',
  RAG_SEARCH: 'rag:search',
  RAG_TOGGLE: 'rag:toggle',
  RAG_GET_STATUS: 'rag:getStatus',
  RAG_INDEX_PROGRESS: 'rag:indexProgress',
  RAG_INDEX_COMPLETE: 'rag:indexComplete',
  RAG_INDEX_ERROR: 'rag:indexError',
};

// デフォルト設定
const DEFAULT_SETTINGS = {
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: 'You are a helpful assistant.',
};

module.exports = {
  APP_NAME,
  MODELS_DIR,
  DB_DIR,
  DB_PATH,
  RAG_DB_PATH,
  IPC_CHANNELS,
  DEFAULT_SETTINGS,
};
