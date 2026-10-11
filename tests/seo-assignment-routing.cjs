const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const cache={};
function read(name){if(cache[name])return cache[name];const box={exports:{},structuredClone,require:p=>read(p.replace('./',''))};vm.runInNewContext(ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box);return cache[name]=box.exports;}
const {seoAssignmentGroup:group,seoItemOwner:owner}=read('seoAssignmentRouting');
assert.equal(group({module:'recurring',itemKey:'indexing_review'}),'gsc');
assert.equal(group({module:'local_listing',itemKey:'google_business_profile'}),'gbp');
assert.equal(group({module:'local_listing',itemKey:'yell'}),'local_listing');
for(const itemKey of ['analytics_conversion_review','tool_health_check','tool_usage_review'])assert.equal(group({module:'recurring',itemKey}),'recurring_general');
assert.equal(group({module:'recurring',itemKey:'tool_internal_links_review'}),'technical_seo');
const owners=new Map([['gsc','Maaz'],['gbp','Junaid'],['recurring_general','Junaid'],['recurring','legacy']]);
assert.equal(owner({module:'recurring',itemKey:'indexing_review'},owners),'Maaz');
assert.equal(owner({module:'recurring',itemKey:'analytics_conversion_review'},owners),'Junaid');
assert.equal(owner({module:'recurring',itemKey:'tool_internal_links_review'},owners),'legacy');
console.log('Passed: independent GSC/GBP/general recurring routing, technical separation and legacy fallback.');
