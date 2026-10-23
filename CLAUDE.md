# Voter Desk — Voting Management System

Session memory for this project. Read it fully before starting work.

- Repo: https://github.com/Ganesh30112006/voter-management (branch `main`)
- Layout: `Frontend/` (done) · `Backend/` (not started)

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
6. If a voter has received a donation, show **only a tick** (click → transaction details). Otherwise show a **Donate** button. **One successful donation per voter**, no repeats. A Super Admin can cancel/reverse a mistaken one, and the voter goes back to Not Received.
7. **Login = mobile number + password set by the Super Admin.** No forgot-password feature.
8. **Super Admin can change any admin's password.** BL Admins can also change their own (My Profile).
9. **BL Admins can donate to any voter** (not only their wards).
10. **Permissions are the same for every BL Admin**; there are no per-admin permission checkboxes. Only the Super Admin manages admins, wards/booths, voters (add/edit), imports, settings and audit logs.
11. Voter status (Active / Not Active / Shifted) is independent of donation status, and is never defaulted when missing (forms and imports).
12. Stack: React + TypeScript + Vite, plain CSS files (**no Tailwind**), React Router, Axios, React Hook Form + Zod, Recharts, Lucide icons, SheetJS (xlsx).
13. Commit/push only when asked. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 3. What is built (Frontend — complete)

Run: `cd Frontend && npm install && npm run dev` → http://localhost:5173 (uses the in-browser mock backend).
Checks: `npm run typecheck`, `npm test` (35 Vitest tests), `npm run build`. All pass.

Dev logins (mock only, password `demo@123` from `VITE_MOCK_PASSWORD`): Super Admin `9000000001`; BL-1 `9876543210` (wards 1–2); BL-2 `9876500011` (ward 3); BL-3 `9123456780` (ward 4, booths 41–42); BL-4 `8098765432` (inactive).

Screens: Login · Dashboard (separate SA/BL versions, charts) · Administrators (create with password, edit, change password, activate/deactivate, generated `BL-n` shown) · Wards & Booths (Ward → Booth → Voters, assign admins) · Voters (All / My Ward tabs, search/filter/sort/paginate, add/edit, household member, duplicate warnings, export) · Import (xlsx/xls/csv, signature check, sheet select, auto + manual column mapping, valid/invalid/duplicate tabs, inline correction, batched upload, summary, report download, template) · Donation Management · Donation History (filters, sort, CSV/Excel export, detail with audit trail, SA cancel/reverse) · Reports (charts + tables, CSV/Excel) · Audit Logs (read-only) · Settings (default amount, effective date, allow amount change, history) · My Profile (change password, signed-in devices).

Key frontend files:
- `Frontend/src/types/index.ts`: all entity and API types (the contract)
- `Frontend/src/services/*.ts`: one typed module per API area; each calls REST via `apiClient` or the mock when `VITE_USE_MOCK=true`
- `Frontend/src/mocks/mockServer.ts`: **reference implementation of every backend rule** (port this logic to the backend)
- `Frontend/src/mocks/db.ts`: seed data and mock persistence (localStorage)
- `Frontend/src/utils/validation.ts`: Zod schemas, Indian mobile rules, password policy
- `Frontend/src/utils/importParser.ts`: column detection and row validation for imports

**Vercel demo deployment:** the user deploys the frontend to Vercel to show it to others. The root `vercel.json` builds with `cd Frontend && npm run build:demo` (`.env.demo`: mock backend on, `VITE_DEMO_MODE=true`, demo password `demo@123`) and rewrites all routes to `index.html`. Each visitor's data lives only in their own browser. A normal `npm run build` refuses to include the mock. **When the real backend exists**, switch `vercel.json` to `npm run build` and set `VITE_API_BASE_URL` in Vercel.

Testing tip: in Playwright, logging in through the form makes Chrome's "Save password?" bubble swallow later clicks. Log in by calling the mock `login()` from `page.evaluate` and putting the token in `sessionStorage['vms-token']`.

## 4. Backend map (to build next — stack not chosen yet, ask the user)

Frontend expects a REST API at `VITE_API_BASE_URL` (e.g. `http://localhost:8080/api`).

### Conventions
- JSON everywhere. `Authorization: Bearer <token>` on every call except login.
- Errors: `{ message: string, code?: string, fieldErrors?: { [field]: string } }`.
  `400` validation · `401` session expired (frontend signs out) · `403` forbidden · `404` · `409` conflict (duplicates).
- Lists: `?page&pageSize&sortBy&sortDir` → `{ items, total, page, pageSize }`.
- Server is the source of truth for IDs, timestamps, totals and permissions. **Enforce every rule server-side.**
- Types: see `Frontend/src/types/index.ts` (Admin, Ward, Booth, Voter, VoterListItem, DonationTransaction, AuditLog, DashboardStats, ReportData, …).

