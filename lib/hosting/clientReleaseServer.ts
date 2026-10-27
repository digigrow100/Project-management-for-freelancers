import 'server-only';
import { notFound } from 'next/navigation';
import { clientFeatureEnabled, type ClientReleaseFeature } from './clientRelease';

// Authentication remains the caller's first step. This is a release switch,
// never a substitute for the existing ownership, MFA and entitlement checks.
export function requireClientFeature(feature: ClientReleaseFeature): void {
  if (!clientFeatureEnabled(feature, process.env)) notFound();
}
