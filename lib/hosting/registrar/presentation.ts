import type {DomainInfo} from './schema';
export type InventoryFilter='all'|'expiring'|'expired'|'locked'|'auto_renew';
export type InventoryRow={name:string;details:DomainInfo;synced_at:string;category:'expiring'|'expired'|'other'|'unknown'};
export type InventorySummary={total:number;expiring:number;expired:number;autoRenew:number;locked:number};
export const groupLabels={expiring:'Expiring soon',expired:'Expired domains',other:'Other domains',unknown:'Expiry not supplied'};
export function expiryLabel(expires:number){return Number.isFinite(expires)&&expires>0&&expires<8640000000000000?new Date(expires).toISOString().slice(0,10):'Not supplied';}
export function daysLabel(expires:number,asOf:number){if(!Number.isFinite(expires)||expires<=0)return 'Expiry unknown';const delta=expires-asOf;if(delta<0)return Math.ceil(-delta/86400000)+' days overdue';const days=Math.ceil(delta/86400000);return days===0?'Due today':days+' days left';}
