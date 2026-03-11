# Property Pulse — WA Market Dashboard

A lightweight static dashboard tracking Western Australia property market indicators.
No build step required — pure HTML, CSS, and vanilla JS.

## Live Data Sources (Free APIs)

| Indicator | Source | API |
|---|---|---|
| Population Growth | ABS | `api.data.abs.gov.au` |
| Building Approvals | ABS | `api.data.abs.gov.au` |
| Commodity Outlook | IMF | `imf.org/external/datamapper/api` |

## Locked Placeholders (Subscription Required)

| Indicator | Source | Notes |
|---|---|---|
| Vacancy Rate | SQM Research | `sqmresearch.com.au` — CSV export |
| Rental Growth | Domain / REA | `developer.domain.com.au` |
| Days on Market | CoreLogic / PropTrack | Enterprise licence |

---

## Deploy to Netlify (2 options)

### Option A — Drag & Drop (fastest)
1. Zip the entire `property-pulse/` folder
2. Go to [netlify.com/drop](https://netlify.com/drop)
3. Drag the zip onto the deploy area
4. Done — live in ~30 seconds

### Option B — GitHub + Netlify (recommended for ongoing updates)
1. Push this folder to a GitHub repo
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
3. Select your repo
4. Build settings:
   - **Build command**: *(leave blank — no build needed)*
   - **Publish directory**: `.` (or the folder name if it's a subdirectory)
5. Click **Deploy site**

Any push to your `main` branch will auto-redeploy.

---

## Adding Subscribed Data Later

When you subscribe to SQM, Domain, etc., update `js/data.js`:

1. Find the indicator with `locked: true`
2. Set `locked: false`
3. Add a `fetcher: async function() { ... }` that calls their API
4. Return `{ value, change, trend[], unit, status, statusLabel }`

---

## Project Structure

```
property-pulse/
├── index.html          # Main page
├── netlify.toml        # Netlify config
├── css/
│   └── style.css       # All styles
└── js/
    ├── data.js         # Indicator config + API fetchers
    └── app.js          # Render logic + tab switching
```
