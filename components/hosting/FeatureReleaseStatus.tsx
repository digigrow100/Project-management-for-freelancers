import 'server-only';
import { CLIENT_RELEASE_FEATURES, clientFeatureEnabled } from '@/lib/hosting/clientRelease';

const names = { email: 'Email accounts', databases: 'Databases', forms: 'Form email API', backups: 'Backups and restores', sources: 'Website source (GitHub and ZIP)' };

// Render only inside the authenticated admin workspace.
export function FeatureReleaseStatus() {
  return <section className="space-y-3 rounded-xl border border-neutral-700 p-5">
    <h2 className="font-medium">Client feature release</h2>
    <p className="text-sm text-neutral-400">Unreleased features are hidden from clients. You can still open them here for testing. These labels show release settings, not live service health.</p>
    <ul className="space-y-2 text-sm">{CLIENT_RELEASE_FEATURES.map(feature => <li className="flex flex-wrap justify-between gap-2" key={feature}>
      <span>{names[feature]}</span>
      <span className={clientFeatureEnabled(feature, process.env) ? 'text-blue-300' : 'text-amber-300'}>
        {clientFeatureEnabled(feature, process.env) ? 'Client access enabled' : 'Testing · admin only'}
      </span>
    </li>)}</ul>
  </section>;
}
