// Creates local operator files. Deliberately never prints their contents.
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
const host=process.argv[2];
if(!host||!/^[a-z0-9.-]+$/.test(host)||!host.endsWith('.housemysite.com'))throw Error('Pass the dedicated agent hostname.');
for(const file of ['.env','vercel-private.env'])if(existsSync(file))throw Error(`${file} already exists; refusing to rotate credentials.`);
const pair=generateKeyPairSync('ed25519'),token=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
const publicKey=pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),privateKey=pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64');
writeFileSync('.env',`AGENT_HOST=${host}\nHOSTING_AGENT_TOKEN=${token}\nHOSTING_AGENT_SIGNING_PUBLIC_KEY=${publicKey}\nPORTAL_ORIGINS=https://web.housemysite.com\nPORTAL_RECEIPT_URL=https://web.housemysite.com/api/hosting-websites/receipts\nTRAEFIK_ENTRYPOINT=websecure\nTRAEFIK_CERT_RESOLVER=le\n# If CrowdSec is attached through a per-router middleware, set its existing name here.\nTRAEFIK_MIDDLEWARES=\nMAX_SITE_BYTES=2000000000\nSTAGING_BUDGET_BYTES=6000000000\nBUILDER_IMAGE=hms-website-builder:1\n`,{mode:0o600,flag:'wx'});
writeFileSync('vercel-private.env',`HOSTING_AGENT_URL=https://${host}\nHOSTING_AGENT_TOKEN=${token}\nHOSTING_AGENT_SIGNING_KEY=${privateKey}\nHOSTING_APP_SECRETS_KEY=${secret}\n`,{mode:0o600,flag:'wx'});
console.log('Created private agent and Vercel credential files. No credentials printed. Read the files privately and configure the correct Vercel project only.');
