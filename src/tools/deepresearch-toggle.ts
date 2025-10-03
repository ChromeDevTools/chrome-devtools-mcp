/**
 * DeepResearch ON/OFF 切り替えツール（簡潔版）
 *
 * 目的: 最小限のコードで確実にDeepResearchを切り替え
 */

/**
 * DeepResearch有効化（シンプル実装）
 */
export async function enableDeepResearch(page: any): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: +ボタンをクリック
    const plusButton = await page.$('button[aria-label*="ファイルの追加"]');
    if (!plusButton) {
      return { success: false, error: '+ボタンが見つかりません' };
    }
    await plusButton.click();
    await page.waitForTimeout(500);

    // Step 2: Deep Research menuitemradio をクリック
    const menuItems = await page.$$('[role="menuitemradio"]');
    let deepResearchItem = null;

    for (const item of menuItems) {
      const text = await item.evaluate((el: any) => el.textContent);
      if (text?.includes('Deep Research') || text?.includes('リサーチ')) {
        deepResearchItem = item;
        break;
      }
    }

    if (!deepResearchItem) {
      return { success: false, error: 'Deep Research menuitemradio が見つかりません' };
    }

    await deepResearchItem.click();
    await page.waitForTimeout(1000);

    // Step 3: 検証（composer-pill確認）
    const pill = await page.$('button.__composer-pill[aria-label*="リサーチ"]');
    if (!pill) {
      return { success: false, error: 'DeepResearch pill が表示されませんでした' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: `エラー: ${error}` };
  }
}

/**
 * DeepResearch無効化（シンプル実装）
 */
export async function disableDeepResearch(page: any): Promise<{ success: boolean; error?: string }> {
  try {
    // リサーチpillボタンをクリック
    const pill = await page.$('button[aria-label*="リサーチ：クリックして削除"]');
    if (!pill) {
      return { success: false, error: 'リサーチpillボタンが見つかりません（既にOFFの可能性）' };
    }

    await pill.click();
    await page.waitForTimeout(500);

    // 検証: pillが消えたことを確認
    const stillExists = await page.$('button[aria-label*="リサーチ：クリックして削除"]');
    if (stillExists) {
      return { success: false, error: 'DeepResearch無効化に失敗しました' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: `エラー: ${error}` };
  }
}

/**
 * DeepResearch状態確認（シンプル実装）
 */
export async function checkDeepResearch(page: any): Promise<{ enabled: boolean; indicator?: string }> {
  try {
    const pill = await page.$('button.__composer-pill[aria-label*="リサーチ"]');

    if (pill) {
      const text = await pill.evaluate((el: any) => el.textContent?.trim());
      return { enabled: true, indicator: `composer-pill: "${text}"` };
    }

    return { enabled: false };
  } catch (error) {
    return { enabled: false };
  }
}
