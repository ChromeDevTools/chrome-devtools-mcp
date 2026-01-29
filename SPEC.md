# Extension Connection Specification

## 参照実装

playwright-mcp の Extension2 (`/Users/usedhonda/projects/public/playwright-mcp/packages/extension2`)

## 接続フロー

1. **Chromeは既に起動している**（何かしらのタブがある状態）
2. **MCPサーバーが接続を開始すると、自動的にconnect.htmlが開く**
3. **現在開いている全タブの一覧が表示される**
4. **ユーザーが任意のタブを1つ選ぶ**（どんなタブでもよい）
5. **選んだタブがMCP操作対象になる**
6. **MCPがそのタブを操作する**（ナビゲーション、入力、クリックなど）

## 重要な前提

- ChatGPTやGeminiのタブが事前に開いている必要は**ない**
- ユーザーは**どんなタブでも**選べる
- 「どのタブを選ぶか」と「そのタブで何をするか」は**別の話**
- ユーザーはアイコンをクリックする必要は**ない**（自動で開く）

## 技術的実装

### MCPサーバー側 (extension-raw.ts)

```typescript
// 拡張機能ID（manifest.jsonのkeyから生成される固定値）
const EXTENSION_ID = 'ibjplbopgmcacpmfpnaeoloepdhenlbm';

// connect.htmlのURLを構築
const connectUrl = `chrome-extension://${EXTENSION_ID}/ui/connect.html?mcpRelayUrl=${wsUrl}`;

// 既存のChromeでconnect.htmlを開く（macOS）
await execAsync(`open -a "Google Chrome" "${connectUrl}"`);
```

### 拡張機能側 (connect.html)

- URLパラメータから `mcpRelayUrl` を取得
- 全タブの一覧を表示
- ユーザーが選択したタブをMCPに接続

### manifest.json

```json
{
  "key": "MIIBIjAN...",  // 固定の拡張機能IDを生成するためのキー
}
```

Extension ID: `ibjplbopgmcacpmfpnaeoloepdhenlbm`

## やってはいけないこと

- Discovery polling（拡張機能がMCPサーバーを探しに行く）
- ユーザーにアイコンをクリックさせる
- ChatGPT/Geminiが開いている前提で話す
- 「ユーザーが普段使っているChrome、ChatGPTやGeminiのタブが開いている」などの余計な前提を付け加える
