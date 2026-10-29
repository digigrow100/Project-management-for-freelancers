// The 23-limit contract is copied into the automation repository as tests/fixtures/app_limits_contract.json (asserted there against the Python code).
// This test fails if the TypeScript source and that shared fixture ever differ.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hosting/packageLimits.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require});
const L=m.exports,fixture=JSON.parse(fs.readFileSync('tests/fixtures/app-limits-contract.json','utf8'));
assert.deepEqual(JSON.parse(JSON.stringify(L.RESOURCE_FIELDS.map(f=>[f[0],f[2]]))),fixture.fields);
assert.equal(L.RESOURCE_FIELDS.length,23);
for(const p of L.APP_PLAN_PRESETS){const c=L.canonicalLimits(p.limits),f=fixture.presets[p.catalog_key];assert.ok(f,p.catalog_key);
 assert.deepEqual(JSON.parse(JSON.stringify(p.limits)),f.limits);assert.equal(c,f.canonical);assert.equal(crypto.createHash('sha256').update(c).digest('hex'),f.digest);}
assert.equal(Object.keys(fixture.presets).length,L.APP_PLAN_PRESETS.length);
console.log('PASS 23-limit contract matches the shared fixture used by the automation repository');
