# NamVoting UI/UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every voter, admin and public page usable by first-time voters and election staff: one coral look, a shared nav, a step tracker, MetaMask guidance, confirmed and receipted votes, and clear admin phase changes, at WCAG 2.1 AA.

**Architecture:** Pages stay static HTML / EJS at their current URLs. `src/css/app.css` overrides Material Dashboard; `src/js/shell.js` draws the nav into `#app-shell`; a new `GET /me` route tells public pages who is signed in. Decision logic lives in small browser-and-Node modules (`steps.js`, `wallet-status.js`, `validate-candidate.js`, plus helpers in `templates.js` and `shell.js`) so mocha tests it; `app.js` wires them to the DOM.

**Tech Stack:** Node 26 (runs the suite; plan targets Node 18 APIs), Express 4, EJS, jQuery 3.2.1, Material Dashboard 2.1.2 CSS, web3 (bundled), truffle-contract, mocha, chai, supertest.

**Spec:** `docs/superpowers/specs/2026-11-05-ui-ux-refresh-design.md` (section numbers below refer to it).

## Global Constraints

- No new npm dependency; no framework; no build step.
- Every URL and the order of the flow stay the same.
- CSP unchanged (`script-src 'self'`): no inline `<script>` blocks, no `on*=` handlers, and no `style=` attributes in `src/*.html` or `src/views/*.ejs`.
- Contract data is escaped (`Templates.escapeHtml`, EJS `<%= %>`); never `.html(` with a `+`-built string (SEC-8 test).
- Brand tokens exactly as spec §3.1: `--brand #ec6363`, `--brand-strong #b93a3a`, `--brand-tint #fdecec`, `--danger #9b1c1c`, `--success #1e6b3a`, `--warning #8a5a00` on `#fff4d6`, `--text #1f2328`, `--muted #57606a`, `--surface #ffffff`, `--page #f6f7f9`.
- WCAG 2.1 AA: text contrast ≥ 4.5:1, labelled inputs, errors in words, visible focus, one `<h1>`, `lang="en"`, skip link.
- Browser modules follow the `templates.js` pattern: IIFE, global in the browser, `module.exports` when `typeof module !== 'undefined'`.
- Existing suites stay green: `npm run test:api` (213), `npm run test:contracts` (26), `npm run test:integration` (3). Contract and integration runs need Ganache on 7545 and the D: tools on `PATH` (`D:\GIT Projects\ecl-chain-tools\node_modules\.bin`).
- One commit per task, message `UI-<n>: <summary>`, ending with the `Co-Authored-By` line.

## Review Focus

1. **Wallet address case:** the DB stores the address as the voter typed it, MetaMask returns it checksummed or lower-case; a case-only difference must not show "wrong account". Tested in Task 3.
2. **Chain not reachable or contract not deployed while the page is open:** the step tracker must not stay on "Checking…" forever and the status panel must show the `ChainUnavailableError` text. Tested in Tasks 2 and 6.
3. **`/me` fails or is slow on a public page:** the visitor still gets the public nav and never sees "Log out"; a voter page never loses its voter nav. Tested in Task 5.
4. **Very long contract strings** (64-character name with no spaces, 100-character qualification) on a 375px screen: cards and tables wrap instead of overflowing. Tested in Task 5 (static CSS check) and Task 9 (screenshot).
5. **Double submit:** a second click on **Cast vote**, **Confirm** (phase) or **Add candidate** while a transaction is pending must not send a second transaction. Tested in Task 6 (`Pending.run`).

---

### Task 1: `GET /me` (UI-1)

**Files:**
- Create: `routes/me.js`, `test/api/ui-me.test.js`
- Modify: `server.js` (mount the router next to the others)

**Interfaces:**
- Produces: `GET /me` → JSON per spec §3.3. Signed out `{ loggedIn: false }`. Signed in `{ loggedIn: true, role, firstName, walletVerified, wallet }`; `wallet` is `account_address` only when `Is_registered` is `'YES'` (case-insensitive), else `null`. Header `Cache-Control: no-store`. Looks the user up by `req.session.emailAddress`; role from `registration.role`.

