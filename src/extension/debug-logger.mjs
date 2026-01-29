/**
 * DebugLogger - Chrome拡張機能デバッグ用ログ管理クラス
 *
 * カテゴリ:
 * - ws: WebSocket接続関連
 * - cdp: Chrome DevTools Protocol関連
 * - tab: タブ操作関連
 * - relay: リレーサーバー関連
 * - error: エラー
 */

class DebugLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 500;
    this.enabled = true;
  }

  /**
   * ログエントリを追加
   * @param {string} category - ログカテゴリ ('ws', 'cdp', 'tab', 'relay', 'error')
   * @param {string} message - ログメッセージ
   * @param {any} data - 追加データ（オプション）
   */
  log(category, message, data = null) {
    if (!this.enabled) return;

    const entry = {
      ts: new Date().toISOString(),
      category,
      message,
      data: data !== null ? this._safeStringify(data) : null
    };

    this.logs.push(entry);

    // 最大件数を超えたら古いログを削除
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // コンソールにも出力
    const prefix = `[${category.toUpperCase()}]`;
    if (data !== null) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  /**
   * エラーログを追加（ショートカット）
   * @param {string} message - エラーメッセージ
   * @param {any} error - エラーオブジェクト
   */
  error(message, error = null) {
    const errorData = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;
    this.log('error', message, errorData);
  }

  /**
   * ログを取得
   * @param {string|null} filter - カテゴリでフィルタ（nullで全件）
   * @param {number} limit - 取得件数（デフォルト: 100）
   * @returns {Array} ログエントリの配列
   */
  getLogs(filter = null, limit = 100) {
    let result = filter
      ? this.logs.filter(l => l.category === filter)
      : this.logs;

    // 最新のログから返す
    return result.slice(-limit);
  }

  /**
   * ログをクリア
   */
  clear() {
    this.logs = [];
    console.log('[DEBUG] Logs cleared');
  }

  /**
   * ログを有効/無効にする
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log('[DEBUG] Logger', enabled ? 'enabled' : 'disabled');
  }

  /**
   * 安全なJSON変換（循環参照対策）
   * @param {any} obj
   * @returns {any}
   */
  _safeStringify(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    try {
      const seen = new WeakSet();
      return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        // WebSocketなど大きなオブジェクトは省略
        if (value instanceof WebSocket) {
          return `[WebSocket: ${value.readyState}]`;
        }
        return value;
      }));
    } catch (e) {
      return String(obj);
    }
  }

  /**
   * 統計情報を取得
   * @returns {Object}
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byCategory: {}
    };

    for (const log of this.logs) {
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
    }

    return stats;
  }
}

// シングルトンインスタンスをエクスポート
export const debugLogger = new DebugLogger();

// デフォルトエクスポート
export default debugLogger;
