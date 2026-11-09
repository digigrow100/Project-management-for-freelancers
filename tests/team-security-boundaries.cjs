const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

function load(file, mocks, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => mocks[name], URL, ...extra });
  return exports;
}

async function testProjectScope() {
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const calls = [];
  const scope = load('lib/projectScope.ts', {
    './supabaseClient': { getSupabase: () => ({ from(table) {
      const query = {
        select(columns) { calls.push([table, columns]); return query; },
        eq(column, value) { calls.push([column, value]); return query; },
        async in(column, ids) { return { data: ids.filter(id => id === first), error: null }; },
      };
      return query;
    } }) },
  });
  await scope.requireProjectResources(first, 'tasks', first, first);
  await assert.rejects(scope.requireProjectResources(first, 'tasks', first, second), /not found/);
  await scope.requireProjectResources(first, 'keyword_pages', first);
  assert.deepEqual(calls.at(-1), ['freelance_hq_keyword_groups.project_id', first]);
  await assert.rejects(scope.requireProjectResources(first, 'web_app_subfeatures', 'invalid'), /Invalid/);
  const attachments = load('lib/attachmentAccess.ts', {}, { process: { env: { SUPABASE_URL: 'https://db.example.test' } } });
  assert.equal(attachments.attachmentPath('https://db.example.test/storage/v1/object/public/task-files/tasks/a/file.pdf'), '/api/attachments/task-files/tasks/a/file.pdf');
  assert.equal(attachments.attachmentPath('https://other.example.test/storage/v1/object/public/task-files/tasks/a/file.pdf'), 'https://other.example.test/storage/v1/object/public/task-files/tasks/a/file.pdf');
}


async function testAttachmentAuthorization() {
  const id = '11111111-1111-4111-8111-111111111111';
  const token = 'a'.repeat(32);
  const path = '/api/attachments/task-files/tasks/' + id + '/report.pdf';
  const params = { bucket: 'task-files', key: ['tasks', id, 'report.pdf'] };
  let authorized = false;
  let shareActive = false;
  let signCalls = 0;
  const route = load('app/api/attachments/[bucket]/[...key]/route.ts', {
    'next/server': { NextResponse: class extends Response {
      static redirect(url, init) {
        return new Response(null, { ...init, headers: { ...init.headers, Location: url } });
      }
    } },
    '@/lib/auth': { requireProjectAccess: async projectId => {
      assert.equal(projectId, id);
      if (!authorized) throw Error('Denied');
    } },
    '@/lib/attachmentAccess': {
      attachmentLocation: () => ({ table: 'freelance_hq_tasks', prefix: 'tasks' }),
      attachmentPath: value => value,
    },
    '@/lib/supabaseClient': { getSupabase: () => ({
      from(table) {
        const query = {
          select: () => query, eq: () => query,
          maybeSingle: async () => ({ data: table === 'freelance_hq_tasks'
            ? { project_id: id, files: [{ url: path }] }
            : shareActive ? { id } : null }),
        };
        return query;
      },
      storage: { from: () => ({ createSignedUrl: async (_key, expiry, options) => {
        assert.equal(expiry, 60);
        assert.equal(options.download, true);
        signCalls++;
        return { data: { signedUrl: 'https://db.example.test/signed' } };
      } }) },
    }) },
  }, { Response });
  const get = query => route.GET({ nextUrl: new URL('https://portal.example.test' + path + query) }, { params });
  assert.equal((await get('')).status, 404);
  assert.equal((await get('?share=' + token)).status, 404);
  assert.equal(signCalls, 0);
  authorized = true;
  assert.equal((await get('')).status, 307);
  shareActive = true;
  assert.equal((await get('?share=' + token)).status, 307);
  assert.equal(signCalls, 2);
}

async function testMigrations() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.freelance_hq_employee_devices (employee_id text, token text);
      create table public.freelance_hq_whatsapp_bridge_devices (owner_user_id text, token text);
      create table public.other_app(id int);
      grant select on public.freelance_hq_employee_devices, public.other_app to anon;
      grant select, update on public.freelance_hq_employee_devices to service_role;
      insert into public.freelance_hq_employee_devices values ('first','old');
      insert into public.freelance_hq_whatsapp_bridge_devices values ('first','old');
      create schema storage;
      create table storage.buckets (id text primary key, public boolean);
      insert into storage.buckets values ('task-files',true),('project-attachments',true),('logos',true);
    `);
    for (const name of ['20261110010100_team_security_boundaries', '20261110010200_private_hq_attachments']) {
      await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`, 'utf8'));
    }
    const {rows:[grants]} = await db.query(`
      select has_table_privilege('anon','public.freelance_hq_employee_devices','SELECT') as anon,
        has_table_privilege('service_role','public.freelance_hq_employee_devices','UPDATE') as service,
        has_table_privilege('anon','public.other_app','SELECT') as other
    `);
    assert.deepEqual(grants, { anon: false, service: true, other: true });
    await db.exec("update public.freelance_hq_employee_devices set token='new' where employee_id='first'");
    await assert.rejects(db.exec("update public.freelance_hq_employee_devices set employee_id='second'"), /belongs to another account/);
    await assert.rejects(db.exec("update public.freelance_hq_whatsapp_bridge_devices set owner_user_id='second'"), /belongs to another account/);
    const {rows} = await db.query('select id, public from storage.buckets order by id');
    assert.deepEqual(rows, [{ id: 'logos', public: true }, { id: 'project-attachments', public: false }, { id: 'task-files', public: false }]);
  } finally {
    await db.close();
  }
}

Promise.all([testProjectScope(), testAttachmentAuthorization(), testMigrations()]).then(() => console.log('PASS: scoped project resources, attachment mapping and database boundaries')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
