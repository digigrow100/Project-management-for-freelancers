import {HOSTING_SECTIONS} from '@/lib/hostingWorkspace';

export type PanelSection = typeof HOSTING_SECTIONS[number]['key'];
export type PanelSettings = Readonly<Record<string, string | undefined>>;
export type PanelFeature = 'services'|'provisioning'|'domains'|'sources'|'uploads'|'publishing'|'github'|'nextjs'|'autodeploy'|'backups';
export type PanelState = {enabled:boolean;label:string};

// Configuration only. Never infer worker enrollment, availability, or live health.
export function panelFeatureState(feature:PanelFeature, settings:PanelSettings):PanelState {
 const services=settings.HOSTING_SERVICES_ENABLED==='approved';
 const sources=services&&settings.HOSTING_SOURCES_ENABLED==='approved';
 const publishing=sources&&settings.HOSTING_PUBLISHING_ENABLED==='approved';
 const github=sources&&settings.HOSTING_GITHUB_ENABLED==='approved';
 const flags:Record<PanelFeature,boolean>={services,
  provisioning:services&&settings.HOSTING_PROVISIONING_ENABLED==='approved',
  domains:services&&settings.HOSTING_DOMAIN_AUTOMATION_ENABLED==='approved',
  sources,uploads:sources&&settings.HOSTING_SOURCES_UPLOAD_ENABLED==='approved',publishing,github,
  nextjs:publishing&&settings.HOSTING_NEXTJS_ENABLED==='approved',
  autodeploy:publishing&&github&&settings.HOSTING_AUTODEPLOY_ENABLED==='approved',
  // The backup gateway intentionally uses "true", not "approved".
  backups:settings.HOSTING_BACKUP_PORTAL_ENABLED==='true'&&Boolean(settings.HOSTING_BACKUP_OWNER_ID)
 };
 return {enabled:flags[feature],label:flags[feature]?'Controls enabled':'Setup needed'};
}

