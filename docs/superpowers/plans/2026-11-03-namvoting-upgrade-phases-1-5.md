# NamVoting Upgrade (SEC-7 → TEST-5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the in-place upgrade of `ecl-v1.0.1`: the remaining Phase 1 security fixes, contract v2, server-driven on-chain registration, the Semaphore-on-Ganache spike, and the attack and evaluation suites.

**Architecture:** The existing Express app (`server.js` `createApp(options)`, mounted by lite-server through `bs-config.js`) gains middleware for errors, CSRF, rate limits and headers. A new `lib/chain.js` wraps the deployed `NamVoting` contract for the server and is injected through `createApp({ chain })`, so API tests use a fake and only integration tests need Ganache. `NamVoting.sol` is upgraded in place, keeping the function names `app.js` already calls.

**Tech Stack:** Node 18, Express 4, EJS, jQuery, web3 4 (server) and the bundled `web3.min.js` (browser), truffle-contract, Truffle 5.11, Ganache UI 2.7.1 (`127.0.0.1:7545`, network ID 5777, chain ID 1337), MySQL/MariaDB (XAMPP), mocha, chai, supertest.

**Spec:** `REQUIREMENTS.md` plus `docs/decisions.md`. **D-001 overrides the spec:** there is no Redis. Sessions and OTPs stay in MySQL; rate-limit counters are in memory.

## Global Constraints

- Upgrade in place: no new framework, no TypeScript, no React, same folder layout, and every existing page URL keeps working (REQUIREMENTS §0).
- Dependencies may only be added from this list: `helmet`, `express-rate-limit`, `@openzeppelin/contracts@5.0.2`, `solidity-coverage` (dev). Anything else needs a new entry in `docs/decisions.md` first.
- No Redis: no `redis`, `connect-redis` or `rate-limit-redis`, and no `REDIS_URL` (D-001). SEC-13 is not applicable.
- Solidity `0.8.24`, `evmVersion: "paris"`, because Ganache 2.7.1 has no `PUSH0`.
- Keep the misspelled contract function name `voterRegisteration`.
- Never commit `.env`. Never log passwords, OTP codes, `SESSION_SECRET`, `OTP_PEPPER` or private keys.
- Each requirement ID gets its own commit, with a message like `SEC-7: central error handler`. After each phase, append the finished IDs to `CHANGELOG.md`.
- API tests run with `npm run test:api` (mocha, `test/api/**/*.test.js`, test DB `blockchainvoting_test`, rebuilt by `test/api/hooks.js`). Contract tests run with `npm run test:contracts` (Truffle, `test/contracts/`, needs Ganache UI running).
- **Before starting a task,** if its test file already exists and passes, mark the task done and move on: work on SEC-8 was in progress on 2026-11-03.

## Review Focus

1. **Ganache restarted with a fresh chain, or the contract not deployed:** registration and admin pages must say "The blockchain is not available. Ask an administrator to run `npm run migrate`." and must not crash the server or change the DB. Tested in Task 9.
2. **On-chain registration succeeds but the DB write fails, or the reverse:** the mismatch must be visible to admins and must not be silently lost. Tested in Tasks 10 and 11.
3. **The OTP email cannot be sent (SMTP down or wrong password):** the voter must see "We couldn't send your code. Please try again in a few minutes.", not a code-entry page for a code that never arrives. Tested in Task 1.
4. **MetaMask on the wrong network or account, or the voter rejects the signature:** the page shows a plain message instead of failing silently in the console. Covered by the manual checklist in Task 8.
5. **The admin closes voting while a voter has the ballot open:** the vote reverts with `WrongPhase`, and the page says "Voting is closed." Tested in Tasks 7 and 8.

---

## Phase 1: Remaining security fixes

### Task 1: SEC-7 central error handling (and Review Focus 3)

**Files:**
- Create: `middleware/errors.js`
- Modify: `server.js`, `routes/table_view.js`, `database.js`, `routes/main.js`
- Create: `src/views/error.ejs`
- Test: `test/api/sec07-errors.test.js`

**Interfaces:**
- Produces: `errors.handler(err, req, res, next)` is the last middleware in `createApp`. `errors.redact(text: string): string` masks the values of `password`, `otp`, `_csrf`, `SESSION_SECRET`, `OTP_PEPPER` and anything matching `/0x[0-9a-fA-F]{64}/`, replacing them with `[redacted]`.

