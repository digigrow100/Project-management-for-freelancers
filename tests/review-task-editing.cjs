const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function compile(path,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in mocks))throw Error(n);return mocks[n];}});return exports;}
const config=compile('lib/seoReviewConfig.ts',{});
async function run(options={}){
 const task={project_id:'p',assigned_to:'u',status:'in_progress',fallback_template_key:'review:gbp:1',checklist:config.REVIEW_SECTIONS.gbp.map(s=>({id:`review:gbp:${s.key}`})),...options.task};
 const saved=[];const data={checks:options.checks??{},rows:{access:[{Owner:'Client'}]},notes:{access:'Keep evidence'}};
 const db={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:task,error:null})}),rpc:async(name,args)=>{saved.push(args);return {error:options.conflict?{message:'This review changed. Reload before saving.'}:null};}};
 const a=compile('lib/seoReviewActions.ts',{'./auth':{requireProjectAccess:async()=>({id:options.user??'u',role:options.role??'member'})},'./supabaseClient':{getSupabase:()=>db},'./store':{getProject:async()=>({type:'seo'})},'./seoReviews':{getSeoReview:async()=>({available:true,cycle:options.cycle??1,revision:4,data})},'./seoReviewConfig':config,'next/cache':{revalidatePath:()=>{}}});
 try{return {result:await a.toggleSeoReviewTaskCheckAction('t','p',options.item??'review:gbp:access'),saved,data};}catch(error){return {error,saved,data};}
}
(async()=>{
 let x=await run();assert.equal(x.saved[0].p_data.checks.access,true);assert.deepEqual(x.saved[0].p_data.rows,x.data.rows);assert.deepEqual(x.saved[0].p_data.notes,x.data.notes);assert.equal(x.saved[0].p_revision,4);assert.equal(x.result.complete,false);
 x=await run({checks:{access:true}});assert.equal(x.saved[0].p_data.checks.access,false);
 x=await run({checks:Object.fromEntries(config.REVIEW_SECTIONS.gbp.map(s=>[s.key,s.key!=='access']))});assert.equal(x.result.complete,true);assert.equal(x.saved[0].p_complete,true);
 for(const options of [{user:'other'},{cycle:2},{task:{project_id:'other'}},{task:{status:'done'}},{item:'review:gbp:fake'},{item:'review:gsc:access'}]){x=await run(options);assert.ok(x.error);assert.equal(x.saved.length,0);}
 x=await run({user:'admin',role:'admin'});assert.ok(!x.error);
 x=await run({conflict:true});assert.match(x.error.message,/Reload/);
 console.log('Review task editing: 11 scenarios passed');
})().catch(e=>{console.error(e);process.exit(1);});
