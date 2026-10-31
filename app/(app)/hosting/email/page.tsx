import {EmailWorkspacePanel} from '@/components/hosting/EmailWorkspacePanel';
import {requireHostingAdmin} from '@/lib/hosting/auth';
import {emailWorkspace} from '@/lib/hosting/email/actions';
export const dynamic='force-dynamic';
export const maxDuration=60;
export default async function Page(){await requireHostingAdmin();const initial=await emailWorkspace();return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Professional email</h1><p className="mt-2 text-neutral-500">Manage email domains, setup checks and mailbox requests.</p></div><EmailWorkspacePanel initial={initial} signerFingerprint={process.env.HOSTING_SIGNER_FINGERPRINT??null}/></div>;}
