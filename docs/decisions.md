# Design decisions

Decisions that change or settle something in `REQUIREMENTS.md`. Newest first.

## D-002: ganache-cli as a dev dependency, for contract coverage only (2026-11-03)

**Affects:** SC-8 (at least 95% line coverage with `solidity-coverage`); plan Task 7.

**Context.** `solidity-coverage` 0.8 removed its Truffle plugin, so the project
pins 0.7.22, the last release with one. That release runs the tests on an
in-process Ganache, and it can't attach to Ganache v7, the version Truffle
5.11 bundles. It falls back to `require('ganache-cli')`, which wasn't installed.

**Decision.** Add `ganache-cli@6.12.2` (the last release) as an exact-pinned dev
dependency. It is used only by `npm run coverage`. The app, `npm run migrate`
and `npm run test:contracts` keep using Ganache UI 2.7.1. If ganache-cli can't
run the tests on Node 18, remove it and record coverage as not measured
(fallback agreed with the team).

**Consequences.**
- One old, unmaintained package in `devDependencies` only; never loaded at runtime.
- Coverage runs on a different chain implementation from the demo chain. The
  contract tests themselves run on Ganache UI.

## D-001: No Redis; short-lived security state lives in MySQL (2026-10-31)

**Affects:** §0.1 (data placement), HK-6, D6, SEC-4, SEC-5, SEC-10, §9; Chapter 3, Figure 3-3.

**Context.** §0.1 and HK-6 put sessions, OTP codes, attempt counters and
rate-limit counters in Redis. SEC-4, SEC-5, §5 and §9 instead assumed MySQL.
On the development PC (Windows 11, 5.9 GB RAM, no Docker or WSL) the
Memurai Developer installer fails with MSI error 1603, and running Redis in
WSL2 would mean an admin install, a reboot and about 1 GB of RAM, on every
team member's machine.

**Decision.** Do not use Redis.

| State | Where it lives |
|---|---|
| Sessions | MySQL, through `express-mysql-session` (SEC-5) |
| OTP codes, expiry, attempt counter, single use | MySQL table `otp_codes` (SEC-4, §5) |
| Rate-limit counters | `express-rate-limit` in-memory store (SEC-10) |

HK-6 is closed as not applicable. `connect-redis`, `rate-limit-redis` and
`redis` are not used, and there is no `REDIS_URL` setting.

**Consequences.**
- One less service to install and run, so the demo starts on any machine with XAMPP.
- The OTP rules (5-minute expiry, 5 attempts, single use) are enforced in code and
  SQL, so they work the same as they would on Redis. Expired rows are not removed
  automatically and need a cleanup query.
- Rate-limit counters reset when the server restarts and aren't shared between
  processes. That's acceptable for a single local server, but it is a limitation.
- **Dissertation:** update Figure 3-3 so the persistence tier shows MySQL only,
  and keep the §9 limitation saying the OTP store uses MySQL instead of Redis.
