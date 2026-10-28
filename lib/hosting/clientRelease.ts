// Server callers pass private environment settings. Only the resulting feature
// names may be sent to a client component; never pass the environment itself.
export const CLIENT_RELEASE_FEATURES = ['email', 'databases', 'forms', 'backups', 'sources'] as const;
export type ClientReleaseFeature = typeof CLIENT_RELEASE_FEATURES[number];
export type ReleaseSettings = Readonly<Record<string, string | undefined>>;

export function clientFeatureEnabled(feature: ClientReleaseFeature, settings: ReleaseSettings): boolean {
  const published = (settings.HOSTING_CLIENT_FEATURES ?? '').split(',').map(value => value.trim());
  if (!published.includes(feature)) return false;
  return feature === 'backups'
    ? settings.HOSTING_BACKUP_PORTAL_ENABLED === 'true'
    : settings.HOSTING_SERVICES_ENABLED === 'approved';
}

export function clientReleaseFeatures(settings: ReleaseSettings): ClientReleaseFeature[] {
  return CLIENT_RELEASE_FEATURES.filter(feature => clientFeatureEnabled(feature, settings));
}
