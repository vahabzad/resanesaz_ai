import path from 'path';
import { HTTPRequest, HTTPResponse, Page } from 'puppeteer-core';
import { appConfigs } from '../../../configs';

export function Delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrollMessagesUp(page: Page, container: string) {
    await page.evaluate((selector) => {
        const container = document.querySelector(
            selector,
        ) as HTMLElement | null;

        if (!container) return;

        container.scrollTop = Math.max(
            0,
            container.scrollTop - 1800,
        );
    }, container);
}

export async function scrollMessagesUpSmooth(
    page: Page,
    selector: string,
    distance = 1000,
    steps = 10,
    stepDelayMs = 100,
): Promise<void> {
    await page.evaluate(
        async (selector, distance, steps, stepDelayMs) => {
            const container = document.querySelector(selector);

            if (!(container instanceof HTMLElement)) {
                return;
            }

            const step = distance / steps;

            for (let i = 0; i < steps; i++) {
                container.scrollTop -= step;

                await new Promise((resolve) =>
                    setTimeout(resolve, stepDelayMs),
                );
            }
        },
        selector,
        distance,
        steps,
        stepDelayMs,
    );
}

const shouldRunHeadless = (): boolean => {
    return process.env.HEADLESS !== 'false';
}

export { launchSocialBrowser as GenerateWebBrowser } from "../../../../browser-runtime";

export async function clickXPath(page: Page, xpath: string): Promise<boolean> {
    const clicked = await page.evaluate((expression) => {
        const node = document.evaluate(
            expression,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue as HTMLElement | null;

        if (!node) {
            return false;
        }

        node.click();
        return true;
    }, xpath);

    return Boolean(clicked);
}

export interface NetworkLogEntry {
    type: 'request' | 'response';
    method: string;
    url: string;
    resourceType?: string;
    status?: number;
    contentType?: string | null;
    requestPostData?: string | null;
    requestPayload?: unknown;
    responseBody?: unknown;
    responseBodyTruncated?: boolean;
    error?: string;
    capturedAt: string;
}

export interface NetworkLoggerOptions {
    responseBodyLimit?: number;
    printToConsole?: boolean;
}

export function attachNetworkLogger(
    page: Page,
    logs: NetworkLogEntry[],
    options: NetworkLoggerOptions = {}
): () => void {
    const responseBodyLimit = options.responseBodyLimit ?? 250_000;
    const printToConsole = options.printToConsole ?? true;

    const onRequest = (request: HTTPRequest) => {
        const entry: NetworkLogEntry = {
            type: 'request',
            method: request.method(),
            url: request.url(),
            resourceType: request.resourceType(),
            requestPostData: null,
            requestPayload: requestMethodOnly(request.postData()),
            capturedAt: new Date().toISOString(),
        };

        if (logs.length >= 256) logs.shift();
    logs.push(entry);
        if (printToConsole && shouldPrintNetworkEntry(entry)) {
            //   console.log(`[REQ] ${entry.method} ${entry.resourceType ?? ''} ${entry.url}`);
            if (entry.requestPostData) {
                // console.log(`[REQ BODY] ${truncateText(entry.requestPostData, 1_000)}`);
            }
        }
    };

    const onResponse = (response: HTTPResponse) => {
        void captureResponse(response, logs, { responseBodyLimit, printToConsole });
    };

    page.on('request', onRequest);
    page.on('response', onResponse);

    return () => {
        page.off('request', onRequest);
        page.off('response', onResponse);
    };
}

export async function firstExistingSelector(page: Page, selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
        if (await page.$(selector)) {
            return selector;
        }
    }

    return null;
}

export async function setInputValue(page: Page, selector: string, value: string): Promise<boolean> {
    return await page.evaluate((inputSelector, nextValue) => {
        const element = document.querySelector(inputSelector) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
        if (!element) {
            return false;
        }

        element.focus();

        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            const prototype = element instanceof HTMLInputElement
                ? HTMLInputElement.prototype
                : HTMLTextAreaElement.prototype;
            const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            valueSetter?.call(element, '');
            element.dispatchEvent(new Event('input', { bubbles: true }));
            valueSetter?.call(element, nextValue);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        if (element.getAttribute('contenteditable') === 'true') {
            element.textContent = nextValue;
            element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: nextValue }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        return false;
    }, selector, value);
}