### Endpoints (SA = Super Admin only)
| Area | Method & path | Notes |
|---|---|---|
| Auth | `POST /auth/login` `{mobile,password,remember}` → `{token,admin,expiresAt}` | Normalize mobile (+91/0/spaces). 401 wrong creds, 403 inactive. Session 8 h, 7 days if remember. Audit failed logins |
| | `POST /auth/logout` · `GET /auth/me` | |
| | `POST /auth/change-password` `{currentPassword,newPassword}` | Any admin; revokes their other sessions |
| | `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `POST /auth/sessions/revoke-others` → `{revoked}` | Sessions of the current admin only; never expose tokens |
| Admins (SA) | `GET /admins` `?search,wardId,status` · `GET /admins/options` · `GET /admins/:id` | Lists BL Admins |
| | `POST /admins` `{fullName,mobile,wardIds,boothIds,password}` → Admin | Server generates sequential `BL-n`; unique mobile; booths must belong to chosen wards |
| | `PUT /admins/:id` `{fullName,mobile,wardIds,boothIds}` · `PATCH /admins/:id/status` `{status}` | Deactivate → revoke sessions |
| | `PUT /admins/:id/password` `{password}` | SA sets a BL password → revoke that admin's sessions |
| Wards | `GET /wards` → `{wards,booths}` (all admins) · `GET /wards/summary` (SA, counts + admin ids) | |
| | `POST /wards`, `PUT /wards/:id` `{number,name}` (SA) | Ward number unique |
| | `POST /booths` `{wardId,number,name}`, `PUT /booths/:id` `{number,name}` (SA) | Booth number unique within its ward; a booth never changes ward |
| | `PUT /wards/:id/admins`, `PUT /booths/:id/admins` `{adminIds}` (SA) | Removing a ward also removes that admin's booths in it; assigning a booth adds its ward |
| Voters | `GET /voters` `?scope=all\|mine,search,wardId,boothId,status,donationStatus,sortBy,sortDir` → VoterListItem | Adds `donationStatus`, `latestDonation`, `canRecordDonation`, `inMyWards`. Search: name, voter ID, mobile, house no., household ID |
| | `GET /voters/:recordId` → `{voter, transactions}` | |
| | `GET /voters/export`, `GET /voters/duplicate-check`, `POST /voters`, `PUT /voters/:recordId` (SA) | Voter ID unique (case-insensitive, keep leading zeros); booth in ward; household can't span wards; status required |
| Imports (SA) | `GET /imports/context` → `{existingVoterIds, households}` | |
| | `POST /imports` `{fileName}` → `{importId}` · `POST /imports/:id/rows` `{rows:[{rowNumber,voter}]}` (batches of 100) · `POST /imports/:id/complete` `{skippedBeforeUpload}` → `{imported,skipped,failed,errors}` | Re-validate every row server-side; duplicate = skipped, invalid = failed; one audit entry per import |
| Donations | `GET /donations/context` → `{suggestedAmount, amountEditable}` | |
| | `POST /donations` `{voterRecordId,amount,receiverName,receiverMobile,idempotencyKey}` + header `Idempotency-Key` | Server sets `TXN-` id, timestamp, admin. **409 if the voter already has a Success txn.** Same key → return the original txn. If amount changes are disabled, amount must equal the current amount |
| | `GET /donations` `?search,from,to,wardId,boothId,adminId,status,sortBy,sortDir` · `GET /donations/export` · `GET /donations/:id` → `{transaction, audit}` | All admins can view all; `adminId` filter SA only |
| | `POST /donations/:id/cancel` `{kind:'Cancelled'\|'Reversed', reason}` (SA) | Only from Success; keeps the record; voter becomes Not Received |
| Reports | `GET /reports/dashboard` `?from,to,wardId,boothId` → DashboardStats | BL: voter counts scoped to assigned wards; "recorded by me" counts all their txns |
| | `GET /reports` `?from,to,wardId,boothId,adminId` → ReportData · `POST /reports/exports` `{name,format}` (audit only) | Unique voters counted separately from transactions; only Success txns count |
| Other | `GET /notifications` · `GET /audit-logs` `?search,entity,adminId,from,to` (SA, read-only) | |
| Settings (SA) | `GET /settings/donation` → `{settings, history, currentAmount}` · `PUT /settings/donation` `{defaultAmount,effectiveDate,allowAmountOverride}` | Current amount = most recently saved entry whose effective date ≤ today. Never changes past txns |

### Suggested tables
`admins` (id `SA-n`/`BL-n`, full_name, mobile **unique**, role, status, password_hash, created_at) · `admin_wards` · `admin_booths` · `sessions` (id, token_hash, admin_id, created_at, last_seen_at, expires_at, device) · `wards` (number unique) · `booths` (ward_id, number, unique(ward_id, number)) · `voters` (record_id, voter_id unique case-insensitive **as text**, full_name, mobile, ward_id, booth_id, house_number, household_id, address, status, timestamps) · `donation_transactions` (id, voter_record_id, voter snapshot fields, amount, receiver_name, receiver_mobile, timestamp, admin_id, admin_name, status, status_reason) with a **partial unique index on voter_record_id WHERE status = 'Success'** · `idempotency_keys` (key, txn_id) · `audit_logs` (append-only) · `donation_settings` + `settings_history`.

### Validation rules (same as frontend)
- Indian mobile: strip spaces, dashes and a +91/91/0 prefix, then `^[6-9]\d{9}$`.
- Password: 8–64 characters with at least one letter and one digit. Hash it (bcrypt/argon2).
- Amount: whole rupees, 1–1,00,000.
- Voter status exactly `Active`, `Not Active` or `Shifted`.

### Audit events to record
Login/failed login, admin create/update/activate/deactivate/password change, ward & booth create/update/assignment, voter create/update/status change, imports, donation recorded/cancelled/reversed, settings changes, exports.

## 5. Next steps
1. Ask the user which backend stack and database to use, then scaffold `Backend/`.
2. Implement the endpoints above, porting the rules from `Frontend/src/mocks/mockServer.ts` and its tests (`mockServer.test.ts`).
3. Point `Frontend/.env.production` `VITE_API_BASE_URL` at the backend and test with `VITE_USE_MOCK=false`.
