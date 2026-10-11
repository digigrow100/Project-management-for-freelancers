const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = ts.createSourceFile('store.ts', fs.readFileSync('lib/store.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['setPausedTaskPendingMode', 'closeOpenTimeEntriesForTask'];
const code = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(source)).join('\n');
const entries = [{id:'active-entry',task_id:'active',user_id:'member',started_at:'2026-10-11T10:00:00Z',ended_at:null},{id:'queued-entry',task_id:'queued',user_id:'member',started_at:'2026-10-11T10:00:00Z',ended_at:null}];
entries.push({id:'previous-assignee',task_id:'queued',user_id:'other-member',started_at:'2026-10-11T10:00:00Z',ended_at:null});
const focus = {};
const box = {exports:{}, Date, requireAssignedTask:async()=>({status:'in_progress',projectId:'project'}), nowIso:()=> '2026-10-11T10:30:00Z', businessTomorrowMorningIso:()=> '2026-10-12T04:00:00Z', touchProject:async()=>{}, isMissingTableError:()=>false,
  getSupabase:()=>({from(table){
    let filters=[],patch;
    const query = {select(){return query;},eq(k,v){filters.push(r=>r[k]===v);return query;},is(k,v){filters.push(r=>r[k]===v);return query;},update(p){patch=p;return query;},upsert(p){focus[p.task_id]=p;return Promise.resolve({error:null});},then(resolve){const rows=entries.filter(r=>filters.every(f=>f(r)));if(patch)rows.forEach(r=>Object.assign(r,patch));return Promise.resolve({data:rows,error:null}).then(resolve);}};
    return query;
  }})};
vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box);
(async()=>{
  await box.exports.setPausedTaskPendingMode('queued','member','30m');
  assert.equal(entries[0].ended_at,null,'A different active timer must keep running');
  assert.equal(entries[1].ended_at,'2026-10-11T10:30:00Z');
  assert.equal(entries[1].duration_seconds,1800);
  assert.equal(entries[2].ended_at,null,'Previous assignee timing must remain untouched');
  await box.exports.setPausedTaskPendingMode('active','member','1h');
  assert.equal(entries[0].ended_at,'2026-10-11T10:30:00Z','Deferring the active task must stop its timer');
  console.log('Passed: queued task deferral preserves active timer; selected task timing closes correctly.');
})().catch(e=>{console.error(e);process.exitCode=1;});
