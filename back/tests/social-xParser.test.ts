import assert from 'node:assert/strict';
import test from 'node:test';
import { parseXGraphqlResponses } from '../src/social/engine/domain/crawl/platforms/x/crawler/XGraphqlParser';

const user = (username: string, id: string) => ({
  __typename: 'User',
  rest_id: id,
  is_blue_verified: true,
  core: {
    screen_name: username,
    name: `${username} title`,
  },
  avatar: { image_url: 'https://pbs.twimg.com/profile.jpg' },
  profile_bio: { description: 'profile description' },
  relationship_counts: { followers: 120, following: 7 },
  tweet_counts: { tweets: 20 },
  legacy: {
    screen_name: username,
    name: `${username} title`,
    description: 'profile description',
    profile_image_url_https: 'https://pbs.twimg.com/profile.jpg',
    followers_count: 120,
    friends_count: 7,
    statuses_count: 20,
  },
});

const tweet = (id: string, username: string, createdAt: string) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: user(username, `user-${username}`) } },
  views: { count: '42' },
  legacy: {
    id_str: id,
    full_text: `post ${id}`,
    created_at: createdAt,
    favorite_count: 3,
    reply_count: 2,
    retweet_count: 4,
    quote_count: 1,
    bookmark_count: 5,
    extended_entities: {
      media: [{
        id_str: 'media-1',
        type: 'photo',
        media_url_https: 'https://pbs.twimg.com/media/photo.jpg',
      }],
    },
  },
});

test('parses the matching X profile and only its own posts', () => {
  const payload = {
    data: {
      user: { result: user('OpenAI', 'user-1') },
      timeline: {
        entries: [
          { content: { itemContent: { tweet_results: { result: tweet('2', 'OpenAI', '2026-08-26T10:00:00Z') } } } },
          { content: { itemContent: { tweet_results: { result: tweet('1', 'OpenAI', '2026-08-25T10:00:00Z') } } } },
          { content: { itemContent: { tweet_results: { result: tweet('9', 'Other', '2026-08-26T11:00:00Z') } } } },
        ],
      },
    },
  };

  const result = parseXGraphqlResponses([payload], '@OpenAI');
  assert.equal(result.profile?.address, '@OpenAI');
  assert.equal(result.profile?.raw?.followersCount, 120);
  assert.deepEqual(result.messages.map((message) => message.externalId), ['2', '1']);
  assert.deepEqual(result.messages[0].raw, {
    conversationId: null,
    authorId: 'user-OpenAI',
    authorUsername: 'OpenAI',
    viewsCount: 42,
    likesCount: 3,
    repliesCount: 2,
    repostsCount: 4,
    quotesCount: 1,
    sharesCount: 5,
    bookmarksCount: 5,
    language: null,
    possiblySensitive: null,
    media: [{
      id: 'media-1',
      type: 'photo',
      url: 'https://pbs.twimg.com/media/photo.jpg',
      expandedUrl: null,
      width: null,
      height: null,
      variants: [],
    }],
    url: 'https://x.com/OpenAI/status/2',
  });
});

test('unwraps visibility wrappers and removes duplicate posts', () => {
  const wrapped = {
    __typename: 'TweetWithVisibilityResults',
    tweet: tweet('5', 'OpenAI', '2026-08-26T10:00:00Z'),
  };
  const result = parseXGraphqlResponses([{ first: wrapped, second: wrapped.tweet }], 'https://x.com/OpenAI');
  assert.deepEqual(result.messages.map((message) => message.externalId), ['5']);
});
