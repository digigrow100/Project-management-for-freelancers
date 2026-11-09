const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const ids = {
  bot: "11111111-1111-4111-8111-111111111111",
  other: "22222222-2222-4222-8222-222222222222",
  job: "33333333-3333-4333-8333-333333333333",
  daily: "44444444-4444-4444-8444-444444444444",
  future: "55555555-5555-4555-8555-555555555555",
};
const digest = "a".repeat(64);

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.freelance_hq_projects (id uuid primary key);`);
    await db.exec(fs.readFileSync("supabase/migrations/20261110015000_seo_bot_workspaces.sql", "utf8"));
    await db.query("insert into public.freelance_hq_seo_bots(id,name,credential_digest) values ($1,'First',$2),($3,'Second',$4)", [ids.bot, digest, ids.other, "b".repeat(64)]);
    const date = (await db.query("select ((now() at time zone 'Asia/Karachi')::date)::text today, (((now() at time zone 'Asia/Karachi')::date)-1)::text yesterday")).rows[0];
    await db.query(`insert into public.freelance_hq_seo_bot_jobs
      (id,bot_id,title,category,target_url,instructions,priority,cadence,starts_on) values
      ($1,$2,'Own overdue task','technical','https://example.test','Check canonical','high','once',$6),
      ($3,$4,'Other task','technical','https://example.test','Check canonical','normal','daily',$6),
      ($5,$2,'Tomorrow task','technical','https://example.test','Check canonical','normal','once',$7::date+1)`,
      [ids.job, ids.bot, ids.daily, ids.other, ids.future, date.yesterday, date.today]);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from public.freelance_hq_seo_bots"), /permission denied/);
    await assert.rejects(db.query("select public.freelance_hq_seo_bot_queue($1)", [digest]), /permission denied/);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.freelance_hq_seo_bot_results"), /permission denied/);
    await db.exec("set role service_role");

    const queue = async key => (await db.query("select public.freelance_hq_seo_bot_queue($1) queue", [key])).rows[0].queue;
    const record = async (job, workDate, status, summary) => (await db.query(
      "select public.freelance_hq_seo_bot_record($1,$2,$3,$4,$5,null) state",
      [digest, job, workDate, status, summary])).rows[0].state;
    assert.equal(await queue("bad"), null);
    const first = await queue(digest);
    assert.equal(first.date, date.today);
    assert.deepEqual(first.tasks.map(task => task.id), [ids.job]);
    assert.equal(first.tasks[0].work_date, date.yesterday);
    assert.equal((await queue("b".repeat(64))).tasks[0].work_date, date.today);
    assert.equal(await record(ids.daily, date.today, "completed", "Wrong account"), "not_found");
    assert.equal(await record(ids.future, date.today, "completed", "Future"), "not_found");
    assert.equal(await record(ids.job, date.today, "completed", "Wrong day"), "stale_date");
    assert.equal(await record(ids.job, date.yesterday, "blocked", "Needs review"), "blocked");
    assert.equal(await record(ids.job, date.yesterday, "completed", "Verified"), "completed");
    assert.equal(await record(ids.job, date.yesterday, "completed", "Retry"), "completed");
    assert.equal((await queue(digest)).tasks[0].summary, "Verified");
    await db.query("update public.freelance_hq_seo_bots set enabled = false where id = $1", [ids.bot]);
    assert.equal(await queue(digest), null);
    assert.equal(await record(ids.job, date.yesterday, "completed", "Disabled"), "unauthorized");
    await db.query("update public.freelance_hq_seo_bots set enabled = true, credential_digest = $2 where id = $1", [ids.bot, "c".repeat(64)]);
    assert.equal(await queue(digest), null);
    assert.equal((await queue("c".repeat(64))).bot, "First");
  } finally {
    await db.close();
  }
}

run().then(() => console.log("PASS: bot authorization, daily dates, own queue, blocker, completion, replay and revocation")).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
