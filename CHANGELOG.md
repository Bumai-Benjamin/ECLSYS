# Changelog

Requirement IDs refer to [REQUIREMENTS.md](REQUIREMENTS.md). Decisions are in
[docs/decisions.md](docs/decisions.md).

## Phase 4: anonymous voting (2026-11-08)

Votes can no longer be linked to voters. Details, limits and the ANON-0 spike
result are in [docs/anonymity.md](docs/anonymity.md). 31 contract tests, 363 API
tests and 4 integration tests pass.

- **ANON-0** Semaphore 4.14.5 deploys to Ganache with Truffle, solc 0.8.24 and
  `paris`; the migration deploys PoseidonT3, SemaphoreVerifier and Semaphore
  before NamVoting. The ANON-6 fallback is not needed.
- **ANON-1** Registration: MetaMask signs a message naming the election, and the
  browser turns the signature into a Semaphore identity. Only its commitment is
  sent; the server registers wallet and commitment in one transaction
  (`voterRegisteration(address, uint256)`) and never stores the commitment.
  No backup file: the same wallet gives the same identity on any device.
- **ANON-2** Voting: the browser builds a depth-16 proof (about a second;
  `src/js/semaphore.bundle.js`, circuit files in `src/zk`). The CSP allows
  `'wasm-unsafe-eval'` and blob workers for it, still no string eval.
- **ANON-3** `POST /api/vote` relays the proof from `RELAYER_PRIVATE_KEY`. It is
  sent without cookies, needs no login or CSRF token, has its own rate limit
  (30 per IP per minute) and logs nothing about the request.
