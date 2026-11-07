/// <reference lib="dom" />

import type { Page } from 'puppeteer-core';

export interface XSessionState {
  authenticated: boolean;
  authCookiePresent: boolean;
  loginVisible: boolean;
  appVisible: boolean;
  url: string;
}

const LOGIN_ROUTE_PATTERN = /(?:\/i\/flow\/login|\/login)(?:\/|$|\?|#)/i;

export const getXSessionState = async (page: Page): Promise<XSessionState> => {
  await page
    .waitForFunction(() => document.readyState !== 'loading', { timeout: 15_000 })
    .catch(() => undefined);

  const cookies = await page.cookies('https://x.com/');
  const authCookiePresent = cookies.some(
    (cookie) => cookie.name === 'auth_token' && cookie.value.length > 0,
  );

  const domState = await page.evaluate((loginRouteSource) => {
    const currentUrl = window.location.href;
    const loginRoute = new RegExp(loginRouteSource, 'i').test(currentUrl);
    const loginSelectors = [
      'input[autocomplete="username"]',
      '[data-testid="LoginForm_Login_Button"]',
    ];
    const appSelectors = [
      '[data-testid="AppTabBar_Home_Link"]',
      '[data-testid="SideNav_AccountSwitcher_Button"]',
      'a[href="/home"]',
      'main [data-testid="primaryColumn"]',
    ];

    return {
      loginVisible:
        loginRoute || loginSelectors.some((selector) => document.querySelector(selector)),
      appVisible: appSelectors.some((selector) => document.querySelector(selector)),
      url: currentUrl,
    };
  }, LOGIN_ROUTE_PATTERN.source);

  return {
    authenticated: authCookiePresent && !domState.loginVisible,
    authCookiePresent,
    ...domState,
  };
};
