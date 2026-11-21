# Setting up NamVoting on a new PC (Windows)

Follow these steps in order. It takes about 30–45 minutes the first time.
For what the project is and how it works, see [README.md](README.md).

## 1. Install the tools

| Tool | Where to get it | Notes |
|---|---|---|
| Git | <https://git-scm.com> | The default install options are fine |
| nvm-windows | <https://github.com/coreybutler/nvm-windows/releases> (`nvm-setup.exe`) | Then, in a **new** terminal: `nvm install 18` and `nvm use 18` |
| Truffle 5.11.5 | `npm install -g truffle@5.11.5` | Install after Node |
| XAMPP | <https://www.apachefriends.org> | Only MySQL is used (Apache is only needed for phpMyAdmin) |
| Ganache UI 2.7.1 | <https://archive.trufflesuite.com/ganache> | |
| MetaMask | <https://metamask.io> **only** | Fake MetaMask extensions steal keys |

Use **Node 18**. Truffle does not officially support newer versions. Check with
`node -v`.

## 2. Get the code

```powershell
git clone -b Ben https://github.com/Bumai-Benjamin/ECLSYS.git namvoting
cd namvoting
npm install
```

All current work is on the `Ben` branch, so keep `-b Ben`. To get later
changes, run `git pull` **inside the `namvoting` folder**.

## 3. Database (XAMPP)

1. Open the XAMPP Control Panel and press **Start** next to **MySQL** (and
   **Apache** if you want phpMyAdmin).
2. Open <http://localhost/phpmyadmin>, create a database called
   `blockchainvoting`, open it, choose **Import**, and load
   `blockchainvoting.sql` from the project folder.
3. In the terminal, apply the schema changes:

   ```powershell
   npm run db:migrate
   ```

## 4. Settings (`.env`)

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill it in:

| Setting | What to put |
|---|---|
| `SESSION_SECRET`, `OTP_PEPPER` | A different long random string in each. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DB_ADMIN_USER`, `DB_ADMIN_PASS` | `root` and an empty password on a fresh XAMPP |
| `DB_USER`, `DB_PASS` | `namvoting_app` and a long password you make up, then run `npm run db:create-user` |
| `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | The Gmail account that sends the email codes (see below) |
| `REGISTRAR_PRIVATE_KEY` | Leave empty for now and fill it in during step 5 |

**Email codes through Gmail.** One Gmail account sends every verification code.
This is the system's default sender. A Gmail account made only for this project
is best, so no one's personal inbox is involved. Gmail does not accept the
normal account password.

1. Turn on 2-Step Verification at <https://myaccount.google.com/security>.
2. Create an app password at <https://myaccount.google.com/apppasswords> (any
   name, such as `NamVoting`).
3. Put the 16 letters, without spaces, in `SMTP_PASS`, and the Gmail address in
   `SMTP_USER`.
4. Leave `MAIL_FROM` empty. Voters then see the sender as **ECN E-Vote**.
5. Check it, which sends one test email (no code) to the address you give:

   ```powershell
   npm run mail:test -- you@example.com
   ```

When `npm run dev` starts, it also prints one line saying whether OTP emails
work, for example `[mail] OTP emails will be sent from "ECN E-Vote" <…>`.

To test without Gmail, create a free account at <https://ethereal.email> and use
`SMTP_HOST=smtp.ethereal.email`, `SMTP_PORT=587` and its username and password.
The emails then appear at <https://ethereal.email/messages> instead of a real
inbox.

`.env` holds passwords and keys. It is ignored by git: never commit it or send
it to anyone. Each PC has its own.

## 5. Ganache (the local blockchain)

1. Open Ganache and choose **New Workspace (Ethereum)**, not **Quickstart**.
2. On the **Server** tab check: hostname `127.0.0.1`, port `7545`, network ID
   `5777`. Press **Save Workspace**.
3. Deploy the contract:

   ```powershell
   npm run migrate
   ```