export async function clickSelector(
    page: Page,
    selector: string,
    options: { textIncludes?: string[] } = {}
): Promise<boolean> {
    const elements = await page.$$(selector);
    for (const element of elements) {
        const matchesText = await element.evaluate((node, expectedTexts) => {
            if (!expectedTexts.length) return true;
            const text = [
                node.textContent,
                node.getAttribute('aria-label'),
                node.getAttribute('title'),
                node.getAttribute('placeholder'),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return expectedTexts.some((expectedText) => text.includes(expectedText.toLowerCase()));
        }, options.textIncludes ?? []);

        if (!matchesText) {
            continue;
        }

        await element.click();
        return true;
    }

    return false;
}

export async function clickByText(page: Page, text: string): Promise<boolean> {
    return await page.evaluate((expectedText) => {
        const normalizedExpected = expectedText.trim().toLowerCase();
        const candidates = Array.from(document.querySelectorAll('a, button, div, span'))
            .filter((element) => {
                const textContent = element.textContent?.trim().toLowerCase() ?? '';
                return textContent.includes(normalizedExpected);
            });

        const target = candidates[0] as HTMLElement | undefined;
        if (!target) {
            return false;
        }

        target.click();
        return true;
    }, text);
}

async function captureResponse(
    response: HTTPResponse,
    logs: NetworkLogEntry[],
    options: Required<NetworkLoggerOptions>
): Promise<void> {
    const request = response.request();
    const headers = response.headers();
    const contentType = headers['content-type'] ?? null;
    const requestPostData = null;
    const entry: NetworkLogEntry = {
        type: 'response',
        method: request.method(),
        url: response.url(),
        resourceType: request.resourceType(),
        status: response.status(),
        contentType,
        requestPostData,
        requestPayload: requestMethodOnly(request.postData()),
        capturedAt: new Date().toISOString(),
    };

    if (shouldReadResponseBody(contentType, request.resourceType())) {
        try {
            const text = await response.text();
            entry.responseBodyTruncated = text.length > options.responseBodyLimit;
            const bodyText = entry.responseBodyTruncated
                ? text.slice(0, options.responseBodyLimit)
                : text;
            entry.responseBody = parsePayload(bodyText, contentType);
        } catch (error) {
            entry.error = (error as Error).message;
        }
    }

    if (logs.length >= 256) logs.shift();
    logs.push(entry);
    if (options.printToConsole && shouldPrintNetworkEntry(entry)) {
        // console.log(`[RES] ${entry.status} ${entry.resourceType ?? ''} ${entry.contentType ?? ''} ${entry.url}`);
        if (entry.responseBody !== undefined) {
            //   console.log(`[RES BODY] ${truncateText(formatBodyForConsole(entry.responseBody), 1_500)}`);
        }
    }
}

function shouldReadResponseBody(contentType: string | null, resourceType: string): boolean {
    if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
        return false;
    }

    if (!contentType) {
        return ['xhr', 'fetch', 'document'].includes(resourceType);
    }

    return [
        'application/json',
        'text/',
        'application/graphql',
        'application/x-www-form-urlencoded',
    ].some((item) => contentType.includes(item));
}

function shouldPrintNetworkEntry(entry: NetworkLogEntry): boolean {
    return ['xhr', 'fetch', 'document'].includes(entry.resourceType ?? '');
}

export function parsePayload(text: string | null, contentType: string | null = null): unknown {
    if (!text) {
        return null;
    }

    const trimmed = text.trim();
    if (!trimmed) {
        return '';
    }

    if (contentType?.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return text;
        }
    }

    return text;
}

function formatBodyForConsole(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
}

function truncateText(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}... [truncated]` : value;
}

function resolveBrowserUserDataDir(): string {
    const configuredPath = appConfigs.CRAWLER.browserUserDataDir;
    return path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(process.cwd(), configuredPath);
}

function requestMethodOnly(value: string | undefined): unknown {
  try { const parsed = JSON.parse(value ?? "{}"); return typeof parsed.method === "string" ? { method: parsed.method } : null; } catch { return null; }
}