- [ ] **Step 1: Write the failing tests** in `test/api/sec07-errors.test.js`:
  - `'returns a friendly 500 page when a route throws, and keeps serving'`: replace `require('../../lib/users').verifyLogin` with `() => Promise.reject(new Error('db down password=hunter2'))`, POST `/login` through `h.submitForm`, then expect `res.status === 500`, `res.text` to contain `'Something went wrong'` and not `'hunter2'` or `'Error:'`. Restore the function, then GET `/login` and expect 200.
  - `'logs errors without secrets'`: stub `console.error` to capture output, trigger the same error, and assert the output contains `'[redacted]'` and not `'hunter2'`.
  - `'table_view DB error does not crash the process'`: stub `require('../../database').query` to call back `new Error('boom')`, GET `/table_view` as an admin (`h.createUser({ role: 'admin' })` then `h.adminLogin`), and expect 500.
  - `'tells the voter when the OTP email cannot be sent'`: replace `require('../../lib/mailer').sendMail` with `() => Promise.reject(new Error('smtp'))`, call `h.startRegistration()`, and expect `res.text` to contain `"We couldn't send your code"` and not the code-entry form's `action="/otpverify"`.
- [ ] **Step 2:** Run `npm run test:api -- --grep SEC-7`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add `errors.handler`, which logs `errors.redact(err.stack)` and renders `error.ejs` with status `err.status || 500`. Register it last in `createApp`.
  - In `table_view.js`, replace `throw err` with `return next(err)`.
  - In `database.js`, log the connection error (redacted) instead of throwing on connect.
  - In `/registerdata`, `await` `mailer.sendMail(...)`. If it rejects, retire the code by calling `otp.issue` again and discarding the result, `delete req.session.pendingRegistration`, and render `voter-registration.ejs` with the alert `"We couldn't send your code. Please try again in a few minutes."`
- [ ] **Step 4:** Run `npm run test:api`. Expected: all PASS.
- [ ] **Step 5:** Commit `SEC-7: central error handler, no crashes, OTP send failure handled`.

### Task 2: SEC-8 XSS: finish escaping and remove inline handlers

**Files:**
- Modify: `src/js/app.js`, `src/js/templates.js` (already exists), every `src/*.html` and `src/views/*.ejs` with an inline `onsubmit` or `onclick`
- Test: `test/api/sec08-xss.test.js`

**Interfaces:**
- Produces: `Templates.escapeHtml(s: any): string` and `Templates.candidateCard(c)`, already referenced by `app.js`. `templates.js` must also `module.exports = Templates` when `typeof module !== 'undefined'`, so Node can test it. Event binding uses `data-action` attributes: `<form data-action="addCandidate">`, `castVote`, `registerVoter`, `changeState`. `app.js` binds `$(document).on('submit', 'form[data-action]', …)` and calls `preventDefault()`.

- [ ] **Step 1: Write the failing tests:**
  - `'escapeHtml escapes & < > " \''`: `expect(Templates.escapeHtml('<img src=x onerror="a">&\'')).to.equal('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;')`.
  - `'candidateCard renders a malicious name as text'`: the output contains `&lt;script&gt;` and no `<script>`.
  - `'no inline event handlers in pages'`: read every file in `src/*.html` and `src/views/*.ejs` and expect no match for `/\son(submit|click)\s*=/i`, except the `onclick="show()"` password toggle in `admin_login.ejs`, which this task also converts to a listener.
  - `'EJS views use escaped output for data'`: no `<%-` in `src/views/*.ejs`.
  - `'app.js never concatenates contract fields into HTML'`: `app.js` contains no `.html(` or `.append(` call whose argument is a string built with `+`. Assert with the regex `/\.(html|append)\(\s*["'][^)]*\+/`.
- [ ] **Step 2:** Run `npm run test:api -- --grep SEC-8`. Expected: FAIL on the remaining inline handlers.
- [ ] **Step 3:** Replace each `onsubmit="App.x(); return false;"` with `data-action="x"`, and replace the `onclick="App.changeState()"` buttons with `<button type="submit">` inside a `data-action="changeState"` form. Add the delegated listener to `app.js`, and move the `show()` toggle into a small listener in `src/js/login-page.js`.
- [ ] **Step 4:** Run `npm run test:api`. Expected: PASS. Manually, add a candidate named `<b>x</b>` on Ganache and check it shows literally on `/result`.
- [ ] **Step 5:** Commit `SEC-8: escape contract data, remove inline handlers`.

### Task 3: SEC-9 CSRF tokens

**Files:**
- Create: `middleware/csrf.js`
- Modify: `server.js`, and the forms in `admin_login.ejs`, `login-form.ejs`, `registration-form.ejs`, `voter-registration.ejs` and `emailverify.ejs`
- Test: `test/api/sec09-csrf.test.js`