- [ ] **Step 1: Write the failing tests** in `test/api/ui-me.test.js`:
  - `'signed out returns { loggedIn: false }'`: `h.agent().get('/me')` → 200, body deep-equals `{ loggedIn: false }`, `cache-control` contains `no-store`.
  - `'voter without a verified wallet'`: `h.createUser()`, `h.login` → body `{ loggedIn: true, role: 'voter', firstName: 'Test', walletVerified: false, wallet: null }`.
  - `'voter after on-chain registration'`: `h.startRegistration(undefined, { chain: fakes.fakeChain() })`, `h.submitOtp(reg, h.lastOtp(...))`, then `reg.a.get('/me')` → `walletVerified: true`, `wallet: reg.wallet`.
  - `'admin'`: `h.createUser({ role: 'admin' })`, `h.adminLogin` → `role: 'admin'`.
  - `'never returns personal data'`: for the voter above, `JSON.stringify(body)` contains none of `user.email_address`, `user.id_number`, `'1990-05-01'`, `'$2'` (bcrypt prefix); `Object.keys(body).sort()` deep-equals `['firstName','loggedIn','role','wallet','walletVerified']`.
- [ ] **Step 2:** Run `npx mocha --grep "GET /me"` (describe name `'UI-1 GET /me'`). Expected: FAIL, 404.
- [ ] **Step 3:** Implement `routes/me.js` with a parameterised `SELECT first_name, role, Is_registered, account_address FROM registration WHERE email_address = ?`; DB errors go to `next(err)`. Mount in `createApp`.
- [ ] **Step 4:** Run `npm run test:api`. Expected: all pass (218).
- [ ] **Step 5:** Commit `UI-1: GET /me for the shared nav and step tracker`.

### Task 2: Step tracker logic (UI-2)

**Files:**
- Create: `src/js/steps.js`, `test/api/ui-steps.test.js`

**Interfaces:**
- Produces: `Steps.compute({ loggedIn: boolean, walletVerified: boolean, phase: 0|1|2|null, hasVoted: boolean|null })` → `{ badge: string, steps: Array<{ id: 'account'|'wallet'|'vote'|'results', label: string, status: 'done'|'current'|'locked'|'checking', reason?: string, href?: string }> }`.
  - Labels: `'Account'`, `'Verify wallet'`, `'Vote'`, `'Results'`. Hrefs: `/dashboard`, `/form`, `/voting`, `/result`.
  - Badge: phase 0 `'Registration'`, 1 `'Voting open'`, 2 `'Voting closed'`, `null` `'Checking…'`.
  - Rules exactly as spec §4.1. Reasons (exact copy): `'Registration is closed.'`, `'Voting opens when the commission starts the voting phase.'`, `'Voting is closed.'`, `'Verify your wallet first.'`, `'Results appear when voting closes.'`.
  - `phase === null` (chain not known yet or unreachable): steps 3 and 4 get `status: 'checking'` and no reason; step 2 is `done` if verified, else `current`.
  - `Steps.unavailable(steps)`: replaces every `'checking'` with `'locked'` and reason `'The blockchain is not available right now.'` (Review Focus 2).
  - At most one step has `status: 'current'`.

- [ ] **Step 1: Write the failing tests:** a table-driven `it` per row: for `phase` in `[0,1,2]` × `walletVerified` in `[false,true]` × `hasVoted` in `[false,true]` (skip voted-but-unverified), assert each step's `status` and `reason` against spec §4.1; plus `'badge text per phase'`, `'phase null gives checking for vote and results'`, `'unavailable() turns checking into locked with the blockchain message'`, `'never more than one current step'` (loop over all combinations), and `'escapes nothing itself; returns plain text'` (no `<` in any label or reason).
- [ ] **Step 2:** Run `npx mocha --grep "UI-2"`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `src/js/steps.js`.
- [ ] **Step 4:** Run `npx mocha --grep "UI-2"`. Expected: PASS.
- [ ] **Step 5:** Commit `UI-2: step tracker logic`.

### Task 3: Wallet status and candidate-form logic (UI-3)

**Files:**
- Create: `src/js/wallet-status.js`, `src/js/validate-candidate.js`, `test/api/ui-wallet-status.test.js`, `test/api/ui-candidate-form.test.js`

