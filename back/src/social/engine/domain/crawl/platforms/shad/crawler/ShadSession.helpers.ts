/// <reference lib="dom" />

import type { Page } from "puppeteer-core";

export interface ShadSessionState {
  authenticated: boolean;
  loginVisible: boolean;
  appVisible: boolean;
  url: string;
}

const LOGIN_ROUTE_PATTERN = /(?:#|\/)\/?login(?:\/|$|\?)/i;

export const getShadSessionState = async (
  page: Page,
): Promise<ShadSessionState> => {
  await page
    .waitForFunction(() => document.readyState !== "loading", {
      timeout: 15_000,
    })
    .catch(() => undefined);

  return await page.evaluate((loginRouteSource) => {
    const currentUrl = window.location.href;
    const loginRoute = new RegExp(loginRouteSource, "i").test(currentUrl);
    const loginSelectors = [
      'input[type="tel"]',
      'input[autocomplete="tel"]',
      'input[id*="phone" i]',
      'input[name*="phone" i]',
      '[class*="login_sign_in"]',
      '[class*="auth-image"]',
    ];
    const appSelectors = [
      '[class*="chat-list"]',
      '[class*="chatlist"]',
      '[class*="dialog-list"]',
      '[class*="sidebar"] [class*="chat"]',
      "#column-left",
      '[data-testid*="chat-list"]',
    ];

    const loginVisible =
      loginRoute ||
      loginSelectors.some((selector) => document.querySelector(selector));
    const appVisible = appSelectors.some((selector) =>
      document.querySelector(selector),
    );

    return {
      authenticated: appVisible && !loginVisible,
      loginVisible,
      appVisible,
      url: currentUrl,
    };
  }, LOGIN_ROUTE_PATTERN.source);
};
