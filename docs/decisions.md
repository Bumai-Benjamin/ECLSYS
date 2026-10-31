# Design decisions

Decisions that change or settle something in `REQUIREMENTS.md`. Newest first.

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
