/// <reference lib="dom" />
import type { Page } from 'puppeteer-core';
import { browserDeadline } from '../../../helpers/BrowserChannelAttempt';
import { log } from '../../../../../helper/showLog';

// Self-contained: this function is also serialized into the browser context.
export function parseRubikaMembersText(value: string): number | null {
  const text = value.replace(/[۰-۹]/g, char => String(char.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 1632))
    .replace(/[\u200c\u200e\u200f\u202a-\u202e]/g, ' ').replace(/[٬,]/g, '').trim();
  // An online count, a time, a title containing digits, or an unrelated number
  // is not a member count. Exact counts are preferred over abbreviated counts.
  if (/آنلاین|online|last seen|آخرین بازدید/i.test(text)) return null;
  const label = '(?:مشترک(?:ین)?|عضو|اعضا|اعضاء|دنبال\\s*کننده(?:\\s*ها)?|subscribers?|members?)';
  const match = text.match(new RegExp('^\\s*(\\d+)\\s*' + label + '\\s*$', 'i'))
    ?? text.match(new RegExp('^\\s*' + label + '\\s*[:：]?\\s*(\\d+)\\s*$', 'i'));
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

// Selectors verified against the public Rubika web application bundle:
// conversation.person -> showPeerInfo -> modal-channel-info.profile-subtitle.
export function readRubikaProfileDom(parse: typeof parseRubikaMembersText) {
  const visible = (element: Element) => {
    const style = window.getComputedStyle(element), bounds = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
  };
  const header = Array.from(document.querySelectorAll('tab-conversation .sidebar-header')).find(visible);
  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || null;
  const title = clean((header?.querySelector('.chat-info .top .peer-title')
    ?? header?.querySelector('.chat-info .top'))?.textContent);
  const bottom = header?.querySelector('.chat-info .bottom');
  // Include the status root itself: the label need not be inside a child span.
  const bottomTexts = bottom ? Array.from(new Set([bottom, ...Array.from(bottom.querySelectorAll('span, .info'))]
    .filter(visible).flatMap(node => [node.textContent?.trim(),
      Array.from(node.childNodes).filter(child => child.nodeType === 3)
        .map(child => child.textContent ?? '').join(' ').trim()])
    .filter((text): text is string => !!text))) : [];
  const panel = Array.from(document.querySelectorAll('modal-channel-info')).find(visible);
  const panelTitle = clean((panel?.querySelector('.profile-name .peer-title')
    ?? panel?.querySelector('.profile-name'))?.textContent);
  const panelMatches = !!panel && !!title && panelTitle === title;
  const panelTexts = panelMatches ? Array.from(panel!.querySelectorAll('.profile-subtitle, .profile-subtitle span'))
    .filter(visible).map(node => node.textContent?.trim()).filter((text): text is string => !!text) : [];
  const candidates = [...bottomTexts.map(text => ({ text, source: 'header' })),
    ...panelTexts.map(text => ({ text, source: 'channel-info' }))];
  const found = candidates.find(item => parse(item.text) !== null);
  return { title, bottomTexts, membersText: found?.text ?? null,
    membersCount: found ? parse(found.text) : null,
    membersSource: found?.source ?? null, panelMatches,
    resolvedChannelUrl: window.location.href };
}

export async function extractRubikaProfile(
  page: Page, channelId: string, expectedUrl: string,
  timing = { headerWaitMs: 2_500, panelWaitMs: 6_000, operationMs: 3_000 },
) {
  // tsx/esbuild adds __name calls for local functions. Keep that naming-only
  // helper in this expression's scope when serializing into the browser.
  const expression = `((__name) => (${readRubikaProfileDom.toString()})(${parseRubikaMembersText.toString()}))((fn) => fn)`;
  const checkedExpression = `(() => { if (window.location.href !== ${JSON.stringify(expectedUrl)}) throw new Error('Rubika profile channel changed'); return ${expression}; })()`;
  const context = `rubika channelId=${channelId} stage=profile-members`;
  const read = () => browserDeadline(() => page.evaluate(checkedExpression), timing.operationMs, 'rubika-profile-read') as Promise<ReturnType<typeof readRubikaProfileDom>>;
  const wait = async (timeout: number) => {
    const handle = await browserDeadline(() => page.waitForFunction(`(${checkedExpression}).membersCount !== null`,
      { timeout, polling: 250 }), timeout + timing.operationMs, 'rubika-profile-wait');
    await browserDeadline(() => handle.dispose(), timing.operationMs, 'rubika-profile-wait-cleanup');
  };
  let raw = await read();
  if (raw.membersCount === null) {
    log(`${context} event=waiting source=header`, 'info');
    try { await wait(timing.headerWaitMs); } catch (error) {
      // A missing count is recoverable; a broken page is not.
      if (!(error instanceof Error) || (error.name !== 'TimeoutError' && !/timeout|timed out|Waiting failed:.*exceeded/i.test(error.message))) throw error;
    }
    raw = await read();
  }
  let opened = false;
  try {
    if (raw.membersCount === null) {
      log(`${context} event=fallback source=channel-info`, 'info');
      if (!raw.panelMatches) {
        opened = await browserDeadline(() => page.evaluate(`(() => {
          if (window.location.href !== ${JSON.stringify(expectedUrl)}) throw new Error('Rubika profile channel changed');
          const target = Array.from(document.querySelectorAll('tab-conversation .sidebar-header .chat-info .person'))
            .find(el => { const r=el.getBoundingClientRect(); return r.width>0 && r.height>0; });
          if (!target) return false; target.click(); return true;
        })()`), timing.operationMs, 'rubika-profile-open-info') as boolean;
      }
      if (opened || raw.panelMatches) {
        try { await wait(timing.panelWaitMs); } catch (error) {
          if (!(error instanceof Error) || (error.name !== 'TimeoutError' && !/timeout|timed out|Waiting failed:.*exceeded/i.test(error.message))) throw error;
        }
        raw = await read();
      }
    }
  } finally {
    if (opened) {
      await browserDeadline(() => page.evaluate(`(() => {
        if (window.location.href !== ${JSON.stringify(expectedUrl)}) return;
        const panel = Array.from(document.querySelectorAll('modal-channel-info'))
          .find(el => { const r=el.getBoundingClientRect(); return r.width>0 && r.height>0; });
        panel?.querySelector('.sidebar-header .sidebar-close-button')?.click();
      })()`), timing.operationMs, 'rubika-profile-close-info');
    }
  }
  log(`${context} event=${raw.membersCount === null ? 'unavailable' : 'captured'} source=${raw.membersSource ?? 'none'} count=${raw.membersCount ?? 'unknown'}`,
    raw.membersCount === null ? 'warning' : 'success');
  return { ...raw, metricsAvailable: raw.membersCount !== null };
}
