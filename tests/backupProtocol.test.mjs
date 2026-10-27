import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backupCommand,backupSites,BackupDenied} from '../lib/hosting/backupProtocol.ts';
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
