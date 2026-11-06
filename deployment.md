# Deployment

Live app: https://gold-ledger-xkhc.onrender.com/
Repository: https://github.com/ArushGarg/gold-ledger

## Run locally

Requires Node.js 22.13 or newer. It uses the built-in `node:sqlite`, so nothing native has to be compiled.

```bash
git clone https://github.com/ArushGarg/gold-ledger.git
cd gold-ledger
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env and set JWT_SECRET to a long random text
npm test
npm start
```

Open http://localhost:3000. On first start the database `ledger.db` is created and filled with demo data. To reset the data, stop the server, delete `ledger.db`, and start again.

## How it is deployed

Hosted as a single Node web service on Render, deployed from the `main` branch of the public GitHub repository.

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/api/health` |

The server serves both the API and the static frontend, so there is one service and one URL.

## Environment variables (names only)

| Name | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | Yes | Signs login tokens. Set a long random value on the host. |
| `NODE_VERSION` | On Render | Set to `24` so the host uses a Node version with `node:sqlite`. |
| `PORT` | No | Provided by the host. Defaults to 3000 locally. |
| `DB_FILE` | No | SQLite file path. Defaults to `ledger.db`. |
| `DEMO_PASSWORD` | No | Password for the seeded demo users. Defaults to the one below. |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | No | Enable scale photo reading through an OpenAI-compatible vision API. Left empty in the demo, so the reader says it is unsure and the clerk types the weight. |

## Demo logins (seed data only)

| Role | Email | Password | Where |
|---|---|---|---|
| Finance head | finance@demo.com | demo1234 | `/` |
| Issue clerk | clerk@demo.com | demo1234 | `/` |
| Karigar (Murugesan S) | karigar1@demo.com | demo1234 | `/karigar.html` |
| Karigar (Selvam K) | karigar2@demo.com | demo1234 | `/karigar.html` |

## Things a reviewer should know

- **The demo database resets.** The host's free tier keeps its filesystem temporary, so the database is rebuilt from the seed data whenever the service restarts or wakes from sleep. Entries you add are lost then. For real use, the database must sit on a persistent volume.
- **First load can be slow.** A free service that has been idle needs up to a minute to wake up.
- **Photo reading is off in the demo.** No API key is set, so the reader reports that it is unsure and the weight is typed by hand. The mismatch block (typed weight differs from the photo reading) is covered by the server code and works whenever a reading is present.
- Demo passwords are for seeded sample data only. No real personal data is stored.