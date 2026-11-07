/// <reference lib="dom" />
import { extractionError } from '../../../helpers/CrawlRecovery';
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';

import type { Browser, Page } from "puppeteer-core";
import { log } from "../../../../../helper/showLog";
import { Delay, GenerateWebBrowser } from "../../../helpers/browserHelpers";
import type {
  CrawlerChannel,
  CrawlerChannelCrawlResult,
  CrawlerChannelProfile,
  CrawlerMessage,
} from "../../../types/Crawler.types";
import { CrawlerOperationError } from "../../../../operations/types/Operations.types";
import { ShadApiResponseCollector } from "../api/ShadApiResponseCollector";
import { SHAD_CRAWLER_DEFINITION } from "../ShadPlatform.definition";
import {
  normalizeShadChannelAddress,
  parseShadApiResponses,
} from "./ShadApiParser";
import { SHAD_JOIN_LABELS } from "./ShadJoin.helpers";
import { getShadSessionState } from "./ShadSession.helpers";
import { latestMessageControl } from '../../../helpers/latestMessageControl';

const SHAD_LATEST_CONTROL_SELECTOR = 'tab-conversation button.bubbles-go-down';

interface ShadReadOptions {
  collectHistory?: boolean;
}

class ShadWebCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private collector: ShadApiResponseCollector | null = null;

  constructor(
    private readonly sessionDir = SHAD_CRAWLER_DEFINITION.sessionDir,
  ) {}

  async crawlChannel(
    channel: CrawlerChannel,
  ): Promise<CrawlerChannelCrawlResult> {
    const collectHistory = channel.retryBoundary?.initialFullCrawl ?? channel.metadata?.initialFullCrawl === true;
    await channel.rememberBoundary?.({ initialFullCrawl: collectHistory });
    return this.readChannel(channel.address, {
      collectHistory,
    });
  }

  async fetchChannelProfile(
    channel: CrawlerChannel,
  ): Promise<CrawlerChannelProfile> {
    const result = await this.readChannel(channel.address);
    if (!result.profile)
      throw new Error(`Shad profile not found for ${channel.address}`);
    return result.profile;
  }

  async fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]> {
    return (await this.readChannel(channel.address)).messages;
  }

  async fetchFastNewPosts(
    channel: CrawlerChannel,
    latestPostId: string | null,
  ): Promise<CrawlerMessage[]> {
    return (await this.fetchFastCrawlResult(channel, latestPostId)).messages;
  }

  async fetchFastCrawlResult(
    channel: CrawlerChannel,
    latestPostId: string | null,
  ): Promise<CrawlerChannelCrawlResult> {
    const result = await this.readChannel(channel.address);
    return {
      profile: result.profile,
      messages: filterMessagesAfterId(result.messages, latestPostId),
    };
  }

  async readChannel(
    address: string,
    options: ShadReadOptions = {},
  ): Promise<CrawlerChannelCrawlResult> {
    const { guid } = normalizeShadChannelAddress(address);
    const page = await this.getPage();
    if (!this.collector)
      throw new Error("Shad API collector is not initialized");
    this.collector.reset();

    let stage = 'navigation';
    try {
      await page.setCacheEnabled(false);
      await this.openChannel(page, guid);
      await Delay(SHAD_CRAWLER_DEFINITION.capture.channelOpenWaitMs);
      await this.joinChannelIfNeeded(page, address);
      await this.waitForConversationReady(page, address);
      stage = 'latest-messages';
      await this.moveToLatestMessages(page);

      stage = 'message-history';
      if (options.collectHistory) await this.collectHistory(page);

      const responses = await this.collector.snapshot();
      const result = parseShadApiResponses(address, responses);
      if (!result.profile && result.messages.length === 0) {
        throw new CrawlerOperationError(
          `No Shad API data was captured for ${address}`,
          "EXTRACTION_FAILED",
          "extraction",
          "error",
        );
      }

      log(
        `shad API crawl captured channel=${guid} messages=${result.messages.length}`,
        "success",
      );
      return result;
    } catch (error) {
      const responses = await this.collector.snapshot().catch(() => []);
      throw new PartialCrawlerExtractionError(extractionError(error, stage, { address }), parseShadApiResponses(address, responses));
    }
  }

  async close(): Promise<void> {
    this.collector?.detach();
    this.collector = null;
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.page = null;
  }

  private async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      await this.ensureAuthenticated(this.page);
      return this.page;
    }

    const { browser, page } = await GenerateWebBrowser(
      this.sessionDir,
      SHAD_CRAWLER_DEFINITION.webUrl,
    );
    this.browser = browser;
    this.page = page;
    this.collector = new ShadApiResponseCollector(page);
    this.collector.attach();
    await page.bringToFront();
    await Delay(SHAD_CRAWLER_DEFINITION.capture.appBootWaitMs);
    await this.ensureAuthenticated(page);
    return page;
  }

  private async openChannel(page: Page, guid: string): Promise<void> {
    await this.ensureAuthenticated(page);
    const nextHash = `#c=${guid}`;
    const targetUrl = `${SHAD_CRAWLER_DEFINITION.webUrl}${nextHash}`;
    const isAlreadyOpen = await page.evaluate(
      (targetHash) => window.location.hash === targetHash,
      nextHash,
    );

    for (
      let attempt = 0;
      attempt <
      SHAD_CRAWLER_DEFINITION.capture.channelNavigationMaxAttempts;
      attempt++
    ) {
      try {
        // A hash-only assignment is not reliable in Shad's SPA when moving
        // between conversations. Browser-level navigation selects the target
        // URL, and reload forces both the conversation UI and API requests to
        // be recreated with the persistent authenticated session.
        if (!isAlreadyOpen || attempt > 0) {
          await page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: SHAD_CRAWLER_DEFINITION.capture.navigationTimeoutMs,
          });
        }
        await page.reload({
          waitUntil: "domcontentloaded",
          timeout: SHAD_CRAWLER_DEFINITION.capture.navigationTimeoutMs,
        });
      } catch (error) {
        if (
          attempt + 1 >=
          SHAD_CRAWLER_DEFINITION.capture.channelNavigationMaxAttempts
        ) {
          throw new CrawlerOperationError(
            "Shad conversation URL could not be opened",
            "NAVIGATION_FAILED",
            "navigation",
            "error",
            {
              targetUrl,
              reason: error instanceof Error ? error.message : String(error),
            },
          );
        }
        continue;
      }

      await Delay(SHAD_CRAWLER_DEFINITION.capture.appBootWaitMs);
      await this.ensureAuthenticated(page);
      const openedTargetChannel = await page.evaluate(
        (targetHash) => window.location.hash === targetHash,
        nextHash,
      );
      if (openedTargetChannel) {
        log(
          `shad conversation opened channel=${guid} navigationAttempt=${attempt + 1}`,
          "info",
        );
        return;
      }
    }

    throw new CrawlerOperationError(
      "Shad conversation URL did not remain on the requested channel after reload",
      "NAVIGATION_FAILED",
      "navigation",
      "error",
      { targetUrl, guid },
    );
  }

  private async collectHistory(page: Page): Promise<void> {
    let previousCount = 0;
    let idleRounds = 0;

    for (
      let round = 0;
      round < SHAD_CRAWLER_DEFINITION.history.maxScrolls;
      round++
    ) {
      const scrolled = await this.scrollConversation(page, "up");
      if (!scrolled) {
        throw new CrawlerOperationError(
          "Shad conversation scroller was not found",
          "SELECTOR_MISSING",
          "navigation",
          "error",
        );
      }
      await Delay(SHAD_CRAWLER_DEFINITION.history.scrollDelayMs);

      const count = parseShadApiResponses(
        "history",
        (await this.collector?.snapshot()) ?? [],
      ).messages.length;
      idleRounds = count <= previousCount ? idleRounds + 1 : 0;
      previousCount = count;
      if (idleRounds >= SHAD_CRAWLER_DEFINITION.history.noNewMessageLimit)
        break;
    }
  }

  private async joinChannelIfNeeded(page: Page, address: string): Promise<void> {
    const startedAt = Date.now();
    let conversationReadyChecks = 0;
    const targetSelector = '[data-vav-shad-join-target="true"]';

    while (
      Date.now() - startedAt <
      SHAD_CRAWLER_DEFINITION.capture.joinDetectionTimeoutMs
    ) {
      const state = await this.locateJoinControl(page);

      if (state.found) {
        log(
          `shad join control detected address=${address} target=${JSON.stringify(state.target)}`,
          "info",
        );
        const confirmationStartedAt = Date.now();
        let clickAttempts = 0;
        let lastObservedClickAttempt = 0;
        let nextClickAt = confirmationStartedAt;

        while (
          Date.now() - confirmationStartedAt <
          SHAD_CRAWLER_DEFINITION.capture.joinConfirmationTimeoutMs
        ) {
          const currentState = await this.locateJoinControl(page);
          if (!currentState.found) {
            await Delay(SHAD_CRAWLER_DEFINITION.capture.afterJoinDelayMs);
            log(
              `shad channel membership confirmed address=${address} clickAttempts=${clickAttempts}`,
              "success",
            );
            return;
          }

          if (clickAttempts > lastObservedClickAttempt) {
            log(
              `shad join control still visible after click address=${address} attempt=${clickAttempts} target=${JSON.stringify(currentState.target)}`,
              "warning",
            );
            lastObservedClickAttempt = clickAttempts;
          }

          if (
            clickAttempts <
              SHAD_CRAWLER_DEFINITION.capture.joinClickMaxAttempts &&
            Date.now() >= nextClickAt
          ) {
            const joinControl = await page.$(targetSelector);
            if (!joinControl) {
              log(
                `shad join target handle missing address=${address} attempt=${clickAttempts + 1} target=${JSON.stringify(currentState.target)}`,
                "warning",
              );
              await Delay(
                SHAD_CRAWLER_DEFINITION.capture.joinConfirmationPollMs,
              );
              continue;
            }

            const clickMethod =
              clickAttempts % 2 === 0 ? "puppeteer" : "dom";
            try {
              log(
                `shad join click starting address=${address} attempt=${clickAttempts + 1} method=${clickMethod} target=${JSON.stringify(currentState.target)}`,
                "info",
              );
              await joinControl.evaluate((element) => {
                element.scrollIntoView({ block: "center", inline: "center" });
              });
              if (clickAttempts % 2 === 0) {
                await joinControl.click({ delay: 100 });
              } else {
                await joinControl.evaluate((element) => {
                  (element as HTMLElement).click();
                });
              }
            } catch (error) {
              log(
                `shad join click threw address=${address} attempt=${clickAttempts + 1} method=${clickMethod} error=${(error as Error).message}`,
                "error",
              );
              throw new CrawlerOperationError(
                `Shad channel join failed while clicking: ${(error as Error).message}`,
                "NAVIGATION_FAILED",
                "navigation",
                "error",
                {
                  address,
                  label: currentState.label,
                  clickAttempt: clickAttempts + 1,
                },
              );
            } finally {
              await joinControl.dispose();
            }

            clickAttempts++;
            nextClickAt =
              Date.now() +
              SHAD_CRAWLER_DEFINITION.capture.joinClickRetryDelayMs;
            log(
              `shad join click dispatched address=${address} label=${currentState.label ?? ""} attempt=${clickAttempts} method=${clickMethod}`,
              "info",
            );
          }

          await Delay(SHAD_CRAWLER_DEFINITION.capture.joinConfirmationPollMs);
        }

        log(
          `shad join confirmation timed out address=${address} clickAttempts=${clickAttempts} elapsedMs=${Date.now() - confirmationStartedAt}`,
          "error",
        );
        throw new CrawlerOperationError(
          `Shad channel join failed: membership control remained visible after ${clickAttempts} click attempts`,
          "NAVIGATION_FAILED",
          "navigation",
          "error",
          { address, label: state.label, clickAttempts },
        );
      }

      conversationReadyChecks = state.conversationReady
        ? conversationReadyChecks + 1
        : 0;
      if (conversationReadyChecks >= 3) return;
      await Delay(1_000);
    }

    log(`shad join action not found address=${address}; continuing`, "info");
  }

  private async locateJoinControl(page: Page): Promise<{
    found: boolean;
    label: string | null;
    conversationReady: boolean;
    target: {
      tagName: string;
      className: string;
      role: string | null;
      cursor: string;
      pointerEvents: string;
      disabled: boolean;
      bounds: { x: number; y: number; width: number; height: number };
      clickableAncestor: string | null;
    } | null;
  }> {
    const joinLabels = JSON.stringify(SHAD_JOIN_LABELS);
    return (await page.evaluate(`(() => {
      const normalize = (value) => (value || '')
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\\u200c\\u200d\\u200e\\u200f]/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim()
        .replace(/[!…]+$/g, '')
        .toLocaleLowerCase('fa-IR');
      const labels = new Set(${joinLabels}.map(normalize));
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          Number.parseFloat(style.opacity || '1') > 0 && bounds.width > 0 && bounds.height > 0;
      };
      document.querySelectorAll('[data-vav-shad-join-target]').forEach((element) =>
        element.removeAttribute('data-vav-shad-join-target')
      );
      const headerSelectors = [
        'tab-conversation header',
        'tab-conversation [class*="header" i]',
        '[class*="conversation" i] header',
        '[class*="conversation" i] [class*="header" i]',
        '[class*="chat" i] header'
      ];
      const headers = Array.from(new Set(headerSelectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
      ))).filter(isVisible);
      const matches = headers.flatMap((header) => Array.from(
        header.querySelectorAll('button, [role="button"], a, [tabindex], div, span')
      )).filter((element) => isVisible(element) && labels.has(normalize(element.textContent)));
      const labelElement = matches.sort((left, right) => {
        const leftBounds = left.getBoundingClientRect();
        const rightBounds = right.getBoundingClientRect();
        return leftBounds.width * leftBounds.height - rightBounds.width * rightBounds.height;
      })[0];
      if (!labelElement) {
        return { found: false, label: null, conversationReady: Boolean(document.querySelector('tab-conversation')), target: null };
      }
      labelElement.setAttribute('data-vav-shad-join-target', 'true');
      const bounds = labelElement.getBoundingClientRect();
      const style = window.getComputedStyle(labelElement);
      const clickableAncestor = labelElement.closest('button, [role="button"], a, [tabindex]');
      return {
        found: true,
        label: (labelElement.textContent || '').trim(),
        conversationReady: true,
        target: {
          tagName: labelElement.tagName.toLowerCase(),
          className: String(labelElement.getAttribute('class') || '').slice(0, 160),
          role: labelElement.getAttribute('role'),
          cursor: style.cursor,
          pointerEvents: style.pointerEvents,
          disabled: labelElement.matches(':disabled, [aria-disabled="true"]'),
          bounds: {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height)
          },
          clickableAncestor: clickableAncestor
            ? clickableAncestor.tagName.toLowerCase() +
              (clickableAncestor.getAttribute('role') ? '[role="' + clickableAncestor.getAttribute('role') + '"]' : '') +
              (clickableAncestor.getAttribute('class') ? '.' + clickableAncestor.getAttribute('class').trim().replace(/\\s+/g, '.').slice(0, 120) : '')
            : null
        }
      };
    })()`)) as {
      found: boolean;
      label: string | null;
      conversationReady: boolean;
      target: {
        tagName: string;
        className: string;
        role: string | null;
        cursor: string;
        pointerEvents: string;
        disabled: boolean;
        bounds: { x: number; y: number; width: number; height: number };
        clickableAncestor: string | null;
      } | null;
    };
  }

  private async waitForConversationReady(
    page: Page,
    address: string,
  ): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          const conversation =
            document.querySelector("tab-conversation") ??
            document.querySelector('[class*="conversation" i]');
          if (!conversation) return false;
          const bounds = conversation.getBoundingClientRect();
          if (bounds.width <= 200 || bounds.height <= 200) return false;

          return [
            conversation,
            ...Array.from(
              conversation.querySelectorAll("div, main, section, ul"),
            ),
          ]
            .some((element) => {
              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              return rect.width > 200 && rect.height > 200 &&
                style.display !== "none" && style.visibility !== "hidden";
            });
        },
        {
          timeout:
            SHAD_CRAWLER_DEFINITION.capture.conversationReadyTimeoutMs,
        },
      );
    } catch (error) {
      throw new CrawlerOperationError(
        `Shad conversation did not become ready after opening the channel: ${(error as Error).message}`,
        "SELECTOR_MISSING",
        "navigation",
        "error",
        { address },
      );
    }
  }

  private async moveToLatestMessages(page: Page): Promise<void> {
    let previousLatestId: string | null = null;
    let stableRounds = 0;
    let emptyStableRounds = 0;
    let scrollerFound = false;
    let lastCapturedMessageCount = 0;

    for (
      let attempt = 0;
      attempt < SHAD_CRAWLER_DEFINITION.capture.latestMaxAttempts;
      attempt++
    ) {
      await this.clickLatestMessageControl(page);
      const scrolled = await this.scrollConversation(page, "down");
      if (!scrolled) {
        await Delay(SHAD_CRAWLER_DEFINITION.capture.latestScrollDelayMs);
        continue;
      }
      scrollerFound = true;

      await Delay(SHAD_CRAWLER_DEFINITION.capture.latestScrollDelayMs);
      const latestControlPending = await latestMessageControl(page, SHAD_LATEST_CONTROL_SELECTOR);
      const parsed = parseShadApiResponses(
        "latest",
        (await this.collector?.snapshot()) ?? [],
      );
      const messages = parsed.messages;
      lastCapturedMessageCount = messages.length;
      const latestId = messages.at(-1)?.externalId ?? null;
      stableRounds =
        !latestControlPending && latestId && latestId === previousLatestId ? stableRounds + 1 : 0;
      emptyStableRounds =
        !latestControlPending && !latestId && parsed.profile && scrolled.atBoundary
          ? emptyStableRounds + 1
          : 0;
      previousLatestId = latestId;

      if (
        scrolled.atBoundary && !latestControlPending &&
        stableRounds >= SHAD_CRAWLER_DEFINITION.capture.latestStableRounds
      ) {
        log(
          `shad conversation positioned at latest message id=${latestId ?? "unknown"}`,
          "info",
        );
        return;
      }

      if (
        scrolled.atBoundary && !latestControlPending &&
        emptyStableRounds >=
          SHAD_CRAWLER_DEFINITION.capture.latestEmptyStableRounds
      ) {
        log("shad conversation is empty and positioned at the message boundary", "info");
        return;
      }
    }

    throw new CrawlerOperationError(
      "Shad conversation did not reach the latest message",
      "EXTRACTION_FAILED",
      "navigation",
      "error",
      {
        scrollerFound,
        latestMessageId: previousLatestId,
        capturedMessageCount: lastCapturedMessageCount,
      },
    );
  }

  private async clickLatestMessageControl(page: Page): Promise<void> {
    if (await latestMessageControl(page, SHAD_LATEST_CONTROL_SELECTOR, true)) {
      log('shad stage=latest-messages event=control-clicked', 'info');
    }
  }

  private async scrollConversation(
    page: Page,
    direction: "up" | "down",
  ): Promise<{ atBoundary: boolean } | null> {
    const target = await page.evaluate((nextDirection) => {
      const conversation =
        document.querySelector<HTMLElement>("tab-conversation") ??
        document.querySelector<HTMLElement>('[class*="conversation" i]') ??
        document.body;
      const candidates = [
        conversation,
        ...Array.from(
          conversation.querySelectorAll<HTMLElement>("div, main, section, ul"),
        ),
      ].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 200 &&
          rect.height > 200 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      });
      const scrollableCandidates = candidates.filter(
        (element) => element.scrollHeight > element.clientHeight + 4,
      );
      const overflowCandidates = candidates.filter((element) => {
        const overflowY = getComputedStyle(element).overflowY;
        return overflowY === "auto" || overflowY === "scroll";
      });
      const preferredCandidates = scrollableCandidates.length
        ? scrollableCandidates
        : overflowCandidates.length
          ? overflowCandidates
          : candidates.filter((element) => element === conversation);
      const element = preferredCandidates.sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        const leftScore =
          leftRect.width * leftRect.height +
          (left.scrollHeight - left.clientHeight);
        const rightScore =
          rightRect.width * rightRect.height +
          (right.scrollHeight - right.clientHeight);
        return rightScore - leftScore;
      })[0];
      if (!element) return null;

      const rect = element.getBoundingClientRect();
      const hasScrollableContent =
        element.scrollHeight > element.clientHeight + 4;
      if (nextDirection === "down") {
        element.scrollTop = element.scrollHeight;
      } else {
        element.scrollTop = 0;
      }
      element.dispatchEvent(new Event("scroll", { bubbles: true }));

      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        atBoundary:
          !hasScrollableContent ||
          (nextDirection === "down"
            ? element.scrollHeight - element.clientHeight -
                element.scrollTop <=
              4
            : element.scrollTop <= 4),
      };
    }, direction);
    if (!target) return null;

    await page.mouse.move(target.x, target.y);
    await page.mouse.wheel({
      deltaY: direction === "down" ? 4_000 : -4_000,
    });
    return { atBoundary: target.atBoundary };
  }

  private async ensureAuthenticated(page: Page): Promise<void> {
    const state = await getShadSessionState(page);
    if (!state.authenticated) {
      throw new CrawlerOperationError(
        "Shad session is not authenticated",
        "AUTH_REQUIRED",
        "authentication",
        "critical",
      );
    }
  }
}

const filterMessagesAfterId = (
  messages: CrawlerMessage[],
  latestPostId: string | null,
): CrawlerMessage[] => {
  if (!latestPostId || !/^\d+$/.test(latestPostId)) return messages;
  const stopId = BigInt(latestPostId);
  return messages.filter(
    (message) =>
      !/^\d+$/.test(message.externalId) || BigInt(message.externalId) > stopId,
  );
};

export default ShadWebCrawler;
