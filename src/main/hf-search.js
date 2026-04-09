/**
 * HuggingFace Hub API 検索モジュール
 * GGUFモデルをキーワード・ライセンス・サイズ等の条件で検索する
 */

const HF_API_BASE = 'https://huggingface.co/api';

// Q4_K_M を優先、なければ他の量子化も許容
const PREFERRED_QUANTS = ['Q4_K_M', 'Q4_K_S', 'Q5_K_M', 'Q5_K_S', 'Q4_0', 'Q8_0'];

/**
 * GGUFファイル名から量子化タイプを抽出
 * @param {string} filename
 * @returns {string|null}
 */
function extractQuantization(filename) {
  const match = filename.match(/[\-_](Q\d[\w]+|IQ\d[\w]+|BF16|F16|F32)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * siblingsから最適なGGUFファイルを選択
 * 優先順位: Q4_K_M > Q4_K_S > Q5_K_M > ... > その他
 * @param {Array} siblings - HF APIのsiblingsフィールド
 * @returns {{ filename: string, quantization: string }|null}
 */
function selectBestGgufFile(siblings) {
  if (!siblings || siblings.length === 0) return null;

  const ggufFiles = siblings
    .map(s => s.rfilename)
    .filter(f => f.endsWith('.gguf') && !f.includes('/') && !f.startsWith('mmproj'));

  if (ggufFiles.length === 0) return null;

  // 優先量子化順に探す
  for (const quant of PREFERRED_QUANTS) {
    const found = ggufFiles.find(f => f.toUpperCase().includes(quant));
    if (found) {
      return { filename: found, quantization: quant };
    }
  }

  // フォールバック: 最初のGGUFファイル
  const first = ggufFiles[0];
  return { filename: first, quantization: extractQuantization(first) || 'UNKNOWN' };
}

/**
 * ライセンスタグからライセンス名と商用利用可否を判定
 * @param {string[]} tags
 * @returns {{ license: string, commercial: boolean, licenseUrl: string }}
 */
function parseLicenseFromTags(tags) {
  const licenseTag = (tags || []).find(t => t.startsWith('license:'));
  if (!licenseTag) {
    return { license: 'Unknown', commercial: false, licenseUrl: '' };
  }

  const licenseId = licenseTag.replace('license:', '');

  const COMMERCIAL_LICENSES = [
    'apache-2.0', 'mit', 'bsd-2-clause', 'bsd-3-clause',
    'cc-by-4.0', 'cc-by-sa-4.0', 'openrail', 'openrail++',
    'llama3', 'gemma', 'cc0-1.0', 'wtfpl', 'unlicense',
  ];

  const LICENSE_NAMES = {
    'apache-2.0': 'Apache 2.0',
    'mit': 'MIT',
    'bsd-2-clause': 'BSD 2-Clause',
    'bsd-3-clause': 'BSD 3-Clause',
    'cc-by-4.0': 'CC BY 4.0',
    'cc-by-sa-4.0': 'CC BY-SA 4.0',
    'openrail': 'OpenRAIL',
    'openrail++': 'OpenRAIL++',
    'llama3': 'Llama 3 Community License',
    'llama3.1': 'Llama 3.1 Community License',
    'llama3.2': 'Llama 3.2 Community License',
    'gemma': 'Gemma License',
    'cc0-1.0': 'CC0 1.0',
    'other': 'Other',
  };

  const LICENSE_URLS = {
    'apache-2.0': 'https://choosealicense.com/licenses/apache-2.0/',
    'mit': 'https://choosealicense.com/licenses/mit/',
    'bsd-2-clause': 'https://choosealicense.com/licenses/bsd-2-clause/',
    'bsd-3-clause': 'https://choosealicense.com/licenses/bsd-3-clause/',
    'cc-by-4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'cc-by-sa-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'gemma': 'https://ai.google.dev/gemma/terms',
  };

  const commercial = COMMERCIAL_LICENSES.some(l => licenseId.toLowerCase().includes(l));
  const license = LICENSE_NAMES[licenseId] || licenseId.toUpperCase();
  const licenseUrl = LICENSE_URLS[licenseId] || `https://huggingface.co/models?license=${licenseId}`;

  return { license, commercial, licenseUrl };
}

/**
 * HF APIレスポンスをアプリのモデル形式に変換
 * @param {Object} hfModel
 * @returns {Object|null}
 */
function convertHfModelToAppModel(hfModel) {
  const bestFile = selectBestGgufFile(hfModel.siblings);
  if (!bestFile) return null;

  const { license, commercial, licenseUrl } = parseLicenseFromTags(hfModel.tags || []);

  const downloadUrl = `https://huggingface.co/${hfModel.id}/resolve/main/${bestFile.filename}`;

  // タグからタスクやキーワードを抽出してアプリのtags配列を構築
  const appTags = [];
  const tagStr = (hfModel.tags || []).join(' ').toLowerCase();
  if (tagStr.includes('instruct') || tagStr.includes('chat')) appTags.push('instruct');
  if (tagStr.includes('code') || tagStr.includes('coder')) appTags.push('code');
  if (tagStr.includes('japanese') || tagStr.includes('ja')) appTags.push('japanese');
  if (tagStr.includes('multilingual')) appTags.push('multilingual');
  if (tagStr.includes('reasoning') || tagStr.includes('thinking')) appTags.push('reasoning');
  if (tagStr.includes('vision') || tagStr.includes('image-text')) appTags.push('vision');
  if (tagStr.includes('moe') || tagStr.includes('mixture')) appTags.push('moe');

  return {
    id: hfModel.id.replace('/', '_').toLowerCase(),
    hfId: hfModel.id,
    name: hfModel.id.split('/').pop(),
    author: hfModel.author || hfModel.id.split('/')[0],
    size: 0, // HF APIからは直接取得できないため0
    memoryRequired: 0,
    quantization: bestFile.quantization,
    license,
    licenseUrl,
    commercial,
    downloadUrl,
    tags: appTags,
    description: `${hfModel.id} — ダウンロード数: ${(hfModel.downloads || 0).toLocaleString()}, Likes: ${(hfModel.likes || 0).toLocaleString()}`,
    downloads: hfModel.downloads || 0,
    likes: hfModel.likes || 0,
    lastModified: hfModel.lastModified,
    // ソースをHF検索とマーク
    source: 'huggingface',
  };
}

/**
 * HuggingFace HubからGGUFモデルを検索
 * @param {Object} options
 * @param {string} [options.search=''] - キーワード検索（例: 'llama', 'qwen japanese'）
 * @param {'downloads'|'likes'|'trending'|'lastModified'} [options.sort='downloads'] - ソート順
 * @param {number} [options.limit=30] - 取得件数 (最大100)
 * @param {boolean|null} [options.commercialOnly=null] - trueの場合、商用ライセンスのみ
 * @param {string} [options.author=''] - 特定の作者でフィルタ（例: 'bartowski', 'unsloth'）
 * @param {string} [options.hfToken=''] - HuggingFace APIトークン
 * @returns {Promise<Object[]>}
 */
async function searchHuggingFaceModels(options = {}) {
  const {
    search = '',
    sort = 'downloads',
    limit = 30,
    author = '',
    hfToken = '',
  } = options;

  // GGUFリポジトリを取得するために必要以上のモデルを取得しておく
  // (full=trueでsiblingsが含まれ、GGUFファイル有無で絞り込むため多めに取得)
  const fetchLimit = Math.min(limit * 3, 100);

  // HF API URL構築
  const url = new URL(`${HF_API_BASE}/models`);
  url.searchParams.set('sort', sort);
  url.searchParams.set('limit', String(fetchLimit));
  url.searchParams.set('full', 'true'); // siblingsを取得するため必須

  // GGUF専用リポジトリを対象にするため、searchに「GGUF」を付加
  const searchQuery = search ? `${search} GGUF` : 'GGUF';
  url.searchParams.set('search', searchQuery);

  if (author) url.searchParams.set('author', author);

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'llamaApp/1.0',
  };
  if (hfToken) {
    headers['Authorization'] = `Bearer ${hfToken}`;
  }

  console.log('[HF Search] Fetching:', url.toString());

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HuggingFace API error ${response.status}: ${errorText}`);
  }

  const hfModels = await response.json();

  console.log(`[HF Search] Got ${hfModels.length} models from API`);

  // アプリ形式に変換し、GGUFファイルが存在するものだけ返す
  const converted = hfModels
    .map(convertHfModelToAppModel)
    .filter(m => m !== null)
    .slice(0, limit); // limitに制限

  // 商用ライセンスフィルタ（タグベースで判定後に適用可能）
  const { commercialOnly } = options;
  if (commercialOnly === true) {
    return converted.filter(m => m.commercial === true);
  }

  console.log(`[HF Search] Returning ${converted.length} GGUF models`);
  return converted;
}

module.exports = {
  searchHuggingFaceModels,
};
