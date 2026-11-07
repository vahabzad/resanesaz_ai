import fs from 'fs/promises';
import path from 'path';
import type { Page } from 'puppeteer-core';
import { appConfigs } from '../../../../../configs';
import { log } from '../../../../../helper/showLog';

const RAW_VALUE_PATTERN = /^doc:(\d+)$/;
const REACTION_SELECTOR = '.reaction-sticker[data-doc-id]';
const MIME_EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
};

type TelegramReactionBlob = {
  documentId: string;
  mimeType: string;
  base64: string;
};

class TelegramReactionAssetService {
  constructor(private readonly directory?: string) {}
  publicPath(rawValue: string, extension = 'webp'): string | null {
    const documentId = RAW_VALUE_PATTERN.exec(rawValue)?.[1];
    return documentId ? this.directory ? `assets/${documentId}.${extension}` : `/uploads/telegram-reactions/${documentId}.${extension}` : null;
  }

  async captureVisible(page: Page): Promise<Record<string, string>> {
    const assets: Record<string, string> = {};
    const blobs = await page.evaluate(async (selector): Promise<TelegramReactionBlob[]> => {
      const results: TelegramReactionBlob[] = [];
      const seen = new Set<string>();
      for (const sticker of Array.from(document.querySelectorAll(selector))) {
        const documentId = sticker.getAttribute('data-doc-id');
        if (!documentId || seen.has(documentId)) continue;
        const image = sticker.querySelector('img');
        const blobUrl = image?.currentSrc?.startsWith('blob:')
          ? image.currentSrc
          : image?.src?.startsWith('blob:') ? image.src : null;
        if (!blobUrl) continue;
        try {
          const blob = await fetch(blobUrl).then((response) => response.blob());
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          }
          results.push({ documentId, mimeType: blob.type, base64: btoa(binary) });
          seen.add(documentId);
        } catch {
          // A blob URL can expire while Telegram replaces an animated frame; the next crawl retries it.
        }
      }
      return results;
    }, REACTION_SELECTOR);

    for (const blob of blobs) {
      const extension = MIME_EXTENSIONS[blob.mimeType];
      if (!extension) {
        log(`telegram reaction blob skipped documentId=${blob.documentId} mimeType=${blob.mimeType}`, 'warning');
        continue;
      }
      const rawValue = `doc:${blob.documentId}`;
      const publicPath = this.publicPath(rawValue, extension);
      if (!publicPath) continue;
      const filePath = this.filePath(blob.documentId, extension);
      if (!(await this.fileExists(filePath))) {
        await this.writeAsset(filePath, Buffer.from(blob.base64, 'base64'));
        log(`telegram reaction blob downloaded documentId=${blob.documentId} mimeType=${blob.mimeType}`, 'success');
      }
      assets[rawValue] = publicPath;
    }
    return assets;
  }

  async existing(rawValues: Iterable<string>): Promise<Record<string, string>> {
    const assets: Record<string, string> = {};
    for (const rawValue of rawValues) {
      const documentId = RAW_VALUE_PATTERN.exec(rawValue)?.[1];
      const publicPath = this.publicPath(rawValue);
      if (documentId && publicPath && await this.fileExists(this.filePath(documentId, 'webp'))) {
        assets[rawValue] = publicPath;
      }
    }
    return assets;
  }

  private async writeAsset(filePath: string, contents: Buffer): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporaryPath, contents, { flag: 'wx' });
      await fs.rename(temporaryPath, filePath).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
        await fs.unlink(temporaryPath).catch(() => undefined);
      });
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private filePath(documentId: string, extension: string): string {
    return this.directory ? path.resolve(this.directory, `${documentId}.${extension}`) : path.resolve(appConfigs.UPLOAD_PATH, 'telegram-reactions', `${documentId}.${extension}`);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    return await fs.access(filePath).then(() => true).catch(() => false);
  }
}

export default new TelegramReactionAssetService();
export { TelegramReactionAssetService };
