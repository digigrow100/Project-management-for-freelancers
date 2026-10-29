import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),uuid=z.string().uuid();
const sealed=z.string().min(80).max(3000).regex(/^[A-Za-z0-9_-]+={0,2}$/);
const treeId=z.string().regex(/^[a-f0-9]{32}$/),sourceNumber=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),sourceVersion=z.number().int().min(0).max(1000000);
// Conservative git ref check; the private service applies the authoritative rules again.
// Build-time variables are plain, non-secret values (they can end up in browser code); secrets are runtime settings configured outside the build.
const RESERVED_BUILD_VARIABLE=/^(PATH|HOME|USER|LOGNAME|SHELL|PWD|OLDPWD|TMPDIR|TMP|TEMP|CI|IFS|ENV|BASH_ENV|NODE_[A-Z0-9_]*|NPM_[A-Z0-9_]*|LD_[A-Z0-9_]*|HMS_[A-Z0-9_]*|NEXT_TELEMETRY_DISABLED|[A-Z]*_PROXY|SSL_[A-Z0-9_]*|SUDO_[A-Z0-9_]*|PYTHON[A-Z0-9_]*|GIT_[A-Z0-9_]*|DYLD_[A-Z0-9_]*|LC_[A-Z0-9_]*|LANG)$/;
const buildVariableName=z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).refine(n=>!RESERVED_BUILD_VARIABLE.test(n)&&(n.startsWith('NEXT_PUBLIC_')||!/(secret|password|passwd|token|private|credential|api_?key|auth)/i.test(n)));
export const buildVariables=z.record(buildVariableName,z.string().max(2048).regex(/^[^\u0000-\u001f\u007f]*$/)).refine(v=>Object.keys(v).length<=32);
const sourceBranch=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/).refine(v=>!v.includes('..')&&!v.includes('//')&&!v.endsWith('/')&&!v.endsWith('.')&&!v.split('/').some(p=>p.startsWith('.')||p.endsWith('.lock')));
export const SOURCE_UPLOAD_MAX_BYTES=64*1024*1024;
export const managedOperation=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('create'),name:z.string().regex(/^[a-z][a-z0-9_]{0,15}$/),sealed}).strict(),
 z.object({operation:z.literal('password'),resource:id,sealed}).strict(),
 z.object({operation:z.literal('quota'),resource:id,quota_mb:z.number().int().positive().max(2147483647)}).strict(),
 z.object({operation:z.literal('enable'),resource:id}).strict(),z.object({operation:z.literal('disable'),resource:id}).strict(),
 z.object({operation:z.literal('delete'),resource:id,confirm:id}).strict()
]);
// Owner-signed documents are produced by the owner's local signer and only relayed here; the private service verifies the signature and every bound field.
export const signature=z.string().regex(/^[A-Za-z0-9+/]{86}==$/);
export const signedApproval=z.object({job:treeId,digest:z.string().regex(/^[a-f0-9]{64}$/),nonce:z.string().regex(/^[a-f0-9]{32}$/),issued:sourceNumber,expires:sourceNumber,plan:z.string().regex(/^[a-f0-9]{64}$/).nullable(),signature}).strict();
export const signedPolicy=z.object({schema:z.literal(1),id:z.string().regex(/^[a-f0-9]{32}$/),service:uuid,client:uuid,actor:id,repository_id:sourceNumber,branch:sourceBranch,allow_activation:z.boolean(),runtimes:z.array(z.enum(['static','php','nextjs'])).min(1).max(3),
 max_per_day:z.number().int().min(1).max(10),issued:sourceNumber,expires:sourceNumber}).strict();
