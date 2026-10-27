// Checks changed source with typed boundaries for unavailable existing app dependencies.
// This is deliberately not a full repository build or auth integration check.
const ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),temporary=path.join(root,'test-runtime/types');fs.mkdirSync(temporary,{recursive:true});
const declarations={
 auth:'export function requireHostingAdmin():Promise<{id:string}>;export function requireHostingClient():Promise<{userId:string;clientId:string;adminView:boolean;client:{status:string}}>;',
 supabase:'type Row={id:string;client_id:string;name:string};type Query=PromiseLike<{data:Row[]|null;error:unknown}>&{select(s:string):Query;order(s:string):Query;limit(n:number):Query;eq(s:string,v:string):Query;insert(row:unknown):Query;single():Promise<{data:any;error:unknown}>;maybeSingle():Promise<{data:any;error:unknown}>};export function getSupabase():{from(s:string):Query;rpc(name:string,args:unknown):Promise<{data:any;error:unknown}>};',
 site:'export function getSiteOrigin():string;',
 rate:'export function rateLimit(scope:string,actor:string,limit:number,seconds:number):Promise<void>;',
 empty:'export {};',
 next:'import type {ComponentType,AnchorHTMLAttributes} from "react";declare const Link:ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>&{href:string}>;export default Link;',
 navigation:'export function usePathname():string;',
 icons:'import type {ComponentType} from "react";type Icon=ComponentType<{size?:number;strokeWidth?:number;"aria-hidden"?:string}>;export const Home:Icon,Server:Icon,Globe:Icon,CreditCard:Icon,CircleHelp:Icon,UserRound:Icon,Archive:Icon;'
};for(const [name,text] of Object.entries(declarations))fs.writeFileSync(path.join(temporary,name+'.d.ts'),text);
const options={target:ts.ScriptTarget.ES2020,lib:['lib.dom.d.ts','lib.dom.iterable.d.ts','lib.esnext.d.ts'],strict:true,noUncheckedIndexedAccess:true,skipLibCheck:true,noEmit:true,esModuleInterop:true,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,baseUrl:root,paths:{'@/*':['./*']},typeRoots:[path.join(root,'node_modules/@types')]};
const host=ts.createCompilerHost(options);const mappings={'./auth':'auth','@/lib/hosting/auth':'auth','@/lib/supabaseClient':'supabase','@/lib/site':'site','@/lib/security/rateLimit':'rate','server-only':'empty','next/link':'next','next/navigation':'navigation','lucide-react':'icons'};
host.resolveModuleNames=(names,containing)=>names.map(name=>mappings[name]?{resolvedFileName:path.join(temporary,mappings[name]+'.d.ts'),extension:ts.Extension.Dts}:ts.resolveModuleName(name,containing,options,ts.sys).resolvedModule);
const files=['lib/hosting/operator.ts','lib/hosting/operatorSchema.ts','lib/hosting/operatorProtocol.ts','lib/hosting/operatorBody.ts','components/hosting/SignedOperatorDelivery.tsx','app/api/hosting-operator/dispatch/route.ts','lib/hosting/backupProtocol.ts','lib/hosting/backups.ts','app/api/hosting-backups/route.ts','components/hosting/BackupManager.tsx','components/hosting/ClientNavigation.tsx','lib/hostingWorkspace.ts','app/(app)/hosting/backups/page.tsx','app/(client)/client/backups/page.tsx'].map(p=>path.join(root,p));
const program=ts.createProgram(files,options,host);const errors=ts.getPreEmitDiagnostics(program);if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exit(1);}console.log('Focused changed-source typecheck passed (existing dependency boundaries stubbed).');