export const PANEL_GROUPS=['Customers & hosting','Websites & data','Billing & payments','Support & administration'] as const;
type Group=typeof PANEL_GROUPS[number];
type Guide={group:Group;items:readonly string[];next:string;related:readonly PanelSection[];feature?:PanelFeature};
export const PANEL_GUIDES:Record<PanelSection,Guide>={
 clients:{group:PANEL_GROUPS[0],items:['Client contact details and status','Portal invitations and account links','Owner inspection of a client portal'],next:'Create a client, then assign a hosting service. Invitations are sent only when you request them.',related:['services','tickets']},
 packages:{group:PANEL_GROUPS[0],items:['Plan price, currency and billing cycle','Declared website, storage and mailbox limits','Allowed servers for each plan'],next:'Save a plan and choose its allowed server. Provider policies must enforce its supported limits before provisioning.',related:['servers','services']},
 servers:{group:PANEL_GROUPS[0],items:['Server identity, provider and capacity','Available, draft and maintenance status','Private connection enrollment'],next:'Use the existing server record. A record marked available is an admin declaration, not a live health check.',related:['packages','operations']},
 services:{group:PANEL_GROUPS[0],items:['Client, package, server and primary domain','Renewal dates and service records','Provisioning requests and scoped status'],next:'Select an active client and plan, an allowed available server and a primary domain. Creation on the VPS requires reviewed enrollment and owner approval.',related:['clients','packages','domains','sources'],feature:'provisioning'},
 domains:{group:PANEL_GROUPS[1],items:['Owned domain records and renewal dates','DNS and certificate observations','Primary-domain link and SSL requests'],next:'Link a domain to its hosting service. Point DNS to the server before requesting SSL; a request alone is not a valid certificate. Domain purchases and aliases are not connected here.',related:['services','sources'],feature:'domains'},
 sources:{group:PANEL_GROUPS[1],items:['GitHub connection, repository switch and export','ZIP upload, staging and supported builds','Publish, rollback, recovery and signed approvals'],next:'Choose a provisioned website. Connect the private source service before using its controls. Publishing, uploads, GitHub and Next.js have separate release gates.',related:['services','domains','backups','operations'],feature:'sources'},
 email:{group:PANEL_GROUPS[1],items:['Mail domains and mailbox inventory','Create, enable, disable and delete requests','Password changes, mailbox quotas and owner approvals'],next:'Select an enrolled hosting service and load its inventory. Passwords are sealed before transport; provider confirmation is required for changes.',related:['services','domains','backups'],feature:'services'},
 databases:{group:PANEL_GROUPS[1],items:['Database and user inventory','Create, password and lifecycle requests','Package limits and independent owner approvals'],next:'Select an enrolled service. Database ownership and limits are checked on the server; a queued request is not a completed database.',related:['services','backups'],feature:'services'},
 forms:{group:PANEL_GROUPS[1],items:['Paid Forms API accounts and monthly usage','API key rotation and revocation','Server-side request format and delivery states'],next:'Enroll a paid Forms account with its fixed sender and recipient. Generating a key does not create an email inbox or guarantee inbox delivery.',related:['email','services','invoices'],feature:'services'},
 backups:{group:PANEL_GROUPS[1],items:['Available restore dates and protected default','Owner-managed schedules and retention conflicts','Website, client and selected-client restore scopes'],next:'Connect encrypted offsite storage, independent evidence and restore targets before enabling recovery. The default is three points including a protected default; this is not a daily two-month history.',related:['services','email','databases','operations'],feature:'backups'},
 billing:{group:PANEL_GROUPS[2],items:['Received payments, refunds and expenses','Outstanding invoices by currency','Date-filtered hosting cash flow'],next:'Review currencies separately. Billing records do not verify server capacity or provision a website.',related:['invoices','payments','expenses']},
 invoices:{group:PANEL_GROUPS[2],items:['Create and view hosting invoices','Record payments and invoice status','Service billing periods and renewal invoices'],next:'Choose the client and service, review the amount and currency, then issue the invoice. Online checkout is not connected.',related:['clients','services','payments']},
 payments:{group:PANEL_GROUPS[2],items:['Recorded payment transactions','Refund history','Invoice-linked immutable financial entries'],next:'Record a payment or refund from its invoice after checking the actual transaction.',related:['invoices','submissions','billing']},
 expenses:{group:PANEL_GROUPS[2],items:['Server and hosting running costs','Expense dates and currencies','Financial overview totals'],next:'Record the actual cost and currency. Recording an expense does not purchase a service.',related:['billing','servers']},
 submissions:{group:PANEL_GROUPS[2],items:['Client payment reference submissions','Review and rejection states','Invoice reference checks'],next:'Verify a payment claim against your actual payment account before recording received money.',related:['invoices','payments']},
 tickets:{group:PANEL_GROUPS[3],items:['Client support conversations','Open and resolved ticket states','Private owner notes and customer replies'],next:'Open a ticket to reply. Private notes remain separate from customer-visible messages.',related:['clients','services']},
 operations:{group:PANEL_GROUPS[3],items:['Reviewed operation requests and receipts','Device signing and operator delivery','Client feature-release settings'],next:'Review operation evidence before repeating a request. Note-only requests do not execute VPS commands. Website approvals are on Website Source; mailbox/database approvals are on their own pages.',related:['sources','email','databases','backups']},
 activity:{group:PANEL_GROUPS[3],items:['Hosting administration events','Client and service changes','Billing audit history'],next:'Use this audit history to review recorded changes. It is not a continuous VPS monitoring feed.',related:['operations','billing']},
 settings:{group:PANEL_GROUPS[3],items:['Business details and invoice terms','Renewal preferences and account authenticator','Owner integration and feature-release overview'],next:'Save business preferences here. Private provider credentials stay in secure server or deployment settings; they are never shown in this panel.',related:['servers','operations']}
};
