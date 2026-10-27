const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const state={denied:false,fetches:0};
global.__releaseTest=state;
const mock=`const c=globalThis.__releaseTest;
 export const serviceScope=async()=>{if(c.denied)throw Error('auth');return {actor:'client',sites:new Map()}};
 export const serviceRequest=async()=>{c.fetches++;return {accepted:true}};
 export class ServiceDenied extends Error{};
 export const getSiteOrigin=()=> 'https://portal.example';
 export const rateLimit=async()=>{};`;
async function load(file,ui=false){
 const result=await build({entryPoints:[path.join(__dirname,'..',file)],tsconfig:path.join(__dirname,'../tsconfig.focused.json'),bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'release-fixture',setup(b){
  b.onResolve({filter:/^(server-only|@\/lib\/(hosting\/managed|site|security\/rateLimit))$/},()=>({path:'mock',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'ts'}));
  if(ui){b.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'icons'}));b.onLoad({filter:/.*/,namespace:'icons'},()=>({contents:'export const Home=()=>null,Server=Home,Globe=Home,CreditCard=Home,CircleHelp=Home,UserRound=Home,Archive=Home,Mail=Home,Database=Home,Send=Home;',loader:'js'}));b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'next'}));
   b.onLoad({filter:/.*/,namespace:'next'},args=>({contents:args.path.endsWith('navigation')?`export const usePathname=()=>'/client';`:`import React from 'react';export default ({children,...props})=>React.createElement('a',props,children);`,loader:'jsx',resolveDir:path.resolve(__dirname,'..')}));}
 }}]});
 const output={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,output,output.exports);return output.exports;
}
function req(command,scope='client'){return new Request('https://portal.example/api/hosting-services?scope='+scope,{method:'POST',headers:{origin:'https://portal.example','Content-Type':'application/json'},body:JSON.stringify(command)});}
test('release policy requires explicit publication and the matching backend switch',async()=>{
 const policy=await load('lib/hosting/clientRelease.ts');
 assert.deepEqual(policy.clientReleaseFeatures({}),[]);
 assert.deepEqual(policy.clientReleaseFeatures({HOSTING_CLIENT_FEATURES:'email,forms,backups',HOSTING_SERVICES_ENABLED:'approved'}),['email','forms']);
 assert.deepEqual(policy.clientReleaseFeatures({HOSTING_CLIENT_FEATURES:'*,unknown,backups',HOSTING_BACKUP_PORTAL_ENABLED:'true'}),['backups']);
 assert.deepEqual(policy.clientReleaseFeatures({HOSTING_CLIENT_FEATURES:'email',HOSTING_SERVICES_ENABLED:'true'}),[]);
});
test('unreleased client APIs never reach service transport; owner preview stays accessible',async()=>{
 const {POST}=await load('app/api/hosting-services/route.ts');
 const commands=[{action:'inventory',service:'11111111-1111-4111-8111-111111111111',kind:'email'},{action:'inventory',service:'11111111-1111-4111-8111-111111111111',kind:'database'},{action:'forms.list'}];
 process.env.HOSTING_SERVICES_ENABLED='approved';delete process.env.HOSTING_CLIENT_FEATURES;
 for(const command of commands)assert.equal((await POST(req(command))).status,404);
 assert.equal(state.fetches,0);
 state.denied=true;assert.equal((await POST(req(commands[0]))).status,503);state.denied=false;
 assert.equal((await POST(req(commands[0],'owner'))).status,200);
 process.env.HOSTING_CLIENT_FEATURES='email';
 assert.equal((await POST(req(commands[0]))).status,200);
 assert.equal((await POST(req(commands[1]))).status,404);
 assert.equal((await POST(req(commands[2]))).status,404);
 delete process.env.HOSTING_SERVICES_ENABLED;
 assert.equal((await POST(req(commands[0]))).status,404);
});
test('client menu shows only published features and no testing labels',async()=>{
 const {ClientNavigation}=await load('components/hosting/ClientNavigation.tsx',true);
 const hidden=renderToStaticMarkup(React.createElement(ClientNavigation));
 assert.doesNotMatch(hidden,/\/client\/(email|databases|forms|backups)/);
 assert.match(hidden,/\/client\/services/);
 const published=renderToStaticMarkup(React.createElement(ClientNavigation,{features:['email']}));
 assert.match(published,/\/client\/email/);
 assert.doesNotMatch(published,/\/client\/(databases|forms|backups)|Testing|Coming soon/);
});