**Interfaces:**
- Produces:
  - `csrf.middleware`: for every request, ensures `req.session.csrfToken` exists (32 random bytes, hex) and sets `res.locals.csrfToken`. For POST, PUT, PATCH and DELETE, it compares `req.body._csrf` with the session token using `crypto.timingSafeEqual` and calls `next(Object.assign(new Error('Invalid form token'), { status: 403 }))` on a mismatch.
  - Every form contains `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`; the existing `helpers.csrfFrom` reads this.
  - `lib/session.startSession` must carry the token over into the regenerated session.
- Note: `saveUninitialized: false` means a session now starts on the first GET of a form. That is expected.

- [ ] **Step 1: Write the failing tests:**
  - `'rejects each POST route without a token'`: for each of `/register`, `/login`, `/adlogin`, `/registerdata` and `/otpverify`, POST without `_csrf` and expect 403.
  - `'rejects a token from another session'`: take a token from agent A and use it on agent B; expect 403.
  - `'accepts the token from the page'`: existing tests using `h.submitForm` keep passing.
  - `'login still works after session regeneration'`: log in, then submit `/registerdata` with the token from `/form`; the request is not a 403.
- [ ] **Step 2:** Run the tests. Expected: FAIL (POST without a token currently succeeds).
- [ ] **Step 3:** Implement the middleware, register it after `sessions.middleware()`, and add the hidden input to the five forms.
- [ ] **Step 4:** Run `npm run test:api`. Expected: all PASS.
- [ ] **Step 5:** Commit `SEC-9: CSRF tokens on all forms`.

### Task 4: SEC-10 rate limits and account lockout (in memory, D-001)

**Files:**
- Create: `middleware/limits.js`
- Modify: `server.js` (`createApp(options)` reads `options.rateLimitMax`), `package.json` (add `express-rate-limit`)
- Test: `test/api/sec10-limits.test.js`

**Interfaces:**
- Produces: `limits.create({ max }: { max?: number })` returns `{ perIp, loginLockout }`.
  - `perIp`: `express-rate-limit` with `windowMs: 60_000`, `max = options.max ?? Number(process.env.RATE_LIMIT_MAX) || 5`, status 429, message `'Too many attempts. Please wait a minute and try again.'`. It applies to POST `/login`, `/adlogin`, `/register`, `/registerdata` and `/otpverify`.
  - `loginLockout`: `windowMs: 15 * 60_000`, `max: 10`, `skipSuccessfulRequests: true`, keyed on the lower-cased `req.body.email_address`. It applies to POST `/login` and `/adlogin`. A login counts as successful when the response is a 302 redirect.
  - Each `createApp` call builds new limiters, so tests are isolated.

