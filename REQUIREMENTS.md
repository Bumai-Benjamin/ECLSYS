# NamVoting Upgrade: Requirements (in-place upgrade of `ecl-v1.0.1`)

> **Audience:** Claude Code (or any developer) working **inside the existing `ecl-v1.0.1` project**.
> **Sources:** Dissertation Chapter 1 (research questions 1–5), Chapter 3 (methodology), and the current code.
> **Status:** Draft v2, 2026-10-31. Assumptions are marked **[ASSUMPTION]**. Confirm them with the team before acting on them.

---

## 0. Ground rules: this is an upgrade, not a rebuild

1. **Keep the existing stack:** Truffle, Ganache, Node/Express, EJS and static HTML pages, jQuery, web3.js, truffle-contract, MySQL through XAMPP/phpMyAdmin, MetaMask and Nodemailer.
2. **Keep the existing structure:** `contracts/`, `migrations/`, `routes/`, `src/` (pages, `src/js/app.js`, `src/views/*.ejs`), `bs-config.js`, `database.js` and `truffle-config.js`. Edit these files; add new files beside them only when needed (e.g. `middleware/`, `db/migrations/`).
3. **Keep URLs and page flow the same** (`/register`, `/login`, `/adlogin`, `/form`, `/userInfo`, `/voting`, `/addCandidate`, `/changePhase`, `/result`, …) so the team's demos and screenshots stay valid.
4. **Make small, reviewable changes.** Make one commit per requirement ID, and keep the app runnable after every commit.
5. **Allowed new dependencies** (only these unless asked): `dotenv`, `bcryptjs`, `helmet`, `express-rate-limit`, `rate-limit-redis`, `redis` (node-redis client), `connect-redis`, `csurf` or an equivalent CSRF middleware, `@openzeppelin/contracts`, plus test tools (`mocha`, `chai`, `supertest`) and, in Phase 4, the Semaphore packages and `esbuild`.
6. **Runtime:** Node 18 LTS (Truffle supports Node 14–18), Truffle 5.x, Ganache UI 2.7.1 on port 7545, the XAMPP MySQL/MariaDB the team already uses, and **Redis 7 on `127.0.0.1:6379`** (the persistence tier in Chapter 3, Figure 3-3).

### 0.1 Data placement (matches Chapter 3, Figure 3-3)

| Store | Holds | Why |
|---|---|---|
| **MySQL** (XAMPP) | Durable records: voters, admins, roles, registration status, audit log | Permanent, relational data that admins can inspect in phpMyAdmin |
| **Redis** | Short-lived security state: sessions, OTP codes, OTP attempt counters, rate-limit counters, pending-registration state, the relayer's nonce lock | Built-in automatic expiry, fast, nothing permanent |
| **Ganache** (blockchain) | Election rules, phase, eligible voters (or Semaphore group), votes, tally | Tamper-evident and auditable |

---

## 1. Current baseline (what exists today)

| Layer | Files | What it does |
|---|---|---|
| Contract | `contracts/NamVoting.sol` (solc 0.5.1) | Three phases (`reg → voting → done`). The admin adds contestants and registers voter addresses. `vote()` enforces registered, not-yet-voted and a valid ID. |
| Deploy | `migrations/1_*.js`, `2_namVoting.js`, `truffle-config.js` (development network on 127.0.0.1:7545) | `truffle migrate` to Ganache |
| Web server | `bs-config.js` (Express inside lite-server, port 3000) and `routes/*.js` | Sign-up, login, admin login, voter registration with email OTP, and the registered-voter table |
| Frontend | `src/*.html`, `src/views/*.ejs`, `src/js/app.js` | MetaMask connection; reading candidates and phase; voting; adding candidates; changing phase; registering a voter address |
| Database | `blockchainvoting.sql`, `database.js` | `registration` (national ID, name, email, gender, date of birth, MD5 password, wallet) and `registered_users` (wallet, flag) |
| Tests | `test/NamVoting.js` | One test (add a contestant) |

---

## 2. Research question traceability

