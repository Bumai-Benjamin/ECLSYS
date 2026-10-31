# Changelog

Requirement IDs refer to [REQUIREMENTS.md](REQUIREMENTS.md). Decisions are in
[docs/decisions.md](docs/decisions.md).

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
