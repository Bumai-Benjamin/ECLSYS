# NamVoting UI/UX Refresh: Design

**Date:** 2026-11-05
**Status:** Approved in conversation, awaiting written-spec review
**Branch:** `ui-refresh` (from `Ben` at `5977d0d`)

## 1. Purpose

Make the app usable by **first-time voters and election staff** without help: at every step they can see where they are, what to do next, and what went wrong in plain words. This is a usability and accessibility pass over the existing pages, not a rebuild.

### Decisions taken with the project owner

| Question | Decision |
|---|---|
| Main goal | Real voter usability (not only demo polish) |
| Devices | Desktop first; every page must still work on a phone |
| Look | Keep the coral brand from the home and login pages and carry it into the internal pages |
| Build approach | Keep the pages as static HTML / EJS; add an override stylesheet over Material Dashboard and a script that draws the shared navigation |
| Flow changes in scope | Step tracker, connect-wallet button, MetaMask guidance (status panel, vote confirmation, receipt), admin clarity (phase timeline with confirmation, inline validation) |

### Constraints (from REQUIREMENTS §0 and the security work)

- Same stack: Express, EJS and static HTML, jQuery, web3 / truffle-contract, Material Dashboard 2.1.2 CSS. No framework, no build step, no new npm dependency.
- Every URL and the order of the flow stay the same.
- The CSP stays as it is (`script-src 'self'`): no inline scripts, no inline event handlers, and (new rule) no inline `style=` attributes.
- Contract data is always escaped (`Templates.escapeHtml`, EJS `<%= %>`).
- Accessibility target: **WCAG 2.1 AA**.

### Out of scope

Anonymous voting (Phase 4), translations into other Namibian languages, email templates, any new framework or build step, URL or flow-order changes, charts beyond CSS bars on Results.

## 2. Page inventory

| URL | File | Nav | Main changes |
|---|---|---|---|
| `/` | `src/index.html` | public | Contrast fix; **Register to vote**, **Sign in**, "See results" |
| `/login`, `/register` | `views/login-form.ejs`, `views/registration-form.ejs` | none | Coral card, visible labels, password rules, labelled error alert |
| `/adlogin` | `views/admin_login.ejs` | none | Same card, "Election administrator sign-in" |
| email code | `views/emailverify.ejs` | voter | Card style, "Didn't get the code?" link back to `/form` |
| `/dashboard` | `views/dashboard.ejs` | voter | Step tracker as the main content |
| `/userInfo` | `src/userInfo.html` | voter | Shell, step tracker |
| `/form` | `views/voter-registration.ejs` | voter | Connect-wallet button, ID hint and inline error, status panel |
| `/voting` | `src/voting.html` | voter | Candidate cards, confirmation dialog, pending states, receipt |
| `/vote_area` | `src/vote_area.html` | voter | Shell and styles only (legacy page kept for the URL) |
| `/result` | `src/result.html` | public or voter | Waiting state; sorted results with CSS bars |
| `/audit` | `views/audit.ejs` | public | Shell, coral styling, shortened hashes |
| `/candidateDetails` | `src/adminCandidateDetails.html` | admin | Clean table, empty state |
| `/addCandidate` | `src/adminAddCandidate.html` | admin | Inline validation, phase lock, success message |
| `/table_view` | `views/adminVoterReg.ejs` | admin | Status badges, mismatch panel, "Recovery tools" collapsed |
| `/changePhase` | `src/adminChangePhase.html` | admin | Phase timeline, typed confirmation |
| errors | `views/error.ejs` | public | Card style |

## 3. Structure

### 3.1 `src/css/app.css`

Loaded **after** `material-dashboard.css` on every page. Defines the design as CSS custom properties and overrides Material's cards, sidebar, buttons, tables, alerts and form fields.

| Token | Value | Use |
|---|---|---|
| `--brand` | `#ec6363` | Accents, highlights, active nav item, step-tracker current step (not for text on white, not as a button background with white text) |
| `--brand-strong` | `#b93a3a` | Buttons and links (white text on it is about 5:1) |
| `--brand-tint` | `#fdecec` | Selected candidate card, active nav background |
| `--danger` | `#9b1c1c` | Errors only, always with an icon and words |
| `--success` | `#1e6b3a` | Success and "On blockchain: Yes" badges |
| `--warning` | `#8a5a00` on `#fff4d6` | Warnings and mismatch panel |
| `--text` / `--muted` | `#1f2328` / `#57606a` | Body text / secondary text |
| `--surface` / `--page` | `#ffffff` / `#f6f7f9` | Cards / page background |

