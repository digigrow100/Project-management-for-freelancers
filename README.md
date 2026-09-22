# Freelance HQ — Project Management

A dark, green-accented Next.js app for tracking SEO, web development and digital
marketing client projects: what to do today, what's open, and what's done.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (dark theme, green/accent palette)
- Server Actions for all mutations (no client-side API calls)
- Supabase (Postgres) for data storage

## Data layer

`lib/store.ts` is the only file that talks to the database. Every function is
`async` and shaped like the app's domain types (`lib/types.ts`), so pages and
components never touch Supabase directly. Access goes through
`lib/supabaseClient.ts`, a lazily-created client using the **service role key**,
which only ever runs on the server (Server Components / Server Actions) and
bypasses Row Level Security — the anon/public key is not used anywhere in this
app, so there's nothing to leak to the browser.

## Branding & client reports

Go to **Settings** to set your company name and upload your logo — this brands
every SEO daily report PDF alongside the client's own logo (uploaded from that
project's Client Details card). If either logo is missing, the report falls
back to showing the company/client name as text instead. Uploads go through a
Server Action straight into Supabase Storage (the `logos` bucket), so no
client-side Supabase key is ever needed.

## Task files & client sharing

Any task can carry file attachments of any kind — add them from the task
detail modal, right when creating a task, or (on the client-facing link
below) directly from the client. Files are stored in a public `task-files`
Supabase Storage bucket and can be downloaded or removed any time. Every task
is fully editable — title, notes, checklist, status, priority, stage, dates,
and files — across SEO, Web Development, and every other project type.

Every project has a **Client Link** control (in the project's Client Details
tab): generate a unique, unguessable URL (`/share/<token>`) and send it to
your client. From that link — no account needed — they can see the project's
task board, add new tasks, and attach files, but can't edit, delete, or mark
anything as done; that stays under your control. Regenerate the link any time
to invalidate the old one, or disable sharing entirely.

## Logging in

The app (everything except `/share/<token>` client links, which are
intentionally public) requires you to be signed in. There's no public sign-up
page — you create your own account directly in Supabase:

1. In the Supabase dashboard, go to **Authentication > Users**.
2. Click **Add user > Create new user**, enter your email and a password, and
   make sure **Auto Confirm User** is checked (so you don't need to click an
   email confirmation link).
3. Go to `/login` in the app and sign in with that email/password.

Session checking happens in `middleware.ts` using the anon key — that key
only ever performs `.auth.*` calls (sign in, sign out, check session). It
has no access to your projects/tasks/etc. even if used directly, since
every table has Row Level Security enabled with no policies; all real data
access still goes through the service-role client described above. The
anon key is kept server-only (no `NEXT_PUBLIC_` prefix) since this app
never needs it in browser-side code — auth runs through Server Actions and
edge middleware only.

## Team accounts & the Admin panel

The very first account to ever sign in is automatically made an **admin** —
admins see every project and can manage the team. Go to **Admin** in the
sidebar to invite team members: give them a name, email, and a temporary
password, and they can sign in at `/login` right away.

New team members default to **member** role, which only sees the projects an
admin explicitly assigns to them (checkboxes under "Projects" on their row in
the Admin panel) — everything else (other projects, Settings, the Admin panel
itself, creating new projects) stays hidden and is also blocked server-side if
attempted directly. Promote a member to admin, remove them from the team, or
change their project access at any time from the same panel.

## Billing & the Finance page

Every project can carry a payment plan, set from its **Client Details** tab
(admin only — payments stay hidden from members entirely):

- **Fixed monthly** — a recurring fee (e.g. most SEO retainers). Log each
  month's fee as it's collected, plus any ad-hoc **additional charges**.
- **One-time** — a single total agreed with the client (e.g. most web
  development projects). Log each **installment** as it comes in; the app
  tracks paid-so-far and remaining automatically.

The **Finance** page (sidebar, admin only) rolls all of that up:

- A summary row — money collected, additional charges, current monthly
  recurring revenue, and outstanding balances on one-time projects — filterable
  to this month, the last 6 months, or this year.
- A collected-by-project-type breakdown.
- A per-project row showing plan, amount collected in the selected period, and
  either the remaining balance (one-time) or last payment date (monthly).

Amounts are tracked per currency (no conversion is attempted), so totals are
shown grouped by currency if you bill clients in more than one.

## Archiving vs. deleting a project

**Archive** (any project page) hides a project from the active project lists
without touching any of its data — reversible any time from the same button.

