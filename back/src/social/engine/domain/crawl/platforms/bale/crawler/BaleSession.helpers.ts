/// <reference lib="dom" />

import type { Page } from 'puppeteer-core';

export interface BaleSessionState {
  authenticated: boolean;
  hasAuthenticatedShell: boolean;
  hasLoginInput: boolean;
  isLoginRoute: boolean;
}

export async function getBaleSessionState(page: Page): Promise<BaleSessionState> {
  return await page.evaluate(() => {
    const hasAuthenticatedShell = Boolean(document.querySelector([
      '[aria-label="dialog-item"]',
      '[aria-label="ChatAppBar"]',
      '#message_list_scroller_id',
    ].join(', ')));
    const hasLoginInput = Boolean(document.querySelector([
      'input[type="tel"]',
      'input[name*="phone" i]',
      'input[autocomplete="tel"]',
      'input[inputmode="tel"]',
    ].join(', ')));

    const isLoginRoute = window.location.pathname === '/login' ||
      window.location.pathname.startsWith('/login/');

    return {
      authenticated: hasAuthenticatedShell && !hasLoginInput && !isLoginRoute,
      hasAuthenticatedShell,
      hasLoginInput,
      isLoginRoute,
    };
  });
}