**Interfaces:**
- Produces: `WalletStatus.decide({ hasEthereum: boolean, accounts: string[]|null, chainId: string|null, expectedWallet: string|null, role: 'voter'|'admin', isAdminAccount: boolean|null })` → `{ state, message, action }`.
  - `EXPECTED_CHAIN_ID = '0x539'`; `action` is `'install'|'connect'|'switch-network'|null`.
  - Precedence: `no-metamask` → `not-connected` (accounts null or empty) → `wrong-network` (chainId compared case-insensitively) → `wrong-account` (voter, `expectedWallet` set, lower-cased addresses differ) → `not-admin` (admin, `isAdminAccount === false`) → `ok`.
  - Messages exactly as spec §4.3; `wrong-account` and `ok` use `WalletStatus.short(addr)` = first 6 + `'…'` + last 4 (`'0x1234…abcd'`).
- Produces: `CandidateForm.validate({ name, party, age, qualification })` → object of `field: message` (empty object when valid). Values trimmed first. Messages: `'Enter the candidate\'s name.'`, `'Name must be 64 characters or fewer.'`, `'Enter the party.'`, `'Party must be 64 characters or fewer.'`, `'Age must be a whole number from 18 to 120.'`, `'Enter the qualification.'`, `'Qualification must be 100 characters or fewer.'`.

- [ ] **Step 1: Write the failing tests:**
  - wallet status: one `it` per state with its exact message and action; `'precedence: no MetaMask wins over everything'`, `'wrong network checked before wrong account'`; `'address case differences are not a wrong account'` (expected `'0xABCDEF…'` mixed case vs accounts `['0xabcdef…']` → `ok`) (Review Focus 1); `'chain id 0X539 counts as the right network'`; `'locked MetaMask (accounts []) is not-connected'`; `'short() gives 0x1234…abcd'`.
  - candidate form: valid input → `{}`; name `''`, 64 chars ok, 65 chars error; party same; age `'17'`, `'18'` ok, `'120'` ok, `'121'`, `'20.5'`, `'abc'`, `''` errors; qualification `''`, 100 ok, 101 error; `'trims before checking'` (`'  '` name is empty).
- [ ] **Step 2:** Run `npx mocha --grep "UI-3"`. Expected: FAIL, modules not found.
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** Run `npx mocha --grep "UI-3"`. Expected: PASS.
- [ ] **Step 5:** Commit `UI-3: wallet status and candidate form checks`.

### Task 4: Template helpers for results, hashes and phase flow (UI-4)

**Files:**
- Modify: `src/js/templates.js`
- Create: `test/api/ui-templates.test.js`

**Interfaces:**
- Produces (on `Templates`):
  - `shortHash(value: string): string`: strings longer than 13 chars → first 6 + `'…'` + last 4; else unchanged.
  - `resultRows(candidates: Array<{id, name, party, voteCount}>)` → `Array<{ id, name, party, votes: number, share: number, barClass: string }>` sorted by votes descending, ties by id ascending; `share` = rounded percent of the total (0 when total is 0); `barClass` = `'bar-' + (share rounded to the nearest 5)`.
  - `resultRow(r)`: HTML `<tr>` with escaped name and party, votes, `share%`, and `<span class="bar ${barClass}" aria-hidden="true"></span>`; cells carry `data-label` for the stacked phone layout.
  - `candidateChoice(c)`: HTML for a voting card: `<label class="candidate-card">` wrapping `<input type="radio" name="candidate" value="${safeId}">` and escaped name, party, age, qualification.
  - `PhaseFlow.next(phase: 0|1|2)` → `{ button: 'Open voting', word: 'OPEN', explain: … }` for 0, `{ button: 'Close voting', word: 'CLOSE', explain: … }` for 1, `null` for 2; `explain` texts exactly as spec §5.1. `PhaseFlow.confirmed(typed, word)`: true when `typed.trim().toUpperCase() === word`.
  - `PhaseFlow` is a second export of `templates.js` (`Templates.PhaseFlow`).

