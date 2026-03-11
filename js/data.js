/* ============================================================
   data.js — Indicator config + fetchers via Netlify Functions
   ============================================================
   Each live indicator calls /.netlify/functions/* which proxies
   the external API server-side — no CORS issues in the browser.

   Locked indicators show a "TO BE SUBSCRIBED" placeholder.
   When you subscribe, set locked: false and add a fetcher.
   ============================================================ */

const INDICATORS = [

  /* ── 1. VACANCY RATE — SQM Research (locked) ── */
  {
    id: "vacancy",
    label: "Vacancy Rate",
    icon: "🏠",
    source: "SQM Research",
    note: "Below 2% = landlord's market. Subscribe to SQM Research to unlock live data.",
    locked: true,
    fetcher: null,
  },

  /* ── 2. POPULATION GROWTH — ABS (live) ── */
  {
    id: "population",
    label: "Population Growth",
    icon: "👥",
    source: "ABS",
    note: "Annual % change — Estimated Resident Population, Western Australia.",
    locked: false,
    fetcher: async function () {
      const res  = await fetch("/.netlify/functions/abs-population");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  },

  /* ── 3. BUILDING APPROVALS — ABS (live) ── */
  {
    id: "approvals",
    label: "Building Approvals",
    icon: "🏗️",
    source: "ABS",
    note: "Monthly new dwelling approvals — Western Australia.",
    locked: false,
    fetcher: async function () {
      const res  = await fetch("/.netlify/functions/abs-approvals");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  },

  /* ── 4. RENTAL GROWTH — Domain/REA (locked) ── */
  {
    id: "rental",
    label: "Rental Growth",
    icon: "📈",
    source: "Domain / REA",
    note: "Annual YoY rental price growth. Requires Domain API or REA enterprise access to unlock.",
    locked: true,
    fetcher: null,
  },

  /* ── 5. DAYS ON MARKET — Property Portals (locked) ── */
  {
    id: "dom",
    label: "Days on Market",
    icon: "📅",
    source: "CoreLogic / PropTrack",
    note: "Median days on market — Perth metro. Requires CoreLogic or PropTrack licence to unlock.",
    locked: true,
    fetcher: null,
  },

  /* ── 6. COMMODITY OUTLOOK — Metal Price API (live) ── */
  {
    id: "commodity",
    label: "Commodity Outlook",
    icon: "⛏️",
    source: "Metal Price API",
    note: "Gold, Silver &amp; AUD/USD — key indicators for WA resource sector confidence.",
    locked: false,
    fetcher: async function () {
      const res  = await fetch("/.netlify/functions/imf-commodity");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  },

];
