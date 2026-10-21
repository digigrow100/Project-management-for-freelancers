import "server-only";
import { parseBridgeReport,type BridgeReport } from './bridgeReports';
const root='https://api.github.com';
export const bridgeRepository='digigrow100/housemysite-server-automation';
async function github(path:string,token:string):Promise<unknown>{
 const response=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('GitHub connection failed. Check the token, its expiry and repository Issues read permission.');
 const raw=await response.text();if(raw.length>2000000)throw new Error('The management response was too large.');
 return JSON.parse(raw);
}
export async function readBridgeReports():Promise<BridgeReport[]>{
 const token=process.env.HOSTING_BRIDGE_GITHUB_TOKEN;
 if(!token)throw new Error('Add HOSTING_BRIDGE_GITHUB_TOKEN to the Vercel production environment, then redeploy. Use a fine-grained token restricted to the automation repository with Issues: Read-only.');
 const user=await github('/user',token) as {id?:number};if(user.id!==110416445)throw new Error('Use a token owned by the existing digigrow100 management account.');
 const result=await github(`/repos/${bridgeRepository}/issues?labels=hms-operation&state=all&sort=created&direction=desc&per_page=30`,token);
 if(!Array.isArray(result))throw new Error('Management reports could not be loaded.');
 const candidates=result.filter(i=>!i.pull_request&&i.user?.id===110416445&&typeof i.body==='string'&&i.body.length<=400).filter(i=>{try{return ['audit.health','audit.services'].includes(JSON.parse(i.body).operation);}catch{return false;}}).slice(0,4);
 const results=await Promise.all(candidates.map(async i=>{
  const comments=await github(`/repos/${bridgeRepository}/issues/${i.number}/comments?per_page=100`,token);
  if(!Array.isArray(comments))return [];
  return comments.map(c=>parseBridgeReport(i,c)).filter((r):r is BridgeReport=>r!==null);
 }));
 return results.flat().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,4);
}
