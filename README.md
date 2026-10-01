# Voxel1 — Attendance & HR

**Voxel1** is the Voxel1 company's in-house attendance and HR app: employees check in with GPS at the office and log in with their mobile number; their one manager approves leave, reads daily tasks and follows attendance on Excel-style sheets.


---

## Why Voxel1?

Voxel1 is built to be simple to run:

- **Supabase backend** — Managed PostgreSQL with built-in auth, storage, and real-time subscriptions. Free tier is enough to get started.
- **Self-hostable** — Deploy Supabase on your own infrastructure with Docker. Your employee data never leaves your server.
- **Modern stack** — React 19 + TypeScript + Tailwind CSS, not a legacy PHP monolith
- **Mobile-ready** — Installable PWA on iOS, Android, and desktop with offline-aware caching
- **Multi-tenant** — One instance can serve multiple organizations with full data isolation

---

## Key Features

### Attendance Tracking (GPS)
- Location-based clock in/out: employees must be within 200 m of an office
- GPS geofencing to validate employee location
- Office and factory/field duty types
- Auto-close forgotten sessions at end of workday

### Leave Management
- Multi-tier approval workflows (Employee → Manager → HR)
- Real-time leave balance tracking (Annual, Sick, Casual, and custom types)
- Configurable department-level approval routing
- Automated email and in-app notifications at every step

### Employee Directory & Organization Setup
- Dynamic departments, designations, and team structures
- Role-based access control (Admin, HR, Manager, Team Lead, Employee)
- Centralized holiday calendar
- Shift management with grace periods and auto-close rules

### Announcements & Notifications
- Organization-wide announcements with role targeting and expiry
- Real-time notification bell + email alerts for leave and attendance events

