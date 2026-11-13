# Gold Ledger

A fine-gold ledger for a jewellery workshop. It records gold issued to karigars (goldsmiths), what comes back as finished pieces, scrap and filings, and shows on any day where every gram is. It also records old gold bought from customers, tied to the exchange bill.

Built for the Company A (Coimbatore) brief: 5 showrooms, about 40 karigars, and roughly ₹1.25 crore a year lost to unexplained gold loss and manual month-end reconciliation.

- **Live app:** https://gold-ledger-xkhc.onrender.com
- **Karigar phone view (Tamil / English):** https://gold-ledger-xkhc.onrender.com/karigar.html
- **Repository:** https://github.com/ArushGarg/gold-ledger

The live demo runs on a free host, so its first load can take up to a minute and its database resets to the seed data whenever the service restarts.

## What it does

**Gold maths**
- Weights are stored as integer milligrams, purity as basis points (91.60% is 9160) and money as paise. There is no floating-point drift. Weights take 3 decimals, purity 2.
- The sample rows from the brief reproduce exactly: 120.000 g at 91.60% gives 109.920 g fine, and the balance after the necklace and scrap receipts is 6.916 g and then 3.893 g.

**Karigar master** (finance head edits, clerk views)
- Agreed wastage % per item category for each karigar (0 to 10%, 2 decimals), and adding new karigars.
- The % in force on the day is stored on every issue entry, so changing the master later never rewrites the allowance of jobs already issued.

**Issue entry**
- Gross weight, purity, fine weight and job number, with the allowed wastage shown straight away.
- The server refuses an issue if the vault does not hold enough fine gold, if the job number belongs to another karigar, or if the job is closed.

**Receipt entry**
- Finished piece, scrap or filings against an open job, with a "this receipt closes the job" option.
- A receipt that would return more fine gold than was issued for the job is refused, and the message shows the remaining balance.
- Karigar and job stay selected after a save, so the next entry cannot land on the wrong job.

**Balances**
- Running fine balance per job and per karigar. Closed jobs show their loss against the allowance. Open jobs show their balance.

**Daily stock statement** (finance only)
- Gold in vault, with karigars, finished pieces, agreed allowance used, beyond allowance, and at refiner.
- A badge confirms every gram is accounted for. The figures reconcile to the opening stock plus old gold bought.
- Dates are in Indian Standard Time.
- **Tally export:** all entries as a CSV file (voucher, date, party, type, category, narration, fine gold).

**Loss alerts** (finance only, worded as items to review, never as accusations)
- A job closed above its agreed allowance.
- A karigar whose latest loss is well above their own earlier average, even within the allowance.

**Old gold desk**
- Exchange bill number (one entry per bill), customer, gross weight, deductions, tested purity, rate and payment mode.
- A live preview shows net weight, fine gold and value before saving. It is calculated by the same server code that saves the entry.
- PAN is required from ₹50,000 and is stored masked in the list. Cash above ₹2,00,000 is blocked.
- Old gold bought is counted into the vault stock.

**Karigar phone view** (`/karigar.html`)
- A karigar signs in and sees only their own gold balance, open jobs with allowed wastage, and slips, each with the running job balance.
- Tamil by default, with an English toggle. Single column, large numerals, built for a phone.

**Scale photo reading (optional AI)**
- The clerk takes a photo of the scale display. The reading appears beside the photo and fills the weight field. If the typed weight differs from the photo reading, saving is blocked.
- If the reader is unsure, offline or not configured, the clerk types the weight.

**Roles and access**

| Role | Can do |
|---|---|
| Finance head | Everything the clerk can, plus the stock statement, alerts, Tally export and karigar master edits |
| Issue clerk | Issue, receipt, old gold desk, view karigars and the master |
| Karigar | View their own balance and slips only |

## Run locally

Requires **Node.js 22.13 or newer** (it uses the built-in `node:sqlite`, so there is nothing native to compile). Tested on Node 24.