- [ ] **Step 1: Write the failing tests:** `'resultRows sorts by votes then id'` (`[{id:1,v:2},{id:2,v:5},{id:3,v:2}]` → ids `[2,1,3]`); `'shares round and bars snap to 5'` (votes `[1,2]` → shares `[33,67]`, bars `bar-35`, `bar-65`); `'zero votes gives share 0 and bar-0'`; `'resultRow and candidateChoice escape <script> in name and party'`; `'candidateChoice uses the numeric id only'`; `'shortHash'` for a 66-char hash and a short string; `PhaseFlow.next` for 0, 1, 2; `'confirmed accepts " open " and rejects "OPN"'`.
- [ ] **Step 2:** Run `npx mocha --grep "UI-4"`. Expected: FAIL.
- [ ] **Step 3:** Implement in `templates.js`, reusing `escapeHtml` and `safeId`.
- [ ] **Step 4:** Run `npm run test:api`. Expected: all pass (SEC-8 static checks included).
- [ ] **Step 5:** Commit `UI-4: result, hash and phase-flow helpers`.

### Task 5: Coral stylesheet, shared shell and page conversion (UI-5)

**Files:**
- Create: `src/css/app.css`, `src/js/shell.js`, `test/api/ui-pages.test.js`, `test/api/ui-shell.test.js`
- Modify: every `src/*.html` and `src/views/*.ejs` (16 files, spec §2)

**Interfaces:**
- Consumes: `GET /me` (Task 1), `Steps` (Task 2).
- Produces:
  - `Shell.navFor(pageNav: 'voter'|'admin'|'public', me: object|null)` → `'voter'|'admin'|'public'`: `public` pages switch to `me.role` when `me && me.loggedIn`; `voter` and `admin` pages always keep their own nav (Review Focus 3).
  - `Shell.items(nav)` → `Array<{ id, label, href }>` with the exact items of spec §3.2 (ids: `dashboard`, `info`, `register`, `voting`, `results`, `logout`; `candidates`, `add`, `voters`, `phase`, `logout`; `home`, `results`, `audit`, `signin`).
  - `Shell.render(nav, activeId)` → HTML string (escaped; `aria-current="page"` on the active item). In the browser, `shell.js` renders into `#app-shell` immediately, then (public pages only) fetches `/me` and re-renders if the nav changes; a failed fetch keeps the public nav.
  - Page placeholders other tasks fill: `#phase-badge` (top bar), `#steps` (voter pages listed in spec §4.1), `#wallet-status` (chain pages: `/form`, `/voting`, `/result`, `/candidateDetails`, `/addCandidate`, `/changePhase`, `/table_view`), `<main id="content">`.
  - `body` attributes: `data-nav`, `data-page`.

- [ ] **Step 1: Write the failing tests:**
  - `ui-shell.test.js`: `navFor('public', null)` → `'public'`; `navFor('public', { loggedIn: false })` → `'public'`; `navFor('public', { loggedIn: true, role: 'voter' })` → `'voter'`; `navFor('voter', null)` → `'voter'`; `items('public')` has no `logout`; `items('admin')` ids in the spec order; `render('voter','voting')` contains `aria-current="page"` exactly once and `href="/voting"`.
  - `ui-pages.test.js` (static, spec §8 list), over the 16 page files: every page with a nav has `id="app-shell"` and loads `/css/app.css` after `material-dashboard.css` and `/js/shell.js`; no `class="sidebar"`; exactly one `<h1`; `<html lang="en">`; no `style=` attribute; none of the removed plugin file names (`jquery-jvectormap`, `nouislider`, `bootstrap-tagsinput`, `jasny-bootstrap`, `bootstrap-notify`, `moment.min`, `jquery.validate`, `arrive.min`); every `<input` (except `type="hidden"`, `type="submit"`, `type="radio"` inside a label), `<select`, `<textarea` has an `id` matched by a `<label for=` or carries `aria-label`; a skip link `href="#content"` is the first `<a` in `<body>`; and `app.css` contains `overflow-wrap: anywhere` (Review Focus 4) and each token from Global Constraints.
