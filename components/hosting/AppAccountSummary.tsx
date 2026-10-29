import type {AppAccountView} from '@/lib/hosting/store';
import {UsageTable} from './AppAccountPanel';
const stateLabel:Record<string,string>={requested:'Waiting for setup',provisioning:'Being set up',uncertain:'Being reviewed by support',provider_confirmed:'Almost ready: storage controls are being verified',enforced:'Ready: the server confirmed your limits',suspended:'Suspended'};
// Read-only and honest: no controls, no estimates. A value nothing measured is shown as unknown.
export function AppAccountSummary({account}:{account?:AppAccountView}){
 if(!account)return <p className="text-sm text-slate-600">Your hosting account has not been set up on the server yet.</p>;
 return <div className="space-y-2 text-sm text-slate-700"><p><strong>Status:</strong> {stateLabel[account.status]??'Being reviewed by support'}</p>
  <p><strong>Websites in this plan:</strong> {account.sites.map(s=>s.hostname+(s.status==='verified'?'':' (not ready)')).join(', ')}</p>
  {account.blocked_features.length>0&&<p><strong>Not available yet:</strong> {account.blocked_features.join(', ')}. These features start only after the server can enforce their limits.</p>}
  {account.usage?<UsageTable usage={account.usage} at={account.usage_at}/>:<p>Usage: unknown (not measured yet).</p>}</div>;
}