**Delete** (admin only, same page) is permanent: the project, its tasks, and
its pricing plan are gone for good, and it can't be undone. You get one
choice at delete time — keep the project's payment history or not. Keeping
it detaches those payment records from the (now-deleted) project so they no
longer show up on a project page, but the amounts still count toward the
Finance page's totals, since that money was genuinely received.

## Setting up Supabase (step by step)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**, pick an organization, name it (e.g. `freelance-hq`),
   set a database password (save it somewhere — you won't need it for this app,
   but you'll want it if you ever connect directly to Postgres), and choose a
   region close to you.
3. Wait for the project to finish provisioning (~2 minutes).

### 2. Create the tables

1. In the Supabase dashboard, open **SQL Editor** in the left sidebar.
2. Click **New query**, paste in the contents of [`supabase/schema.sql`](./supabase/schema.sql),
   and click **Run**. This creates the `projects`, `stages`, `tasks`, and
   `business_profile` tables (enabling Row Level Security on all of them) and a
   public `logos` storage bucket for client/company logo uploads.
3. (Optional) Run [`supabase/seed.sql`](./supabase/seed.sql) the same way if you
   want to start with the two example projects instead of an empty dashboard.

> Already ran `schema.sql` before logo uploads existed? Just run
> [`supabase/migrations/002_logos_and_business_profile.sql`](./supabase/migrations/002_logos_and_business_profile.sql)
> once — it only adds the new table and storage bucket, nothing destructive.
>
> Already ran it before task checklists / date-based scheduling existed? Also run
> [`supabase/migrations/003_task_checklist_and_schedule_date.sql`](./supabase/migrations/003_task_checklist_and_schedule_date.sql) —
> it adds a `checklist` column and converts `scheduled_for` from a `'today'`-only
> flag into a real date.
>
> Already ran it before task images / client sharing existed? Also run
> [`supabase/migrations/004_task_images_and_client_sharing.sql`](./supabase/migrations/004_task_images_and_client_sharing.sql) —
> it adds an `images` column to tasks, a `share_token` column to projects, and
> the `task-images` storage bucket.
>
> Already ran it before task attachments supported any file type (not just
> images)? Also run
> [`supabase/migrations/005_task_files.sql`](./supabase/migrations/005_task_files.sql) —
> it renames the `images` column to `files` and adds a `task-files` storage
> bucket for the new uploads.
>
> Already ran it before team accounts / the Admin panel existed? Also run
> [`supabase/migrations/006_teams_and_roles.sql`](./supabase/migrations/006_teams_and_roles.sql) —
> it adds `profiles` (role per signed-in user) and `project_assignments`
> (which member can see which project) tables. Nothing to configure by hand:
> the next person who signs in becomes admin automatically if no profile
> exists yet.
>
> Already ran it before billing / the Finance page existed? Also run
> [`supabase/migrations/007_payments.sql`](./supabase/migrations/007_payments.sql) —
> it adds `payment_plans` (how a project is priced) and `payments` (the
> ledger of amounts actually received) tables.
>
> Already ran 007 before a project could have more than one currency? Also run
> [`supabase/migrations/008_multi_currency_payment_plans.sql`](./supabase/migrations/008_multi_currency_payment_plans.sql) —
> it lets a project have one payment plan per currency (e.g. a PKR plan and a
> USD plan on the same project) instead of a single project-wide plan.
>
> Already ran 008 before clients existed as their own thing? Also run
> [`supabase/migrations/009_clients.sql`](./supabase/migrations/009_clients.sql) —
> it adds a `clients` table and a `client_id` column on `projects`, so a
> client is a reusable record you pick when creating a project instead of
> free-text details typed into each project separately.
>
> Already ran 009? Also run
> [`supabase/migrations/010_isolate_clients_table.sql`](./supabase/migrations/010_isolate_clients_table.sql) —
> if your Supabase project is shared with another app that already has its
> own `clients` table, 009's `create table if not exists` silently left that
> unrelated table alone and pointed this app's `client_id` foreign key at it,
> breaking client creation. This migration moves this app's data to its own
> `freelance_hq_clients` table (migrating any rows 009 did manage to create)
> so it never collides with another app's table again.
>
> Already ran 010? Also run
> [`supabase/migrations/011_project_deletion.sql`](./supabase/migrations/011_project_deletion.sql) —
> it lets a project's `payments.project_id` be null, which powers the new
> "Delete Project" option: pricing plans always go with a deleted project,
> but you can choose to keep its payment history counted in Finance totals.
>
> Already ran 011? Also run
> [`supabase/migrations/012_namespace_all_tables.sql`](./supabase/migrations/012_namespace_all_tables.sql) —
> if this Supabase project is shared with another app, every table this app
> owns (`projects`, `stages`, `tasks`, `business_profile`, `profiles`,
> `project_assignments`, `payment_plans`, `payments`) gets renamed with a
> `freelance_hq_` prefix, the same way `clients` already was in 010, so none
> of them can ever collide with a same-named table from anything else in the
> same database. All rows, columns, and foreign keys carry over unchanged —
> only the table names change.
>
> Already ran 012? Also run
> [`supabase/migrations/013_seo_keywords.sql`](./supabase/migrations/013_seo_keywords.sql) —
> it adds a `freelance_hq_keywords` table so SEO projects get a proper
> keyword rank-tracker (keyword, target page, volume, difficulty, current vs.
> target rank, status, notes) instead of keyword lists buried in task
> checklists.
>
> Already ran 013? Also run
> [`supabase/migrations/014_keyword_rank_history.sql`](./supabase/migrations/014_keyword_rank_history.sql) —
> it adds a `freelance_hq_keyword_rank_history` table. A row is logged
> automatically every time a keyword's current rank changes (adding a
> keyword, editing it, or importing), so its **History** button on the
> Keywords tab shows how its position moved over time instead of only ever
> showing the latest value.
>
> Already ran 014? Also run
> [`supabase/migrations/015_keyword_monthly_tracking.sql`](./supabase/migrations/015_keyword_monthly_tracking.sql) —
> it adds an `is_tracked` flag to `freelance_hq_keywords` and a new
> `freelance_hq_keyword_monthly_positions` table, powering the **Monthly
> Position Tracker** on the Keywords tab: pick keywords into a tracking
> list, manually enter one rank per keyword per calendar month, see every
> previous month alongside the newest one in a grid, and export it to XLSX
> or PDF.
>
> Already ran 015? Also run
> [`supabase/migrations/016_keyword_groups.sql`](./supabase/migrations/016_keyword_groups.sql) —
> it adds `freelance_hq_keyword_groups` and `freelance_hq_keyword_pages`
> tables, plus a `page_id` column on `freelance_hq_keywords`. This powers
> the **Keyword Groups** carousel at the top of the Keywords tab: create a
> named group (e.g. a content silo), add pages within it, and assign
> keywords to a page to track their performance by group and by page —
> each card shows a live average rank and month-over-month trend. Keywords
> left unassigned still show up normally in the flat list below.
>
> Already ran 016? Also run
> [`supabase/migrations/017_project_attachments.sql`](./supabase/migrations/017_project_attachments.sql) —
> it adds a `freelance_hq_project_attachments` table and a public
> `project-attachments` storage bucket, powering a new **Attachments** tab
> on SEO projects (shown before Client Details) for files that belong to
> the project as a whole — briefs, reports, exports — rather than a single
> task.
>
> Already ran 017? Also run
> [`supabase/migrations/018_backlinks.sql`](./supabase/migrations/018_backlinks.sql) —
> it adds `freelance_hq_backlink_categories` and `freelance_hq_backlink_entries`
> tables, plus a `vault_password_hash` column on `freelance_hq_profiles`. This
> powers a new **Backlinks** tab on SEO projects (shown before Attachments):
> track backlink profiles — social media logins, local listings, Web 2.0
> properties, guest posts, or any custom category you create — with a
> username, email, password, posting cadence, notes, and a list of
> article/backlink links per entry. Saved passwords are encrypted at rest
> (see the `BACKLINKS_SECRET` env var below) and only decrypt after you enter
> your own security password, a per-user reveal password set from the
> Backlinks tab that's separate from your login password.
>
> Already ran 018? Also run
> [`supabase/migrations/019_keyword_multi_page.sql`](./supabase/migrations/019_keyword_multi_page.sql) —
> a keyword can now be assigned to more than one Page at once (e.g. the same
> keyword targets both a service page and a location page). Existing
> single-page assignments are copied over automatically; nothing to redo by
> hand.
>
> Already ran 019? Also run
> [`supabase/migrations/020_domains.sql`](./supabase/migrations/020_domains.sql) —
> adds `freelance_hq_domain_clients`, `freelance_hq_domains`,
> `freelance_hq_domain_dns_records`, and `freelance_hq_domain_settings` tables.
> This powers a new admin-only **Domains** tab (sidebar, separate from client
> projects) for managing a domain resale inventory: add domains manually, assign
> them to a lightweight domain-client contact, edit DNS records, and lock/unlock
> or auto-renew. It can optionally sync against a Dynadot reseller account (API
> key entered on the Domains → Dynadot Settings tab, encrypted at rest — see the
> `DYNADOT_SECRET` env var below) to import your whole domain portfolio in one
> click and push DNS/lock changes to the registrar. **Note:** the Dynadot API
> commands in `lib/dynadot.ts` are implemented from Dynadot's documented API v3
> shape but haven't been exercised against a live account from this environment
> — test each sync/lock/DNS action against a throwaway domain first, and check
> [dynadot.com/domain/api-commands](https://www.dynadot.com/domain/api-commands)
> if a call fails with an unexpected error.
>
> Already ran 020? Also run
> [`supabase/migrations/021_notes.sql`](./supabase/migrations/021_notes.sql) —
> adds `freelance_hq_notes` and `freelance_hq_task_notes` tables. This powers
> a new **Notes** tab (sidebar, everyone can use it) — a shared, docs-like
> space where SEO/content writers can write articles, tables, and plans right
> in the app instead of Google Docs — plus a "Notes" tab on every task's
> detail modal for task-specific writing. A note is visible to its author and
> to admins; an admin can also assign a note to a specific member, and choose
> whether that member can edit it or only view it. Any note can be pinned so
> it shows on the dashboard.
>
> Already ran 021? Also run
> [`supabase/migrations/022_note_folders.sql`](./supabase/migrations/022_note_folders.sql) —
> adds `freelance_hq_note_folders` and a `folder_id` column on
> `freelance_hq_notes`. Notes are now organized like a small file explorer:
> your Projects (plus a project-independent **General** bucket) show first,
> each can hold one level of folders and/or notes placed directly in it, and
> folders hold their own notes. Anyone who can access a project can
> create/rename/delete its folders; General is open to everyone. This is
> layout only — the per-note author/admin/assignee visibility rules from 021
> are unchanged.
>
> Already ran 022? Also run
> [`supabase/migrations/023_notifications.sql`](./supabase/migrations/023_notifications.sql) —
> adds `freelance_hq_notification_seen`, which powers small red count badges
> on the **Projects** and **Notes** tabs (sidebar and mobile nav). A member
> sees a badge when an admin assigns them a new project or a new note; the
> badge clears the moment they open that tab. Admins see a badge on Projects
> for any project created since they last opened it.
>
> Already ran 023? Also run
> [`supabase/migrations/024_web_app_features.sql`](./supabase/migrations/024_web_app_features.sql) —
> adds `freelance_hq_web_app_features` and `freelance_hq_web_app_subfeatures`.
> This powers a new **Web Application** project type: register a project the
> same way as Web Development (website details fieldset included), then use
> its **Features** tab to define features/tabs (e.g. "Customer") and, inside
> each, the sub-features it needs (e.g. "Add customer", "Export customer
> list") with a status per sub-feature. Both features and sub-features
> support select-some/select-all bulk delete, duplicate, and xlsx export.
>
> Already ran 024? Also run
> [`supabase/migrations/025_web_app_type_constraint.sql`](./supabase/migrations/025_web_app_type_constraint.sql) —
> **required** for the Web Application project type to work. The
> `freelance_hq_projects.type` column still carried a check constraint from
> before namespacing that didn't allow `'web_app'`, so creating a Web
> Application project would fail with a server error until this runs.
>
> Already ran 025? Also run
> [`supabase/migrations/026_renewals.sql`](./supabase/migrations/026_renewals.sql) —
> adds `freelance_hq_renewals`. This powers a new **Renewals** tab (sidebar,
> admin-only) for logging paid renewal work — domain, hosting, email
> service, malware removal, or any combination — separate from both the
> Domains resale inventory and client Projects. Each record can link to an
> existing Domain Client or just carry a typed name (with an option to save
> it as a Domain Client for next time), tracks what you charged vs. what it
> cost you, a due date, and a pending/completed status. The page shows
> total earned, total paid, net profit, and a due-soon/overdue count at a
> glance.
>
> Already ran 026? Also run
> [`supabase/migrations/027_member_renewals_access.sql`](./supabase/migrations/027_member_renewals_access.sql) —
> adds `can_access_renewals` to `freelance_hq_profiles`. Renewals was
> admin-only; this lets an admin grant individual members access to it (view
> and manage renewal records) without making them a full admin — toggle it
> per member from the Admin page next to their Projects access. Admins
> always have access regardless of this flag.
>
> Already ran 027? Also run
> [`supabase/migrations/028_renewal_currency.sql`](./supabase/migrations/028_renewal_currency.sql) —
> adds `currency` to `freelance_hq_renewals` (defaults existing rows to
> `'PKR'`). Renewals now uses the same PKR/USD/GBP currency options as
> Payments/Finance elsewhere in the app — pick a currency per renewal record,
> and the Renewals page's totals and currency tabs (when you have records in
> more than one currency) are scoped per currency, matching Finance's
> pattern.
>
> Already ran 028? Also run
> [`supabase/migrations/029_websites.sql`](./supabase/migrations/029_websites.sql) —
> adds `freelance_hq_websites`, for managing the Next.js client sites you
> build: contact info, service-area cities, and Google Tag Manager/GA/Pixel
> head+body scripts, fetched at runtime by the live site from a secret-keyed
> public endpoint. See 030 below for how this is actually surfaced in the
> UI — it changed after this migration first shipped.
>
> Already ran 029? Also run
> [`supabase/migrations/030_website_domain_popup.sql`](./supabase/migrations/030_website_domain_popup.sql) —
> adds `is_offline` and `last_fetched_at` to `freelance_hq_websites`, makes
> `domain_id` one-to-one (a domain has at most one website config) and
> cascades its deletion with the domain. This reworked Website Management
> from its own tab into a **popup on each domain row in the Domains tab**
> (click the "Website" button) — there is no separate Websites tab anymore.
> The popup lets you edit contact info/cities/head+body scripts, shows a
> **Connected** / **Not connected yet** / **Connection lost** / **Offline**
> badge (based on when the live site last successfully fetched its config
> from `GET /api/site-config`), a **Take offline** button that flips a flag
> the site's own code is instructed to check and show a "temporarily
> offline" page for, and the copy-paste "Setup instructions" prompt
> (pre-filled with that domain's secret key and the config URL) to hand to
> a Claude Code session inside the website's own repo to attach it.
>
> Already ran 030? Also run
> [`supabase/migrations/031_renewals_domain_link.sql`](./supabase/migrations/031_renewals_domain_link.sql) —
> adds a nullable `domain_id` to `freelance_hq_renewals` (set null if the
> linked domain is removed from the inventory). This folds the standalone
> Domains inventory tab into the Renewals tab, which is now the app's
> **Domains** tab at `/domains` — the old resale-inventory-only Domains tab
> is gone. Each renewal row can optionally link to a real domain (pick an
> existing one or type a new name to register it on save); once linked, an
> admin can open its **Website** button for the same Google Tag
> codes/contact info/offline popup described above, plus a **Manage
> domain** link to that domain's detail page. Admins also get two extra
> sub-tabs on this page — **Domain Clients** and **Domain Inventory**
> (Dynadot API key, bulk import, and manually registering a domain) —
> moved over from the old Domains tab. Non-admin members granted Renewals
> access only ever see the Renewals list itself, same as before.

### 3. Get your API credentials

1. In the Supabase dashboard, go to **Project Settings > API**.
2. Copy the **Project URL** (looks like `https://xxxxx.supabase.co`).
3. Copy the **`service_role`** key under **Project API keys** — click "Reveal"
   first. This is a secret key with full database access; never put it in a
   `NEXT_PUBLIC_*` variable or commit it to git.
4. Also copy the **`anon` / `public`** key from the same page (see "Logging
   in" above for what it's used for — it's kept server-only here, not
   exposed to the browser).

### 4. Add the environment variables

**Locally:**

```bash
cp .env.example .env.local
```

Then fill in all three values in `.env.local`:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
```

`.env.local` is already gitignored, so it stays out of version control.

**On Vercel (or wherever you deploy):**

1. Open your project on [vercel.com](https://vercel.com) > **Settings > Environment Variables**.
2. Add all three variables above with the same values, for the **Production**
   and **Preview** environments.
3. Redeploy (or just push — the next deploy will pick them up).

> Using the **Backlinks** tab (SEO projects)? Also set `BACKLINKS_SECRET` — any
> long random string, e.g. generate one with `openssl rand -hex 32`. It encrypts
> saved backlink login passwords at rest; everything else in the app works fine
> without it. Set it once and don't change it — changing or losing it makes any
> previously saved backlink passwords permanently undecryptable.

> Using the **Domains** tab's Dynadot sync? Also set `DYNADOT_SECRET` — another
> long random string, different from `BACKLINKS_SECRET`, e.g. `openssl rand -hex
> 32`. It encrypts your saved Dynadot API key at rest; manual domain entry, DNS
> records, and everything else on the Domains tab works fine without it.

### 5. Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the dashboard, projects, and task boards are now
reading and writing to your Supabase database.

## Getting started (without Supabase configured)

The app still builds and lints without the two env vars set, since every
data-driven route renders dynamically (no build-time database calls). It will
throw a clear error at request time, though, so you do need Supabase configured
to actually run it.

## Android / iOS apps (Capacitor)

This is a full Next.js **server** (server actions, cookie-based auth,
server-only Supabase calls) — it can't be exported as static HTML and bundled
on-device the way a plain single-page app can. So instead of bundling files,
[Capacitor](https://capacitorjs.com) wraps a thin native shell (an Android
`WebView` / iOS `WKWebView`) that loads the app straight from its live
production URL, configured in `capacitor.config.ts` (`server.url`). Update
that URL if the production domain ever changes (e.g. once a custom domain
replaces the default `*.vercel.app` one) — everything else in the shell stays
the same.

This means:
- The web app in this repo is the single source of truth — there's nothing
  to keep in sync between "the web app" and "the mobile app."
- The device needs network access to your production deployment to use the
  app, same as visiting the site in a browser (there's no offline bundle).
- Publishing an update to production (merge to `main`, promote in Vercel) is
  enough to update everyone using the native apps too — no app-store update
  needed for ordinary code changes. You only need to rebuild/resubmit the
  native app itself when something in `capacitor.config.ts`, an icon, a
  permission, or a native plugin changes.

### What's already set up

- `android/` — a full Android Studio/Gradle project.
- `ios/` — a full Xcode project.
- `www/` — a placeholder `index.html` Capacitor requires on disk as its
  `webDir`; in practice it's never shown, since the app always loads
  `server.url` instead.
- `capacitor.config.ts` — app id (`com.freelancehq.app`), app name, and the
  production URL the shell loads.

Whenever you change `capacitor.config.ts` (or install a Capacitor plugin),
re-sync the native projects:

```bash
npm run cap:sync
```

### Building for Android

Requires [Android Studio](https://developer.android.com/studio) (Android SDK
+ a JDK) installed locally — this can't be done in a browser or this
environment.

```bash
npm run cap:android   # opens the android/ project in Android Studio
```

From Android Studio: **Build → Generate Signed App Bundle/APK**. You'll need
to create a signing keystore the first time (Android Studio walks you through
it) — keep that keystore file and its passwords somewhere safe, since you
need the *same* one for every future update.

- To distribute directly from your own website (no store): build a **signed
  APK**, host the `.apk` file, and users install it after enabling "install
  from unknown sources." You maintain your own update notifications — there's
  no store to check for updates automatically.
- To publish on the **Google Play Store**: build a **signed AAB**, create a
  [Google Play Console](https://play.google.com/console) account ($25
  one-time), create an app listing (icon, screenshots, description, privacy
  policy URL), and upload the AAB.

### Building for iOS

Requires a **Mac** with [Xcode](https://developer.apple.com/xcode/) installed
— Apple only allows building/signing iOS apps on macOS, so this step can't be
done from this Linux environment either.

```bash
npm run cap:ios   # opens the ios/ project in Xcode
```

iOS has no direct "download the app from a website" option — see below.
To ship it at all you need an [Apple Developer Program](https://developer.apple.com/programs/)
account ($99/year), then in Xcode: set your Team under Signing & Capabilities,
**Product → Archive**, then submit through **App Store Connect** — either to
TestFlight (invited testers only, builds expire after 90 days) or for full
App Store review and release.

### App icons & splash screen

The generated projects currently use Capacitor's default placeholder icon —
`public/icon-512.png` isn't large enough for App Store submission (Apple
requires a 1024×1024 source icon with no transparency). Once you have proper
source art, generate all the platform-specific sizes with:

```bash
npm install --save-dev @capacitor/assets
npx capacitor-assets generate
```

### Direct download vs. app stores, summarized

| | Android | iOS |
|---|---|---|
| Download directly from your website | ✅ Yes — host a signed `.apk`, users sideload it | ❌ Not possible for a public app |
| App/Play Store listing | Optional — Google Play Console, $25 one-time | Effectively required — Apple Developer Program, $99/year |
