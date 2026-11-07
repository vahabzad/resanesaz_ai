import type { Page } from 'puppeteer-core';

/** Bale gates lazy view/reaction rendering on page visibility and focus. */
export async function keepBalePageActive(page: Page): Promise<void> {
  const client = await page.createCDPSession();
  try {
    // Keep this session attached: detaching resets focus emulation.
    await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    page.once('close', () => { void client.detach().catch(() => undefined); });
  } catch (error) {
    await client.detach().catch(() => undefined);
    throw error;
  }
}
