/**
 * Markdown レンダリングユーティリティ
 * CDNから読み込んだmarked.jsとhighlight.jsを使用
 */

/**
 * マークダウンをHTMLに変換
 * @param {string} markdown - マークダウンテキスト
 * @returns {string} - サニタイズされたHTML
 */
function markdownToHtml(markdown) {
  if (!markdown) return '';

  // marked と hljs がCDNから読み込まれているか確認
  if (typeof marked === 'undefined' || typeof hljs === 'undefined') {
    console.error('marked or hljs not loaded from CDN');
    return escapeHtml(markdown);
  }

  // marked の設定
  marked.setOptions({
    highlight: function (code, lang) {
      // 言語が指定されている場合はシンタックスハイライト
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {
          console.error('Highlight error:', err);
        }
      }
      // 自動検出
      try {
        return hljs.highlightAuto(code).value;
      } catch (err) {
        console.error('Auto highlight error:', err);
        return code;
      }
    },
    breaks: true,      // 改行を<br>に変換
    gfm: true,         // GitHub Flavored Markdown
    headerIds: false,  // ヘッダーにIDを付与しない
    mangle: false,     // メールアドレスを難読化しない
  });

  try {
    // マークダウンをHTMLに変換
    const html = marked.parse(markdown);

    // 基本的なサニタイゼーション（XSS対策）
    return sanitizeHtml(html);
  } catch (error) {
    console.error('Markdown parsing error:', error);
    // エラー時はプレーンテキストとして表示
    return escapeHtml(markdown);
  }
}

/**
 * HTMLをサニタイズ（基本的なXSS対策）
 * @param {string} html - HTMLテキスト
 * @returns {string} - サニタイズされたHTML
 */
function sanitizeHtml(html) {
  // 許可するタグのホワイトリスト
  const allowedTags = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'strong', 'em', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote', 'a', 'span', 'div'
  ];

  // 危険なスクリプトタグとイベントハンドラを削除
  let sanitized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');

  return sanitized;
}

/**
 * HTMLエスケープ（フォールバック用）
 * @param {string} text - エスケープするテキスト
 * @returns {string} - エスケープされたテキスト
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * ストリーミング中のマークダウンを安全にレンダリング
 * 未完結のコードフェンスを検出し、完結済み部分のみmarkdownで描画。
 * 未完結部分はプレーンテキストとして表示する。
 * @param {string} text - 蓄積中のマークダウンテキスト
 * @returns {string} - HTML
 */
function renderStreamingMarkdown(text) {
  if (!text) return '';

  // コードフェンスの数を数えて開きっぱなしかどうか判定
  const fences = text.match(/```/g);
  const isInsideCodeBlock = fences && fences.length % 2 !== 0;

  if (!isInsideCodeBlock) {
    return markdownToHtml(text);
  }

  // 最後の ``` 以前を完結済み部分として取得
  const lastFenceIndex = text.lastIndexOf('```');
  const completePart = text.substring(0, lastFenceIndex);
  const incompletePart = text.substring(lastFenceIndex);

  const completedHtml = completePart ? markdownToHtml(completePart) : '';
  const incompleteHtml = `<pre class="streaming-incomplete-code">${escapeHtml(incompletePart)}</pre>`;

  return completedHtml + incompleteHtml;
}

// グローバルスコープに公開
window.markdownToHtml = markdownToHtml;
window.renderStreamingMarkdown = renderStreamingMarkdown;
