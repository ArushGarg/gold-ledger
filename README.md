# Gold Ledger

A fine-gold ledger for a jewellery workshop. It records gold issued to karigars (goldsmiths), what comes back as finished pieces, scrap and filings, and shows on any day where every gram is.

Built for the Company A (Coimbatore) brief: 5 showrooms, about 40 karigars, and roughly ₹1.25 crore a year lost to unexplained gold loss and manual month-end reconciliation.

**Live app:** _add link after deployment_

## What it does

- **Exact fine-gold maths.** Weights are stored as integer milligrams and purity as basis points (91.60% is stored as 9160), so there is no floating-point drift. The sample rows from the brief reproduce exactly: 120.000 g at 91.60% gives 109.920 g fine, and the balance after the necklace and scrap receipts is 3.893 g.
- **Karigar master** with agreed wastage % per item category (necklace, ring, bangle).
- **Issue entry** with gross weight, purity, fine weight and job number. The server checks the vault has enough gold.
- **Receipt entry** for finished pieces, scrap and filings, with allowed vs actual wastage worked out per job. A receipt can close a job, and closed jobs accept no further entries.
- **Running balance** per karigar and per job.
- **Stock statement** (finance only): gold in vault, with karigars, finished pieces, agreed allowance used, beyond allowance, and at refiner. A badge confirms every gram is accounted for, and the figures reconcile to the opening stock.
- **Loss alerts** (finance only): a job closed above its allowance, and a karigar whose latest loss rises above their own earlier average. They are worded as items to review, never as accusations.
- **Tally export:** the stock statement and all entries as a CSV file.
- **Scale photo reading (optional AI).** The photo appears beside the reading for the clerk to confirm. If the typed weight differs from the photo reading, saving is blocked. If the reader is unsure or not configured, the clerk types the weight.
- **Roles:** issue clerk and finance head. Stock figures and alerts are finance only.
- **Inputs validated** on the server: weights to 3 decimals, purity to 2, job numbers, categories and ownership of jobs.

## Run locally

Requires **Node.js 22.13 or newer** (it uses the built-in `node:sqlite`, so there is nothing native to compile). Tested on Node 24.

```bash
git clone https://github.com/ArushGarg/gold-ledger.git
cd gold-ledger
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Open `.env` and set `JWT_SECRET` to a long random text. Then:

```bash
npm test
npm start
```

Open http://localhost:3000. The database file `ledger.db` and the demo data are created on first start. To reset the data, stop the server, delete `ledger.db`, and start again.

## Demo logins (seed data only)

| Role | Email | Password |
|---|---|---|
| Finance head | finance@demo.com | demo1234 |
| Issue clerk | clerk@demo.com | demo1234 |

## What the seed data shows

| Karigar | Story |
|---|---|
| Murugesan S | The sample rows from the brief (TX-30411, TX-30437, TX-30438). Open job J-1001 with a balance of 3.893 g. |
| Selvam K | Four steady jobs, then a higher-loss job that stays within allowance. Triggers the drift alert. |
| Ravi P | One normal job and one closed above allowance. Triggers the over-allowance alert. |
| Karthik M | Clean history, no alerts. |

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

If the three `AI_` variables are empty, the photo reader reports that it is unsure and the clerk types the weight.

## Project structure

```
server/fine.js     Exact gold maths: milligrams, basis points, wastage, drift
server/index.js    Express API, auth, roles, validation, stock statement, alerts, CSV
server/seed.js     Demo users, karigars and history
public/index.html  Single-page frontend (no build step)
test/              Unit tests for the maths and alert rules
```

## Tests

```bash
npm test
```

Covers the brief's sample rows, the allowed-wastage figure, input rejection (4 decimals, bad purity), excess loss only on closed jobs, and drift detection.

## Stack

Node.js, Express, SQLite (`node:sqlite`), vanilla JavaScript, JWT with bcrypt, `node --test`.

## Assumptions

- Allowed wastage is the agreed % for the item category applied to the fine gold issued for that job.
- Excess loss is judged only when a receipt closes the job.
- The vault opens with 20.000 kg of fine gold.
- Finished pieces leave the vault flow once received. Scrap and filings return to the vault.
- A drift alert needs at least four closed jobs, and the latest loss must be more than 1.5 times the karigar's earlier average.

## Known limits

Not built yet: the old gold desk (with PAN and payment mode capture), the Tamil karigar view for slips and balances, offline drafts for power and network cuts, and the refiner send and return flow (the refiner figure is fixed at 0). Photo reading needs an external vision model and is off in the demo unless configured. Login attempts are rate limited, but there is no password reset or user management screen.
