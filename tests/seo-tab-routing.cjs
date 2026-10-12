const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert');
const cache={};function read(name){if(cache[name])return cache[name];const c={exports:{},require:n=>n.startsWith('./')?read(n.slice(2)):require(n),structuredClone};vm.runInNewContext(ts.transpile(fs.readFileSync('lib/'+name+'.ts','utf8'),{module:ts.ModuleKind.CommonJS}),c);return cache[name]=c.exports;}
const {seoAssignmentGroup,seoItemOwner}=read('seoAssignmentRouting');
const owners=new Map([['full_website','Junaid'],['technical_seo','Maaz'],['gsc','Maaz'],['gbp','Junaid'],['recurring_general','Junaid']]);
for(const [module,itemKey,group,owner] of [['full_website','xml_sitemap','technical_seo','Maaz'],['full_website','google_tag_manager','full_website','Junaid'],['recurring','indexing_review','gsc','Maaz'],['recurring','broken_link_scan','technical_seo','Maaz'],['recurring','backlink_review','recurring_general','Junaid'],['local_listing','google_business_profile','gbp','Junaid']]) {const item={module,itemKey};assert.equal(seoAssignmentGroup(item),group);assert.equal(seoItemOwner(item,owners),owner);}
assert.equal(seoItemOwner({module:'full_website',itemKey:'xml_sitemap'},new Map([['full_website','legacy']])),'legacy');
console.log('Passed: tab routing separates tracking, technical checks, GSC, GBP and recurring; legacy fallback retained.');