| RQ | Question (short) | Answered by the upgrade items |
|---|---|---|
| RQ1 | Essential elements for integrating blockchain with e-voting | INT-1 to INT-4: database registration automatically drives on-chain registration; the contract is the source of truth; integration tests |
| RQ2 | Threats and attack vectors | SEC-1 to SEC-12, the §7 threat model and the `test/attacks/` suite |
| RQ3 | Effectiveness for security, privacy and transparency | §8 evaluation: integrity, anonymity and auditability checks plus metrics |
| RQ4 | Vulnerabilities and limitations | Findings from the attack tests, the Slither report and the §9 limitations |
| RQ5 | How cryptography, consensus and smart contracts help | SC-1 to SC-8 (contract v2), ANON-1 to ANON-6 (zero-knowledge proofs and nullifiers), CRY notes; consensus is analysed in writing only (§9) |

---

## 3. Defects found in the current code: each fix needs a test

| ID | Defect | File(s) | Fixed by |
|---|---|---|---|
| D1 | A Gmail address and app password are hard-coded in source | `routes/main.js` | HK-2 |
| D2 | Admin login queries the voter table with no role check, so any voter can become admin | `routes/admin_login.js` | SEC-1 |
| D3 | Admin pages (`/addCandidate`, `/changePhase`, `/candidateDetails`, `/table_view`) have no login check | `bs-config.js`, `routes/table_view.js` | SEC-2 |
| D4 | One OTP is generated when the server starts; it is shared by everyone, never expires and has no attempt limit | `routes/main.js` | SEC-4 |
| D5 | Passwords are unsalted MD5; `confirm_password` is stored too | `routes/registration-route.js`, `login-route.js`, `admin_login.js` | SEC-3 |
| D6 | The session secret `'123456cat'` is hard-coded; cookies lack `httpOnly` and `sameSite`; sessions use the in-memory store, so they are lost on restart and leak memory | `bs-config.js` | SEC-5 (Redis) |
| D7 | Module-level globals (`account_address`, `data`) mean concurrent registrations overwrite each other | `routes/main.js` | SEC-4 |
| D8 | The "already registered" check reads a misspelled column (`is_registerd`), so it never triggers | `routes/main.js` | SEC-6 |
| D9 | The duplicate-email check uses `data.length > 1`, so one duplicate gets through | `routes/registration-route.js` | SEC-6 |
| D10 | Database and on-chain registration are separate: the admin pastes addresses by hand | `src/js/app.js` (`registerVoter`) | INT-1 |
| D11 | **The contract stores `voters[addr].vote` publicly, and the vote transaction is sent from the voter's own address, so anyone can link a voter to their choice** | `NamVoting.sol`, `app.js` | SC-3, ANON-* |
| D12 | Vote counts are readable while voting is still open | `NamVoting.sol`, `app.js` | SC-5 |
| D13 | No contract events | `NamVoting.sol` | SC-4 |
| D14 | Candidate fields are concatenated into HTML strings, allowing XSS | `src/js/app.js` | SEC-8 |
| D15 | `throw err` inside DB callbacks crashes the server; no CSRF protection; deprecated `window.ethereum.enable()` | various | SEC-7, SEC-9, FE-1 |
| D16 | `registerVoter()` and `changeState()` in `app.js` send no `{from}`; `changeState` increments a global without checking it | `src/js/app.js` | FE-2 |

---

## 4. Upgrade phases (work in this order)