Rules: body text at least 16px; touch targets at least 44px; visible focus ring (`outline: 3px solid var(--brand-strong); outline-offset: 2px`) on every interactive element; every inline `style=` attribute now in the pages moves into this file.

### 3.2 `src/js/shell.js`

Draws the sidebar and top bar. Every page with navigation has, right after `<body>`:

```html
<nav id="app-shell" aria-label="Main"></nav>
<script src="/js/shell.js"></script>
```

and `<body data-nav="voter|admin|public" data-page="<page id>">`. The script runs synchronously where it sits, so the nav is drawn before the rest of the page is shown (no flicker). The hand-written sidebars are deleted from the 8 pages that have them (`adminAddCandidate.html`, `adminCandidateDetails.html`, `adminChangePhase.html`, `result.html`, `userInfo.html`, `adminVoterReg.ejs`, `dashboard.ejs`, `voter-registration.ejs`).

- **Voter nav:** Dashboard, Information, Voter registration, Voting, Results, Log out.
- **Admin nav (election order):** Candidates, Add candidate, Voters, Election phase, Log out.
- **Public nav:** Home, Results, Audit, Sign in.
- On `data-nav="public"` pages the script asks `/me` and switches to the voter or admin nav when someone is signed in. Until the answer arrives, the public nav shows; "Log out" never shows to visitors.
- The top bar holds the page title, the **phase badge** (Registration / Voting open / Voting closed) and, on the voter pages listed in §4.1, the step tracker.
- Below 992px the sidebar becomes a top bar with a menu button (`aria-expanded`, `aria-controls`); Escape closes it.

### 3.3 `GET /me`

New JSON route (in a new `routes/me.js`, mounted in `createApp`).

- Signed out: `{ "loggedIn": false }`.
- Signed in: `{ "loggedIn": true, "role": "voter"|"admin", "firstName": "…", "walletVerified": true|false, "wallet": "0x…"|null }`.
- `walletVerified` is `registration.Is_registered = 'YES'`; `wallet` is `registration.account_address` when verified.
- Never returns the email address, ID number, date of birth or password hash. `Cache-Control: no-store`.

### 3.4 Shared browser and Node modules

Same pattern as `templates.js` and `errors.js`: a global in the browser, `module.exports` in Node, so the logic is tested with mocha.

- **`src/js/steps.js`** `Steps.compute({ loggedIn, walletVerified, phase, hasVoted })` returns the four steps, each `{ id, label, status: 'done'|'current'|'locked', reason?, href? }`, and the phase badge text.
- **`src/js/wallet-status.js`** `WalletStatus.decide({ hasEthereum, accounts, chainId, expectedWallet, role, isAdminAccount })` returns `{ state, message, action? }`, where `state` is one of `no-metamask`, `not-connected`, `wrong-network`, `wrong-account`, `not-admin`, `ok`.
- **`src/js/validate-candidate.js`** `CandidateForm.validate({ name, party, age, qualification })` returns `{ field: message }` for each problem.

### 3.5 Script lists

Every page keeps only what it uses: jQuery, Bootstrap, Material core (`popper`, `bootstrap-material-design`, `perfect-scrollbar`, `material-dashboard.js`), and on chain pages `web3.min.js`, `truffle-contract.js`, `templates.js`, `errors.js`, `app.js`. The unused plugins (`jquery-jvectormap`, `nouislider`, `bootstrap-tagsinput`, `jasny-bootstrap`, `bootstrap-notify`, `moment`, `jquery.validate`, `arrive`) are removed from the pages. The files stay in `assets/` (no deletions in this change).

## 4. Voter journey

### 4.1 Step tracker

Shown on `/dashboard` (as the main content), `/userInfo`, `/form`, `/voting` and `/result` when signed in as a voter.

```
1 Account ✓  →  2 Verify wallet  →  3 Vote  →  4 Results
```

