# Chrome AI Bridge 改善計画

## ✅ 完了: Gemini応答検出の改善

ポーリングループ、テキスト長安定化検出、途中経過ログを実装済み。

## ✅ 完了: Extension接続タイムアウトの自動復旧

RelayServerクリーンアップ、health checkタイムアウト延長（2s→4s）を実装済み。v2.0.4でリリース。

## ✅ 完了: ~/.claude/CLAUDE.md 三者議論セクション改善

単一AI質問（デフォルト）と三者議論プロトコルの使い分けを明確化。文字数目安を追加。

---

## 🗺️ 今後の開発ロードマップ（三者議論の結果）

### 議論の経緯

ChatGPTとGeminiに「chrome-ai-bridgeの今後の開発方向性」について相談し、3ラウンドの議論を実施。

### 一致した見解

| 項目 | 結論 |
|------|------|
| 最優先 | 安定性強化（UIセレクター堅牢化、エラー復旧） |
| AXツリー活用 | 有効（DOMクラス名より安定） |
| ストリーミング完了判定 | 状態機械化が重要 |
| ヒューマン介入フロー | CAPTCHA/再認証時に必須 |

### 異なる見解と統合

| 項目 | ChatGPT | Gemini | 統合判断 |
|------|---------|--------|----------|
| 公式API優先度 | 高（規約リスク回避） | 低（WebUI価値優先） | **UIファースト + APIはfallback** |
| Anti-Bot対策 | 規約回避には非協力 | 重要 | **「自然な操作」を目指す（遅延等）** |
| Claude.ai追加 | リスク大 | 条件付き価値あり | **検討課題（優先度低）** |

### 開発優先順位

1. **安定性強化**（Phase 1）
   - DOM + AXツリーの多層抽出
   - ストリーミング完了判定の状態機械化
   - ログイン切れ/CAPTCHA/レート制限の検知
   - ヒューマン介入フロー（通知→手動操作→再開）

2. **DX/テスト**（Phase 2）
   - DOM/AXツリーのスナップショットで単体テスト
   - DOM変更検知の自動監視（CI/CD連携）
   - E2Eは週次スモーク程度に

3. **機能拡張**（Phase 3）
   - レート制限の可視化（残り回数、リセット時間）
   - 画像添付、ファイルアップロード

4. **API併設**（Phase 4）
   - UI障害時のfallback（脱出ハッチ）
   - policy-driven routing（api_preferred / ui_only / ui_fallback）

5. **新プロバイダー**（検討課題）
   - Claude.ai: Projects/Artifacts連携の可能性
   - ただし保守コスト・規約リスクを考慮

---

## 🔧 次のアクション: AXツリー抽出の調査

### 目的

ChatGPT/GeminiのUIでAXツリー（アクセシビリティツリー）が安定しているか調査し、セレクター堅牢化に活用できるか検証。

### 調査項目

1. CDP `Accessibility.getFullAXTree` でツリー取得
2. 入力欄、送信ボタン、メッセージ要素の `role` / `aria-label` を確認
3. UI変更後も安定しているか（過去のUI変更履歴と比較）

### 調査コマンド

```bash
npm run cdp:chatgpt  # ChatGPTのスナップショット
npm run cdp:gemini   # Geminiのスナップショット
```

---

## Archive: ~/.claude/CLAUDE.md 三者議論セクション改善（実装済み）

### 背景

現在の`§3.2 三者議論`セクションには問題がある：

1. **「同じ質問を並列で投げる」を禁止** しているが、実際のMCPには`ask_chatgpt_gemini_web`（並列クエリ）ツールがある
2. **議論フローが単純すぎる** - ChatGPT→Gemini→追加質問→統合という一方通行
3. **真の「議論」になっていない** - 相互の反論・補足がない

### 改善方針

**2つの使い分けを明確化：**

| 用途 | ツール | 説明 |
|------|--------|------|
| **クイック回答** | `ask_chatgpt_gemini_web` | 同じ質問を並列で投げ、両方の視点を素早く得る |
| **三者議論** | `ask_chatgpt_web` + `ask_gemini_web` | 順次呼び出しで真の議論を行う |

### 改善案: 新しい三者議論セクション

```markdown
### 3.2 AI議論（chrome-ai-bridge MCP）

#### ツールの使い分け

| シーン | ツール | 説明 |
|--------|--------|------|
| **即答が欲しい** | `ask_chatgpt_gemini_web` | 両AIに並列で同じ質問。素早く2つの視点を得る |
| **深い議論が必要** | 個別ツール | 三者議論プロトコルを使用 |

#### 三者議論プロトコル（Deliberation Mode）

**発動条件:**
- 設計判断、アーキテクチャ選択
- 回答に矛盾がある、確信が持てない
- セキュリティ・破壊的変更に関わる決定
- ユーザーが「議論して」「深掘りして」と依頼

**議論フロー:**

```
Round 1: 問題提起
├── Claude: 質問を設計
├── ChatGPT: 初期回答（ask_chatgpt_web）
└── Claude: 回答を評価、論点を抽出

