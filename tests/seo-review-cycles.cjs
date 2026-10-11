const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const box = { exports: {}, structuredClone };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/seoReviewConfig.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, box);
const { emptyReview, reviewComplete, nextReview, REVIEW_SECTIONS } = box.exports;
for (const kind of ['gsc', 'gbp']) {
  const current = emptyReview();
  assert.equal(reviewComplete(kind, current), false);
  for (const section of REVIEW_SECTIONS[kind]) current.checks[section.key] = true;
  assert.equal(reviewComplete(kind, current), true);
  current.rows.indexing = [{ 'Page URL': 'https://example.com/new', Status: 'Pending' }];
  current.rows.keywords = [{ Keyword: 'example', Impressions: '120' }];
  current.notes.indexing = 'Follow up next cycle';
  const next = nextReview(current);
  assert.equal(reviewComplete(kind, next), false);
  assert.equal(next.rows.indexing[0].Status, 'Pending');
  assert.equal(next.rows.keywords[0].Impressions, '120');
  assert.equal(next.notes.indexing, 'Follow up next cycle');
  next.rows.indexing[0].Status = 'Indexed';
  assert.equal(current.rows.indexing[0].Status, 'Pending');
}
console.log('SEO review carry-forward and cycle checks passed.');
