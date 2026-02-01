/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {askChatGPTFastWithTimings, askGeminiFastWithTimings, getClient, ChatDebugInfo} from '../fast-cdp/fast-chat.js';

export type AIKind = 'chatgpt' | 'gemini';

export interface AIResult {
  provider: string;
  success: boolean;
  answer: string;
  error?: string;
  debug?: ChatDebugInfo;
}

export interface ConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * GEMINI_STUCK_* エラーかどうかを判定
 */
function isGeminiStuckError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('GEMINI_STUCK_');
  }
  return false;
}

/**
 * AIに質問を送信し、結果を返す
 * 接続確立からクエリ送信までを一括で行う
 * Geminiのスタックエラーの場合は自動リトライ
 */
export async function askAI(kind: AIKind, question: string, debug?: boolean): Promise<AIResult> {
  const askFn = kind === 'chatgpt' ? askChatGPTFastWithTimings : askGeminiFastWithTimings;
  const label = kind === 'chatgpt' ? 'ChatGPT' : 'Gemini';

  const maxRetries = kind === 'gemini' ? 2 : 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await askFn(question, debug);
      return {
        provider: label,
        success: true,
        answer: result.answer || '（空の応答）',
        debug: result.debug,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Geminiのスタックエラーの場合はリトライ
      if (kind === 'gemini' && isGeminiStuckError(error) && attempt < maxRetries) {
        console.error(`[askAI] Gemini stuck error on attempt ${attempt}, retrying...`);
        // セッションは既にクリアされているのでそのままリトライ
        continue;
      }

      return {
        provider: label,
        success: false,
        answer: '',
        error: lastError.message,
      };
    }
  }

  // ここには到達しないはずだが、型安全のため
  return {
    provider: label,
    success: false,
    answer: '',
    error: lastError?.message || 'Unknown error',
  };
}

/**
 * AIへの接続を確立する（並列接続用）
 * Geminiのスタックエラーの場合は自動リトライ
 */
export async function connectAI(kind: AIKind): Promise<ConnectionResult> {
  const maxRetries = kind === 'gemini' ? 2 : 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await getClient(kind);
      return {success: true};
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Geminiのスタックエラーの場合はリトライ
      if (kind === 'gemini' && isGeminiStuckError(error) && attempt < maxRetries) {
        console.error(`[connectAI] Gemini stuck error on attempt ${attempt}, retrying...`);
        // セッションは既にクリアされているのでそのままリトライ
        continue;
      }

      return {
        success: false,
        error: lastError.message,
      };
    }
  }

  // ここには到達しないはずだが、型安全のため
  return {
    success: false,
    error: lastError?.message || 'Unknown error',
  };
}