### Phase 0: Housekeeping (HK)
- **HK-1** `git init`; add a `.gitignore` covering `node_modules/`, `.env`, `build/` (optional), `*.zip` and `ganache-db/`. Do not commit `ecl-v1.0.1.zip`.
- **HK-2** Add `dotenv` and `.env.example` with `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `GANACHE_RPC=http://127.0.0.1:7545`, `REDIS_URL=redis://:<password>@127.0.0.1:6379/0`, `OTP_PEPPER`, `REGISTRAR_PRIVATE_KEY` and `RELAYER_PRIVATE_KEY`. Remove every hard-coded secret from `routes/main.js`, `database.js` and `bs-config.js`. **The leaked Gmail app password must be revoked by its owner, not just removed.**
- **HK-3** Fix `package.json`: rename it from `pet-shop` to `namvoting`, remove the broken `tsc` start script, and add the scripts `dev` (lite-server), `migrate` (`truffle migrate --reset`), `test:contracts` (`truffle test`), `test:api` (mocha), `db:migrate` and `seed:admin`.
- **HK-4** Delete dead code: `routes/user.js` (it references a non-existent `users` table) and the commented-out `routes/first_page.js`. Remove the unused `var app = express()` blocks inside route files.
- **HK-5** Add `README.md` with Windows setup: XAMPP, importing the DB, **Redis**, Ganache workspace, `truffle migrate`, adding the network to MetaMask (RPC `http://127.0.0.1:7545`, chain ID 1337), importing accounts, and `npm run dev`.
- **HK-6 Redis setup.** Document one supported way to run Redis on Windows, in this order of preference:
  1. **Docker Desktop:** add a `docker-compose.yml` with `redis:7-alpine`, `--requirepass ${REDIS_PASSWORD}`, the port bound to `127.0.0.1:6379` only, and a persisted volume.
  2. **WSL2 (Ubuntu):** `sudo apt install redis-server`, then set `bind 127.0.0.1` and `requirepass` in `redis.conf`.
  3. **Memurai Developer edition:** a native Windows, Redis-compatible server, for machines without Docker or WSL.

  Add `lib/redis.js`: one shared client created from `REDIS_URL`. It connects at startup, logs connection errors without crashing, and the app **refuses to start** if Redis is unreachable, because sessions and OTPs depend on it. Add an `npm run redis:check` script that runs `PING`.

### Phase 1: Security fixes on existing routes (SEC)
- **SEC-1 Roles.** Add `role ENUM('voter','admin') DEFAULT 'voter'` to `registration`. `/adlogin` succeeds only when `role='admin'`. Set `req.session.role`. Seed admins only with `npm run seed:admin`.
- **SEC-2 Route guards.** Create `middleware/auth.js` with `requireLogin` and `requireAdmin`. Wrap the `sendFile` routes in `bs-config.js`: admin routes (`/addCandidate`, `/changePhase`, `/candidateDetails`, `/table_view`) use `requireAdmin`; voter routes (`/form`, `/userInfo`, `/voting`, `/vote_area`) use `requireLogin`; `/result` stays public.
- **SEC-3 Passwords.** Use bcryptjs with cost 12 and drop the `confirm_password` column. Migrate on login: if the stored hash is 32-hex MD5 and matches, re-hash with bcrypt and save.
- **SEC-4 OTP.** Create table `otp_codes(id, reg_id, code_hash, purpose, expires_at, attempts, used_at)`. Generate a 6-digit code with `crypto.randomInt` per request, store it as SHA-256 with a server pepper, give it a 5-minute expiry and a 5-attempt limit, and make it single-use. Keep the pending `id_number` and `account_address` in **`req.session`**, not module globals. **[ASSUMPTION]** Use MySQL rather than Redis to avoid a new service on Windows; update the Chapter 3 diagram (which shows Redis) to match, or add Redis later.
- **SEC-5 Sessions.** Store sessions in MySQL with `express-mysql-session`; take the secret from `.env`; set cookies to `httpOnly`, `sameSite='strict'` and a 30-minute idle timeout; regenerate the session at login; destroy it at logout.
- **SEC-6 Registration bugs.** Add unique indexes on `email_address` and `id_number`. Fix `is_registerd` to `Is_registered`. Fix `length > 1` to `length > 0`. Validate an 11-digit national ID, email format and password length of at least 8 on the server.
- **SEC-7 Errors.** Replace `throw err` in callbacks with `next(err)` and add a central error handler that renders a friendly message and logs without passwords or OTPs.
- **SEC-8 XSS.** In `app.js`, build candidate cards and table rows with jQuery `.text()` or an `escapeHtml()` helper; never concatenate raw contract strings into HTML. Escape EJS output with `<%= %>`, not `<%- %>`, for user data.
- **SEC-9 CSRF.** Add CSRF tokens to every POST form (`/register`, `/login`, `/adlogin`, `/registerdata`, `/otpverify`).
- **SEC-10 Rate limits.** Allow 5 requests per minute per IP on `/login`, `/adlogin`, `/register`, `/registerdata` and `/otpverify`.
- **SEC-11 Headers.** Add `helmet` with a content security policy that allows only self-hosted scripts. Move `web3.min.js` and `truffle-contract.js` into `src/js/`; they are already local.
- **SEC-12 DB user.** Create a MySQL user `namvoting_app` with only SELECT, INSERT and UPDATE on `blockchainvoting`, instead of `root` with no password.

