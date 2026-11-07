import type { Page } from 'puppeteer-core';
import { Delay } from '../../../helpers/browserHelpers';

export async function isRubikaLoginPage(page: Page): Promise<boolean> {
  await Delay(1_000);
  return await page.evaluate(() => {
    const hasLoginSignIn = document.querySelector('[class*="login_sign_in"]') !== null;
    const hasAuthImage = document.querySelector('[class*="auth-image"]') !== null;
    return hasLoginSignIn || hasAuthImage;
  });
}