- [ ] **Step 2:** Run `npx mocha --grep "UI-5"`. Expected: FAIL on every page.
- [ ] **Step 3:** Write `app.css` (tokens, Material overrides, focus ring, 16px base, 44px targets, `.bar-0`…`.bar-100` widths, badges, status panel, step tracker, candidate cards, stacked tables below 576px, collapsed sidebar below 992px) and `shell.js`.
- [ ] **Step 4:** Convert the pages: remove hand-written sidebars and unused plugin scripts; add the shell placeholder, skip link, `lang`, one `<h1>`, labels; move every `style=` into `app.css`; keep all element ids `app.js` uses (`#content`, `#loader`, `#contestantSelect`, `#name`, `#age`, `#party`, `#qualification`, `#accadd`, `#Results`, `#renderTable`, `#not`, `#currentPhaseAdmin`, `#contestantsResultsAdmin`). Keep `#chainError` for now (Task 6 replaces it). Public and sign-in pages per spec §6: home gets **Register to vote** (`/register`), **Sign in** (`/login`) and a "See results" link (`/result`); sign-in, sign-up and admin sign-in use one `.auth-card`, show `Use at least 8 characters.` (check `lib/validate.js` for the real rule and copy it exactly) before the password field, and put server messages in `<div class="alert" role="alert">`; `/audit` shows addresses and hashes through `Templates.shortHash`-equivalent EJS (`value.slice(0, 6) + '…' + value.slice(-4)`) with the full value in `title`.
- [ ] **Step 5:** Run `npm run test:api`. Expected: all pass. Then open `/`, `/login`, `/result`, `/audit` in the browser pane at 1280px and 375px and check the nav renders with no console errors and no CSP violations.
- [ ] **Step 6:** Commit `UI-5: coral stylesheet, shared nav, accessible page markup`.

### Task 6: Status panel and pending guard in `app.js` (UI-6)

**Files:**
- Create: `src/js/pending.js`, `test/api/ui-pending.test.js`
- Modify: `src/js/app.js`, the 7 chain pages (replace `#chainError` with `#wallet-status`), `test/api/fe-errors.test.js` (expect `id="wallet-status"` and `wallet-status.js` before `app.js` instead of `#chainError`)

**Interfaces:**
- Consumes: `WalletStatus` (Task 3), `Steps` (Task 2), `/me` (Task 1).
- Produces:
  - `Pending.run(key: string, fn: () => Promise<any>)` → the promise of `fn`, or `null` (and `fn` not called) when a run with the same `key` is still in flight; `Pending.busy(key)` → boolean (Review Focus 5).
  - `App.status(state)`: renders a `WalletStatus.decide` result into `#wallet-status`, with the action button (`install` link, `connect`, `switch-network`).
  - `App.alert(text, kind)`: replaces `showMessage`; writes into `#wallet-status .status-alert` (`role="alert"`), `kind` `'ok'|'error'`; `showMessage`/`showError` become thin wrappers so existing callers keep working.
  - `App.switchNetwork()`: `wallet_switchEthereumChain` to `0x539`; on error code `4902`, `wallet_addEthereumChain` with `{ chainId: '0x539', chainName: 'NamVoting (Ganache)', rpcUrls: ['http://127.0.0.1:7545'], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }`.
  - `App.phase` and `App.hasVoted` set after `initContract`; when the contract is unreachable `App.chainDown = true` and the step tracker is rendered with `Steps.unavailable` (Review Focus 2).
  - `App.renderSteps()` fills `#steps` and `#phase-badge` from `/me` + `App.phase` + `App.hasVoted`.

- [ ] **Step 1: Write the failing tests:** `ui-pending.test.js`: `'second run with the same key while busy returns null and does not call fn'`; `'different keys run in parallel'`; `'key is free again after the promise settles, also after a rejection'`. Update `fe-errors.test.js` as described; it must now fail on the pages.
- [ ] **Step 2:** Run `npx mocha --grep "UI-6|FE"`. Expected: FAIL.
- [ ] **Step 3:** Implement `pending.js` and the `app.js` changes; wrap `castVote`, `addCandidate`, `changeState`, `registerVoter` in `Pending.run`. Swap `#chainError` for `<div id="wallet-status" role="status" aria-live="polite">` on the chain pages and load `wallet-status.js`, `steps.js`, `pending.js` before `app.js`.
- [ ] **Step 4:** Run `npm run test:api`. Expected: all pass. In the browser pane with Ganache running, `/result` shows the `ok` chip or the right state; with Ganache stopped it shows the blockchain-unavailable message and the steps show "locked" with that reason.
- [ ] **Step 5:** Commit `UI-6: MetaMask status panel, network switch, one transaction at a time`.

