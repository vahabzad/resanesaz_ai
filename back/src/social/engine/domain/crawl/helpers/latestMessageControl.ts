/// <reference lib="dom" />
import type { ElementHandle, Page } from 'puppeteer-core';

// Selectors belong to the platform. Skip hidden duplicates and controls covered
// by another element; a DOM click would incorrectly activate those controls.
export async function latestMessageControl(page: Page, selector: string, click = false): Promise<boolean> {
  const handle = await page.evaluateHandle((controlSelector) => {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(controlSelector))) {
      if (element.matches(':disabled, [aria-disabled="true"]')) continue;
      let visible = true;
      for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          visible = false;
          break;
        }
      }
      if (!visible || getComputedStyle(element).pointerEvents === 'none') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (hit && (hit === element || element.contains(hit))) return element;
    }
    return null;
  }, selector);
  try {
    const control = handle.asElement() as ElementHandle<HTMLElement> | null;
    if (!control) return false;
    if (click) {
      try {
        await control.click({ delay: 100 });
      } catch (error) {
        // A loading transition may remove the control between discovery and click.
        const stillVisible = await control.evaluate(element =>
          element.isConnected && element.getClientRects().length > 0).catch(() => false);
        if (stillVisible) throw error;
        return false;
      }
    }
    return true;
  } finally {
    await handle.dispose();
  }
}