| Step | Done when | Current when | Locked reason |
|---|---|---|---|
| 1 Account | signed in | (never; signing in completes it) | none |
| 2 Verify wallet | `walletVerified` | not verified and phase is Registration | "Registration is closed." when phase is past Registration and not verified |
| 3 Vote | `hasVoted` | verified, phase is Voting, not voted | "Voting opens when the commission starts the voting phase." (Registration) / "Voting is closed." (Done, not voted) / "Verify your wallet first." |
| 4 Results | (never "done") | phase is Done | "Results appear when voting closes." |

Markup is an ordered list with `aria-current="step"` on the current step; the current step links to its page. `hasVoted` comes from `voters(account).hasVoted` on the contract, `phase` from `state()`; before MetaMask answers, steps 3 and 4 show "Checking…".

### 4.2 Connect wallet (`/form`)

- **"Use my MetaMask wallet"** calls `eth_requestAccounts` and fills `account_address`. The field becomes read-only and shows the short form (`0x1234…abcd`) with a "Use a different account" link that clears it.
- Typing an address by hand still works when MetaMask is unavailable; the server-side `validate.wallet` check is unchanged.
- ID number: label, hint "11 digits, as on your Namibian ID", inline error tied with `aria-describedby`.

### 4.3 MetaMask status panel

Replaces the floating `#chainError` box on `/form`, `/voting`, `/result` and the admin chain pages. One `<div id="wallet-status" role="status" aria-live="polite">` near the top of the content; contract errors from `ChainErrors.message` go into a `role="alert"` line inside it and stay until the next action.

| State | Message | Action |
|---|---|---|
| `no-metamask` | "You need the MetaMask browser extension to vote." | Link to `https://metamask.io/download/` (opens in a new tab) |
| `not-connected` | "Connect MetaMask to continue." | **Connect MetaMask** (`eth_requestAccounts`) |
| `wrong-network` | "MetaMask is on another network." | **Switch to the election network** (`wallet_switchEthereumChain` to `0x539`; on error 4902, `wallet_addEthereumChain` with RPC `http://127.0.0.1:7545`) |
| `wrong-account` | "This MetaMask account isn't the wallet you registered (0x12…ab). Switch account in MetaMask." | none |
| `not-admin` | "This MetaMask account isn't an election administrator." | none |
| `ok` | "Connected: 0x12…ab" (small green chip) | none |

`accountsChanged` and `chainChanged` still reload the page (Task 8 behaviour).

### 4.4 Voting (`/voting`)

1. Candidates as selectable cards (radio inputs styled as cards; name, party, age, qualification), built with `Templates` escaping.
2. **Review my vote** (disabled until a card is chosen) opens a native `<dialog>`: "You are voting for *Name* (*Party*). You can't change your vote afterwards." Buttons **Cast vote** and **Go back**. Focus moves into the dialog and returns to the button on close.
3. Pending states in an `aria-live` region: "Confirm the transaction in MetaMask…", then "Recording your vote…".
4. **Receipt:** "Your vote is recorded." with transaction hash (shortened, full value on hover and focus, copy button), block number, a link to `/audit`, and "Your choice is not stored next to your name."
5. If the wallet has already voted, the page shows "You have voted" with a link to `/result` instead of the form.
6. Errors: `WrongPhase` → "Voting is closed." (Review Focus 5); 4001 → "You cancelled the request in MetaMask."; others via `ChainErrors.message`.

### 4.5 Results (`/result`)

- Before Done: "Results will appear when voting closes." and a link to `/audit`.
- Done: table sorted by votes (ties by contestant number) with name, party, votes and share; the share is a CSS bar whose width comes from a class `bar-0` … `bar-100` in steps of 5 (rounded to the nearest 5), set by `app.js`; no inline style.

## 5. Admin pages

All use the admin nav, the phase badge and the status panel (`not-admin` instead of `wrong-account`).

### 5.1 Election phase (`/changePhase`)

- Timeline **Registration → Voting → Closed** with the current stop marked (`aria-current`).
- One button for the next step only: **Open voting** (from Registration) or **Close voting** (from Voting). No button when Closed. The contract only moves forward, so there is never a back button.
- Text under the button: Open voting = "No more candidates or voter registrations. Registered voters can vote." Close voting = "Voting stops for good. Results and totals become public."
- Confirmation `<dialog>` repeats the text and requires typing `OPEN` or `CLOSE` (case-insensitive) before **Confirm** is enabled.
- After the transaction: timeline and badge update without a reload; pending, success and error states as in §4.4.

