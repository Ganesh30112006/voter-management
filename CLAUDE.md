# Voter Desk — Voting Management System

Session memory for this project. Read it fully before starting work.

- Repo: https://github.com/Ganesh30112006/voter-management (branch `main`)
- Layout: `Frontend/` (done) · `Backend/` (done: Node + TypeScript + Express + PostgreSQL, for AWS. Frontend on AWS Amplify, backend as a plain Node app on AWS Elastic Beanstalk with RDS PostgreSQL. **No Docker**: the user rejected it; tests use the `embedded-postgres` npm package)

> **Role & naming change (user, 2026-10-23). This overrides any older "BL Admin" / "donation" wording in this file.**
> - Roles: **Super Admin** (unchanged) → **Corporator** (was BL Admin; IDs `C-1`, `C-2`, …) → **BLO** (Booth Level Officer; IDs `C-<n>-BLO<m>`, e.g. `C-1-BLO1` = first BLO of C-1).
> - The Super Admin creates Corporators and assigns their wards. A **Corporator creates its own BLOs** and assigns them to wards/booths **inside the Corporator's wards**. The Super Admin can manage every BLO.
> - Scope: **BLOs see and record payments only for voters in their assigned booths. Corporators see and record payments for voters in their wards.** This replaces old rule 9 ("donate to any voter").
> - **"Donation" is renamed "Payment" everywhere**: UI text, API paths (`/payments`), backend tables and code.
> - **Payments are cash in hand: no transaction ID is shown anywhere** (screens, search, exports, audit "Affected Record"). The server still keeps an internal `TXN-000001` reference for linking, cancel/reverse and idempotency.
> - **Corporators have a Location** (free text, optional, max 200 chars) that the Super Admin enters when creating/editing them. BLOs have none (`location: ''`).
> - **A Super Admin can create more Super Admins** (user, 2026-10-24): IDs `SA-2`, `SA-3`, … (counter `super_admin`, migration 002); name + mobile + password only (no wards/location); full rights. A Super Admin manages every account **except its own** (that is My Profile), so one active Super Admin always remains.
> - **Import accepts Excel, CSV and PDF** (user, 2026-10-24): a typed PDF table with headings, or an electoral roll (English EC layout or the **Telugu AP ward roll**: ఓటరు పేరు, ఇంటి సంఖ్య = door number, వయస్సు/వయసు, లింగము పు/స్త్రీ, EPIC "ఓటరు ఐడి. కార్డు నెం." at the bottom of each box). Ward + Status chosen for the whole roll, **booth optional**; the assembly reference "94 - 195 - 210" is ignored. Browser print margins (URL, date, "64/101") and rotated watermarks are skipped. PDFs up to 2 GB are read in 1 MB pieces page by page; scanned pages are listed as skipped (no OCR). Excel ≤ 100 MB, CSV ≤ 200 MB.
> - **Changes from 2026-10-24 (later):** voters have **no mobile number** (receiver mobile stays on payments); **booth is optional** for voters; voters have optional **Age** and **Gender**; an import Booth Number that is not a booth of the ward (e.g. "BLO1") only warns and the voter is added without a booth; **Voter ID is the default sort**.
> - **Status:** only **Active voters can be paid** (Shifted / Not Active are refused; deceased = Not Active). A separate **"Update status" import** reads every EPIC in a deaths/shifted list (PDF/Excel/CSV) and sets the chosen status for matching voters.
> - **Corporators have full control inside their own wards** (user, 2026-10-24): add/edit/import voters, status lists, booths and their BLOs, cancel payments. Wards and a ward's Corporator stay Super Admin only. **A ward has one Corporator**: giving a taken ward asks the Super Admin to **Move** or **Cancel**.
> - **Existing Voter ID** on import or add: the user chooses **Keep the existing voter** or **Replace its details** (payments stay with the voter).
> - **Corporators never see voters outside their wards** (2026-10-24): `/imports/context` is scoped to their wards; `/voters/duplicate-check` only says a Voter ID exists elsewhere (`existing: null`, no name/ward, no `similar` for other wards); `/voters/status` counts out-of-area IDs as `notFound` (no `outsideArea`). Taking a BLO off its last booth in a ward also removes that ward (it never widens to the whole ward).
> - **Corporators and BLOs are never shown Super Admins**: no SA accounts in lists, and work an SA did carries no recorder (blank); settings changes notify only "Payment details · Successfully updated".
> - **Downloads are Excel only** (user, 2026-10-24): every export (voters, payment history, reports, import validation/errors, not-found Voter IDs) is an .xlsx file; there are no CSV downloads. CSV files can still be imported. Everyone (SA, Corporator, BLO) changes their own password in My Profile. **A Super Admin can change every account's password except another Super Admin's** (server 403, button hidden). Because the same-name password rule can reveal a same-named account's password, **every** password attempt is rate-limited per signed-in account: change-password 10/hour, admin create/reset 30/hour (accepted attempts count too).
> - **"Given by"** (user, 2026-10-24): the payment form has a required **"Given by (your name)"** field for everyone who records a payment, prefilled with the account name and editable (stored as `given_by_name`, migration 005; older payments were filled with the account name). Shown as "Name (account ID)" on the confirm step, receipt, payment details, voter history and Payment History (column + export). Never put it in audit summaries (they are shown in payment details, and an SA's typed name would leak); `hideSuperAdmin` blanks it. Corporators can filter Payment History by themselves or one of their own BLOs (server-checked; a Super Admin ID returns nothing).
> - **BLO totals** (user, 2026-10-24): Reports has "Amount given by each BLO" (`byBlo` in `GET /reports`): the Super Admin sees every BLO (with its Corporator) plus an "All BLOs" total; a Corporator sees only its own BLOs plus their combined total; BLOs get none. BLOs with no payments show 0; a ward filter lists only BLOs on that ward or with payments there. Also an Excel sheet "By BLO".
> - **Ward payment amount** (user, 2026-10-24): a Corporator (its own wards) or a Super Admin (any ward) can set a ward's own amount per voter on Wards & Booths → "Amount" (`PUT /wards/:id/payment-amount {amount|null}`, migration 006 `wards.payment_amount`; null = the overall Settings amount). `/payments/context?wardId=` returns the ward amount as `suggestedAmount` plus `defaultAmount` and `wardAmounts` (caller's area only); the server enforces it when the amount is locked. Applies to new payments only; audited as "Ward payment amount changed".
> - **Own wards only** (user, 2026-10-25): `GET /wards` returns every ward/booth only to a Super Admin; a Corporator gets its own wards and their booths, a BLO its wards and the booths it covers, so no filter, form or label shows other wards. **Account details** (Accounts → view) show "Total distributed" (amount + payments) from `GET /admins/:id/payment-totals`, for accounts the caller manages (Super Admin: everyone else; Corporator: its BLOs).
> - **BLO cash** (user, 2026-10-25): a Corporator records the cash it hands each of its BLOs (Accounts → BLO details → "Cash with this BLO": add money, or a minus amount for money taken back, never more than given; optional note; history). Table `blo_cash` (migration 007); `GET/POST /cash/:bloId` (`cash.ts`). **Left = given − the BLO's successful payments** (a cancelled payment goes back automatically). Only the BLO's own Corporator can add/take back; the BLO, its Corporator and Super Admins can view. The BLO sees "Money left with you" on Payment Management and in the payment form (`cashLeft` in `/payments/context`); a payment larger than what is left only warns, it is not blocked. Reports "By BLO" adds Cash given / Cash left. Accounts details for a Corporator keep "Total distributed".
> - **Shifted voters can be paid** (user, 2026-10-26; replaces "only Active voters can be paid" for Shifted): Super Admins and Corporators pay them directly; **a BLO must get its Corporator's permission first**. BLO: "Ask permission" → "Waiting for permission" → Pay once allowed ("Refused · ask again" after a refusal). Corporator (its wards) / Super Admin: "Permission requests · Shifted voters" card on Payment Management with Allow / Refuse; notifications both ways. Table `shifted_approvals` (migration 008, one row per voter); `GET /shifted-approvals?status=`, `POST /voters/:id/shifted-approval/request` (BLO), `POST /voters/:id/shifted-approval {decision}` (ward manager); `shiftedApproval` on voter list items; the server refuses a BLO payment to a Shifted voter without approval (403). Who decided is never returned. **Not Active voters are still never paid.**
> - **"Not Active" is renamed "Dead"** (user, 2026-10-26): statuses are **Active / Shifted / Dead**; Dead voters are never paid (list shows "Dead · no payment"). Migration 009 converted existing Not Active voters to Dead. The server and import still accept "Not Active" (and deceased/died/expired/మరణించారు in files) as Dead. API keys renamed `notActive` → `dead`, `notActiveVoters` → `deadVoters`. Wherever this file says "Not Active" for voters, read "Dead".

