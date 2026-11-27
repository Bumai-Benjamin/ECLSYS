# Anonymous voting (Phase 4, ANON)

This page covers how NamVoting keeps a vote from being linked to a voter, what
it still trusts, and how to check it.

## The problem it fixes

Up to v2 a voter called `vote(candidateId)` from their own MetaMask wallet. The
`VoteCast` event had no address, but the transaction's sender and its input data
are public on the chain. The `registration` table also links each wallet to a
national ID, name and email. Anyone who could read both could tell how a named
person voted.

## How it works now

NamVoting uses [Semaphore](https://semaphore.pse.dev) v4: zero-knowledge proofs
of membership in a group.

1. **Voting key.** On the registration page MetaMask signs a fixed message that
   names the election contract (`scripts/zk/voter-key.js`). The signature
   becomes a Semaphore identity in the browser. The same wallet always gives the
   same signature, so the voter gets the same identity back on any device and
   has no backup file to keep. The signature is the identity's secret, and it
   never leaves the page.
2. **Registration (ANON-1).** Only the identity's public **commitment** is sent
   with the form. After the email code, the server's registrar account calls
   `voterRegisteration(wallet, commitment)`, which marks the wallet as
   registered and adds the commitment to the election's Semaphore group. The
   commitment is held in the session until then and is never written to MySQL
   or the audit log.
3. **Voting (ANON-2).** The voting page asks MetaMask for the same signature,
   rebuilds the identity, reads every commitment from `members()` and builds
   a proof in the browser (about a second). The proof says "a member of this
   group chose candidate N" (message = candidate id, scope = `electionId()`)
   without saying which member.
4. **Relay (ANON-3).** The page POSTs the proof to `/api/vote` **without
   cookies**. The server doesn't know which signed-in voter sent it, logs
   nothing about it, and sends it to `castVote(proof)` from its relayer account.
   The voter's wallet never appears in the vote transaction.
5. **Contract (ANON-4).** `castVote` checks the election, the candidate, the
   nullifier and the proof (`Semaphore.verifyProof`). The nullifier is the same
   whenever one identity votes in one election, so a second vote is refused,
   but it can't be traced back to a commitment. The old `vote(uint)` is gone.
6. **Receipt (ANON-5).** The voter gets the transaction hash and the nullifier.
   The `/audit` page lists every `VoteCast` with its nullifier, so a voter can
   find their own vote; nobody else can tell whose it is.

## What is and isn't public

| Who knows | What |
|---|---|
| Everyone (chain) | Which wallets are registered; every commitment; every vote's candidate and nullifier; that the relayer sent each vote |
| The server (database) | Name, ID, email and wallet of each registered voter |
| Only the voter (browser, MetaMask) | The signature (identity secret), and so which nullifier is theirs |

The link wallet → commitment is public (both are in the registration
transaction). That is fine: a proof shows that *some* member voted, never which
commitment, so the commitment doesn't lead to a vote.

## What it still trusts

- **The wallet key.** Anyone with a voter's private key (or who tricks them into
  signing the voting-key message elsewhere) can rebuild the identity and so vote
  in their name, or recognise their nullifier. The message warns about this.
  Ganache test keys are public, so in the demo setup this protects nothing
  against someone with access to the Ganache workspace.
- **Network metadata.** The web server sees the IP address that posts each proof
  while it answers. It doesn't log or store it (the rate limiter keeps per-IP
  counters in memory for a minute), but a server operator who changes the code
  could. A voter on the same network as many others, or behind Tor, is not
  linkable this way. Timing works the same way: a vote posted seconds after a
  voter signs in could be correlated by someone watching both.
- **The anonymity set** is every registered voter. With very few voters, results
  themselves can reveal votes (for example, a unanimous result).
- **The relayer** can refuse to relay (censor) but can't change a vote: the
  candidate is part of the proof. `castVote` is open to anyone, so a voter could
  send their proof from another, unlinked wallet instead, but never from the
  registered one.
- **The circuit files** in `src/zk` are Semaphore's published depth-16 artifacts
  (`https://snark-artifacts.pse.dev/semaphore/4.13.0/semaphore-16.{wasm,zkey}`),
  matching `@semaphore-protocol/core` 4.14.5. A tampered file can only produce
  proofs the on-chain verifier rejects. Depth 16 holds 65,536 voters.

## ANON-0 spike result

Semaphore 4.14.5 compiles with Truffle 5.11.5, solc 0.8.24 and `paris`, and runs
on Ganache 7 (the engine of Ganache UI 2.7.1). Measured deploy gas:

| Contract | Gas |
|---|---|
| PoseidonT3 (library, linked into Semaphore) | 3,692,316 |
| SemaphoreVerifier | 3,720,276 |
| Semaphore | 1,838,860 |
| NamVoting | 1,540,878 |

All fit under Ganache's default block gas limit (6,721,975), so the workspace
setting doesn't need changing. A proof made in Node verifies on-chain
(`test/contracts/NamVoting.js`, `test/integration/chain.test.js`), and the same
proof code runs in the browser under the app's CSP in about a second. The
ANON-6 fallback is not needed.

One deviation from the plan: ANON-1 called for an encrypted identity backup.
Deriving the identity from a MetaMask signature (Semaphore's recommended
pattern) needs no backup, so there is none.

Ganache 6 (`ganache-cli`) does not return the data of custom-error reverts, so
the contract tests need Ganache 7 or Ganache UI 2.7.

## How to check it

- `test/contracts/NamVoting.js`: the vote transaction contains neither the
  voter's wallet nor their commitment; a second vote, a changed message, an
  outsider's proof and a proof for another election are all refused.
- `test/integration/chain.test.js`: register, prove, relay and count a vote
  through `lib/chain` against a running Ganache.
- `test/api/anon-relay.test.js`: the relay sets no cookie, needs no CSRF token,
  logs nothing about the proof, and the commitment never reaches MySQL.