// Runtime secret names: same rules as the private service (never a build variable, never a reserved process variable).
const RESERVED_RUNTIME=/^(PORT|HOSTNAME|PATH|HOME|USER|LOGNAME|SHELL|PWD|TMPDIR|TMP|TEMP|NODE_[A-Z0-9_]*|NEXT_TELEMETRY_DISABLED|HMS_[A-Z0-9_]*|LD_[A-Z0-9_]*|DYLD_[A-Z0-9_]*)$/;
export const secretName=z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).refine(n=>!RESERVED_RUNTIME.test(n));
export const serviceCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('hosting.domain.request'),service:uuid,domain:uuid,operation:z.enum(['attach','ssl']),request_key:uuid}).strict(),
 z.object({action:z.literal('hosting.domain.status'),service:uuid,domain:uuid}).strict(),
 z.object({action:z.literal('hosting.provision'),service:uuid,request_key:uuid}).strict(),
 z.object({action:z.literal('hosting.status'),service:uuid}).strict(),
 z.object({action:z.literal('source.status'),service:uuid}).strict(),
 z.object({action:z.literal('source.repositories'),service:uuid}).strict(),
 z.object({action:z.literal('source.connect'),service:uuid,installation_id:sourceNumber,repository_id:sourceNumber,branch:sourceBranch,expected_version:sourceVersion}).strict(),
 z.object({action:z.literal('source.switch'),service:uuid,installation_id:sourceNumber,repository_id:sourceNumber,branch:sourceBranch,expected_version:sourceVersion}).strict(),
 z.object({action:z.literal('source.disconnect'),service:uuid,expected_version:sourceVersion}).strict(),
 z.object({action:z.literal('source.request'),service:uuid,operation:z.enum(['deploy','export','publish','rollback']),request_key:uuid,tree:treeId.nullable()}).strict(),
 z.object({action:z.literal('source.build'),service:uuid,tree:treeId,request_key:uuid,variables:buildVariables}).strict(),
 z.object({action:z.literal('source.recover'),service:uuid,job:treeId,request_key:uuid}).strict(),
 z.object({action:z.literal('source.github_status'),service:uuid}).strict(),
 z.object({action:z.literal('source.auto_revoke'),service:uuid}).strict(),
 z.object({action:z.literal('source.auto_resume'),service:uuid}).strict(),
 z.object({action:z.literal('source.approvals_pending'),service:uuid}).strict(),
 z.object({action:z.literal('source.approval_view'),service:uuid,job:treeId}).strict(),
 z.object({action:z.literal('source.approve'),service:uuid,job:treeId,approval:signedApproval}).strict(),
 z.object({action:z.literal('source.approval_withdraw'),service:uuid,job:treeId}).strict(),
 z.object({action:z.literal('source.auto_install'),service:uuid,policy:signedPolicy,signature:signature}).strict(),
 z.object({action:z.literal('source.secret_key'),service:uuid}).strict(),
 z.object({action:z.literal('source.secret_list'),service:uuid}).strict(),
 z.object({action:z.literal('source.secret_put'),service:uuid,name:secretName,blob:z.string().min(80).max(8192)}).strict(),
 z.object({action:z.literal('source.secret_delete'),service:uuid,name:secretName}).strict(),
 z.object({action:z.literal('source.discard'),service:uuid,tree:treeId}).strict(),
 z.object({action:z.literal('source.upload_ticket'),service:uuid,size:z.number().int().min(22).max(SOURCE_UPLOAD_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({action:z.literal('inventory'),service:uuid,kind:z.enum(['email','database'])}).strict(),
 z.object({action:z.literal('request'),service:uuid,kind:z.enum(['email','database']),request_key:uuid,operation:managedOperation}).strict(),
 z.object({action:z.literal('forms.list')}).strict(),
 z.object({action:z.literal('forms.rotate'),project:uuid}).strict(),
 z.object({action:z.literal('forms.revoke'),project:uuid}).strict(),
 z.object({action:z.literal('forms.status'),project:uuid,job:id}).strict()
]).superRefine((command,ctx)=>{
 // A rollback chooses its own target on the private service; publish and export need an explicit released/staged tree.
 if(command.action==='source.request'&&(command.operation==='rollback'?command.tree!==null:command.operation!=='deploy'&&command.tree===null))ctx.addIssue({code:z.ZodIssueCode.custom,message:'tree'});
});
export const managedInventory=z.object({service:uuid,kind:z.enum(['email','database']),enabled:z.boolean(),resources:z.array(z.object({id,name:z.string().max(254)}).strict()).max(1000),jobs:z.array(z.object({id,state:z.enum(['queued','applying','uncertain','restore_review','provider_confirmed']),created:z.number().int().nonnegative()}).strict()).max(50),host_key:z.string().regex(/^[A-Za-z0-9_-]{43}=$/)}).strict();
export const formProject=z.object({id:uuid,client:uuid,name:z.string().max(64),active:z.number().int().min(0).max(1),paid_until:z.number().int().nonnegative(),monthly_limit:z.number().int().positive().max(100000),used:z.number().int().nonnegative()}).strict();
export type ManagedInventory=z.infer<typeof managedInventory>;


const sourceRepository=z.object({installation_id:z.number().int().positive(),repository_id:z.number().int().positive(),full_name:z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/).max(140),branch:z.string().min(1).max(200),write:z.boolean()}).strict();
const sourceHealth=z.object({ok:z.literal(true),checked:z.number().int().nonnegative(),status:z.number().int().nullable(),root_status:z.number().int().nullable(),tls:z.boolean()}).strict();
const sourceResult=z.record(z.union([z.string().max(200),z.number(),z.boolean(),z.null(),z.array(z.string().max(1024)).max(50),sourceHealth]));   // a completed publication reports its health evidence
export const sourceJob=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','applying','done','failed','uncertain','cancelled']),operation:z.enum(['deploy','export','publish','rollback','recover','build']),source:z.enum(['github','tree','release','job']),tree:treeId.nullable(),created:z.number().int().nonnegative(),result:sourceResult.nullable(),live_verified:z.boolean()}).strict()
 .refine(j=>j.live_verified===(['publish','rollback'].includes(j.operation)&&j.state==='done'),'live');
