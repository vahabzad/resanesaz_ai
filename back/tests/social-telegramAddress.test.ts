import { strict as assert } from 'node:assert';
import test from 'node:test';
import { resolveTelegramWebChannelAddress } from '../src/social/engine/domain/crawl/platforms/telegram/crawler/TelegramAddress.helpers';

test('builds a Telegram Web URL from a username', () => {
  assert.deepEqual(resolveTelegramWebChannelAddress('example_channel'), {
    username: 'example_channel',
    url: 'https://web.telegram.org/k/#@example_channel',
  });
  assert.deepEqual(resolveTelegramWebChannelAddress('  @example_channel  '), {
    username: 'example_channel',
    url: 'https://web.telegram.org/k/#@example_channel',
  });
});

test('normalizes a full Telegram Web channel URL', () => {
  assert.deepEqual(resolveTelegramWebChannelAddress('https://web.telegram.org/k/#@example_channel'), {
    username: 'example_channel',
    url: 'https://web.telegram.org/k/#@example_channel',
  });
});

test('rejects an invalid Telegram channel address', () => {
  assert.throws(() => resolveTelegramWebChannelAddress('invalid username'));
});
