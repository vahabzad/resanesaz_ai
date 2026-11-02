/* eslint-disable @typescript-eslint/no-require-imports -- The standalone test build emits CommonJS. */
const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { SourceRunStatus } = require("../.data/component-test-build/front/components/platform/source-run-status.js");
const { CrawlerBuildReport } = require("../.data/component-test-build/front/components/platform/crawler-build-report.js");

test("a failed source shows queued and running debug separately, with a route to its report", () => {
  const source = { status: "failed", buildMode: "debug", buildStatus: "draft", buildReport: null, activeRun: { id: "debug-run", status: "queued", trigger: "debug", createdAt: "2026-11-02T12:00:00Z", startedAt: null } };
  const render = () => renderToStaticMarkup(React.createElement(SourceRunStatus, { source, onSelectRun() {} }));
  const queued = render();
  assert.ok(queued.includes("دیباگ در صف"));
  assert.ok(queued.includes("هنوز شروع نشده"));
  assert.match(queued, /href="#crawl-runs"/);
  assert.ok(!queued.includes("در حال دیباگ"));
  source.activeRun = { ...source.activeRun, status: "running", startedAt: "2026-11-02T12:01:00Z" };
  const running = render();
  assert.ok(running.includes("در حال دیباگ"));
  assert.ok(!running.includes("هنوز شروع نشده"));
  source.activeRun = null;
  source.buildStatus = "failed";
  assert.equal(render(), "");
  const failed = renderToStaticMarkup(React.createElement(CrawlerBuildReport, { source }));
  assert.ok(failed.includes("دیباگ ناموفق"));
  assert.ok(!failed.includes("نسخهٔ قبلی حفظ شد"));
  source.buildStatus = "active";
  assert.ok(renderToStaticMarkup(React.createElement(CrawlerBuildReport, { source })).includes("دیباگ موفق"));
});
