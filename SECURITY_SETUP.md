# AJartivo Security Implementation (Production)

This project now uses backend-enforced controls for authentication hardening, authorization, and secure downloads.

## 1) What Was Implemented

- Email/password auth with strong password validation (`12+` chars, upper/lower/number/symbol).
- Email verification required before login access.
- Backend-assisted login throttling (`preLoginCheck`, `reportLoginAttempt`).
- Route protection for protected/admin pages in `js/auth.js`.
- Admin double-check (custom claim + UID/email whitelist) through `adminGuardCheck`.
- Download flow moved to backend `requestSecureDownload`:
  - requires authenticated + verified user
  - daily user limit (default 5/day)
  - IP-based daily limit
  - nonce lock to reduce refresh/multi-click abuse
  - signed, temporary URL generation
- Firestore/Storage rules deny public writes and block protected collections.

## 2) Files Added

- `functions/index.js`
- `functions/package.json`
- `firestore.rules`
- `storage.rules`
- `firebase.json`

## 3) Files Updated

- `js/auth.js`
- `js/download-system.js`
- `pages/header.html`
- `pages/sidebar.html`
- `css/style.css`
- `js/script.js`

## 4) Required Firebase Deploy Steps

Run from project root:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules,storage
```

## 5) Required Environment Variables (Cloud Functions)

Set these before deploying:

- `ADMIN_UID_WHITELIST` (comma-separated UIDs)
- `ADMIN_EMAIL_WHITELIST` (comma-separated emails)
- `DAILY_FREE_LIMIT_PER_USER` (default `5`)
- `DAILY_IP_LIMIT` (default `25`)
- `MAX_FAILED_ATTEMPTS` (default `5`)
- `LOGIN_LOCK_MINUTES` (default `15`)
- `DOWNLOAD_URL_TTL_MS` (default `120000`)
- `FUNCTION_REGION` (default `us-central1`)

Example:

```bash
firebase functions:config:set app.admin_uids="UID1,UID2"
```

If you use `functions:config`, map those values in `functions/index.js` or use runtime env from your deploy pipeline.

## 6) Admin Claims Setup (One Time)

Each admin must have custom claim:

```js
admin.auth().setCustomUserClaims("ADMIN_UID", { admin: true, role: "admin" });
```

Both claim + whitelist are required.

## 7) Data Model Requirements for Secure Download

For each design document in `designs/{id}`, store:

- `storagePath` (recommended), e.g. `secure-downloads/cdr/file1.cdr`
- or `downloadPath`
- legacy `download` with `gs://...` is also supported

Direct public HTTP links are intentionally blocked in secure flow.

## 8) Free Download Limit Logic

- Per-user daily count: `downloadDaily/{uid_YYYY-MM-DD}`
- Per-IP daily count: `downloadIpDaily/{ip_YYYY-MM-DD}`
- Event logs: `downloadEvents/{autoId}`
- Nonce locks: `downloadNonces/{uid_date_design_nonceHash}`

## 9) Security Notes

- Frontend source code is always visible in browser.
- Real protection is enforced by backend verification + Firebase Rules + signed URLs.
- Do not put secrets in client-side JS.
- Keep Firebase API keys non-secret but lock project via rules, auth, and backend checks.
- Enable HTTPS only, App Check, and monitoring/alerts in production.