```bash
git clone https://github.com/ArushGarg/gold-ledger.git
cd gold-ledger
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Open `.env` and set `JWT_SECRET` to a long random text. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then:

```bash
npm test
npm start
```

Open http://localhost:3000. The database file `ledger.db` and the demo data are created on first start. To reset the data, stop the server, delete `ledger.db`, and start again.

## Demo logins (seed data only)

| Role | Email | Password | Where |
|---|---|---|---|
| Finance head | finance@demo.com | demo1234 | `/` |
| Issue clerk | clerk@demo.com | demo1234 | `/` |
| Karigar (Murugesan S) | karigar1@demo.com | demo1234 | `/karigar.html` |
| Karigar (Selvam K) | karigar2@demo.com | demo1234 | `/karigar.html` |

## What the seed data shows

| Karigar | Story |
|---|---|
| Murugesan S | The brief's sample rows (TX-30411, TX-30437, TX-30438). Open job J-1001 with a balance of 3.893 g. |
| Selvam K | Four steady jobs, then a higher-loss job that stays within allowance. Triggers the drift alert. |
| Ravi P | One normal job and one closed above allowance (J-2006). Triggers the over-allowance alert. |
| Karthik M | Clean history, no alerts. |

Each karigar has different agreed wastage. Two old-gold purchases are seeded: EX-1001 (a small cash purchase under the PAN limit) and EX-1002 (a bank-paid purchase with PAN). The seed code refuses to start if a seeded purchase breaks the PAN or cash rules.

A quick walkthrough: issue 50.000 g at 91.60% to Murugesan S as job `J-3001` (necklace). Fine gold shows 45.800 g and allowed wastage 1.374 g. Receive a finished piece of 43.500 g, scrap of 5.500 g and filings of 0.500 g, ticking "closes the job" on the last one. The job closes with a loss of 0.458 g, inside the allowance, so no alert is raised.

## Environment variables

Names only. Never commit real values.

| Name | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | Yes | Signs login tokens |
| `PORT` | No | Server port, default 3000 |
| `DB_FILE` | No | SQLite file path, default `ledger.db` |
| `DEMO_PASSWORD` | No | Password for the seeded demo users |
| `AI_BASE_URL` | No | Base URL of an OpenAI-compatible vision API, for scale photo reading |
| `AI_API_KEY` | No | Key for that API |
| `AI_MODEL` | No | Vision model name |
| `NODE_VERSION` | On Render | Set to `24` so the host has `node:sqlite` |

If the three `AI_` variables are empty, the photo reader reports that it is unsure and the clerk types the weight. They are empty in the live demo.

## Project structure

```
server/fine.js      Exact gold maths: milligrams, basis points, wastage, drift, IST dates
server/index.js     Express API, auth, roles, validation, stock statement, alerts, CSV
server/oldgold.js   Old gold maths, PAN and cash-limit rules, routes
server/karigar.js   Karigar slips API with running job balance
server/master.js    Karigar master: add karigar, set agreed wastage (finance only)
server/seed.js      Demo users, karigars, wastage and job history
public/index.html   Main single-page app (clerk and finance), no build step
public/oldgold.js   Old gold desk screen
public/master.js    Karigar master screen
public/karigar.html Karigar phone view (Tamil / English)
test/               Unit and API tests
```

## Tests

```bash
npm test
```

Covers: the brief's sample rows and rounding, input rejection (4 decimals, bad purity), excess loss only on closed jobs, drift detection, old gold value, PAN and cash rules, access control for each role (a karigar cannot read other karigars, stock, alerts or old gold; a clerk cannot read the stock statement), the receipt cap (within balance, over, and exactly equal), Indian-time date conversion, and the master (finance only, validation, and past jobs keeping their allowance after a master change).

## Security

- Passwords hashed with bcrypt. Login tokens expire after 8 hours. Login attempts are rate limited.
- Every route checks the role on the server. The screens only hide what the server already refuses.
- All inputs are validated on the server: weights, purity, rates, PAN format, bill numbers, names and categories. Database queries use prepared statements, and the frontend escapes everything it renders.
- Security headers are set on every response. No secrets are in the repository: `.env` is git-ignored and `.env.example` holds names only.
- All demo data is fictional. PAN is shown masked in lists.

## Stack

Node.js, Express, SQLite (`node:sqlite`), vanilla JavaScript, JWT with bcrypt, `node --test`. Deployed on Render as a single web service. See `deployment.md` for deployment details.

## Assumptions

- The vault opens with 20.000 kg of fine gold.
- Allowed wastage is the agreed % for the item category applied to the fine gold issued for that job, using the % in force on the day of issue.
- Excess loss is judged only when a receipt closes the job.
- A karigar cannot return more fine gold than was issued for the job.
- Finished pieces leave the vault flow once received. Scrap, filings and old gold bought go into the vault.
- A drift alert needs at least four closed jobs, and the latest loss must be more than 1.5 times the karigar's earlier average and above 0.2% of the gold issued.
- PAN is required for old-gold purchases of ₹50,000 or more, and cash payment above ₹2,00,000 is blocked. Both limits are assumed and kept as constants in `server/oldgold.js`.
- The old-gold rate defaults to ₹12,500 per gram, from the brief, and can be changed per purchase.
- Dates are shown in Indian Standard Time. The database stores UTC.
- The Tamil text is a machine draft and needs a native speaker's review.

## Known limits

Not built: offline drafts for power and network cuts on shared tablets, the refiner send and return flow (the refiner figure is fixed at 0), reading the karat-meter printout, HUID and net-weight fields on receipts, corrections or reversals of saved entries (entries are append-only), a separate managing-partner role, alerts delivered by message (they appear on the finance screen only), and a Tally XML voucher format (the export is CSV).

Other limits: the photo reader needs an external vision model and is off in the live demo, so its end-to-end behaviour is untested against a real model, and the mismatch block has no automated test yet. The live database resets on every restart. PAN is stored in plain text and should be encrypted for real use. The login rate limit is held in memory. There is no password reset or user management screen.