### Phase 2: Contract upgrade, `NamVoting` v2 (SC)
Keep the contract name, the file and the migration. Change `truffle-config.js` to **solc `0.8.24`** with `evmVersion: "paris"`; Ganache 2.7.1 lacks newer opcodes.
- **SC-1** Use OpenZeppelin `AccessControl` with `ADMIN_ROLE`, `REGISTRAR_ROLE` and `RELAYER_ROLE`. The migration grants them to the Ganache accounts set in `.env` or in the migration config.
- **SC-2** Keep the function names the frontend uses (`addContestant`, `voterRegisteration`, `changeState`, `vote`, `contestants`, `contestantsCount`, `state`) so `app.js` changes stay small. `changeState` may only move forward one step at a time.
- **SC-3** **Remove the `vote` field from `Voter`.** No storage may map an address to a choice.
- **SC-4** Emit the events `ContestantAdded`, `VoterRegistered`, `PhaseChanged` and `VoteCast(candidateId)`, with no voter address in Phase 4 mode.
- **SC-5** Hide counts from the `contestants()` getter: `voteCount` is returned as 0 unless `state == done`. Add `results()`, which reverts before `done`. The underlying storage stays technically readable (§9).
- **SC-6** Use custom errors (`WrongPhase`, `NotRegistered`, `AlreadyVoted`, `InvalidContestant`) instead of bare `require`.
- **SC-7** Add `voterRegisterationBatch(address[])` for the server to use.
- **SC-8** Expand `test/NamVoting.js` to cover every function, role, phase transition and revert, aiming for at least 95% line coverage (`solidity-coverage`).

### Phase 3: Integration (INT): RQ1
- **INT-1** After OTP success (`/otpverify`), the **server** calls `voterRegisteration(account_address)` with `REGISTRAR_PRIVATE_KEY` through web3 (already a dependency), then updates MySQL. If the chain call fails, roll back the DB change and show an error. Remove the manual address-paste step from the admin page (D10), or keep it only as a recovery tool for admins.
- **INT-2** Add `config/contract.js`, which loads the ABI and address from `build/contracts/NamVoting.json` for the Ganache network ID, shared by the server and pages.
- **INT-3** Make `/table_view` show each registered voter's on-chain status next to the DB record, and flag mismatches.
- **INT-4** Add a `/audit` page (public) that lists all events from block 0, re-counts the `VoteCast` events and compares the total with `results()`.

### Phase 4: Anonymity (ANON): fixes "lacks anonymity"
Removing the `vote` field alone (SC-3) is **not enough**: the transaction `vote(3)` sent from the voter's own address still reveals their choice on Ganache. Real unlinkability needs the vote to be sent from a different address, with proof of eligibility that does not reveal who the voter is.

- **ANON-0 (spike first, mark as throwaway):** compile the Semaphore contracts (latest stable) with Truffle, solc 0.8.24 and `paris`; deploy them and their Poseidon library to Ganache (set the workspace gas limit to 30,000,000); and verify one proof generated in Node. Record the result in `docs/anon-spike.md`. **If this fails, use the fallback in ANON-6.**
- **ANON-1** Registration: after the OTP, the browser creates a Semaphore identity (bundled with `esbuild` into `src/js/semaphore.bundle.js`) and sends only the **identity commitment**. The voter downloads an encrypted backup of the identity. The server adds the commitment to the election's group on-chain and **does not store the commitment next to the user**; it records only that the user registered.
- **ANON-2** Voting: on `voting.html`, the browser generates a proof (`scope = election ID`, `message = candidate ID`) and POSTs it to a new route, `POST /api/vote`.
- **ANON-3** Relayer: the route checks the proof and calls `castVote(proof)` from `RELAYER_PRIVATE_KEY`, so the voter's MetaMask address never appears in the vote transaction. It never logs IPs or session IDs alongside proofs.
- **ANON-4** The contract adds `castVote(ISemaphore.SemaphoreProof)`. Nullifiers block double voting; the old address-based `vote()` is disabled when anonymous mode is on.
- **ANON-5** The voter receives the transaction hash and nullifier as a receipt and can find their vote on the `/audit` page.
- **ANON-6 (fallback if ANON-0 fails):** keep address-based registration, but votes go only through the server relayer (`POST /api/vote` after login; the server marks `has_voted` in the DB, not on-chain, and submits `vote(candidateId)` from the relayer address). This hides voters from the chain but **requires trusting the server**. Document it as a weaker design in Chapter 4.

