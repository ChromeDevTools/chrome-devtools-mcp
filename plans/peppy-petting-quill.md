# v1.1.24 テスト＆非推奨スクリプト整理プラン

## 概要
1. 古いスクリプトに警告を追加（うっかり使用防止）
2. 新しいツール（getPageDom等）のMCPなしテスト

---

## Phase 1: 非推奨スクリプトの整理

### 対象ファイル
| スクリプト | 状態 | 理由 |
|-----------|------|------|
| `scripts/start-mcp-from-json.mjs` | 非推奨 | 古いMCP起動方式 |
| `scripts/configure-codex-mcp.mjs` | 非推奨 | Codex専用、使用頻度なし |
| `scripts/codex-mcp-test.mjs` | 非推奨 | Codex専用、使用頻度なし |

### 対策: スクリプト先頭に警告＆即終了

各スクリプトの先頭に追加:
```javascript
console.error('');
console.error('⚠️  DEPRECATED: このスクリプトは非推奨です。');
console.error('   現在は以下を使用してください:');
console.error('   - npm run test:chatgpt -- "質問"');
console.error('   - npm run cdp:chatgpt');
console.error('');
process.exit(1);
```

### CLAUDE.mdに追記
```markdown
### 使用禁止スクリプト（非推奨）
以下は古いスクリプトで、使用しないでください:
- `start-mcp-from-json.mjs`
- `configure-codex-mcp.mjs`
- `codex-mcp-test.mjs`
```

---

## Phase 2: MCPなしテスト

### 現役ツール一覧
| 関数 | スクリプト | コマンド |
|------|-----------|---------|
| `askChatGPTFast` | test-fast-chat.mjs | `npm run test:chatgpt -- "質問"` |
| `askGeminiFast` | test-fast-chat.mjs | `npm run test:gemini -- "質問"` |
| `getPageDom` | test-fast-chat.mjs | `--dump-dom` オプション |
| `takeCdpSnapshot` | cdp-snapshot.mjs | `npm run cdp:chatgpt` |

### テスト手順

```bash
# 1. ビルド
npm run build

# 2. DOM取得テスト（新機能）
node --import ./scripts/browser-globals-mock.mjs scripts/test-fast-chat.mjs chatgpt --dump-dom

# 3. CDPスナップショット
npm run cdp:chatgpt

# 4. 質問送信テスト
npm run test:chatgpt -- "JavaScriptでPromiseの基本を教えて"
```

---

## 修正ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `scripts/start-mcp-from-json.mjs` | 警告＆即終了追加 |
| `scripts/configure-codex-mcp.mjs` | 警告＆即終了追加 |
| `scripts/codex-mcp-test.mjs` | 警告＆即終了追加 |
| `CLAUDE.md` | 使用禁止スクリプトの明記 |

---

## 検証

### Phase 1 検証
```bash
# 非推奨スクリプトを実行 → 警告が出て終了することを確認
node scripts/start-mcp-from-json.mjs
# → "⚠️ DEPRECATED" と表示され exit 1
```

### Phase 2 検証
```bash
# getPageDom のテスト
node --import ./scripts/browser-globals-mock.mjs scripts/test-fast-chat.mjs chatgpt --dump-dom
# → DOM情報が出力されること
```
