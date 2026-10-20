const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

let pathname = '/admin';
let profile = { role: 'admin', name: 'Test Admin', email: 'admin@example.test' };
const cache = new Map();
const blocked = new Error('NOT_FOUND');

function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (name === 'next/navigation') return {
      usePathname: () => pathname,
      notFound: () => { throw blocked; },
    };
    if (name === 'next/link') return ({ href, prefetch, children, ...props }) =>
      React.createElement('a', { href, ...props }, children);
    if (name === '@/lib/hosting/auth') return {requireHostingAdmin:async()=>{if(profile?.role!=='admin')throw blocked;return profile;}};
    if (name === '@/lib/auth') return { getCurrentProfile: async () => profile };
    if (name === '@/app/login/actions') return { logoutAction: '/test-logout' };
    if (/\/(InstallAppButton|RefreshButton)$/.test(name)) return {
      InstallAppButton: () => null, RefreshButton: () => null,
    };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync);
      if (!resolved) throw new Error('Unresolved local module: ' + name);
      return load(resolved);
    }
    return require(name);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: localRequire }, { filename });
  return module.exports;
}

const { WorkspaceProvider, WorkspaceOnly } = load('components/WorkspaceProvider.tsx');
const { Sidebar } = load('components/Sidebar.tsx');
const { MobileNav } = load('components/MobileNav.tsx');
const { MobileTopBar } = load('components/MobileTopBar.tsx');
const { workspaceForPath, canAccessHosting, HOSTING_SECTIONS } = load('lib/hostingWorkspace.ts');
const HostingLayout = load('app/(app)/hosting/layout.tsx').default;


function render(currentPath, currentProfile = profile) {
  pathname = currentPath;
  return renderToStaticMarkup(React.createElement(WorkspaceProvider, {
    canAccessHosting: canAccessHosting(currentProfile),
  },
    React.createElement(Sidebar, { profile: currentProfile }),
    React.createElement(MobileTopBar),
    React.createElement(MobileNav, { profile: currentProfile }),
    React.createElement(WorkspaceOnly, { name: 'team' }, React.createElement('div', null, 'TEAM_FLOATING_TOOLS')),
  ));
}

(async () => {
  for (const route of ['/hosting', '/hosting/servers', '/hosting/billing']) {
    const html = render(route);
    assert.match(html, /Switch workspace/);
    assert.match(html, /Hosting navigation/);
    assert.match(html, /href="\/hosting\/servers"/);
    for (const teamHref of ['/projects', '/today', '/admin/my-tasks', '/team', '/finance']) {
      assert.ok(!html.includes(`href="${teamHref}"`), `${route} leaked ${teamHref}`);
    }
    assert.ok(!html.includes('TEAM_FLOATING_TOOLS'));
    assert.ok(!html.includes('New Project'));
    const active = html.match(/href="\/hosting"[^>]*aria-current="page"/g) || [];
    assert.equal(active.length, route === '/hosting' ? 1 : 0);
  }
  // A normal team route restores the original menus; no sticky global mode.
  for (const route of ['/admin', '/projects', '/projects/example', '/hosting-other']) {
    const html = render(route);
    assert.match(html, /href="\/projects"/);
    assert.match(html, /New Project/);
    assert.match(html, /TEAM_FLOATING_TOOLS/);
    assert.ok(!html.includes('href="/hosting/servers"'));
  }
  assert.equal(workspaceForPath('/hosting-other'), 'team');
  const member = { ...profile, role: 'member' };
  const memberHtml = render('/projects', member);
  assert.ok(!memberHtml.includes('Switch workspace'));
  assert.ok(!memberHtml.includes('href="/hosting"'));
  assert.ok(!memberHtml.includes('New Project'));
  assert.equal(canAccessHosting(null), false);
  profile = member;
  await assert.rejects(HostingLayout({ children: 'secret' }), error => error === blocked);
  profile = null;
  await assert.rejects(HostingLayout({ children: 'secret' }), error => error === blocked);
  profile = { role: 'admin' };
  await HostingLayout({ children: 'allowed' });
  assert.ok(HOSTING_SECTIONS.some(s=>s.key==='payments'));
  assert.ok(HOSTING_SECTIONS.some(s=>s.key==='operations'));
  console.log('PASS: hosting/team menus, desktop/mobile switch, exact route boundaries, hidden team tools, effective-role guard and hosting section navigation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
