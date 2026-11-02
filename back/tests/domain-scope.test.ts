import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns } from "drizzle-orm";

import { mediaInboxItem, mediaSourceSubscription, rawArticle, source } from "../db/schema";

test("platform ingestion is global while media projections remain tenant-scoped", () => {
  assert.equal("mediaId" in getTableColumns(source), false);
  assert.equal("mediaId" in getTableColumns(rawArticle), false);
  assert.equal("mediaId" in getTableColumns(mediaSourceSubscription), true);
  assert.equal("mediaId" in getTableColumns(mediaInboxItem), true);
});