### Task 7: Voter pages: tracker, connect wallet, voting and results (UI-7)

**Files:**
- Modify: `src/js/app.js`, `src/views/dashboard.ejs`, `src/userInfo.html`, `src/views/voter-registration.ejs`, `src/views/emailverify.ejs`, `src/voting.html`, `src/result.html`
- Test: `test/api/ui-pages.test.js` (add voter-page checks)

**Interfaces:**
- Consumes: `Templates.candidateChoice`, `Templates.resultRows`, `Templates.resultRow`, `Templates.shortHash` (Task 4); `Pending.run`, `App.status`, `App.alert`, `App.renderSteps` (Task 6).
- Produces (DOM contracts the tests check):
  - `/form`: `<button type="button" id="use-wallet">Use my MetaMask wallet</button>`, the address input `#account_address` with `aria-describedby="wallet-hint"`, a "Use a different account" button `#change-wallet` (hidden until filled); ID input has `aria-describedby="id-hint"` with text `11 digits, as on your Namibian ID`.
  - `/voting`: `<fieldset id="ballot">` filled with `candidateChoice` cards; `<button type="button" id="review-vote" disabled>Review my vote</button>`; `<dialog id="confirm-vote">` with `#confirm-text`, `#cast-vote`, `#cancel-vote`; `<div id="vote-progress" aria-live="polite">`; `<section id="receipt" hidden>` with `#receipt-tx`, `#receipt-block`, a link to `/audit`; `<section id="already-voted" hidden>` linking to `/result`.
  - `/result`: `#results-waiting` (shown before phase 2, links to `/audit`) and `<table id="results-table">` filled with `resultRow`.
  - `emailverify.ejs`: link `href="/form"` with text `Didn't get the code? Request a new one`.

- [ ] **Step 1: Write the failing tests** (static, in `ui-pages.test.js` under `describe('UI-7 voter pages')`): each id above exists on its page; `#review-vote` starts `disabled`; `<dialog id="confirm-vote">` exists; `#receipt` and `#already-voted` have the `hidden` attribute; the exact copy strings `Use my MetaMask wallet`, `11 digits, as on your Namibian ID`, `Review my vote`, `Your choice is not stored next to your name.`, `Results will appear when voting closes.`, `Didn't get the code? Request a new one`; `app.js` contains no `$('#test')` and no `Election is Not Over Yet`.
- [ ] **Step 2:** Run `npx mocha --grep "UI-7"`. Expected: FAIL.
- [ ] **Step 3:** Implement markup and `app.js` wiring:
  - `#use-wallet` → `eth_requestAccounts`, fill and lock the input, show the short form.
  - Ballot: selecting a card enables `#review-vote`; it opens `#confirm-vote` (`showModal()`), whose text is set with `.text()`; **Cast vote** runs `Pending.run('vote', …)` through "Confirm the transaction in MetaMask…" → "Recording your vote…" → receipt (tx hash via `Templates.shortHash`, full hash in `title`, block number from the receipt); focus returns to `#review-vote` on cancel.
  - `App.hasVoted` true → show `#already-voted` instead of the ballot.
  - Results via `resultRows` when phase is 2, else `#results-waiting`.
- [ ] **Step 4:** Run `npm run test:api`. Expected: all pass. With Ganache, MetaMask and the dev server: walk Task 8 checklist items 2, 4, 5, 7 and 8 of the Phases 1–5 plan (register, vote, already-voted, results, cancel, voting closed).
- [ ] **Step 5:** Commit `UI-7: guided voter journey, vote confirmation and receipt`.

### Task 8: Admin pages: phase timeline, candidate form, voters (UI-8)

**Files:**
- Modify: `src/js/app.js`, `src/adminChangePhase.html`, `src/adminAddCandidate.html`, `src/adminCandidateDetails.html`, `src/views/adminVoterReg.ejs`
- Test: `test/api/ui-pages.test.js` (admin-page checks), `test/api/int03-table-view.test.js` stays unchanged and green

