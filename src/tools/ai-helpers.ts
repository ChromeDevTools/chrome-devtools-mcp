/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {askChatGPTFast, askGeminiFast, getClient} from '../fast-cdp/fast-chat.js';

export type AIKind = 'chatgpt' | 'gemini';

export interface AIResult {
  provider: string;
  success: boolean;
  answer: string;
  error?: string;
}

export interface ConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * AIに質問を送信し、結果を返す
 * 接続確立からクエリ送信までを一括で行う
 */
export async function askAI(kind: AIKind, question: string): Promise<AIResult> {
  const askFn = kind === 'chatgpt' ? askChatGPTFast : askGeminiFast;
  const label = kind === 'chatgpt' ? 'ChatGPT' : 'Gemini';

  try {
    const answer = await askFn(question);
    return {
      provider: label,
      success: true,
      answer: answer || '（空の応答）',
    };
  } catch (error) {
    return {
      provider: label,
      success: false,
      answer: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * AIへの接続を確立する（並列接続用）
 */
export async function connectAI(kind: AIKind): Promise<ConnectionResult> {
  try {
    await getClient(kind);
    return {success: true};
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
