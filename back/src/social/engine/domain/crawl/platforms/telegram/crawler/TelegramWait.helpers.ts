/// <reference lib="dom" />
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';

export async function telegramDeadline<T>(task: Promise<T>, stage: string, timeoutMs = 35_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CrawlerOperationError(
        `Telegram ${stage} timed out after ${timeoutMs}ms`, 'EXTRACTION_FAILED', stage, 'warning', { timeoutMs },
      )), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

// Self-contained: Puppeteer serializes this function into the channel tab.
export function telegramUnavailableNotice(): string | null {
  const nodes = document.querySelectorAll('.popup-body, .popup-description, .toast, #column-center .empty-placeholder, #column-center .chat-empty');
  for (const node of Array.from(nodes)) {
    const bounds = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    if (!bounds.width || !bounds.height || style.display === 'none' || style.visibility === 'hidden') continue;
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (/username (?:is )?not (?:found|occupied)|(?:channel|chat|user) (?:does(?:n't| not) exist|not found|is (?:unavailable|private)|was deleted)|(?:this|the) (?:channel|chat) (?:is no longer|can.?t be)|(?:کانال|کاربر|گفتگو).{0,35}(?:وجود ندارد|یافت نشد|پیدا نشد|خصوصی|حذف شده)|USERNAME_(?:INVALID|NOT_OCCUPIED)|CHANNEL_(?:PRIVATE|INVALID)/i.test(text)) return text.slice(0, 240);
  }
  return null;
}