**Interfaces:**
- Consumes: `Templates.PhaseFlow` (Task 4), `CandidateForm.validate` (Task 3), `Pending.run`, `App.status`, `App.alert` (Task 6).
- Produces (DOM contracts):
  - `/changePhase`: `<ol id="phase-timeline">` with three items `Registration`, `Voting`, `Closed` (current has `aria-current="step"`); `<button type="button" id="next-phase">` (text from `PhaseFlow.next`, hidden when `null`); `<p id="next-phase-explain">`; `<dialog id="confirm-phase">` with `<input id="confirm-word" aria-describedby="confirm-word-hint">`, `#confirm-phase-ok` (disabled until `PhaseFlow.confirmed`), `#confirm-phase-cancel`.
  - `/addCandidate`: each field followed by `<p class="field-error" id="<field>-error" hidden>`; inputs get `aria-invalid` and `aria-describedby` when invalid; form wrapper `#candidate-form-locked` message `Candidates can only be added during Registration.` shown when phase ≠ 0; success text `Candidate added.` with a link to `/candidateDetails`.
  - `/candidateDetails`: `#candidates-empty` with `No candidates yet.` and a link to `/addCandidate`.
  - `/table_view`: on-chain cell `<td class="on-chain"><span class="badge badge-yes|badge-mismatch|badge-unknown">…same text…</span></td>`; recovery form inside `<details id="recovery-tools"><summary>Recovery tools</summary>…</details>`.

- [ ] **Step 1: Write the failing tests** (static, `describe('UI-8 admin pages')`): each id and copy string above; `#confirm-phase-ok` starts `disabled`; `adminVoterReg.ejs` contains `<details id="recovery-tools">` and `badge-mismatch`.
- [ ] **Step 2:** Run `npx mocha --grep "UI-8"`. Expected: FAIL.
- [ ] **Step 3:** Implement markup and `app.js` wiring (`changeState` now runs from `#confirm-phase-ok` inside `Pending.run('phase', …)` and re-renders the timeline and badge without a reload; `addCandidate` validates first, focuses the first invalid field, and does nothing else when invalid). In `int03-table-view.test.js` the regexes match `<td class="on-chain">\s*Yes\s*</td>`; if the badge wrapper breaks them, record a ruling and change those three regexes to look inside the badge, keeping the exact texts.
- [ ] **Step 4:** Run `npm run test:api`. Expected: all pass. With Ganache and MetaMask as admin: add a candidate with a 17-year-old age (inline error, no MetaMask prompt), add 2 valid candidates, open voting with the typed `OPEN`, close voting with `CLOSE`, and check the badge and timeline update without a reload.
- [ ] **Step 5:** Commit `UI-8: admin phase timeline, candidate checks, voter table badges`.

### Task 9: Verification pass and changelog (UI-9)

**Files:**
- Modify: `CHANGELOG.md`, `README.md` (short "Using the app" section: voter steps, admin steps, where MetaMask messages appear)
- Create: `docs/ui-screenshots/` (PNG per page at 1280px and 375px)

- [ ] **Step 1:** Run `npm run test:api`, `npm run test:contracts`, `npm run test:integration`. Expected: all pass.
- [ ] **Step 2:** Keyboard-only pass: Tab from the skip link through `/form`, `/voting` (dialog open, Escape, focus return) and `/changePhase` (dialog, typed word). Every focusable element shows the focus ring; nothing is unreachable.
- [ ] **Step 3:** Screenshots of all 16 pages at 1280×800 and 375×812 into `docs/ui-screenshots/<page>-desktop.png` and `-phone.png`, with a 64-character name and 100-character qualification candidate present (Review Focus 4); no horizontal scroll at 375px.
- [ ] **Step 4:** Spot-check contrast of the brand button (`#b93a3a` on white text) and muted text (`#57606a` on `#ffffff`) and `--warning` text on its background, all ≥ 4.5:1.
- [ ] **Step 5:** Add a `## UI refresh (2026-11-05)` entry to `CHANGELOG.md` listing UI-1 to UI-9, and the README section. Commit `UI-9: verification, screenshots and changelog`.