- **ANON-4** `castVote(proof)` replaces `vote(uint)`. NamVoting keeps its own
  nullifiers (Semaphore's `validateProof` can be called by anyone, which would
  let someone spend a voter's nullifier without the vote counting).
  `voters(address)` is replaced by `registered(address)`.
- **ANON-5** `VoteCast` carries the nullifier; the receipt shows it, and `/audit`
  lists it. 254-bit values stay exact (decimal strings) in `lib/chain`.
- The admin recovery form takes the voter's voting key as well as the wallet;
  the registration page shows the key if the on-chain step fails.
- Fix: `lib/chain` signs with the registrar and relayer keys itself. web3
  4.0.3's contract `.send()` asked Ganache to sign, which only worked when the
  key belonged to one of Ganache's own unlocked accounts.

## AI-slop audit fixes (2026-11-07)

Fixes from an audit against the anti-slop design rules for app screens. 346 API
tests pass; the design lint and the browser inspector report no failures on the
public pages.

- Square corners everywhere (buttons, inputs, panels, badges, markers); no
  resting shadows, only the dialog casts one.
- The navigation is neutral: a grey row for the current page, no coral bar or
  rule, and the phase as plain text ("Phase: Registration").
- Sign-in pages: a flat page ground instead of the diagonal two-tone split, a
  bordered card, and the commission's name as a wordmark instead of a small
  uppercase label. No ⚠ ✓ ● symbols drawn from CSS.
- The wallet status sits under the page title, as a quiet line of text.
- Dashboard: the first line says what to do next, or why there is nothing to do
  yet; the four steps are one strip with a bar per step; the help panel is gone.
- Results and Voting pages list who is on the ballot before voting opens
  (`/results.json` now returns `ballot`, names and parties only).
- Numbers in tables are right-aligned with tabular figures.
- Home: plain ground, a shorter heading, no slogan card.
- Bugs: closed confirmation dialogs were drawn at the foot of the Voting and
  Election phase pages (Material sets `dialog { display: block }`); dark-mode
  tables had light grey borders; the Voters page showed raw dates.

## UI audit fixes (2026-11-07)

Fixes from a UI audit of every page. 331 API tests pass; screenshots in
`docs/ui-screenshots/` now include a `-dark` set.

- Form inputs fit their columns (`box-sizing: border-box`); they overlapped
  on the two-column Create account and Add candidate forms.
- Table headers no longer break one letter per line.
- Results work without MetaMask: the new public `GET /results.json` reads the
  totals from the contract (none before voting closes). Public pages no
  longer show MetaMask warnings.
- Results name the winner (or a tie) and the number of votes cast, mark the
  winning row, and draw an empty bar track for 0%. The voter dashboard shows
  the same summary once voting closes.
- Audit page: events in plain words ("Vote cast for …") with the raw event
  under "Technical details"; full contract and wallet addresses; code text
  no longer pink (it failed contrast).
- A closed election is shown in neutral colours, not red. The Election phase
  page links to Results and no longer repeats the phase.
- Voters list numbers rows from 1 and says "Missing on blockchain".
- `/vote_area` redirects to `/voting`; the old page is gone.
- Dark colour scheme and reduced-motion support; the home image is an 800px
  WebP (50 KB, was a 149 KB PNG); skip links on the sign-in pages; 44px brand
  link; `autocomplete="sex"` on Gender.

## UI refresh (2026-11-06)

Done: **UI-1 to UI-9** (spec `docs/superpowers/specs/2026-11-05-ui-ux-refresh-design.md`).
299 API tests, 26 contract tests and 3 integration tests pass. Screenshots of
every page at 1280px and 375px are in `docs/ui-screenshots/`.

- **UI-1** `GET /me`: who is signed in, with no personal data.
- **UI-2** Step tracker: Account, Verify wallet, Vote, Results, with the reason
  a step is not open yet.
- **UI-3** MetaMask status messages and the Add candidate checks.
- **UI-4** Results sorted with share bars, ballot cards, shortened hashes, and
  the Open voting / Close voting flow.
- **UI-5** Coral stylesheet (`src/css/app.css`), one shared nav
  (`src/js/shell.js`), and all 17 pages rewritten: labels on every field, one
  heading, skip link, no inline styles, WCAG 2.1 AA contrast. `/voting` no
  longer shows the old demo's admin forms to voters.
- **UI-6** MetaMask status panel (install, connect, switch to the election
  network, wrong account, not an admin), and one transaction at a time.
- **UI-7** Connect-wallet button on `/form`, ballot with a confirmation dialog,
  progress lines and a receipt, "You have voted", and a results page that
  waits for voting to close.
- **UI-8** Admin: phase timeline with a typed OPEN / CLOSE confirmation,
  candidate checks before MetaMask opens, voter table badges, recovery tools
  folded away.
- **UI-9** A transaction that was mined but reverted is now reported ("The
  blockchain rejected the transaction. Nothing was changed.") instead of
  showing success; the bundled truffle-contract doesn't treat it as an error.
  Stacked tables on phones show their column names.

## Phase 3: Integration (2026-11-05)

Done: **INT-1 to INT-4**. 202 API tests pass (`npm run test:api`); the
contract is faked in API tests. `npm run test:integration` checks
`lib/chain.js` against Ganache and skips itself when Ganache is not running.

- **INT-2** `config/contract.js` and `lib/chain.js`: the server reads the
  contract address from the Truffle build and checks the contract is really on
  the running chain before every call. Ganache stopped, reset or not migrated
  gives "The blockchain is not available. Ask an administrator to run npm run
  migrate." instead of a crash.
- **INT-1** After the email code, the server registers the wallet on-chain
  (registrar key, `REGISTRAR_PRIVATE_KEY`) and then in the DB. A chain failure
  saves nothing and tells the voter; a DB failure after the chain succeeded is
  recorded as `chain_db_mismatch`. The admin form is now a recovery tool.
- **INT-3** The admin voter table has an "On blockchain" column (Yes,
  No ⚠ mismatch, Unknown) and lists recorded mismatches.
- **INT-4** Public `/audit` page: contract events, a re-count of votes, and a
  check against the contract totals once voting is done.

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
