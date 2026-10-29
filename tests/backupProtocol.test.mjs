import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backupCommand,backupSites,backupPolicies,backupScopePlan,backupApplyResult,BackupDenied} from '../lib/hosting/backupProtocol.ts';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const context={actor:'alice',owner:false,readOnly:false,sites:new Map([['a',{clientId:'ca',name:'Site A'}],['b',{clientId:'cb',name:'Site B'}]])};
const selection=site=>({site,point:'p',components:['website']});
test('client can select own single-client sites, never another client batch',()=>{
 assert.equal(backupCommand({action:'plan',selections:[selection('a')]},context).selections[0].site,'a');
 assert.throws(()=>backupCommand({action:'plan',selections:[selection('a'),selection('b')]},context),BackupDenied);
 assert.equal(backupCommand({action:'plan',selections:[selection('a'),selection('b')]},{...context,owner:true}).selections.length,2);
});
test('read-only inspection denies all mutations',()=>{
 for(const command of [{action:'plan',selections:[selection('a')]},{action:'stage',job:'j',digest:'a'.repeat(64)},{action:'limit',site:'a',copies:5},{action:'default',site:'a',point:'p'}])assert.throws(()=>backupCommand(command,{...context,owner:true,readOnly:true}),BackupDenied);
 assert.equal(backupCommand({action:'status',job:'j'},{...context,readOnly:true}).action,'status');
});
test('owner policy bounds, unknown privilege fields and live actions denied',()=>{
 for(const copies of [2,1001,true,'4',3.5])assert.throws(()=>backupCommand({action:'limit',site:'a',copies},{...context,owner:true}),BackupDenied);
 for(const command of [{action:'activate'},{action:'list',owner:true},{action:'plan',selections:[selection('foreign')]},{action:'plan',selections:[selection('a'),selection('a')]},{action:'stage',job:'j',digest:'bad'}])assert.throws(()=>backupCommand(command,context),BackupDenied);
 assert.throws(()=>backupCommand({action:'default',site:'a',point:'p'},context),BackupDenied);
});
test('catalog response binds names locally and rejects scope/secret/duplicate/default tampering',()=>{
 const point={id:'p',captured:100,default:true,components:['website']}; const row={id:'a',copies:3,points:[point]};
 assert.equal(backupSites([row],context)[0].name,'Site A');
 for(const rows of [[{...row,id:'foreign'}],[{...row,secret:'leak'}],[row,row],[{...row,points:[point,point]}],[{...row,points:[point,{...point,id:'q'}]}],[{...row,points:[{...point,captured:Date.now()}]}]])assert.throws(()=>backupSites(rows,context),BackupDenied);
});

