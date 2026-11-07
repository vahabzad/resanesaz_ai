import assert from "node:assert/strict";
import test from "node:test";
import { buildCrawler, CrawlerBuildError, pageEvidence, validateSample } from "../src/server/crawler-builder";
import { generatedRecipeSchema, parseRecipe, type CrawlerRecipe } from "../src/server/crawler-recipe";
import { discoverArticleLinks, extractArticle } from "../src/server/web-crawler";

const recipe: CrawlerRecipe = { contractVersion: "2", linkSelector: ".latest a[href]", pathPrefixes: ["/posts/"], titleSelectors: [".headline"], bodySelectors: [".story-text", ".photo-caption"], removeSelectors: [".related"] };
const text = "متن کامل خبر واقعی که باید همراه با تمام پاراگراف‌ها استخراج شود. ".repeat(6);
const listing = `<a href="/topics/politics">صفحه سیاسی</a><div class="latest">${Array.from({length: 8}, (_, index) => `<a href="/posts/story-${index}">عنوان خبر آزمایشی ${index}</a>`).join("")}</div>`;
const fetchPage = async (url: string) => ({ finalUrl: url, body: url.endsWith("/") ? listing : `<h1 class="headline">عنوان خبر آزمایشی</h1><div class="${url.endsWith("7") ? "photo-caption" : "story-text"}"><p>${text}</p><div class="related">خبرهای دیگر</div></div>` });

