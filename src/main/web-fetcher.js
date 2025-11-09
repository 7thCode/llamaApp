/**
 * ウェブページフェッチャー
 * HTMLを取得してクリーンなテキストに変換
 */

const https = require('https');
const http = require('http');
const { parse } = require('node-html-parser');

class WebFetcher {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000; // 30秒
    this.userAgent = options.userAgent || 'LlamaApp/1.0';
  }

  /**
   * URLからHTMLを取得
   * @param {string} url - 取得するURL
   * @returns {Promise<string>} HTML文字列
   */
  async fetchHtml(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: this.timeout,
      };

      const req = protocol.request(options, (res) => {
        // リダイレクト処理
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchHtml(res.headers.location)
            .then(resolve)
            .catch(reject);
        }

        // エラーステータスコード
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          return;
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout fetching ${url}`));
      });

      req.end();
    });
  }

  /**
   * HTMLをクリーンなテキストに変換
   * @param {string} html - HTML文字列
   * @returns {object} {title, text}
   */
  extractText(html) {
    const root = parse(html);

    // 不要な要素を削除
    root.querySelectorAll('script, style, nav, footer, header, iframe, noscript').forEach(el => el.remove());

    // タイトル取得
    const titleEl = root.querySelector('title');
    const h1El = root.querySelector('h1');
    const title = (titleEl?.text || h1El?.text || 'Untitled').trim();

    // メインコンテンツを優先的に抽出
    let text = '';
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content'];

    for (const selector of mainSelectors) {
      const mainContent = root.querySelector(selector);
      if (mainContent) {
        text = mainContent.text;
        break;
      }
    }

    // メインコンテンツが見つからない場合はbody全体
    if (!text) {
      const body = root.querySelector('body');
      text = body ? body.text : root.text;
    }

    // テキストのクリーンアップ
    text = text
      .replace(/\s+/g, ' ') // 連続する空白を1つに
      .replace(/\n+/g, '\n') // 連続する改行を1つに
      .trim();

    return { title, text };
  }

  /**
   * URLを取得してテキスト化
   * @param {string} url - 取得するURL
   * @returns {Promise<object>} {title, text}
   */
  async fetchAndExtract(url) {
    try {
      const html = await this.fetchHtml(url);
      const result = this.extractText(html);
      return result;
    } catch (error) {
      throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
  }

  /**
   * URLの妥当性をチェック
   * @param {string} url - チェックするURL
   * @returns {boolean} 妥当性
   */
  isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

module.exports = WebFetcher;
