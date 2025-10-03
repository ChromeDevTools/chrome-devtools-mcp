/**
 * DeepResearch ON/OFF切り替え手順記録システム
 *
 * 目的: 毎回要素を探す必要をなくし、記録された手順で確実に切り替え
 */

import fs from 'node:fs';
import path from 'node:path';

interface DeepResearchStep {
  action: 'click' | 'wait' | 'verify';
  selector?: string;
  ariaLabel?: string;
  textContent?: string;
  waitMs?: number;
  description: string;
}

interface DeepResearchProcedure {
  version: string;
  lastUpdated: string;
  steps: {
    enable: DeepResearchStep[];
    disable: DeepResearchStep[];
    verify: DeepResearchStep[];
  };
}

const PROCEDURE_FILE = path.join(process.cwd(), 'docs/deepresearch-procedure.json');

/**
 * デフォルトの手順定義
 */
const DEFAULT_PROCEDURE: DeepResearchProcedure = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  steps: {
    enable: [
      {
        action: 'click',
        selector: 'button[aria-label*="ファイルの追加"]',
        description: '+ボタンをクリックしてメニューを開く'
      },
      {
        action: 'wait',
        waitMs: 500,
        description: 'メニューが表示されるまで待機'
      },
      {
        action: 'click',
        selector: '[role="menuitemradio"]',
        textContent: 'Deep Research',
        description: 'Deep Research menuitemradio をクリック'
      },
      {
        action: 'wait',
        waitMs: 1000,
        description: 'DeepResearch有効化完了を待機'
      }
    ],
    disable: [
      {
        action: 'click',
        selector: 'button[aria-label*="リサーチ：クリックして削除"]',
        description: 'リサーチpillボタンをクリックして無効化'
      }
    ],
    verify: [
      {
        action: 'verify',
        selector: 'button.__composer-pill[aria-label*="リサーチ"]',
        description: 'リサーチpillボタンの存在確認'
      }
    ]
  }
};

/**
 * 手順をファイルから読み込み
 */
export async function loadProcedure(): Promise<DeepResearchProcedure> {
  try {
    if (fs.existsSync(PROCEDURE_FILE)) {
      const data = await fs.promises.readFile(PROCEDURE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`手順ファイルの読み込みエラー: ${error}`);
  }
  return DEFAULT_PROCEDURE;
}

/**
 * 手順をファイルに保存
 */
export async function saveProcedure(procedure: DeepResearchProcedure): Promise<void> {
  try {
    const dir = path.dirname(PROCEDURE_FILE);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      PROCEDURE_FILE,
      JSON.stringify(procedure, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error(`手順ファイルの保存エラー: ${error}`);
  }
}

/**
 * 手順を実行
 */
export async function executeProcedure(
  page: any,
  steps: DeepResearchStep[]
): Promise<{ success: boolean; error?: string }> {
  for (const step of steps) {
    try {
      if (step.action === 'click') {
        const element = await page.$(step.selector);
        if (!element) {
          return { success: false, error: `要素が見つかりません: ${step.selector}` };
        }

        // textContent指定がある場合は検証
        if (step.textContent) {
          const text = await page.evaluate((el: any) => el.textContent, element);
          if (!text?.includes(step.textContent)) {
            return { success: false, error: `テキスト不一致: 期待="${step.textContent}", 実際="${text}"` };
          }
        }

        await element.click();
      } else if (step.action === 'wait') {
        await page.waitForTimeout(step.waitMs || 500);
      } else if (step.action === 'verify') {
        const element = await page.$(step.selector);
        if (!element) {
          return { success: false, error: `検証失敗: ${step.selector} が見つかりません` };
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `ステップ実行エラー: ${step.description} - ${error}`
      };
    }
  }

  return { success: true };
}

/**
 * DeepResearchを有効化
 */
export async function enableDeepResearch(page: any): Promise<{ success: boolean; error?: string }> {
  const procedure = await loadProcedure();
  return await executeProcedure(page, procedure.steps.enable);
}

/**
 * DeepResearchを無効化
 */
export async function disableDeepResearch(page: any): Promise<{ success: boolean; error?: string }> {
  const procedure = await loadProcedure();
  return await executeProcedure(page, procedure.steps.disable);
}

/**
 * DeepResearch状態を確認
 */
export async function verifyDeepResearch(page: any): Promise<{ enabled: boolean; error?: string }> {
  const procedure = await loadProcedure();
  const result = await executeProcedure(page, procedure.steps.verify);

  if (!result.success) {
    return { enabled: false, error: result.error };
  }

  return { enabled: true };
}
