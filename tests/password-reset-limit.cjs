const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

function load(file,mocks={},env={}){
 const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
 const m={exports:{}};
 vm.runInNewContext(js,{module:m,exports:m.exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),process:{env},Buffer,URL});
 return m.exports;
}

const UNAVAILABLE='Password reset is temporarily unavailable. Please try again later.';

test('password reset errors name the wait and keep outages separate',async()=>{
 const messages=load('lib/security/passwordResetLimit.ts');
 let allowed=true,unavailable=false,args;
 const limiter=load('lib/security/rateLimit.ts',{
  'next/headers':{headers:()=>({get:()=>null})},
  '@/lib/supabaseClient':{getSupabase:()=>({rpc:async(_name,value)=>{args=value;return {data:allowed,error:unavailable?{message:'down'}:null};}})}
 },{SUPABASE_SERVICE_ROLE_KEY:'test-only-not-real'});

 allowed=false;
 await assert.rejects(limiter.limitSignIn('reset','Owner@Example.com'),error=>{
  assert.equal(messages.passwordResetLimiterMessage(error),'You can try again in 15 minutes.');
  assert.equal(error instanceof limiter.RateLimitExceeded,true);
  return true;
 });
 assert.equal(args.p_limit,3);
 assert.equal(args.p_seconds,900);
 assert.equal(messages.passwordResetLimiterMessage(new limiter.RateLimitExceeded(60)),'You can try again in 1 minute.');
 assert.equal(messages.passwordResetLimiterMessage(new limiter.RateLimitExceeded(61)),'You can try again in 2 minutes.');
 assert.equal(messages.passwordResetLimiterMessage({code:'rate_limited',retryAfterSeconds:900}),'You can try again in 15 minutes.');

 allowed=true;unavailable=true;
 await assert.rejects(limiter.limitSignIn('reset','Owner@Example.com'),error=>{
  assert.equal(messages.passwordResetLimiterMessage(error),UNAVAILABLE);
  assert.equal(error instanceof limiter.SecurityCheckUnavailable,true);
  return true;
 });
 const bare=load('lib/security/rateLimit.ts',{'next/headers':{headers:()=>({get:()=>null})},'@/lib/supabaseClient':{getSupabase:()=>{throw new Error('must not run');}}}, {});
 await assert.rejects(bare.limitSignIn('reset','owner@example.com'),error=>messages.passwordResetLimiterMessage(error)===UNAVAILABLE);
 for(const error of [new Error('database timeout'),null,undefined,'Please wait before requesting another reset link.',{code:'rate_limited',retryAfterSeconds:0},{code:'rate_limited',retryAfterSeconds:900.5},{name:'RateLimitExceeded'}]){
  assert.equal(messages.passwordResetLimiterMessage(error),UNAVAILABLE);
 }
 const leaked={name:'AuthApiError',status:429,code:'over_email_send_rate_limit',message:'For security purposes, you can only request this after 12 seconds. owner@gmail.com'};
 assert.equal(messages.passwordResetProviderMessage(leaked),'You can try again in 12 seconds.');
 assert.equal(messages.passwordResetAuthLog(leaked).name,'AuthApiError');
 assert.equal(messages.passwordResetAuthLog(leaked).status,429);
 assert.equal(messages.passwordResetAuthLog(leaked).code,'over_email_send_rate_limit');
 assert.equal(JSON.stringify(messages.passwordResetAuthLog(leaked)).includes('@'),false);
 assert.equal(messages.passwordResetProviderMessage({name:'AuthRetryableFetchError',status:500,code:undefined,message:'Error sending recovery email'}), "We couldn't send the reset email. Please try again in a few minutes.");
 assert.equal(messages.passwordResetProviderMessage({name:'AuthRetryableFetchError',status:504,code:'request_timeout'}),"We couldn't send the reset email. Please try again in a few minutes.");
 assert.equal(messages.passwordResetProviderMessage({name:'AuthApiError',status:400,code:'validation_failed',message:'Email address owner@gmail.com is invalid'}),'Could not complete this request. Please try again later.');
 assert.equal(messages.passwordResetAuthLog({name:'AuthApiError',status:400,code:'owner@gmail.com'}).code,null);
});
