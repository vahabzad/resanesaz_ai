import assert from "node:assert/strict";
import test from "node:test";
import { startCrawlWorker } from "../worker/src/runtime";

const emptyResult = { processed: 0, scheduled: 0, recovered: 0, results: [] };
test("worker starts immediately and never overlaps a slow cycle or restarts after stop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const worker = startCrawlWorker({ intervalMs: 1000, runCycle: async () => { calls += 1; await pending; return emptyResult; } });
  assert.equal(calls, 1);
  t.mock.timers.tick(5000);
  assert.equal(calls, 1);
  worker.stop(); release();
  await pending; await Promise.resolve();
  t.mock.timers.tick(5000);
  assert.equal(calls, 1);
});

test("worker retries after cycle failure instead of leaving the queue permanently idle", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let errors = 0;
  const worker = startCrawlWorker({ intervalMs: 1000, runCycle: async () => { calls += 1; if (calls === 1) throw new Error("temporary"); return emptyResult; }, onError: () => { errors += 1; } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(errors, 1);
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.equal(calls, 2);
  worker.stop();
});
