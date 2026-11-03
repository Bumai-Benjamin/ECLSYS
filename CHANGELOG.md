# Changelog

Requirement IDs refer to [REQUIREMENTS.md](REQUIREMENTS.md). Decisions are in
[docs/decisions.md](docs/decisions.md).

## Phase 2: Contract v2 (2026-11-03)

Done: **SC-1 to SC-8**, plus the frontend changes they need (D15, D16).
26 contract tests (`npm run test:contracts`); 100% line coverage of
`NamVoting.sol` (`npm run coverage`, D-002).

- **SC-1** OpenZeppelin 5.0.2 `AccessControl` with `ADMIN_ROLE`, `REGISTRAR_ROLE`
  and `RELAYER_ROLE`; the migration grants the registrar and relayer roles.
- **SC-2** Same function names as v1; `changeState` moves one step forward only.
- **SC-3** No storage links a voter to a choice (`Voter` has no `vote` field).
- **SC-4** Events `ContestantAdded`, `VoterRegistered`, `PhaseChanged`,
  `VoteCast(contestantId)` with no voter address.
- **SC-5** Vote counts hidden from `contestants()` until the phase is done;
  `results()` reverts before then.
- **SC-6** Custom errors: `WrongPhase`, `NotRegistered`, `AlreadyVoted`,
  `InvalidContestant`, `InvalidPhaseChange`, `AlreadyRegistered`.
- **SC-7** `voterRegisterationBatch(address[])`.
- **SC-8** Tests for every function, role, phase change and revert.
- **Frontend** `app.js` uses `eth_requestAccounts`, checks for chain ID 1337, sends
  every transaction from the connected account, reads the phase from the chain,
  and shows readable messages for reverts and cancelled MetaMask requests.
- Solidity 0.8.24 with `evmVersion: "paris"` (Ganache UI 2.7.1 has no `PUSH0`).
- SEC-9 decision recorded: a fresh CSRF token at login (D-003).

## Phase 1: Security fixes (2026-11-03)

Done: **SEC-1 to SEC-12**, with API tests for each (`npm run test:api`, 157
tests). SEC-13 is not applicable (no Redis, D-001).

- **SEC-1** `role` column; `/adlogin` admits only `role='admin'`; `npm run seed:admin`.
- **SEC-2** `requireLogin` / `requireAdmin` guards on the voter and admin pages
  and on the raw `.html` files.
- **SEC-3** bcrypt (cost 12); MD5 hashes upgraded at login; `confirm_password` dropped.
- **SEC-4** Per-request OTP: HMAC with `OTP_PEPPER`, 5-minute expiry, 5 attempts,
  single use; pending registration kept in the session (fixes D4, D7).
- **SEC-5** Sessions in MySQL; `httpOnly`, `sameSite=strict`, 30-minute idle
  timeout; new session at login, destroyed at logout.
- **SEC-6** Unique email and ID number; `Is_registered` and duplicate checks
  fixed; server-side validation.
- **SEC-7** Central error handler with a friendly page; secrets redacted from
  logs; if the OTP email can't be sent the voter is told and the code is retired.
- **SEC-8** Contract data escaped in the frontend; no inline event handlers
  (forms use `data-action`).
- **SEC-9** CSRF tokens on every POST form. The token is renewed with the session
  at login.
- **SEC-10** 5 POSTs per minute per IP on each form route; account lockout after
  10 failed logins in 15 minutes. Counters are in memory (D-001).
- **SEC-11** helmet and a CSP with `script-src 'self'`; jQuery served locally
  (3.2.1); remote and inline scripts removed.
- **SEC-12** `namvoting_app` MySQL user with SELECT/INSERT/UPDATE (and DELETE on
  `sessions`) through `npm run db:create-user`; `audit_log` table; admin logins audited.

## Phase 0: Housekeeping (2026-10-31)

Done: **HK-1, HK-2, HK-3, HK-4, HK-5, HK-6** (HK-6 closed as not applicable, see D-001).

- **HK-1** Git repository and `.gitignore` (`node_modules/`, `.env`, `build/`,
  `*.zip`, `ganache-db/`). The hard-coded Gmail credentials were removed before
  the first commit, so they aren't in the history.
- **HK-2** `dotenv` and `.env.example`; DB, session and SMTP settings come from
  `.env`; the server refuses to start without the required settings.
  *The Gmail app password that used to be in `routes/main.js` must still be
  revoked by its owner.*
- **HK-3** Package renamed to `namvoting`; broken `tsc` start script removed;
  scripts `dev`, `start`, `migrate`, `test:contracts`, `db:migrate`
  (`scripts/db-migrate.js`). `truffle-config.js` uses a fresh-connection provider
  so `truffle test` no longer fails against Ganache UI. `seed:admin` and
  `test:api` arrive with SEC-1 and the first API tests.
- **HK-4** Removed `routes/user.js`, `routes/first_page.js`,
  `src/views/first_page.ejs` and the unused `express()` apps inside route files.
- **HK-5** `README.md` with Windows setup (Node 18 through nvm-windows, XAMPP,
  Ganache, MetaMask, `.env`).
- **HK-6** Redis dropped (D-001): sessions and OTPs will live in MySQL; rate
  limits in memory. `REDIS_URL` removed.