---

## 1. Goal

A system for an organization that distributes donations to voters.

- **Super Admin** manages everything: BL Admins, wards & booths, voters, Excel/CSV import, donation settings, reports, audit logs.
- **BL Admin** views all voters (plus a *My Ward Voters* tab), records donations, and sees donation history and reports.
- **Core workflow:** open a voter → **Donate** → enter the amount (prefilled), receiver name and receiver mobile → confirm. The server records the timestamp, transaction ID and admin. The voter then shows a green **✓ Received** tick **in place of** the Donate button.

## 2. Rules from the user (must follow)

1. **Ask before doing anything you are unsure about.** Use the question tool; don't guess.
2. **Don't leave bugs.** Think first, then verify with a type check, tests, a build, and a browser run of the real flow.
3. Keep the UI **simple and plain**: white/light-gray background, navy sidebar, blue primary, green = received/active, gray = not active, amber = shifted, red = errors.
4. **No campaigns** of any kind: no campaign names, no campaign settings or filters.
5. Donation status is only **Received ✓ / Not Received**. A donation records **timestamp, receiver name, receiver mobile** (plus amount; the user confirmed keeping amount).
6. If a voter has received a donation, show **only a tick** (click → transaction details). Otherwise show a **Donate** button. **One successful donation per voter**, no repeats. **The receiver is not limited**: one person (e.g. the head of a household) may receive for several voters, so never add a uniqueness check on receiver name/mobile. A Super Admin can cancel/reverse a mistaken one, and the voter goes back to Not Received.
7. **Login = mobile number OR full name, + password** (set by the Super Admin, or by a BLO's Corporator). Names may repeat; the password tells same-named accounts apart, so **a password that another account with the same name (case/space-insensitive) already uses is rejected** on create, reset and change. If a rename ever makes name+password ambiguous, name login asks for the mobile number. No forgot-password feature. API body: `POST /auth/login {identifier, password, remember}`.
8. **Super Admin can change any admin's password.** BL Admins can also change their own (My Profile).
9. ~~BL Admins can donate to any voter~~ (superseded: area-scoped, see the role block).
10. **Permissions are the same for every BL Admin**; there are no per-admin permission checkboxes. Only the Super Admin manages admins, wards/booths, voters (add/edit), imports, settings and audit logs.
11. Voter status (Active / Not Active / Shifted) is never defaulted when missing (forms and imports). Only Active voters can be paid.
12. Stack: React + TypeScript + Vite, plain CSS files (**no Tailwind**), React Router, Axios, React Hook Form + Zod, Recharts, Lucide icons, SheetJS (xlsx).
13. Commit/push only when asked. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 3. Frontend (complete)

**No mock / demo mode** (user, 2026-10-24): the frontend always talks to the real API; the mock server, demo seed and Vercel demo were removed. The login page shows only the login form (no product name, no test credentials; tab title "Login").
Run: start the backend (section 4), then `cd Frontend && npm install && npm run dev` → http://localhost:5173 (`.env.development` points at http://localhost:4000/api).
Checks: `npm run typecheck`, `npm test` (34 Vitest tests), `npm run build`. All pass.

Screens: Login (mobile or name) · Dashboard (role-specific) · Accounts (SA: Corporators / BLOs / Super Admins tabs; Corporator: "My BLOs") · Wards & Booths (Corporators on wards, BLOs on booths) · Voters (SA: manage; others: "My Voters" in their area) · Import (Excel/CSV/PDF; heading row found below title rows; real spreadsheet row numbers) · Payment Management · Payment History (no payment ID shown; SA cancel/reverse) · Reports · Audit Logs (SA) · Settings (SA) · My Profile.

Key files: `Frontend/src/utils/importParser.ts` + `utils/pdfLayout.ts` (PDF table / electoral-roll reading) + `services/pdfReader.ts` · `Frontend/src/types/index.ts` (the API contract) · `src/services/*.ts` (REST) · `src/utils/permissions.ts` (roles/scope helpers) · `src/utils/validation.ts`.

**AWS Amplify:** deployed by GitHub Actions (`.github/workflows/frontend-ci.yml`), which builds with `VITE_API_BASE_URL` and publishes to the Amplify app. `amplify.yml` is only for a Git-connected Amplify build.

Testing tip: in Playwright, logging in through the form makes Chrome's "Save password?" bubble swallow later clicks. Log in by calling the login API (or mock `login()`) from `page.evaluate` and putting the token in `sessionStorage['vms-token']`.

## 4. Backend (complete): `Backend/`, see `Backend/README.md`

Node + TypeScript + Express 5 + PostgreSQL (`pg`, plain SQL migrations in `Backend/migrations/`). No Docker: `npm run db:local` runs a real PostgreSQL from the `embedded-postgres` npm package (data in `Backend/.pgdata`); tests start their own. Local API port is **4000** in `Backend/.env`: on this PC, 8080 is used by Jenkins and 8090 by a Wondershare app.
Run: `npm run db:local` (terminal 1) → `create-super-admin` once (see README) → `npm run dev`. Checks: `npm run typecheck`, `npm test` (60 API tests against real Postgres; sample data in `test/fixtures.ts`), `npm run build`. All pass, and the full browser flow was verified against the real API.

Conventions: JSON; `Authorization: Bearer <token>` (only a SHA-256 of tokens is stored); errors `{message, code?, fieldErrors?}` with 400/401/403/404/409; lists `?page&pageSize&sortBy&sortDir` → `{items,total,page,pageSize}`; sort keys are whitelisted, everything else is parameterised.

Endpoints (all under `/api`): `auth/*` (login `{identifier,password,remember}`, logout, me, change-password, sessions) · `admins` (SA + Corporators for their own BLOs; `role`, `corporatorId` filters; `options`) · `wards`, `wards/summary`, `booths`, `…/admins` assignment · `voters` (always scoped to the caller's area for non-SA), `voters/export|duplicate-check` (SA) · `imports` (SA, batches re-validated) · `payments` (`context`, record with idempotency, list/export/detail scoped, `:id/cancel` SA) · `settings/payment` (SA) · `reports/dashboard`, `reports`, `reports/exports` · `notifications` · `audit-logs` (SA) · `health`.

Database guarantees: unique admin mobile; voter ID unique case-insensitive (text, leading zeros kept); **partial unique index: one Success payment per voter** (receiver deliberately not unique); voter row locked while paying; append-only `audit_logs` (trigger); gapless counters for `SA-n`, `C-n`, `VR-`, `TXN-`, `AUD-`; per-Corporator `blo_counter` for `C-n-BLOm`.

Scripts: `migrate`, `create-super-admin` (first SA + initial payment amount, idempotent), `db:local`. The local dev database was wiped on 2026-10-24 (no demo data).

## 5. Deployment (LIVE since 2026-10-24, Mumbai ap-south-1, account 492462083767)

- Site: **https://main.d1il8v95socjri.amplifyapp.com** (Amplify app `d1il8v95socjri`, branch `main`)
- API: **https://d37boaln3snj1u.cloudfront.net/api** (CloudFront `E3NW6NPUQSE0HH`, sends `X-Origin-Verify`) → EB app `voter-desk`, env `voter-desk-api` (single t4g.small, Node 24, SG `sg-0654d6e10ccee1637` = CloudFront prefix list only, default EB SG disabled) → RDS `khwaja` (PostgreSQL 17, db.t4g.micro, private, SG `sg-0fecc0ba01c39a3c8`, master user `Khwaja`, DB `voterdesk`, deletion protection, 7-day backups).
- First Super Admin SA-1 (mobile 9966338451) was created with `create-super-admin` run on the EB instance through SSM (instance role has AmazonSSMManagedInstanceCore).
- CD: GitHub OIDC roles `voterdesk-backend-deploy` (EB) and `voterdesk-frontend-deploy` (Amplify app only), trusted only for each repo's `production` environment. GitHub's OIDC subject includes numeric IDs (`repo:Ganesh30112006@204135162/<repo>@<repoId>:environment:production`; backend repo ID 1431622954, frontend 1430844586), so re-creating a repo means updating the role trust policy. Pushing to `main` in either repo tests and deploys.
- Users are in Guntur/Vijayawada: served from CloudFront's Chennai edge (~0.2 s per request measured).

### Original plan (kept for reference)

Target: **AWS Elastic Beanstalk (Node.js platform) + RDS PostgreSQL** for the API, **AWS Amplify Hosting** for the frontend. `Backend/deploy/package-eb.ps1` builds `deploy/voter-desk-backend.zip` (includes the RDS CA bundle and `.ebextensions/voterdesk.config`: health check `/api/health`, `TRUST_PROXY=1`, TLS to RDS). The API runs migrations on start; run `create-super-admin` once against RDS.
Decided (2026-10-24): region **ap-south-1 (Mumbai)**; **RDS PostgreSQL** (not DynamoDB: the backend needs SQL/transactions; >1 lakh voters measured fine: lists/search 30–130 ms, SA reports ~0.7 s with 1.5 lakh voters); **single EB instance behind CloudFront** (no domain yet; `ORIGIN_SECRET` header so only CloudFront reaches the API; `TRUST_PROXY=2`); add a load balancer + ACM certificate when the user buys a domain.
Backend repo: **https://github.com/Ganesh30112006/khwaja_backend** (git repo inside `Backend/`, branch `main`). GitHub Actions `.github/workflows/ci-cd.yml`: tests on every push/PR; deploys to EB from `main` via OIDC once repo variables `AWS_ROLE_ARN, AWS_REGION, EB_APP, EB_ENV, EB_BUCKET, API_HEALTH_URL` are set.
Before deploying: the user must run `aws login` (the CLI session on this PC had expired), and confirm region, instance sizes and how HTTPS is provided (a domain + ACM certificate on the load balancer, or CloudFront). Creating AWS resources costs money: always confirm first.