Round 2: クロス検証
├── Claude: ChatGPTの回答をGeminiに提示し意見を求める
├── Gemini: 同意/反論/補足を回答（ask_gemini_web）
└── Claude: 矛盾点・新しい視点を整理

Round 3+: 深掘り（必要に応じて）
├── Claude: 矛盾点をChatGPTに再質問
├── ChatGPT: 反論への回答
└── Claude: 収束判定

Final: 統合判断
└── Claude: 両者の意見を統合し、最終決定
```

**質問テンプレート（Round 2以降）:**

```
前回のAI（ChatGPT/Gemini）は以下のように回答しました：
---
[前回の回答を要約]
---

これについて、あなたの意見を聞かせてください：
1. 同意できる点は？
2. 異なる見解や補足はある？
3. 見落としている観点は？
```

**議論のルール:**
- 最低2ラウンド（一方通行禁止）
- 矛盾が解消されるまで継続
- 回答を鵜呑みにしない（Claudeが批判的に評価）
- 議論ログは`docs/ask/`に保存
```

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `~/.claude/CLAUDE.md` | §3.2を上記に置き換え |

### 検証方法

1. CLAUDE.mdを更新
2. 新しいClaude Codeセッションを開始
3. 「〇〇について三者議論して」と依頼
4. 議論プロトコルが正しく実行されることを確認

---

## Archive: Extension接続タイムアウトの自動復旧（実装済み）

### 問題

MCPツール呼び出し時に「Extension connection timeout (5s)」が発生。
Chrome拡張をリロードすると成功する。

### 原因

1. **古いキャッシュの残存**: MCP側の`geminiClient`/`chatgptClient`が古い接続を保持
2. **RelayServerのクリーンアップ不備**: 古いRelayServerがstop()されずに残存
3. **health checkタイムアウトが短い**: 2秒では不十分

```
時系列:
T0: MCPサーバー起動 → RelayServer作成 → geminiClient キャッシュ
T1: Extension側の接続が何らかの理由で切断（stale状態）
T2: ask_gemini_web呼び出し
T3: 古いgeminiClientでhealth check → 2秒タイムアウト → fail
T4: キャッシュクリア → 新RelayServer作成
T5: しかしExtension側が「眠っている」→ 5秒タイムアウト
T6: "Extension connection timeout" エラー
```

### 実装計画

#### Phase 1: 古いRelayServerの明示的クリーンアップ

**ファイル:** `src/fast-cdp/fast-chat.ts`

RelayServerインスタンスを追跡し、接続失敗時にstop()を呼ぶ。

```typescript
// モジュールレベルでRelayServer参照を保持
let chatgptRelay: RelayServer | null = null;
let geminiRelay: RelayServer | null = null;

async function getClient(kind: 'chatgpt' | 'gemini'): Promise<CdpClient> {
  const existing = kind === 'chatgpt' ? chatgptClient : geminiClient;

  if (existing) {
    const healthy = await isConnectionHealthy(existing, kind);
    if (!healthy) {
      // 古いRelayServerをクリーンアップ
      const oldRelay = kind === 'chatgpt' ? chatgptRelay : geminiRelay;
      if (oldRelay) {
        console.error(`[${kind}] Stopping stale RelayServer`);
        await oldRelay.stop().catch(() => {});
      }
      // キャッシュクリア
      if (kind === 'chatgpt') {
        chatgptClient = null;
        chatgptRelay = null;
      } else {
        geminiClient = null;
        geminiRelay = null;
      }
    }
  }
  // ... 新規接続作成
}
```

#### Phase 2: createConnection()でRelay参照を保存

**ファイル:** `src/fast-cdp/fast-chat.ts`
**対象:** `createConnection()` 関数

`connectViaExtensionRaw()`がRelayServerを返すように変更し、それを保存。

```typescript
// extension-raw.ts から RelayServer を返す
export async function connectViaExtensionRaw(...): Promise<{client: CdpClient, relay: RelayServer}> {
  // ...
  return { client, relay };
}

// fast-chat.ts で保存
const { client, relay } = await connectViaExtensionRaw(...);
if (kind === 'chatgpt') {
  chatgptRelay = relay;
} else {
  geminiRelay = relay;
}
```

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/fast-cdp/fast-chat.ts` | health checkタイムアウト延長、Relay参照保持、クリーンアップ追加 |
| `src/fast-cdp/extension-raw.ts` | connectViaExtensionRawがRelayServerを返すように変更 |

### 検証方法

```bash
# 1. ビルド
npm run build

# 2. MCPテスト（Claude Code再起動後）
# ask_gemini_web を呼び出し

# 3. Chrome拡張をリロード（問題を再現）

# 4. 再度 ask_gemini_web を呼び出し
# → 自動復旧して成功するはず

# 5. ログ確認
tail -f .local/mcp-debug.log | grep -i "stale\|reconnect\|stop"
```

**成功基準:**
1. Extension接続が切れても、次の呼び出しで自動復旧
2. 古いRelayServerが適切にクリーンアップされる
3. ユーザーがChrome拡張を手動リロードする必要がない