### 5.2 Add candidate (`/addCandidate`)

- Labelled fields with inline checks before MetaMask opens (`CandidateForm.validate`): name required, at most 64 characters; party required, at most 64; age a whole number 18 to 120; qualification required, at most 100.
- Errors under each field (`aria-describedby`, `aria-invalid`); focus moves to the first invalid field.
- Outside Registration the form is disabled with "Candidates can only be added during Registration."
- Success: "Candidate added." with a link to the candidates list; the form clears.

### 5.3 Candidates (`/candidateDetails`)

Table (#, name, party, age, qualification) with an empty state: "No candidates yet." and a link to Add candidate.

### 5.4 Voters (`/table_view`)

- Phase 3 columns kept; the "On blockchain" cell keeps its exact text (`Yes`, `No ⚠ mismatch`, `Unknown (blockchain unavailable)`, as the INT-3 tests expect) inside a badge: success for Yes, warning for the mismatch, muted for Unknown.
- The mismatch list sits in a warning panel above the table.
- The manual registration form moves into a collapsed **Recovery tools** section (`<details>`).

## 6. Public and sign-in pages

- **Home:** keep the coral layout and logo; fix text contrast; primary **Register to vote**, secondary **Sign in**, quiet "See results" link.
- **Sign in / sign up / admin sign-in / email code:** one coral card style; visible `<label>` for every field (no placeholder-only fields); password rules shown before typing; server messages in a labelled alert box. The email-code page gets "Didn't get the code? Request a new one", a link back to `/form`; submitting the form again issues a new code through the existing `/registerdata` route, so the OTP rules (expiry, attempts, single use) are unchanged and no ID number has to be carried on the code page.
- **`/audit`:** public nav and coral styling; hashes and addresses shortened (`0x12…ab`) with the full value in a `title` and on focus.
- **Error page:** same card style.

## 7. Layout and accessibility rules

- **Breakpoints:** desktop first at 1280px; below 992px the sidebar becomes a top bar with a menu button; below 576px one column, tables become stacked rows (`data-label` per cell), buttons and candidate cards are full width.
- **WCAG 2.1 AA:** text contrast at least 4.5:1 (3:1 for large text and UI parts); every input labelled; errors in words and not only colour; visible keyboard focus; dialogs hold focus and return it; `aria-live` for the status panel and pending states; `lang="en"` and exactly one `<h1>` per page; skip link "Skip to content" as the first focusable element.

## 8. Testing

TDD for every unit with logic. New mocha files under `test/api/` (run by `npm run test:api`):

- `ui-steps.test.js`: every combination of `loggedIn`, `walletVerified`, `phase` (0, 1, 2) and `hasVoted` gives the table in §4.1.
- `ui-wallet-status.test.js`: each row of the §4.3 table, plus precedence (no MetaMask before wrong network before wrong account).
- `ui-candidate-form.test.js`: each rule in §5.2, including boundaries (17, 18, 120, 121, 64 and 65 characters, non-integer age).
- `ui-me.test.js`: signed out; voter verified and not verified; admin; response has no email, ID number, date of birth or hash; `Cache-Control: no-store`.
- `ui-pages.test.js` (static checks over `src/*.html` and `src/views/*.ejs`):
  - every page with navigation has `#app-shell` and loads `/css/app.css` after `material-dashboard.css`, and `/js/shell.js`;
  - no page keeps a hand-written `class="sidebar"`;
  - exactly one `<h1>` per page; `<html lang="en">`;
  - no `style=` attribute (extends the SEC-8 / SEC-11 checks);
  - no removed plugin script is referenced;
  - every `<input>`, `<select>` and `<textarea>` has a matching `<label for>` or `aria-label`.

Existing suites stay green: 213 API tests, 26 contract tests, 3 integration tests.

**Manual:** the Task 8 MetaMask checklist on the new UI (wrong network, rejected signature, closing voting while the ballot is open), keyboard-only pass through the voter journey and the phase change, and screenshots of every page at 1280px and 375px.

## 9. Delivery

Each area is its own commit on `ui-refresh` (`UI-1` to `UI-n`), the app runnable after every commit, `CHANGELOG.md` updated at the end. Merged into `Ben` after review.