- [ ] **Step 1: Write the failing tests:**
  - `'6th POST /login in a minute from one IP gets 429'`: use `h.agent({ rateLimitMax: 5 })` and send 6 wrong logins; the statuses are `[200,200,200,200,200,429]`.
  - `'locks an account after 10 failed logins even from fresh agents'`: use `rateLimitMax: 1000`, 10 wrong passwords for one email, then the correct password; the 11th response is 429 and no session is created.
  - `'a successful login does not count toward lockout'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and wire the limiters in `createApp`, before the routers.
- [ ] **Step 4:** Run `npm run test:api`. Expected: PASS. (`hooks.js` already sets `RATE_LIMIT_MAX=1000` for the other tests.)
- [ ] **Step 5:** Commit `SEC-10: rate limits and account lockout (in-memory, D-001)`.

### Task 5: SEC-11 security headers and self-hosted scripts

**Files:**
- Modify: `server.js`, all `src/*.html` and `src/views/*.ejs` that load remote scripts, and `package.json` (add `helmet`)
- Create: `src/js/vendor/` only if a needed file is missing locally
- Test: `test/api/sec11-headers.test.js`

**Decisions:**
- Replace `https://ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js` with the local `assets/js/core/jquery.min.js` and confirm the pages still work. If that copy is jQuery 3 and something breaks, download jQuery 1.12.4 into `src/js/vendor/jquery-1.12.4.min.js` instead.
- Delete the `core-js` CDN, `html5shiv`, `respond` and `kit.fontawesome.com` script tags: they are only for old browsers or duplicate icon fonts.
- Stylesheets and fonts may stay remote. The CSP:
  - `default-src 'self'`
  - `script-src 'self'`
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://maxcdn.bootstrapcdn.com https://use.fontawesome.com`
  - `font-src 'self' https://fonts.gstatic.com https://maxcdn.bootstrapcdn.com https://use.fontawesome.com`
  - `img-src 'self' data:`
  - `connect-src 'self' http://127.0.0.1:7545 http://localhost:7545`
  - `object-src 'none'`, `frame-ancestors 'none'`
- Move any remaining inline `<script>…</script>` blocks into files under `src/js/pages/<page>.js`.

- [ ] **Step 1: Write the failing tests:**
  - `'sends CSP and helmet headers'`: GET `/login` has a `content-security-policy` header containing `script-src 'self'` but not `unsafe-inline` inside `script-src`, plus `x-content-type-options: nosniff`.
  - `'pages load no remote scripts'`: no `src="http` in `src/*.html` or `src/views/*.ejs`.
  - `'pages have no inline script blocks'`: no `<script>` tag without `src` in those files.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Then open every page in Chrome with MetaMask and Ganache running and check the console shows no CSP violations.
- [ ] **Step 4:** Run `npm run test:api`. Expected: PASS.
- [ ] **Step 5:** Commit `SEC-11: helmet, CSP, self-hosted scripts`.

### Task 6: SEC-12 least-privilege DB user

**Files:**
- Create: `scripts/create-db-user.js`, `db/migrations/006_audit_log.sql`, `lib/audit.js`
- Modify: `package.json` (script `db:create-user`), `README.md` §3, `.env.example` (`DB_ADMIN_USER`, `DB_ADMIN_PASS`, `DB_USER=namvoting_app`)
- Test: `test/api/sec12-dbuser.test.js`

**Interfaces:**
- Produces:
  - `npm run db:create-user` connects as `DB_ADMIN_USER` and creates `namvoting_app@localhost` with `DB_PASS`. It grants SELECT, INSERT and UPDATE on `blockchainvoting.*` and DELETE on `blockchainvoting.sessions` only. It can be run again safely.
  - `audit.record(actorRegId: number|null, action: string, detail?: string): Promise<void>` inserts into `audit_log` and never throws: on a DB error it only logs.
  - Actions used by later tasks: `'admin_login'`, `'voter_registered'`, `'chain_register_failed'`, `'chain_db_mismatch'`.
- `006_audit_log.sql` is exactly the `audit_log` table from REQUIREMENTS §5.

- [ ] **Step 1: Write the failing tests:**
  - `'app user cannot DELETE registration'` (skipped unless `DB_ADMIN_USER` is set and differs from `DB_USER`): `h.query('DELETE FROM registration WHERE 1=0')` rejects with code `ER_TABLEACCESS_DENIED_ERROR`.
  - `'app user cannot DROP'`: same pattern, with `DROP TABLE otp_codes`.
  - `'audit.record writes a row'`.
  - `'admin login is audited'`: after `h.adminLogin`, a row with `action = 'admin_login'` exists.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Call `audit.record(user.reg_id, 'admin_login')` in `routes/admin_login.js` on success.
- [ ] **Step 4:** Run `npm run db:create-user`, set `DB_USER=namvoting_app` in `.env`, then run `npm run test:api`. Expected: all PASS.
- [ ] **Step 5:** Commit `SEC-12: least-privilege DB user, audit log`. Update `CHANGELOG.md` with Phase 1 done: SEC-1 to SEC-12, with SEC-13 not applicable (D-001).

---

## Phase 2: Contract v2

### Task 7: `NamVoting` v2 contract (SC-1 to SC-8)

**Files:**
- Modify: `contracts/NamVoting.sol`, `truffle-config.js` (solc `0.8.24`, `settings: { evmVersion: "paris", optimizer: { enabled: true, runs: 200 } }`, plugin `solidity-coverage`), `migrations/2_namVoting.js`, `package.json` (add `@openzeppelin/contracts@5.0.2`, dev `solidity-coverage`, script `coverage: "truffle run coverage"`), `.env.example` (`REGISTRAR_ADDRESS`, `RELAYER_ADDRESS`)
- Test: `test/contracts/NamVoting.js` (rewrite), plus `test/contracts/helpers.js`

**Interfaces (exact; used by `app.js` and `lib/chain.js`):**
```solidity
enum PHASE { reg, voting, done }
bytes32 public constant ADMIN_ROLE, REGISTRAR_ROLE, RELAYER_ROLE;   // keccak256("ADMIN_ROLE") etc.
PHASE public state;
uint public contestantsCount;
function contestants(uint id) external view returns (uint id_, string name, uint voteCount, string party, uint age, string qualification); // voteCount 0 unless done
function voters(address) external view returns (bool isRegistered, bool hasVoted);
function addContestant(string calldata name, string calldata party, uint age, string calldata qualification) external;   // ADMIN, reg
function voterRegisteration(address user) external;                    // REGISTRAR or ADMIN, reg
function voterRegisterationBatch(address[] calldata users) external;    // REGISTRAR or ADMIN, reg
function changeState(PHASE x) external;                                 // ADMIN; x must equal state + 1
function vote(uint contestantId) external;                              // voting
function results() external view returns (uint[] memory);              // index 0 = contestant 1; reverts unless done
error WrongPhase(PHASE expected, PHASE actual);
error NotRegistered(); error AlreadyVoted(); error InvalidContestant(uint id); error InvalidPhaseChange(PHASE from, PHASE to);
error AlreadyRegistered(address voter);
event ContestantAdded(uint indexed id, string name);
event VoterRegistered(address indexed voter);
event PhaseChanged(PHASE phase);
event VoteCast(uint indexed contestantId);   // no voter address
```
- The constructor grants `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE` to the deployer. The migration grants `REGISTRAR_ROLE` to `process.env.REGISTRAR_ADDRESS || accounts[1]` and `RELAYER_ROLE` to `process.env.RELAYER_ADDRESS || accounts[2]`.
- **No storage maps an address to a choice** (SC-3). Votes are stored as a private `mapping(uint => uint) _votes`.
- `test/contracts/helpers.js` exports `expectRevert(promise, errorSignature)`. It awaits the promise, expects it to throw, and asserts `JSON.stringify(err)` contains `web3.utils.sha3(errorSignature).slice(0, 10)`, e.g. `expectRevert(p, 'WrongPhase(uint8,uint8)')`.

- [ ] **Step 1: Write the failing tests** (one `it` each):
  - deployer has `ADMIN_ROLE`; `accounts[1]` has `REGISTRAR_ROLE`;
  - a non-admin `addContestant` reverts `AccessControlUnauthorizedAccount(address,bytes32)`;
  - `addContestant` emits `ContestantAdded` and increments `contestantsCount`;
  - `addContestant` in voting reverts `WrongPhase(uint8,uint8)`;
  - the registrar can `voterRegisteration`, emitting `VoterRegistered`;
  - a voter cannot register themselves (unauthorized);
  - registering twice reverts `AlreadyRegistered(address)`;
  - a batch of 3 registers all 3;
  - `changeState(2)` from reg reverts `InvalidPhaseChange(uint8,uint8)`;
  - `changeState(0)` from voting reverts the same error;
  - a non-admin `changeState` reverts;
  - an unregistered voter's `vote` reverts `NotRegistered()`;
  - `vote` during reg reverts `WrongPhase`;
  - `vote(0)` and `vote(count+1)` revert `InvalidContestant(uint256)`;
  - a second vote reverts `AlreadyVoted()`;
  - `vote` emits `VoteCast` whose args contain no address (check `Object.values(log.args)` has no `0x…40-hex` string);
  - `contestants(1).voteCount` is 0 during voting even after votes;
  - `results()` reverts `WrongPhase` before done;
  - after done, `results()` equals the expected counts;
  - `voters(addr)` returns exactly 2 fields.
- [ ] **Step 2:** With Ganache UI running, run `npm run test:contracts`. Expected: FAIL (old contract).
- [ ] **Step 3:** Implement the contract and migration.
- [ ] **Step 4:** Run `npm run migrate && npm run test:contracts`, then `npm run coverage`. Expected: PASS, with `NamVoting.sol` line coverage at least 95%.
- [ ] **Step 5:** Commit `SC-1..SC-8: NamVoting v2 (roles, events, custom errors, hidden tallies)`.

### Task 8: Frontend on contract v2 (and Review Focus 4 and 5)

**Files:**
- Modify: `src/js/app.js`
- Create: `src/js/errors.js` (browser and Node, same pattern as `templates.js`)
- Test: `test/api/fe-errors.test.js`, plus the manual checklist below

**Interfaces:**
- Produces: `ChainErrors.message(err): string`, which maps a revert to text:
  - `WrongPhase`: "Voting is closed." during voting actions; otherwise "That action is not allowed in the current phase."
  - `NotRegistered`: "Your wallet is not registered to vote."
  - `AlreadyVoted`: "You have already voted."
  - `InvalidContestant`: "That candidate does not exist."
  - `AccessControlUnauthorizedAccount`: "This MetaMask account is not allowed to do that."
  - MetaMask code `4001`: "You cancelled the request in MetaMask."
  - otherwise: "Something went wrong talking to the blockchain."
- `app.js` changes:
  - Use `eth_requestAccounts` only (remove `ethereum.enable()`), and set `App.account = accounts[0]`.
  - Check `eth_chainId === '0x539'` (1337); otherwise show "Please switch MetaMask to the Ganache network (chain ID 1337)."
  - Send `{ from: App.account }` on every transaction (fixes D16).
  - `changeState` reads `state()` from the chain and sends `state + 1` (no global counter).
  - Show `ChainErrors.message(err)` in a `#chainError` element added to each page.
  - Listen for `accountsChanged` and `chainChanged`, and reload the page on either.

- [ ] **Step 1: Write the failing tests:** for each mapping, build an error whose `JSON.stringify` contains the selector (or `{ code: 4001 }`) and assert the exact text above.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `errors.js` and the `app.js` changes.
- [ ] **Step 4:** Run `npm run test:api`. Expected: PASS. Then work through the manual checklist with Ganache UI, `npm run migrate` and `npm run dev`, and tick every line in the commit message:
  1. The admin adds 2 candidates.
  2. A voter registers through `/form`, and their wallet shows registered on-chain after Task 10.
  3. The admin moves the phase to Voting.
  4. The voter votes, and a second vote shows "You have already voted."
  5. The admin moves the phase to Done, and results show the correct counts.
  6. MetaMask on another network shows the switch message.
  7. Rejecting a signature shows the cancel message.
  8. Moving to Done while the ballot is open, then clicking VOTE, shows "Voting is closed."
- [ ] **Step 5:** Commit `FE: app.js on contract v2, readable chain errors`. Update `CHANGELOG.md`: Phase 2 done.

---

## Phase 3: Integration

### Task 9: Server-side contract access (INT-2, Review Focus 1)

**Files:**
- Create: `config/contract.js`, `lib/chain.js`, `test/api/fakes.js`
- Modify: `server.js` (`createApp(options)` takes `options.chain`, defaulting to `require('./lib/chain').create()` created on first use)
- Test: `test/api/int02-chain-config.test.js`, `test/integration/chain.test.js`, plus `package.json` script `test:integration: "mocha test/integration --timeout 60000"` (skips itself when `GANACHE_RPC` is unreachable)

**Interfaces:**
- `config/contract.js`:
  - `loadArtifact(): object` reads `build/contracts/NamVoting.json`.
  - `addressFor(artifact, networkId: string): string` throws `ChainUnavailableError` (exported, `status = 503`) with the message `"The blockchain is not available. Ask an administrator to run npm run migrate."` when the artifact is missing or has no entry for `networkId`.
- `lib/chain.js` `create({ rpcUrl = process.env.GANACHE_RPC, registrarKey = process.env.REGISTRAR_PRIVATE_KEY })` returns an object whose methods all reject with `ChainUnavailableError` when the RPC is unreachable or the contract isn't deployed:
  - `registerVoter(address: string): Promise<{ txHash: string }>`: if the chain throws `AlreadyRegistered`, resolve `{ txHash: null, alreadyRegistered: true }` instead.
  - `isRegistered(address: string): Promise<boolean>`
  - `audit(): Promise<{ contractAddress: string, phase: 0|1|2, events: Array<{ event: string, blockNumber: number, args: object }>, results: number[]|null, contestants: Array<{ id: number, name: string }> }>`
- `test/api/fakes.js` exports `fakeChain(overrides)`, an in-memory implementation of the same methods. It records `calls.registerVoter`, and `unavailable: true` makes every method reject with `ChainUnavailableError`.
- `helpers.agent(options)` passes `options.chain`. `test/api/hooks.js` sets `process.env.CHAIN = 'fake'`, so that `createApp` defaults to `fakeChain()` in API tests.

- [ ] **Step 1: Write the failing tests:**
  - `addressFor` with a missing network throws `ChainUnavailableError` with the exact message.
  - Integration: against Ganache, `registerVoter(fresh)` then `isRegistered(fresh)` is true; registering the same address again returns `alreadyRegistered: true`; `audit().events` includes `VoterRegistered`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with web3 4: `new Web3(rpcUrl)`, `web3.eth.accounts.privateKeyToAccount`, `wallet.add`, `contract.methods.voterRegisteration(addr).send({ from, gas: 200000 })`, and `getPastEvents('allEvents', { fromBlock: 0 })`.
- [ ] **Step 4:** Run `npm run test:api && npm run test:integration`. Expected: PASS.
- [ ] **Step 5:** Commit `INT-2: server-side contract access`.

### Task 10: Automatic on-chain registration (INT-1, Review Focus 1 and 2)

**Files:**
- Modify: `routes/main.js` (`/otpverify`), `src/views/adminVoterReg.ejs` (relabel the manual form "Recovery: register an address on-chain")
- Test: `test/api/int01-registration.test.js`

**Behaviour:** after `otp.verify` returns `'ok'`:
1. Call `chain.registerVoter(pending.accountAddress)`.
2. If it throws `ChainUnavailableError` or any other error:
   - leave the DB unchanged;
   - call `audit.record(regId, 'chain_register_failed', message)`;
   - render `voter-registration.ejs` with the alert `"We couldn't register your wallet on the blockchain. Nothing was saved. Please try again later."`
3. Otherwise run `completeRegistration`. If that fails, call `audit.record(regId, 'chain_db_mismatch', address)`, then pass the error to `next(err)`.
4. On success, call `audit.record(regId, 'voter_registered')`.

- [ ] **Step 1: Write the failing tests:**
  - `'registers the wallet on-chain then in the DB'`: `fake.calls.registerVoter` equals `[wallet]`, and the DB `Is_registered` is `'YES'`.
  - `'chain unavailable leaves DB untouched'`: with `fakeChain({ unavailable: true })`, the alert text is shown, `Is_registered` stays `'No'`, `registered_users` has no row, and an audit row `chain_register_failed` exists.
  - `'DB failure after chain success is audited as chain_db_mismatch'`: stub `conn.getConnection` to error; the response is 500 and the audit row exists.
  - `'already registered on-chain is treated as success'`: with `fakeChain({ registerVoter: async () => ({ txHash: null, alreadyRegistered: true }) })`, the DB is updated.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:api`. Expected: PASS.
- [ ] **Step 5:** Commit `INT-1: server registers voters on-chain after OTP`.

### Task 11: Admin view of DB versus chain (INT-3, Review Focus 2)

**Files:**
- Modify: `routes/table_view.js`, `src/views/adminVoterReg.ejs`
- Test: `test/api/int03-table-view.test.js`

**Behaviour:** For each `registered_users` row, `await chain.isRegistered(addr)` (in parallel, at most 10 at a time) and render a column "On blockchain" showing `Yes`, `No ⚠ mismatch` or `Unknown (blockchain unavailable)`. Rows from `audit_log` with action `chain_db_mismatch` are listed above the table.

- [ ] **Step 1: Write the failing tests:**
  - a row registered on both shows `Yes`;
  - a DB-only row shows `mismatch`;
  - with the chain unavailable the page still renders (200) and shows `Unknown`;
  - a voter session gets 403.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:api`. Expected: PASS.
- [ ] **Step 5:** Commit `INT-3: on-chain status in voter table`.

### Task 12: Public audit page (INT-4)

**Files:**
- Create: `routes/audit.js`, `src/views/audit.ejs`
- Modify: `server.js` (mount the router; the route is public)
- Test: `test/api/int04-audit.test.js`

**Behaviour:** GET `/audit` renders:
- the contract address, phase and event list (newest first, at most 500);
- a re-count, i.e. the number of `VoteCast` events per contestant;
- when the phase is done, the `results()` totals and a line saying either `"Re-count matches the contract totals."` or `"WARNING: re-count does not match the contract totals."`;
- during voting, the line `"Totals are hidden until voting ends."`
It shows no voter names, emails or ID numbers.

- [ ] **Step 1: Write the failing tests:**
  - with a fake chain whose events count `{1:2, 2:1}` and results `[2,1]`, the page shows "matches";
  - with results `[2,2]`, it shows "WARNING";
  - during voting it shows "hidden";
  - with the chain unavailable it returns 503 with the `ChainUnavailableError` message;
  - the page text contains no `@` email from the DB.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:api`. Expected: PASS.
- [ ] **Step 5:** Commit `INT-4: public audit page`. Update `CHANGELOG.md`: Phase 3 done.

---

## Phase 4: Anonymity spike only

### Task 13: ANON-0 Semaphore on Ganache spike (throwaway)

**Files:** a throwaway branch `spike/anon-0`; only `docs/anon-spike.md` is merged to the main branch.

- [ ] **Step 1:** `git switch -c spike/anon-0`. Add the Semaphore contracts (latest stable `@semaphore-protocol/contracts`) and compile them with Truffle, solc 0.8.24 and `paris`. Record the exact package versions.
- [ ] **Step 2:** Set the Ganache workspace gas limit to 30,000,000. Deploy the Poseidon library, the verifier and Semaphore with a Truffle migration, and record the gas used for each.
- [ ] **Step 3:** In a Node script, create an identity, a group of 3 and a proof (`scope = 1`, `message = 2`). Call `validateProof` on Ganache and record the proof-generation time and the gas used.
- [ ] **Step 4:** Write `docs/anon-spike.md` with sections **Result** (works or fails), **Versions**, **Gas**, **Timings**, **Problems hit** and **Recommendation** (ANON-1 to ANON-5, or the ANON-6 fallback). Then `git switch main` and commit only that file: `ANON-0: spike result`.
- [ ] **Step 5: STOP.** Report the result to the human. ANON-1 to ANON-6 get their own plan, written after this result.

---

## Phase 5: Attack suite and evaluation

### Task 14: Threat-model attack tests (TEST-3)

**Files:**
- Create: `test/api/attacks/surface1-ui.test.js`, `surface4-database.test.js`, `surface5-otp.test.js`, and `test/contracts/attacks.js` (covering surfaces 2 and 3)

Each file starts with a comment naming its row in REQUIREMENTS §7 and lists every test from that row. Where an earlier task's test already proves a line, add a one-line `it` that calls the same helper and names the attack, so the attack suite reads complete on its own. Lines not covered elsewhere:
- **Surface 1:** a candidate name `<script>alert(1)</script>` comes back from `/audit` escaped.
- **Surface 2:** a contestant ID sent as `2**256-1` reverts `InvalidContestant`; the phase cannot go backwards after done.
- **Surface 3:** replaying a captured `vote` raw transaction from the same account reverts with `AlreadyVoted` (the nonce is used, or the vote is already cast); Ganache's RPC is not reachable on the machine's LAN IP (manual note in the file header).
- **Surface 4:** each of `' OR '1'='1`, `admin@gmail.com' -- ` and `1; DROP TABLE registration` in `/login`, `/register` and `/registerdata` fields leaves the `registration` row count unchanged and logs nobody in; a voter session gets 403 on `/table_view`, `/addCandidate` and `/changePhase`.
- **Surface 5:** two agents registering at the same time each get their own code and neither code works for the other (D7).

- [ ] **Step 1:** Write the tests.
- [ ] **Step 2:** Run `npm run test:api && npm run test:contracts`. Expected: PASS. A failure is a real bug: fix it in its own commit before continuing.
- [ ] **Step 3:** Commit `TEST-3: attack suite for the five surfaces`.

### Task 15: Static analysis (TEST-4)

- [ ] **Step 1:** Install Python 3 if missing (`winget install Python.Python.3.12`), then `pip install slither-analyzer`.
- [ ] **Step 2:** Run `slither . --truffle-ignore-compile --exclude-dependencies --json slither.json` after `truffle compile`, and render the findings into `docs/slither-report.md` as a table (detector, impact, location, status).
- [ ] **Step 3:** Fix every High and Medium finding. Each fix is a commit with a test in `test/contracts/NamVoting.js`, or a written "accepted risk" note in the report explaining why.
- [ ] **Step 4:** If Slither cannot be installed on the PC, record decision D-00x in `docs/decisions.md` and run `npx solhint contracts/*.sol` instead. Ask the human before adding `solhint`.
- [ ] **Step 5:** Commit `TEST-4: Slither report`.

### Task 16: Evaluation script (TEST-5, REQUIREMENTS §8)

**Files:**
- Create: `scripts/eval.js`
- Modify: `package.json` (`eval: "truffle exec scripts/eval.js"`)
- Output: `docs/evaluation-results.md`

**Behaviour** (against a freshly migrated Ganache UI):
1. Deploy a new `NamVoting` instance (not the app's).
2. Create 50 accounts with `web3.eth.accounts.create()` and fund each with 1 ETH from `accounts[0]`.
3. Add 3 contestants, batch-register all 50 accounts, then change the phase to voting.
4. Each voter votes for contestant `(i % 3) + 1`.
5. Change the phase to done.

Measure:
- **Integrity:** the re-count of `VoteCast` events equals `results()` equals `[17,17,16]`, and the total is 50.
- **Invalid conditions:** an unregistered vote, a vote in the wrong phase, an invalid contestant and a double vote each revert with the expected error (pass or fail per item).
- **Performance:** gas used per function (mean and max), and transaction submit-to-receipt time (mean and p95).
- **Anonymity (baseline):** for each `vote` transaction, check whether `tx.from` plus the decoded input identifies the choice. The expected result now is "linkable: 50/50". Report it as the pre-ANON baseline.

Write the markdown tables with a header saying "Local Ganache 2.7.1 results; not representative of a public network (Chapter 3 §3.7.4)".

- [ ] **Step 1:** Write the failing check: `test/contracts/eval.js` runs `scripts/eval.js` in a `--quick` mode (5 voters) and asserts the integrity section reports `PASS`.
- [ ] **Step 2:** Run `npm run test:contracts`. Expected: FAIL (no script yet).
- [ ] **Step 3:** Implement `scripts/eval.js`.
- [ ] **Step 4:** Run `npm run test:contracts && npm run eval`. Expected: PASS, and `docs/evaluation-results.md` is written with every section filled.
- [ ] **Step 5:** Commit `TEST-5: evaluation script and baseline results`. Update `CHANGELOG.md`: Phase 5 (pre-ANON) done.
