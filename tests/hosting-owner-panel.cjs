// Structural guards for the owner approvals panel (no browser here): email/database approvals must not depend on the website-source feature,
// must have an offline signing path like source approvals, and the client-visible "failed" wording must not promise that nothing changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const panel = fs.readFileSync('components/hosting/OwnerApprovalsPanel.tsx', 'utf8');
const managedPanel = fs.readFileSync('components/hosting/ManagedServicePanel.tsx', 'utf8');
const page = fs.readFileSync('app/(app)/hosting/sources/page.tsx', 'utf8');

// the page mounts the panel without requiring the sources flag; it only tells the panel whether sources are on
assert.ok(/!context\.readOnly\?<OwnerApprovalsPanel sources=\{process\.env\.HOSTING_SOURCES_ENABLED==='approved'\}/.test(page), 'panel must not be gated on HOSTING_SOURCES_ENABLED');
// source requests are fetched only when sources are on, and a failure there cannot stop the managed list from loading
assert.ok(/if\(sources\)\{\s*try\{/.test(panel) && /catch\{sourceProblem=true/.test(panel));
assert.ok(panel.indexOf("managed.approvals_pending") > panel.indexOf('sourceProblem=true'), 'managed requests load after, and independently of, the source section');
// the signer-context route needs the sources flag, so it is only asked for when sources are on
assert.ok(/if\(sources\)\{\s*const context=await fetch\('\/api\/hosting-approvals\/context'/.test(panel));
// offline path for managed approvals: request is exposed for sign-file and the pasted answer is validated against the exact request
assert.ok(panel.includes("setOffline({kind:'managed-approval',payload:body})"));
assert.ok(panel.includes('pastedManaged') && panel.includes('submitPastedManaged') && /approval\.job!==item\.job\.id\|\|approval\.digest!==item\.digest/.test(panel));
assert.ok(!/catch\(error\)\{throw error;\}/.test(panel), 'a signer failure must lead to the offline path, not just rethrow');
// honest wording for a failed managed request
assert.ok(!/failed:'Not applied — nothing was changed'/.test(managedPanel));
assert.ok(/failed:'Did not complete — the hosting panel may hold part of this change/.test(managedPanel));
console.log('hosting owner panel structure ok');