export const sourceTree=z.object({id:treeId,kind:z.enum(['zip','github']),state:z.enum(['staged','released']),files:z.number().int().nonnegative(),bytes:z.number().int().nonnegative(),created:z.number().int().nonnegative(),manifest_sha256:z.string().regex(/^[a-f0-9]{64}$/),runtime:z.enum(['static','php','nextjs','node','unknown']),publishable:z.boolean(),buildable:z.boolean()}).strict()
 // Static and PHP are always publishable; Next.js only once built (the status carries the proof); Node and unknown never.
 .refine(t=>['static','php'].includes(t.runtime)?t.publishable:t.runtime==='nextjs'||!t.publishable,'publishable')
 .refine(t=>t.buildable===(t.runtime==='nextjs'&&t.state==='released'),'buildable');
export const sourcePublication=z.object({state:z.enum(['none','live','uncertain']),runtime:z.enum(['static','php','nextjs','node','unknown']).nullable(),live_tree:treeId.nullable(),live_since:z.number().int().nonnegative().nullable(),previous_tree:treeId.nullable(),rollback_available:z.boolean(),
 health:z.object({ok:z.literal(true),checked:z.number().int().nonnegative(),status:z.number().int().nullable(),root_status:z.number().int().nullable(),tls:z.boolean()}).strict().nullable(),live_verified:z.boolean()}).strict()
 .refine(p=>p.state==='live'?p.health!==null&&p.live_verified===true&&p.live_tree!==null:!p.live_verified&&p.health===null&&p.live_tree===null&&!p.rollback_available,'publication');   // live always carries health evidence
export const NEXTJS_STATES=['none','queued','building','built','awaiting_approval','starting','live','failed','rolled_back','uncertain'] as const;
export const sourceBuild=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),tree:treeId,state:z.enum(['building','built','failed']),created:z.number().int().nonnegative(),finished:z.number().int().nonnegative().nullable(),artifact_sha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
 reason:z.string().max(60).nullable(),message:z.string().max(300).nullable(),phase:z.string().max(20).nullable(),summary:z.string().max(6000).nullable(),next_version:z.string().max(40).nullable(),variable_names:z.array(buildVariableName).max(32),files:z.number().int().nonnegative().nullable(),bytes:z.number().int().nonnegative().nullable()}).strict()
 .refine(b=>b.state==='built'?b.artifact_sha256!==null&&b.reason===null:b.artifact_sha256===null,'build');
export const sourceNextjs=z.object({state:z.enum(NEXTJS_STATES),live:z.boolean(),job:z.string().regex(/^[a-f0-9]{32}$/).nullable(),error:z.string().max(60).nullable(),reason:z.string().max(100).nullable(),builds:z.array(sourceBuild).max(12)}).strict();
export const sourceStatus=z.object({service:uuid,version:z.number().int().nonnegative(),repository:sourceRepository.nullable(),jobs:z.array(sourceJob).max(5),trees:z.array(sourceTree).max(5),
 nextjs:sourceNextjs,current:z.object({tree:treeId,released:z.number().int().nonnegative()}).strict().nullable(),publication:sourcePublication,published_to_web_root:z.boolean(),live_verified:z.boolean()}).strict()
 .refine(s=>s.published_to_web_root===(s.publication.state==='live')&&s.live_verified===s.publication.live_verified,'live')
 // The Next.js lifecycle can never claim more than the publication record proves.
 .refine(s=>s.nextjs.live===(s.publication.state==='live'&&s.publication.runtime==='nextjs'),'nextjs live')
 .refine(s=>s.nextjs.state!=='live'||(s.nextjs.live&&s.live_verified),'nextjs live evidence')
 .refine(s=>s.publication.state!=='uncertain'||s.nextjs.state==='uncertain','nextjs uncertain')
 .refine(s=>s.trees.every(t=>t.runtime!=='nextjs'||!t.publishable||s.nextjs.builds.some(b=>b.tree===t.id&&b.state==='built')),'publishable build')
 .refine(s=>s.trees.every(t=>t.runtime==='nextjs'||!s.nextjs.builds.some(b=>b.tree===t.id)),'build tree');