test("builder repairs category selectors using internal pages and reports extracted source categories", async () => {
  let attempts = 0;
  const categorizedPage = async (url: string) => {
    const page = await fetchPage(url);
    return { ...page, body: page.body + (url.endsWith("/") ? "" : '<div class="desk-label">اقتصاد</div>') };
  };
  const result = await buildCrawler("https://example.test/", "web", new AbortController().signal, async () => {}, {
    fetch: categorizedPage,
    generate: async (evidence) => {
      attempts++;
      if (attempts === 2) {
        assert.match(JSON.stringify((evidence as { pages: unknown }).pages), /desk-label/);
        assert.match(JSON.stringify((evidence as { feedback: unknown }).feedback), /SAMPLE_CATEGORY_MISSING/);
      }
      return { ...recipe, categorySelectors: attempts === 1 ? [".wrong-label"] : [".desk-label"] };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.report.passed, true);
  assert.ok(result.report.samples.every((sample) => sample.categoryStatus === "found" && sample.categories?.[0] === "اقتصاد"));
  assert.throws(() => generatedRecipeSchema.parse(recipe));
  assert.deepEqual(parseRecipe(recipe), recipe); // Existing versions remain usable.
  assert.throws(() => parseRecipe({ ...recipe, categorySelectors: ["a[href]"] }));
  assert.match(pageEvidence('<nav class="breadcrumbs"><a href="/category/world">World</a></nav><meta property="article:section" content="Politics">', "https://example.test/"), /World|Politics/);
});

test("site-specific recipes handle paths and layouts unsupported by the generic extractor", () => {
  assert.equal(discoverArticleLinks(listing, "https://example.test/").length, 0);
  assert.equal(discoverArticleLinks(listing, "https://example.test/", recipe).length, 8);
  const html = `<h1 class="headline">عنوان خبر واقعی</h1><div class="story-text">${text}<aside>تبلیغ</aside><div class="related">خبر نامربوط</div></div>`;
  assert.equal(extractArticle(html, "https://example.test/posts/x", recipe)?.content, text.trim());
  assert.equal(validateSample(html, "https://example.test/posts/x", recipe).passed, true);
  assert.equal(validateSample(html, "https://example.test/posts/x", {...recipe, bodySelectors: ["main"]}).passed, false);
  assert.equal(validateSample(html, "https://example.test/posts/x", {...recipe, titleSelectors: [".missing"]}).passed, false);
  const excerptOnly = `<script type="application/ld+json">${JSON.stringify({"@type":"NewsArticle",articleBody:text})}</script><h1 class="headline">عنوان خبر واقعی</h1><div class="story-text">${text.slice(0,100)}</div>`;
  assert.equal(validateSample(excerptOnly, "https://example.test/posts/x", recipe).passed,false);
});

test("builder tests distributed real samples, repairs a failed recipe and does not ingest samples", async () => {
  let generations = 0;
  const events: Record<string, unknown>[] = [];
  const result = await buildCrawler("https://example.test/", "web", new AbortController().signal, async (event) => { events.push(event); }, {
    fetch: fetchPage,
    generate: async (evidence) => { generations += 1; if (generations === 2) assert.ok((evidence as {feedback: unknown}).feedback); return {...recipe, bodySelectors: generations === 1 ? [".missing"] : recipe.bodySelectors}; },
  });
  assert.equal(generations, 2);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.samples.length, 6);
  assert.equal(result.report.discovered, 8);
  assert.equal(result.report.attempts, 2);
  assert.ok(result.report.samples.some((sample) => sample.url.endsWith("7")));
  assert.ok(events.some((event) => event.stage === "build-repair"));
});

test("invalid or undersampled crawlers never pass the activation gate", async () => {
  let attempts = 0;
  await assert.rejects(buildCrawler("https://example.test/", "web", new AbortController().signal, async () => {}, {
    fetch: fetchPage, generate: async () => { attempts += 1; return {...recipe, bodySelectors: [".missing"]}; },
  }), (error: unknown) => error instanceof CrawlerBuildError && error.code === "CRAWLER_VALIDATION_FAILED" && error.report?.passed === false);
  assert.equal(attempts, 2); // Identical effective recipes stop instead of making a blind third attempt.
  await assert.rejects(buildCrawler("https://example.test/", "web", new AbortController().signal, async () => {}, {
    fetch: async (url) => ({finalUrl:url,body:url.endsWith("/") ? '<div class="latest"><a href="/posts/one">خبر آزمایشی منفرد</a></div>' : `<h1 class="headline">خبر منفرد</h1><div class="story-text">${text}</div>`}), generate: async () => recipe,
  }), (error: unknown) => error instanceof CrawlerBuildError && error.report?.samples.length === 1 && !error.report.passed);
});

test("debug gives Codex the existing recipe and errors and retests failed articles outside the current listing", async () => {
  const failedUrl = "https://example.test/posts/older-failed-story";
  const context = { previousVersionId: "previous-version", recipe, failures: [{url:failedUrl,errorCode:"ARTICLE_INVALID",durationMs:1000}, {url:"https://example.test/topics/politics",errorCode:"ARTICLE_INVALID",durationMs:1000}] };
  const events: Record<string,unknown>[]=[];
  const result=await buildCrawler("https://example.test/","web",new AbortController().signal,async(event)=>{events.push(event);},{fetch:fetchPage,generate:async(evidence)=>{
    const feedback=(evidence as {feedback:{mode:string;previousRecipe:unknown;failures:unknown}}).feedback;
    assert.equal(feedback.mode,"debug");
    assert.deepEqual(feedback.previousRecipe,recipe);
    assert.deepEqual(feedback.failures,context.failures);
    return recipe;
  }},context);
  assert.equal(result.report.passed,true);
  assert.ok(result.report.samples.some(sample=>sample.url===failedUrl));
  assert.ok(!result.report.samples.some(sample=>sample.url.endsWith("/topics/politics")));
  assert.ok(events.some(event=>event.stage==="debug-analysis"));
});

test("model recipes cannot execute code and public DOM evidence drops credentials and active content", () => {
  assert.throws(() => parseRecipe({...recipe, code: "exec()"}));
  assert.throws(() => parseRecipe({...recipe, pathPrefixes:["https://internal/"]}));
  assert.throws(() => parseRecipe({...recipe, bodySelectors:["div["]}));
  const evidence = pageEvidence('<script>secret-script</script><form>form-secret</form><a href="/posts/one?token=query-secret" onclick="secret-action()">خبر آزمایشی</a>', "https://example.test/");
  assert.doesNotMatch(evidence, /secret|onclick|token=/);
  assert.match(evidence, /href="\/posts\/one"/);
  const large = `<div>${'<span class="filler">Layout</span>'.repeat(1500)}</div><div class="actual-body"><h1>عنوان خبر</h1><p>${text}</p></div>`;
  assert.match(pageEvidence(large, "https://example.test/"), /actual-body/);
});

test("debug cannot pass solely by extracting historical pages when current discovery is broken", async () => {
  const context={previousVersionId:"old",recipe,failures:Array.from({length:3},(_,i)=>({url:`https://example.test/posts/old-${i}`,errorCode:"ARTICLE_INVALID",durationMs:null}))};
  await assert.rejects(buildCrawler("https://example.test/","web",new AbortController().signal,async()=>{},{fetch:fetchPage,generate:async()=>({...recipe,linkSelector:".missing a[href]"})},context),(error:unknown)=>error instanceof CrawlerBuildError && error.report?.discovered===0 && !error.report.passed);
});

test("debug diagnoses and repairs a liveblog missed by six distributed samples", async () => {
  const liveUrl = "https://example.test/posts/story-2"; // Not among 0,1,3,4,6,7.
  let attempts = 0;
  const liveFetch = async (url: string) => url === liveUrl
    ? { finalUrl: url, body: `<h1 class="headline">عنوان پوشش زنده</h1><div class="live-updates"><p>${text}</p></div>` }
    : fetchPage(url);
  const result = await buildCrawler("https://example.test/", "web", new AbortController().signal, async () => {}, {
    fetch: liveFetch,
    generate: async (evidence) => {
      attempts++;
      if (attempts === 2) {
        const data = evidence as { pages: Array<{url:string;previousExtraction:unknown}>; feedback: unknown };
        assert.ok(data.pages.some(page => page.url === liveUrl));
        assert.match(JSON.stringify(data.feedback), /SAMPLE_EXTRACTION_INVALID/);
        assert.match(JSON.stringify(data.feedback), /"matches":0/);
        assert.match(JSON.stringify(data.pages), /previousExtraction/);
      }
      return attempts === 1 ? recipe : { ...recipe, bodySelectors: [...recipe.bodySelectors, ".live-updates"] };
    },
  }, { previousVersionId: "old", recipe, failures: [] });
  assert.equal(attempts, 2);
  assert.equal(result.report.samples.length, 8);
  assert.ok(result.report.samples.some(sample => sample.url === liveUrl && sample.passed));
});

test("debug cannot hide a failed historical article by narrowing the new recipe", async () => {
  const failedUrl = "https://example.test/liveblog/older";
  const brokenFetch = async (url: string) => url === failedUrl
    ? {finalUrl:url,body:'<h1 class="headline">عنوان خبر بدون متن</h1>'}
    : fetchPage(url);
  await assert.rejects(buildCrawler("https://example.test/", "web", new AbortController().signal, async () => {}, {
    fetch: brokenFetch, generate: async () => recipe,
  }, {previousVersionId:"old",recipe:{...recipe,pathPrefixes:["/posts/","/liveblog/"]},failures:[{url:failedUrl,errorCode:"ARTICLE_INVALID",durationMs:null}]}),
  (error:unknown) => error instanceof CrawlerBuildError && !!error.report?.samples.some(sample => sample.url === failedUrl && !sample.passed));
});

test("debug deduplicates repeated failures before testing every distinct failed URL", async () => {
  const urls = ["https://example.test/posts/older-1", "https://example.test/posts/older-2", "https://example.test/posts/older-3", "https://example.test/posts/older-4"];
  const failures = [urls[0],urls[0],urls[0],...urls.slice(1)].map(url => ({url,errorCode:"ARTICLE_INVALID",durationMs:null}));
  const result = await buildCrawler("https://example.test/", "web", new AbortController().signal, async () => {}, {
    fetch: fetchPage, generate: async () => recipe,
  }, {previousVersionId:"old",recipe,failures});
  for (const url of urls) assert.equal(result.report.samples.filter(sample => sample.url === url).length, 1);
});

test("debug preserves previous discovery coverage and rejects inaccessible required pages", async () => {
  const oldListing = listing + '<a class="previous-link" href="/liveblog/current">پوشش زنده خارج از فهرست جدید</a>';
  const oldRecipe = {...recipe,linkSelector:".latest a[href], a.previous-link",pathPrefixes:["/posts/","/liveblog/"]};
  await assert.rejects(buildCrawler("https://example.test/", "web", new AbortController().signal, async () => {}, {
    fetch: async (url) => {
      if (url.endsWith("/liveblog/current")) throw new Error("UPSTREAM_404");
      return url.endsWith("/") ? {finalUrl:url,body:oldListing} : fetchPage(url);
    },
    generate: async () => recipe,
  }, {previousVersionId:"old",recipe:oldRecipe,failures:[]}),
  (error:unknown) => error instanceof CrawlerBuildError && !!error.report?.samples.some(sample => sample.errorCode === "UPSTREAM_404"));
});

test("debug rejects dropping a working link even when its extraction still passes", async () => {
  await assert.rejects(buildCrawler("https://example.test/", "web", new AbortController().signal, async () => {}, {
    fetch: fetchPage, generate: async () => ({...recipe,linkSelector:'.latest a[href]:not([href$="2"])'}),
  }, {previousVersionId:"old",recipe,failures:[]}),
  (error:unknown) => error instanceof CrawlerBuildError && !!error.report?.samples.some(sample => sample.url.endsWith("story-2") && sample.errorCode === "SAMPLE_DISCOVERY_REGRESSION"));
});

test("liveblog article headers remain in model evidence and extraction while site headers are excluded", async () => {
  const liveHtml = `<header class="site-header"><h1>عنوان سایت</h1><div class="wysiwyg">${text}</div></header><main><header class="compact-featured-area"><h1 class="headline">عنوان پوشش زنده</h1><a class="desk-label" href="/category/world">World</a><div class="wysiwyg"><p>${text}</p></div></header></main>`;
  const liveRecipe = {...recipe,titleSelectors:["main h1"],bodySelectors:[".wysiwyg"],categorySelectors:[".desk-label"]};
  const evidence = pageEvidence(liveHtml,"https://example.test/posts/live");
  assert.match(evidence,/compact-featured-area/);
  assert.doesNotMatch(evidence,/site-header/);
  const sample = validateSample(liveHtml,"https://example.test/posts/live",liveRecipe);
  assert.equal(sample.passed,true);
  assert.deepEqual(sample.categories,["World"]);
  assert.equal(extractArticle(liveHtml,"https://example.test/posts/live",liveRecipe)?.content,text.trim());
  assert.equal(extractArticle(`<header><h1 class="headline">عنوان سایت</h1><div class="wysiwyg">${text}</div></header>`,"https://example.test/posts/live",liveRecipe),null);
});
