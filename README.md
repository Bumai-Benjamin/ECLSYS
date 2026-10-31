# NamVoting

A blockchain e-voting prototype: a Solidity contract on a local Ganache chain,
an Express server (inside lite-server) with EJS and static pages, MySQL for voter
records, MetaMask for signing, and email OTPs through Nodemailer.

The upgrade plan is in [REQUIREMENTS.md](REQUIREMENTS.md), the decisions that
change it are in [docs/decisions.md](docs/decisions.md), and progress is in
[CHANGELOG.md](CHANGELOG.md).

## Requirements (Windows)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18 LTS | Truffle supports Node 14–18. Install through [nvm-windows](https://github.com/coreybutler/nvm-windows): `nvm install 18` then `nvm use 18` |
| Truffle | 5.11.x | `npm install -g truffle@5.11.5` |
| Ganache UI | 2.7.1 | RPC on `127.0.0.1:7545` |
| XAMPP | any recent | Only MySQL/MariaDB is used |
| MetaMask | latest | Browser extension |
| Git | any | |

Redis is **not** used. Sessions, OTPs and other short-lived state live in MySQL
(see [D-001](docs/decisions.md)).

> **Security:** install MetaMask **only** from <https://metamask.io>. Fake
> MetaMask extensions are a known way to steal keys.

## 1. Get the code and install packages

```powershell
git clone <repo-url> namvoting
cd namvoting
npm install
```

## 2. Database (XAMPP)

1. Start **MySQL** in the XAMPP Control Panel.
2. Open phpMyAdmin (<http://localhost/phpmyadmin>), create a database called
   `blockchainvoting`, open it, and use **Import** to load `blockchainvoting.sql`.
3. Apply the schema migrations in `db/migrations/` (safe to run again; it only
   applies new files):

```powershell
npm run db:migrate
```

## 3. Configuration (`.env`)

```powershell
Copy-Item .env.example .env
```

Then edit `.env`:

- `SESSION_SECRET` and `OTP_PEPPER`: long random strings. Generate each with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `SMTP_*` and `MAIL_FROM`: the account that sends OTP emails. For Gmail, turn on
  2-step verification and create an **app password**; never use the real account
  password.
- `DB_*`: leave the defaults for a stock XAMPP install.

`.env` is ignored by git. Never commit it.

## 4. Ganache

1. Open Ganache UI and create (or open) a workspace.
2. In **Settings → Server**, check: hostname `127.0.0.1`, port `7545`,
   network ID `5777`. Ganache UI uses chain ID `1337`.
3. Deploy the contract:

```powershell
npm run migrate
```

This writes `build/contracts/NamVoting.json`, which the pages load to find the
contract. Run it again whenever you restart Ganache with a fresh chain or change
the contract.

## 5. MetaMask

1. **Add the network:** MetaMask → network menu → *Add network* → *Add a network
   manually*:
   - Network name: `Ganache`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency symbol: `ETH`
2. **Import accounts:** in Ganache, click the key icon next to an account, copy
   its private key, then in MetaMask choose *Import account* and paste it.
   - The **first** Ganache account deployed the contract and is the admin; use it
     on the admin pages.
   - Import one or more other accounts to act as voters.
3. After restarting Ganache, MetaMask may show nonce errors. Fix them with
   *Settings → Advanced → Clear activity tab data* for each imported account.

Only ever import Ganache test keys into this MetaMask network. Never use a
wallet that holds real funds.

## 6. Run

```powershell
npm run dev
```

The app runs on <http://localhost:3000>. If something else is already using port
3000, lite-server moves to the next free port (3001, 3002, …) and prints which one.

Main pages: `/register` (sign up), `/login`, `/form` (voter registration with
email OTP), `/userInfo`, `/voting`, `/result`; admin: `/adlogin`,
`/addCandidate`, `/changePhase`, `/candidateDetails`, `/table_view`.

## Tests

```powershell
npm run test:contracts   # truffle test against Ganache on 7545
```

`truffle test` deploys fresh copies of the contracts to the running Ganache
workspace each time. It doesn't change `build/contracts`.

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` / `npm start` | Start the web server (lite-server + Express) |
| `npm run migrate` | `truffle migrate --reset` to Ganache |
| `npm run test:contracts` | Contract tests |
| `npm run db:migrate` | Apply `db/migrations/*.sql` in order |

## Troubleshooting

- **`CONNECTION ERROR: Couldn't connect to node`** from Truffle: Ganache isn't
  running on `127.0.0.1:7545`, or `GANACHE_RPC` in `.env` points somewhere else.
  (An earlier version of this error came from Ganache closing idle connections;
  `truffle-config.js` now opens a fresh connection for every request.)
- **`Missing required settings in .env`** on start: copy `.env.example` to `.env`
  and fill it in.
- **`ER_ACCESS_DENIED_ERROR` / `ECONNREFUSED` for MySQL:** start MySQL in XAMPP and
  check the `DB_*` values.