MetaMask stays in use for admin actions and for proving wallet ownership at registration.

### Phase 5: Tests and evaluation (TEST)
- **TEST-1** API tests with mocha and supertest against a test database (`blockchainvoting_test`), covering every SEC item.
- **TEST-2** Contract tests with `truffle test` against Ganache, covering every SC and ANON item.
- **TEST-3** `test/attacks/`: one test file per threat-model row (§7).
- **TEST-4** Run Slither on `contracts/` and save the report to `docs/slither-report.md`, with no high or medium findings left open.
- **TEST-5** An `npm run eval` script produces `docs/evaluation-results.md` (§8).

---

## 5. Database changes (`db/migrations/*.sql`, run in order)

```sql
-- 001_roles_and_constraints.sql
ALTER TABLE registration
  ADD COLUMN role ENUM('voter','admin') NOT NULL DEFAULT 'voter',
  DROP COLUMN confirm_password,
  MODIFY password VARCHAR(100) NOT NULL,
  ADD UNIQUE KEY uq_email (email_address),
  ADD UNIQUE KEY uq_idnum (id_number);
UPDATE registration SET role='admin' WHERE email_address='admin@gmail.com';

-- 002_otp.sql
CREATE TABLE otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reg_id INT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose ENUM('verify_email','register_vote','login') NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT NOT NULL DEFAULT 0,
  used_at DATETIME NULL,
  FOREIGN KEY (reg_id) REFERENCES registration(reg_id)
);

-- 003_sessions.sql  (express-mysql-session can create this itself)

-- 004_audit_log.sql
CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_reg_id INT NULL,
  action VARCHAR(64) NOT NULL,
  detail VARCHAR(500),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```
Keep `registered_users` for compatibility but treat the chain as the source of truth (INT-3). Also update `blockchainvoting.sql` so a fresh import matches the migrated schema.

---

## 6. Contract v2 interface (sketch)

```solidity
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/access/AccessControl.sol";

contract NamVoting is AccessControl {
    enum PHASE { reg, voting, done }
    struct Contestant { uint id; string name; uint voteCount; string party; uint age; string qualification; }
    struct Voter { bool isRegistered; bool hasVoted; }       // no `vote` field (SC-3)

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    PHASE public state;
    uint public contestantsCount;

    function addContestant(string calldata, string calldata, uint, string calldata) external;   // ADMIN, reg
    function voterRegisteration(address) external;                                               // REGISTRAR, reg
    function voterRegisterationBatch(address[] calldata) external;                                // REGISTRAR, reg
    function changeState(PHASE) external;                                                        // ADMIN, +1 step only
    function vote(uint) external;                                                                 // voting; disabled in anon mode
    function contestants(uint) external view returns (Contestant memory);                        // voteCount = 0 unless done
    function results() external view returns (uint[] memory);                                     // reverts unless done
    // Phase 4: function castVote(ISemaphore.SemaphoreProof calldata) external;

    event ContestantAdded(uint id, string name);
    event VoterRegistered(address voter);
    event PhaseChanged(PHASE phase);
    event VoteCast(uint contestantId);
}
```
(The misspelled name "Registeration" is kept on purpose so `app.js` still works.)

---

## 7. Threat model: five attack surfaces (Chapter 3, Figure 3-4)