### Reports & Analytics
- Attendance summaries and leave reports
- Exportable data for payroll integration (CSV, PDF)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Backend | [Supabase](https://supabase.com) (PostgreSQL + Auth + Storage + Edge Functions) |
| Mobile | Installable PWA (iOS Safari, Android Chrome, desktop) |
| Icons | Lucide React |
| Deployment | Vercel / Netlify (frontend), Supabase (backend), Docker Compose (self-hosted) |

---

## Quick Start

### Prerequisites

- **Node.js** 18+ and **npm** 9+
- A **Supabase** account ([free tier](https://supabase.com) is enough) — or Docker for self-hosting
- **Supabase CLI** (install via npm): `npm install -g supabase`

---

### Option A: Supabase Cloud (Recommended — 5 minutes)

This is the fastest way to get Voxel1 running. Supabase's free tier includes 500 MB database, 5 GB bandwidth, and 2 Edge Functions — enough for a small team.

#### 1. Clone & Install

```bash
git clone <your-repository-url> voxel1
cd voxel1
npm install
```

#### 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Choose an organization, name your project (e.g. `voxel1`), set a secure database password, and choose a region close to your users
4. Wait ~2 minutes for the database to provision

#### 3. Link Your Local Repo to Supabase

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

You can find your project ref in Supabase Dashboard → Settings → General → Reference ID.

#### 4. Apply Database Migrations

Enable `pg_cron` in Supabase Dashboard → Database → Extensions before applying migrations; migration `0009_cron_setup.sql` schedules a job with it.

```bash
supabase db push
```

This applies the migrations in `supabase/migrations/`.

#### 5. Deploy Edge Functions

```bash
supabase functions deploy admin-verify-employee
supabase functions deploy create-employee
supabase functions deploy cron-attendance-reminders
supabase functions deploy cron-auto-absent
supabase functions deploy cron-auto-close-sessions
supabase functions deploy cron-daily-report
supabase functions deploy cron-push-checkin-reminder
supabase functions deploy cron-selfie-storage-cleanup --no-verify-jwt
supabase functions deploy employee-mobile-login
```

#### 6. Set Required Secrets

```bash
# Generate a random secret for cron job auth:
# PowerShell: [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
# Bash: openssl rand -base64 32

supabase secrets set CRON_SECRET=<your-random-secret>

# Email (leave notices, daily report). Use a domain you own, verified in Resend:
supabase secrets set RESEND_API_KEY=<your-resend-key>
supabase secrets set EMAIL_FROM="Voxel1 <noreply@your-domain>"
supabase secrets set APP_URL=https://your-domain
```

Without `EMAIL_FROM`, the app works normally but sends no emails.

#### 7. Set Up Cron Jobs

In your Supabase Dashboard → **SQL Editor**, first run `ALTER DATABASE postgres SET app.cron_secret = '<your-random-secret>';` using the same secret from step 6. Then replace `<PROJECT_REF>` in `scripts/setup-cron-schedules.sql` with your Supabase project ref and run the script. The database must have `pg_cron` and `pg_net` enabled.

This schedules the background jobs, including the hourly `selfie-storage-cleanup` job, which deletes any attendance selfie photos left from before attendance became GPS only. Confirm it is active in `cron.job` and that its first invocation succeeds, so the old photos are actually removed.

#### 8. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → `anon` `public` key |
| `VITE_VAPID_PUBLIC_KEY` | *(Optional)* Generate with `npx web-push generate-vapid-keys` for browser push notifications |

#### 9. Start the Dev Server

```bash
npm run dev
```

Open `http://localhost:3000`. You'll see the Voxel1 landing page. Register your organization from the app, or create the first admin user via the Supabase Dashboard → Authentication → Add User.

---

### Option B: Docker Compose (Self-Hosted — 2 minutes)

Deploy the entire Voxel1 stack (frontend + Supabase backend) on your own infrastructure with a single `docker compose up` command. All Supabase services — PostgreSQL, Auth, REST API, Realtime, Storage, Edge Functions, and Studio — are included and pre-configured.

#### Prerequisites

- **Docker** and **Docker Compose** v2+
- **Git** (to clone the repo)

#### 1. Clone & Generate Secrets

```bash
git clone <your-repository-url> voxel1
cd voxel1

# Generate a secure .env file with random secrets:
#   PowerShell: bash scripts/generate-secrets.sh
#   macOS/Linux: bash scripts/generate-secrets.sh
#   (Requires Node.js 18+ and openssl — both standard on dev machines)
#
# Or manually: cp .env.docker .env and fill in your own values
bash scripts/generate-secrets.sh
```

Edit `.env` to set your Studio credentials (at minimum):
```
DASHBOARD_USERNAME=your-username
DASHBOARD_PASSWORD=your-secure-password
```

#### 2. Start Everything

```bash
docker compose up -d
```

The first startup takes **2–3 minutes** while Docker pulls images, PostgreSQL initializes, all 21 database migrations run, 21 edge functions deploy, and cron jobs are configured. Check progress with:

```bash
docker compose logs voxel1-init -f
```

#### 3. Access the Stack

| Service | URL | Description |
|---------|-----|-------------|
| **Voxel1 App** | [http://localhost:3000](http://localhost:3000) | The HRMS frontend |
| **Supabase Studio** | [http://localhost:3001](http://localhost:3001) | Database admin UI |
| **Supabase API** | [http://localhost:8000](http://localhost:8000) | Kong API gateway (REST, Auth, Storage, Realtime) |

There is no sign-up, and the app runs a single organization (Voxel1). Its Admin adds managers (email + password) and employees (name + mobile number) in Team Directory, or adds employees as rows in the `employee_roster` table. Employees log in with their mobile number only.

#### What's Included

The stack runs 13 containers covering every Supabase service:

| Container | Role |
|-----------|------|
| `voxel1-db` | PostgreSQL 15 with `pg_cron`, `pg_net`, and `pg_trgm` extensions |
| `voxel1-kong` | API gateway routing all Supabase traffic (port 8000) |
| `voxel1-auth` | GoTrue authentication (email/password, JWT) |
| `voxel1-rest` | PostgREST — auto-generated REST API from your schema |
| `voxel1-realtime` | WebSocket subscriptions for live notifications |
| `voxel1-storage` | File storage API backed by MinIO (S3-compatible) |
| `voxel1-minio` | MinIO S3 object store for uploaded files |
| `voxel1-meta` | Database introspection for Studio |
| `voxel1-edge-fn` | Deno Edge Functions runtime (21 functions deployed) |
| `voxel1-studio` | Supabase Studio admin UI (port 3001) |
| `voxel1-imgproxy` | Image resizing proxy for uploaded photos |
| `voxel1-frontend` | React 19 SPA served by Nginx (port 3000) |
| `voxel1-init` | Auto-setup container (runs once — migrations, functions, cron) |

Cron jobs for attendance processing, daily reports and check-in reminders are automatically scheduled.

#### Persistence

Your data survives container restarts and `docker compose down`:

| Volume | Contents |
|--------|----------|
| `voxel1-postgres-data` | All database tables, users, and settings |
| `voxel1-minio-data` | Uploaded files (selfies, avatars, logos) |
| `voxel1-secrets` | Auto-generated JWT keys and credentials |

To wipe everything and start fresh: `docker compose down -v`

#### Configuration

See `.env.docker` for a complete reference of all environment variables. Key options:

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_SUPABASE_URL` | `http://localhost:8000` | Change if Kong is exposed on a different host/port |
| `VITE_SUPABASE_ANON_KEY` | (auto-generated) | Must match `ANON_KEY`. Rebuild frontend after changing |
| `POSTGRES_PASSWORD` | (auto-generated) | Database superuser password |
| `JWT_SECRET` | (auto-generated) | HMAC-SHA256 key for all auth tokens |
| `CRON_SECRET` | (auto-generated) | Shared secret for pg_cron → edge function calls |
| `RESEND_API_KEY` | (empty) | Optional — enables email sending via [Resend](https://resend.com) |

**Changing the Supabase URL**: If you expose Kong on a different host or port, update `VITE_SUPABASE_URL` in `.env` and rebuild the frontend:

```bash
docker compose build --no-cache voxel1-frontend
docker compose up -d
```

**PWA service worker**: Runtime caching in the PWA service worker is optimized for Supabase Cloud URLs. In self-hosted mode, API requests bypass the service worker cache. This has no functional impact — the app works correctly; it's a performance optimization only.

---

## Environment Variables Reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | **Yes** | Your Supabase project URL (cloud: `https://<ref>.supabase.co`, self-hosted: `http://localhost:8000`) |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Supabase anonymous/public API key (safe to expose in client code) |
| `VITE_VAPID_PUBLIC_KEY` | No | VAPID public key for web push notifications. Generate with `npx web-push generate-vapid-keys` |

---

## Architecture

```
React 19 PWA (TypeScript + Tailwind)
    │
    ▼
Custom Hooks → hrService (facade) → Domain Services → Supabase SDK
    │
    ▼
Supabase
├── PostgreSQL (15 tables, full RLS)
├── Auth (email/password, row-level security)
├── Storage (avatars, selfies, org logos, content images)
├── Edge Functions (16 serverless functions)
└── Realtime (notification bell live updates)
    │
    ▼
pg_cron + pg_net → Edge Functions (scheduled background jobs)
```

- **State-based routing** — No React Router; `currentPath` state in `App.tsx`
- **Context + Event Bus** — No Redux; AuthContext, ThemeContext, SubscriptionContext
- **Multi-tenant** — Every query scoped by `organization_id`
- **Row-Level Security** — PostgreSQL RLS policies enforce data isolation per user/org
- **WebP auto-conversion** — All uploaded images converted to WebP

---

## Supabase Project Structure

```
supabase/
├── migrations/              # Database schema (15 migrations)
│   ├── 0001_initial_schema.sql          # Core tables (orgs, profiles, attendance, leaves, etc.)
│   ├── 0002_rls_policies.sql            # Row-level security policies
│   ├── 0003_auth_hooks.sql              # handle_new_user trigger
│   ├── 0004_fix_rls_helpers.sql         # RLS helper function fixes
│   ├── 0005_storage_buckets.sql         # Storage buckets + policies
│   ├── 0006_settings_unique_constraint.sql
│   ├── 0007_attendance_self_update.sql
│   ├── 0008_attendance_self_update_text_cast.sql
│   ├── 0009_cron_setup.sql              # pg_cron + pg_net extension setup
│   ├── 0010_contact_submissions.sql
│   ├── 0011_push_subscriptions.sql
│   ├── 0012_broadcasts.sql
│   ├── 0013_add_email_to_profiles.sql
│   ├── 0014_admin_hr_cross_org_rls.sql
│   └── 0015_notify_super_admins.sql
├── functions/               # Edge Functions (16 deployed)
│   ├── employee-mobile-login/  # Employee login by mobile number
│   ├── admin-verify-employee/  # Manual employee verification
│   ├── create-employee/     # Create auth user + profile
│   ├── cron-auto-close-sessions/   # Close forgotten check-outs
│   ├── cron-auto-absent/           # Mark absent employees
│   ├── cron-daily-report/          # Daily attendance summary
│   ├── cron-attendance-reminders/  # Checkout reminders
│   └── cron-push-checkin-reminder/ # Missed check-in push alerts
└── .temp/                   # Local Supabase config (git-ignored)
```

### Storage Buckets

| Bucket | Access | Purpose |
|--------|--------|---------|
| `avatars` | Public read | Employee profile photos |
| `selfies` | Private, user-scoped | Legacy: old attendance selfies, emptied by `cron-selfie-storage-cleanup` |
| `org-logos` | Public read | Organization logos |
| `content-images` | Public read | Blog/tutorial cover images |
| `showcase-logos` | Public read | Featured organization logos |

### Cron Jobs

| Job | Schedule | Edge Function |
|-----|----------|---------------|
| `auto-close-sessions` | Every 5 min | `cron-auto-close-sessions` |
| `auto-absent-check` | Every minute | `cron-auto-absent` |
| `daily-attendance-report` | Daily 23:00 UTC | `cron-daily-report` |
| `attendance-reminders` | Every 5 min | `cron-attendance-reminders` |
| `push-checkin-reminder` | Every minute | `cron-push-checkin-reminder` |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant org records with status (active / read-only / suspended) |
| `profiles` | Employee profiles (extends `auth.users`, 1-to-1) |
| `attendance` | Daily attendance with GPS location and duty type |
| `leaves` | Leave requests with multi-tier approval status |
| `shifts` | Shift definitions with grace periods |
| `teams` | Team records with leader assignments |
| `settings` | Key-value organization configuration |
| `announcements` | Organization announcements with role targeting |
| `notifications` | User notification records |
| `review_cycles`, `performance_reviews` | Unused (performance reviews were removed; data kept) |
| `blog_posts` | Blog articles |
| `tutorials` | Tutorial/how-to content |
| `showcase_organizations` | Featured organizations |
| `social_links` | Social media links |
| `reports_queue` | Email automation queue |
| `contact_submissions` | Contact form submissions |
| `push_subscriptions` | Web push notification subscriptions |
| `broadcasts` | Super admin broadcast audit log |

---

## Role-Based Access

| Role | Access Level |
|------|-------------|
| **Admin** | Full organization visibility and configuration (logs in with email + password) |
| **Manager** | Team members' attendance, leave and daily tasks (logs in with email + password) |
| **Employee** | Own data only (logs in with mobile number) |

---

## Deployment

### Frontend (Vercel / Netlify / Any Static Host)

```bash
npm run build      # outputs to dist/
```

Set the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables in your hosting dashboard. Deploy the `dist/` folder.

### Backend (Supabase)

The backend is your Supabase project. No additional deployment needed for the database and auth. For self-hosted, run the Supabase Docker stack behind a reverse proxy (nginx, Caddy) with TLS.

---

## License

Voxel1 is private software of the Voxel1 company. It includes code from the MIT-licensed OpenHRApp project; that notice is kept in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Attendance data retention

Attendance records are kept indefinitely; the 10-day sheet is only a display window. Automatic attendance and associated audit-copy deletion has been disabled.

For existing deployments, apply `supabase/migrations/0063_keep_attendance_indefinitely.sql` in the Supabase SQL editor or through your database migration process before deploying the updated app. This disables the old purge RPC and removes its cron schedule, including protection against an older Docker scheduler. Deploy the updated scheduler script and restart `voxel1-selfie-cleanup` on Docker. Fresh installations apply this migration with the other migrations. Previously deleted records require a backup to restore.
