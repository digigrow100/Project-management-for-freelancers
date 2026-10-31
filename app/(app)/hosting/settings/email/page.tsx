import {emailWorkspace} from '@/lib/hosting/email/actions';
import {EmailSettingsPanel} from '@/components/hosting/EmailSettingsPanel';
import {HostingSettingsTabs} from '@/components/hosting/HostingSettingsTabs';
export const dynamic='force-dynamic';
export default async function Page(){const data=await emailWorkspace();return <div className="space-y-6"><h1 className="text-3xl font-semibold">Hosting settings</h1><HostingSettingsTabs active="email"/><EmailSettingsPanel settings={data.settings}/></div>;}