| # | Surface | Threats | Controls (requirement IDs) | Attack tests (`test/attacks/`) |
|---|---|---|---|---|
| 1 | User interface | XSS, phishing, client tampering, a fake MetaMask | SEC-8, SEC-11; show the contract address and network before signing; the README warns to install MetaMask only from metamask.io | Script tag in a candidate name renders as text; changing the candidate ID in DevTools is rejected by the contract |
| 2 | Smart contract | Access-control bypass, phase skipping or reversal, double voting, invalid candidate | SC-1, SC-2, SC-6, ANON-4 | A non-admin calls each admin function and it reverts; voting in the wrong phase reverts; voting twice or reusing a nullifier reverts; candidates 0 and n+1 revert; phase cannot go backwards or skip |
| 3 | Blockchain network | Exposed RPC, relayer downtime, replay, reading voter choices from transactions | Ganache bound to 127.0.0.1; ANON-3, ANON-4; ANON-6 fallback | A replayed proof reverts; scanning all transactions finds no voter address linked to a candidate (anonymous mode) |
| 4 | Registration database | SQL injection, privilege abuse, voter-to-vote linkage, weak hashes | SEC-1, SEC-3, SEC-12; parameterised queries; ANON-1 (no commitment stored) | SQL-injection payloads in every form fail; a voter session gets 403 on admin pages; schema check finds no commitment column |
| 5 | Email OTP channel | Brute force, replay, a shared OTP, interception | SEC-4, SEC-10 | 6th wrong attempt locks; expired code is rejected; user A's code fails for user B; a used code fails; two concurrent registrations do not interfere (D7) |

---

## 8. Evaluation (Chapter 3 §3.7, RQ3): `npm run eval` writes `docs/evaluation-results.md`

| Type | Measure | Pass criterion |
|---|---|---|
| Functional | Full flow: sign up, verify, register, admin adds candidates, phase change, vote, results | Passes on Ganache |
| Invalid conditions | Unregistered voter, wrong phase, invalid candidate, double vote | All rejected with the correct error |
| Integrity | Simulated 50 voters; re-count from events equals `results()` equals the number of voters | 100% match |
| Anonymity | Script scans every Ganache transaction and DB table to try linking a person to a candidate | No link possible (ANON); in the fallback, a link is possible only through the server, which is documented |
| Integration | Pages to routes, routes to MySQL, routes to the contract, MetaMask to the contract | Tests pass |
| Performance | Page and API latency, transaction time on Ganache, gas per function, proof-generation time | Mean and p95, labelled as local Ganache results (§3.7.4) |
| Usability | Task scripts for voter and admin, plus a SUS questionnaire template in `docs/` | Template present |
| Security | §7 attack suite plus the Slither report | All green; no open high or medium findings |

---

## 9. Known limitations (state these in the dissertation, RQ4)
- **Ganache is a single local node** that produces blocks instantly. There is no decentralisation, consensus or real gas market. The proof-of-stake reasoning in Chapter 3 §3.5.2 is a design argument the prototype does not demonstrate, and performance figures do not transfer to a public network.
- **Truffle and Ganache were discontinued in 2023.** Versions are pinned; moving to Hardhat or Foundry is future work.
- **Running tallies remain in contract storage** during voting even though the getters hide them. Fully hiding them needs encrypted ballots, which is future work.
- **No coercion resistance or receipt-freeness.**
- **Registration timing** may weakly correlate a registering user with an on-chain group addition.
- **The ANON-6 fallback trusts the server**, if it is used.
- **The OTP store uses MySQL instead of Redis**, which differs from the Chapter 3 diagram (**[ASSUMPTION]**; reconcile in the text).

---

## 10. Instructions for Claude Code
1. Read this file and the existing code before changing anything. Ask about any **[ASSUMPTION]** that blocks you.
2. Work phase by phase in the order 0 → 5. Within a phase, work item by item, writing the test first where practical.
3. Do not replace the stack, framework or folder layout, and do not convert to TypeScript or React. Keep page URLs working.
4. Never commit `.env` or secrets. Never store anything that links a user to a vote or an identity commitment.
5. After each phase, update `README.md` and append to `CHANGELOG.md` the requirement IDs now done.
6. Phase 4 starts with the ANON-0 spike. Report the result before building ANON-1 to ANON-5.