export const sourceRepositories=z.object({service:uuid,version:z.number().int().nonnegative(),repository:sourceRepository.nullable(),available:z.array(z.object({installation_id:z.number().int().positive(),repository_id:z.number().int().positive(),full_name:sourceRepository.shape.full_name,write:z.boolean()}).strict()).max(200)}).strict();
export const sourceTreeSummary=z.object({id:treeId,kind:z.literal('zip'),files:z.number().int().nonnegative(),bytes:z.number().int().nonnegative(),manifest_sha256:z.string().regex(/^[a-f0-9]{64}$/),activated:z.literal(false)}).strict();
export const sourceUploadTicket=z.object({url:z.string().url(),ticket:z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/),signature:z.string().regex(/^[a-f0-9]{64}$/),expires:z.number().int().positive(),max_bytes:z.number().int().positive()}).strict();
// Verified GitHub links and the automatic-deployment policy as reported by the private service (the policy itself is owner-signed there).
export const AUTO_POLICY_STATES=['active','paused','revoked','expired'] as const;
export const autoPolicy=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),state:z.enum(AUTO_POLICY_STATES),repository_id:sourceNumber,branch:sourceBranch,allow_activation:z.boolean(),runtimes:z.array(z.enum(['static','php','nextjs'])).min(1).max(3),
 max_per_day:z.number().int().min(1).max(10),expires:z.number().int().positive(),failures:z.number().int().min(0).max(1000),reason:z.string().max(60).nullable()}).strict();
export const autoStatus=z.object({service:uuid,policy:autoPolicy.nullable(),pending:z.object({commit_sha:z.string().regex(/^[a-f0-9]{40}$/),received:z.number().int().nonnegative()}).strict().nullable(),
 recent:z.array(z.object({kind:z.string().max(40),detail:z.string().max(120).nullable(),created:z.number().int().nonnegative()}).strict()).max(8)}).strict();
export const githubInstallation=z.object({installation_id:sourceNumber,github_login:z.string().max(60),account_login:z.string().max(60),state:z.enum(['active','suspended','revoked']),write:z.boolean(),repositories:z.number().int().min(0).max(300)}).strict();
export const githubStatus=z.object({service:uuid,installations:z.array(githubInstallation).max(20),auto:autoStatus}).strict()
 .refine(g=>g.auto.service===g.service&&(g.auto.policy===null||g.auto.policy.state!=='active'||g.installations.some(i=>i.state==='active')),'github');   // an active policy always has an active installation behind it
// Sent only by the server-side OAuth callback after GitHub itself vouched for the user and installation; never accepted from a browser.
export const githubLinkCommand=z.object({action:z.literal('source.github_link'),service:uuid,installation_id:sourceNumber,github_user_id:sourceNumber,github_login:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/),
 repositories:z.array(z.object({id:sourceNumber,full_name:z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/).max(140)}).strict()).max(300)}).strict();
// Approval inbox views. Intent and plan detail are relayed to the owner's signer, which recomputes the job digest itself; the portal never trusts or alters them.
const jsonRecord=z.record(z.unknown());
export const approvalView=z.object({job:sourceJob,intent:jsonRecord.nullable(),digest:z.string().regex(/^[a-f0-9]{64}$/),needs_plan:z.boolean(),
 plan:z.object({digest:z.string().regex(/^[a-f0-9]{64}$/).nullable(),detail:jsonRecord.nullable(),error:z.string().max(200).nullable()}).strict().nullable(),
 approval_received:z.boolean(),approvable:z.boolean(),summary:jsonRecord}).strict()
 .refine(v=>v.digest===v.job.digest&&(!v.approvable||(v.job.state==='queued'&&(!v.needs_plan||v.plan?.digest))),'approval view');
export const approvalsPending=z.object({service:uuid,pending:z.array(approvalView).max(5)}).strict();
export const secretKey=z.object({service:uuid,public_key:z.string().max(400).regex(/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),format:z.literal('hms-secret-v1')}).strict();
export const secretList=z.object({service:uuid,version:z.number().int().nonnegative(),secrets:z.array(z.object({name:secretName,updated:z.number().int().nonnegative()}).strict()).max(64)}).strict();
export type ApprovalView=z.infer<typeof approvalView>;
export type SecretList=z.infer<typeof secretList>;
export type GithubStatus=z.infer<typeof githubStatus>;
export type SourceStatus=z.infer<typeof sourceStatus>;
export type SourceRepositories=z.infer<typeof sourceRepositories>;
export type SourceJob=z.infer<typeof sourceJob>;
export type SourceBuild=z.infer<typeof sourceBuild>;