4. In Ganache, click the key icon on the account with **index 1**, copy its
   private key, and paste it after `REGISTRAR_PRIVATE_KEY=` in `.env`. The server
   uses this account to register voters on the blockchain.

Next time, **open the saved workspace**. Quickstart makes a brand-new chain every
time. You would then have to run `npm run migrate` again, update
`REGISTRAR_PRIVATE_KEY`, and re-import the MetaMask accounts.

Ganache uses two different numbers. **Chain ID `1337`** is the one MetaMask
needs. **Network ID `5777`** is only used by Truffle.

## 6. MetaMask

1. **Add the network** (MetaMask → Networks → Add a custom network):
   - Network name: `Ganache`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency symbol: `ETH`

   Or skip this step. The app shows a **Switch to the election network** button
   that adds the network for you.
2. **Import accounts** (account menu → Add account → Import account), pasting
   each private key from Ganache's key icon:
   - **Account 0**: the admin. It deployed the contract.
   - **Account 3** or higher: a voter. Import one per test voter.
   - Do **not** use accounts 1 and 2. The server uses them.

A Ganache account shows about 100 ETH. This is test money and worth nothing.
Never import a wallet that holds real funds.

## 7. Start the app

```powershell
npm run dev
```

Check that the output says **`Local: http://localhost:3000`**. If it shows 3001
or higher, another copy is already running. Close it before testing, because the
browser will talk to the old copy.

### Create an admin account

1. Sign up at <http://localhost:3000/register> with the admin's email.
2. In a second terminal, in the project folder, run this with that email:

   ```powershell
   npm run seed:admin -- admin@example.com
   ```

3. Sign in at <http://localhost:3000/adlogin>. The normal `/login` page leads to
   the voter pages.

## 8. Check everything works

```powershell
npm run test:api            # needs MySQL
npm run test:contracts      # needs Ganache
npm run test:integration    # needs Ganache and REGISTRAR_PRIVATE_KEY
```

All three should finish with no failures.

## A first test run

1. **Admin** (`/adlogin`, MetaMask on account 0): add two candidates.
2. **Voter:** sign up at `/register` with an email you can open and an age of 18
   or over. Sign in at `/login`, open **Voter registration**, enter the ID number
   and the account 3 address, then type the emailed code. The server registers
   the wallet on the blockchain. There is no MetaMask pop-up for this step.
3. **Admin:** **Voters** should show the wallet as registered on-chain. Open
   voting in **Election phase**.
4. **Voter** (MetaMask on account 3): vote. A second attempt shows "You have
   already voted."
5. **Admin:** close voting. **Results** shows the counts.

## Troubleshooting

| Problem | Fix |
|---|---|
| "We couldn't send your code", or `[mail] OTP emails are NOT working` at start | The line says why. For "rejected the login": make a new app password and paste it into `SMTP_PASS`, and check `SMTP_USER` is the same Google account. Then run `npm run mail:test -- you@example.com` and restart `npm run dev` |
| Changes to `.env` have no effect | The server reads `.env` only when it starts. Stop it (Ctrl+C) and run `npm run dev` again |
| Server starts on port 3001 or higher | An older copy is still running. Close it so only one runs on 3000 |
| "Missing on blockchain" in the voter table | The wallet was registered on an older Ganache chain that has since been reset. Wallets registered on the current chain show "Yes" |
| "The blockchain is not available" | Ganache isn't running, or the contract isn't deployed. Open the workspace and run `npm run migrate` |
| MetaMask "nonce" errors after a Ganache reset | MetaMask → Settings → Advanced → **Clear activity tab data** |
| `fatal: not a git repository` | Run git commands inside the project folder, not the folder above it |
| `ER_ACCESS_DENIED_ERROR` or `ECONNREFUSED` (MySQL) | Start MySQL in XAMPP. Check the `DB_*` values and run `npm run db:create-user` again |
