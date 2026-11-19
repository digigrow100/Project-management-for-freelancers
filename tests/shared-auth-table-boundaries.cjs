// Isolated PostgreSQL regression tests. Never connects to a hosted database.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');
const migration = fs.readFileSync('supabase/migrations/20261119112518_shared_auth_table_boundaries.sql', 'utf8');

test('shared Auth table migration preserves ownership, trusted provisioning and HQ isolation', async () => {
  const db = new PGlite();
  const [admin, user, other, newcomer, basic, paid] = Array.from({length: 6}, randomUUID);
  const useRole = async (role, uid = '') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec(`set role ${role}`);
  };
  const count = async table => Number((await db.query(`select count(*) n from ${table}`)).rows[0].n);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated, service_role;
      create table auth.users (id uuid primary key, email text);
      create table public.plans (id uuid primary key, code text unique);
      create table public.users (
        id uuid primary key references auth.users(id), email text, name text,
        role text not null default 'USER', plan_id uuid references public.plans(id),
        created_at timestamptz not null default now(), updated_at timestamptz default now()
      );
      create table public.usage_logs (id int primary key, user_id uuid, invoices_today int);
      create table public.freelance_hq_profiles (id uuid primary key, role text);
      alter table public.freelance_hq_profiles enable row level security;
      grant select, insert, update on public.freelance_hq_profiles to service_role;
      grant all on public.users, public.usage_logs to anon, authenticated, service_role;
      alter table public.users enable row level security;
      alter table public.usage_logs enable row level security;
      create policy users_admin_all on public.users for all using
        (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'ADMIN'));
      create policy users_insert_own on public.users for insert with check (auth.uid() = id);
      create policy users_select_own on public.users for select using (auth.uid() = id);
      create policy users_update_own on public.users for update using (auth.uid() = id);
      create policy usage_logs_insert_all on public.usage_logs for insert with check (true);
      create policy usage_logs_select_own on public.usage_logs for select using (auth.uid() = user_id or user_id is null);
      create policy usage_logs_update_own on public.usage_logs for update using (auth.uid() = user_id or user_id is null);
    `);
    await db.query('insert into public.plans values ($1, $2), ($3, $4)', [basic, 'BASIC', paid, 'PRO']);
    for (const id of [admin, user, other, newcomer]) {
      await db.query('insert into auth.users values ($1,$2)', [id, `${id}@example.test`]);
    }
    for (const id of [admin, user, other]) {
      await db.query('insert into public.users (id,email,role,plan_id) values ($1,$2,$3,$4)',
        [id, `${id}@example.test`, id === admin ? 'ADMIN' : 'USER', basic]);
    }
    await db.query('insert into public.usage_logs values (1,$1,2),(2,$2,3),(3,null,4)', [user, other]);
    await db.query("insert into public.freelance_hq_profiles values ($1,'admin')", [user]);
    const before = (await db.query('select * from public.users order by id')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from public.users order by id')).rows, before);
    await db.exec(migration); // Safe to rerun; no duplicate policies/triggers or data writes.

    await useRole('authenticated', user);
    assert.equal(await count('public.users'), 1); // No recursive RLS error.
    assert.equal((await db.query('select role from public.users')).rows[0].role, 'USER');
    assert.equal((await db.query("update public.users set name='Updated profile' returning id")).rows.length, 1);
    for (const [column, value] of [['role', 'ADMIN'], ['plan_id', paid], ['email', 'changed@example.test'], ['id', newcomer]]) {
      await assert.rejects(db.query(`update public.users set ${column}=$1 where id=$2`, [value, user]), /managed by the server/);
    }
    await assert.rejects(db.exec("update public.users set created_at=now()+interval '1 day'"), /managed by the server/);
    assert.equal((await db.query('update public.users set name=$1 where id=$2 returning id', ['Other', other])).rows.length, 0);
    assert.deepEqual((await db.query('select id from public.usage_logs order by id')).rows, [{id: 1}]);
    await assert.rejects(db.exec('update public.usage_logs set invoices_today=0'), /permission denied/);
    await assert.rejects(db.query('insert into public.usage_logs values (4,$1,0)', [user]), /permission denied/);
    await assert.rejects(db.exec('select * from public.freelance_hq_profiles'), /permission denied/);
    await assert.rejects(db.exec('select freelance_hq_security.guard_legacy_user_fields()'), /permission denied/);

    await useRole('authenticated', newcomer);
    await assert.rejects(db.query('insert into public.users (id,email,role) values ($1,$2,$3)',
      [newcomer, `${newcomer}@example.test`, 'ADMIN']), /server defaults/);
    await assert.rejects(db.query('insert into public.users (id,email,plan_id) values ($1,$2,$3)',
      [newcomer, `${newcomer}@example.test`, paid]), /server defaults/);
    await db.query('insert into public.users (id,email,plan_id) values ($1,$2,$3)',
      [newcomer, `${newcomer}@example.test`, basic]);

    await useRole('authenticated', admin);
    assert.equal(await count('public.users'), 4);
    await db.query("update public.users set plan_id=$1 where id=$2", [paid, other]);
    await useRole('service_role');
    assert.equal(await count('public.users'), 4);
    await db.query("update public.users set email='synced@example.test',plan_id=$1 where id=$2", [paid, user]);
    await db.exec('update public.usage_logs set invoices_today=invoices_today+1');
    assert.equal(await count('public.usage_logs'), 3);

    await useRole('anon');
    for (const table of ['public.users', 'public.usage_logs']) {
      await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    }
    await useRole('postgres');
    const exposed = (await db.query(`select p.proname from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('legacy_user_is_admin','guard_legacy_user_fields')`)).rows;
    assert.deepEqual(exposed, []);
    assert.equal(await count('auth.users'), 4);
    assert.equal(await count('public.freelance_hq_profiles'), 1);
  } finally { await db.close(); }
});

test('standalone HQ installs without companion app tables remain supported', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    await db.exec(migration);
    assert.equal((await db.query("select to_regclass('public.users') as users")).rows[0].users, null);
  } finally { await db.close(); }
});