const owner={...context,owner:true};
const sig='A'.repeat(86)+'==';
const approval={job:'j'.repeat(1)==='j'?'abcdef0123456789abcdef0123456789':'',digest:'a'.repeat(64),nonce:'n1',issued:1700000000,expires:1700000300,signature:sig};
test('policy is read-only safe; schedule is owner-only and bounded',()=>{
 assert.equal(backupCommand({action:'policy'},{...context,readOnly:true}).action,'policy');
 assert.throws(()=>backupCommand({action:'schedule',site:'a',interval_days:7},context),BackupDenied);
 assert.throws(()=>backupCommand({action:'schedule',site:'a',interval_days:7},{...owner,readOnly:false,sites:new Map()}),BackupDenied);
 for(const days of [0,31,true,'7',1.5])assert.throws(()=>backupCommand({action:'schedule',site:'a',interval_days:days},owner),BackupDenied);
 assert.equal(backupCommand({action:'schedule',site:'a',interval_days:30},owner).interval_days,30);
});
test('scoped restore plans: a client names only its own, the administrator may cross clients, nothing else is accepted',()=>{
 assert.equal(backupCommand({action:'plan_scope',scope:{type:'site',site:'a'}},context).scope.site,'a');
 assert.equal(backupCommand({action:'plan_scope',scope:{type:'client',client:'ca'}},context).scope.client,'ca');
 for(const scope of [{type:'site',site:'foreign'},{type:'client',client:'nobody'},{type:'sites',sites:['a','b']},{type:'all'},{type:'site',site:'a',extra:1},{type:'sites',sites:[]},{type:'sites',sites:['a','a']}])assert.throws(()=>backupCommand({action:'plan_scope',scope},context),BackupDenied,JSON.stringify(scope));
 assert.equal(backupCommand({action:'plan_scope',scope:{type:'sites',sites:['a','b']}},owner).scope.sites.length,2);
 assert.deepEqual(backupCommand({action:'plan_scope',scope:{type:'site',site:'a'},point:{a:'p'},accept_shared:['email:a-mail']},context).accept_shared,['email:a-mail']);
 for(const extra of [{point:'oldest'},{point:{foreign:'p'}},{components:['logs']},{accept_shared:['email']},{accept_shared:['x:y']},{role:'owner'}])assert.throws(()=>backupCommand({action:'plan_scope',scope:{type:'site',site:'a'},...extra},context),BackupDenied,JSON.stringify(extra));
 assert.throws(()=>backupCommand({action:'plan_scope',scope:{type:'site',site:'a'}},{...context,readOnly:true}),BackupDenied);
});
test('apply is the owner relaying their own signature; anything else is refused',()=>{
 assert.equal(backupCommand({action:'apply',job:approval.job,approval},owner).approval.nonce,'n1');
 assert.throws(()=>backupCommand({action:'apply',job:approval.job,approval},context),BackupDenied);
 assert.throws(()=>backupCommand({action:'apply',job:approval.job,approval},{...owner,readOnly:true}),BackupDenied);
 for(const bad of [{...approval,job:'other'},{...approval,digest:'x'},{...approval,signature:'short'},{...approval,expires:approval.issued},{...approval,extra:1},{...approval,plan:null}])assert.throws(()=>backupCommand({action:'apply',job:approval.job,approval:bad},owner),BackupDenied,JSON.stringify(bad).slice(0,50));
});
test('real responses from the automation backup chain satisfy the portal validators, and tampering is caught',{skip:!process.env.HMS_AUTOMATION_SOURCE},()=>{
 const run=spawnSync('python',[fileURLToPath(new URL('./fixtures/hosting-backup-responses.py',import.meta.url)),process.env.HMS_AUTOMATION_SOURCE],{encoding:'utf8',cwd:process.env.HMS_AUTOMATION_SOURCE,env:{...process.env,PYTHONPATH:process.env.HMS_AUTOMATION_SOURCE}});
 assert.equal(run.status,0,run.stderr);
 const real=JSON.parse(run.stdout);
 const ctx={actor:'owner',owner:true,readOnly:false,sites:new Map([['svc-shop',{clientId:'client-a',name:'Shop'}],['svc-blog',{clientId:'client-a',name:'Blog'}],['svc-platform',{clientId:'platform',name:'Portal'}]])};
 const policies=backupPolicies(real.policy,ctx);
 assert.equal(policies.length,2);assert.equal(policies[0].copies,3);assert.match(policies[0].explanation,/every 30 days/);assert.ok(policies[0].points.every(p=>p.components.length===4));
 const plan=backupScopePlan(real.plan,ctx);
 assert.deepEqual(plan.sites.map(s=>s.site).sort(),['svc-blog','svc-shop']);assert.equal(plan.plan.schema,1);
 const applied=backupApplyResult(real.apply,ctx,plan.job);assert.equal(applied.state,'applied');
 const command=backupCommand({action:'apply',job:plan.job,approval:real.approval},ctx);assert.equal(command.approval.job,plan.job);
 // tampering
 assert.throws(()=>backupPolicies([{...real.policy[0],secret:'x'}],ctx),BackupDenied);
 assert.throws(()=>backupPolicies([{...real.policy[0],points:[{...real.policy[0].points[0],default:true},{...real.policy[0].points[1],default:true}]}],ctx),BackupDenied);
 assert.throws(()=>backupPolicies([{...real.policy[0],id:'svc-unknown'}],ctx),BackupDenied);
 assert.throws(()=>backupScopePlan({...real.plan,sites:[...real.plan.sites,real.plan.sites[0]]},ctx),BackupDenied);
 assert.throws(()=>backupScopePlan({...real.plan,extra:1},ctx),BackupDenied);
 assert.throws(()=>backupApplyResult({...real.apply,state:'applied',sites:real.apply.sites.map(s=>({...s,apply:'reverted'}))},ctx,plan.job),BackupDenied);
 assert.throws(()=>backupApplyResult(real.apply,ctx,'f'.repeat(32)),BackupDenied);
});
