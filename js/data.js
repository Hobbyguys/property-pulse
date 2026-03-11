/* ============================================================
   data.js — Indicator config + fetchers via CORS proxy
   ============================================================
   Uses corsproxy.io to bypass browser CORS restrictions when
   calling ABS and IMF APIs directly from a static Netlify site.

   Format: https://corsproxy.io/?url=<encoded-target-url>

   Locked indicators show a "TO BE SUBSCRIBED" placeholder.
   When you subscribe, set locked: false and add a fetcher.
   ============================================================ */

const PROXY = "https://corsproxy.io/?url=";

function proxied(url) {
  return PROXY + encodeURIComponent(url);
}

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
      const url =
        "https://api.data.abs.gov.au/data/ABS/ERP_ASGS2016/1.5.3.A" +
        "?startPeriod=2017&detail=dataonly&format=jsondata";

      const res  = await fetch(proxied(url));
      if (!res.ok) throw new Error(`ABS ERP HTTP ${res.status}`);
      const json = await res.json();

      const obs = json?.data?.dataSets?.[0]?.observations;
      if (!obs) throw new Error("ABS ERP: no observations in response");

      const vals = Object.entries(obs)
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([, v]) => v[0])
        .filter(v => v != null && v > 0);

      if (vals.length < 2) throw new Error("ABS ERP: not enough data points");

      // Annual growth rates between consecutive yearly values
      const rates = [];
      for (let i = 1; i < vals.length; i++) {
        rates.push(parseFloat((((vals[i] - vals[i - 1]) / vals[i - 1]) * 100).toFixed(2)));
      }

      const latest = rates[rates.length - 1];
      const prev   = rates[rates.length - 2] ?? latest;

      return {
        value:       `+${latest.toFixed(1)}%`,
        change:      parseFloat((latest - prev).toFixed(2)),
        trend:       rates.slice(-6),
        unit:        "%",
        status:      latest >= 1.5 ? "green" : latest >= 0.5 ? "amber" : "red",
        statusLabel: latest >= 1.5 ? "Strong Growth" : latest >= 0.5 ? "Moderate" : "Slowing",
      };
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
      const url =
        "https://api.data.abs.gov.au/data/ABS/ABS_BA/1.5.1.M" +
        "?startPeriod=2023-01&detail=dataonly&format=jsondata";

      const res  = await fetch(proxied(url));
      if (!res.ok) throw new Error(`ABS BA HTTP ${res.status}`);
      const json = await res.json();

      const obs = json?.data?.dataSets?.[0]?.observations;
      if (!obs) throw new Error("ABS BA: no observations in response");

      const vals = Object.entries(obs)
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([, v]) => v[0])
        .filter(v => v != null && v > 0);

      if (vals.length < 2) throw new Error("ABS BA: not enough data points");

      const latest = Math.round(vals[vals.length - 1]);
      const prev   = Math.round(vals[vals.length - 2]);
      const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));

      return {
        value:       latest.toLocaleString(),
        change,
        trend:       vals.slice(-6).map(v => Math.round(v)),
        unit:        "dwellings/mo",
        status:      latest >= 2000 ? "green" : latest >= 1400 ? "amber" : "red",
        statusLabel: change >= 0 ? "Rising Supply" : "Declining Supply",
      };
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

  /* ── 6. COMMODITY OUTLOOK — IMF (live) ── */
  {
    id: "commodity",
    label: "Commodity Outlook",
    icon: "⛏️",
    source: "IMF Commodity Prices",
    note: "Iron ore price index (USD/t) — key indicator for WA resource sector confidence.",
    locked: false,
    fetcher: async function () {
      const url = "https://www.imf.org/external/datamapper/api/v1/PIORECR?periods=10";

      const res  = await fetch(proxied(url));
      if (!res.ok) throw new Error(`IMF HTTP ${res.status}`);
      const json = await res.json();

      // Shape: { values: { PIORECR: { WLD: { "2015": 55.7, ... } } } }
      const series = json?.values?.PIORECR?.WLD;
      if (!series) throw new Error("IMF: unexpected response shape");

      const vals = Object.keys(series).sort().map(y => series[y]).filter(v => v != null);
      if (vals.length < 2) throw new Error("IMF: not enough data points");

      const latest = vals[vals.length - 1];
      const prev   = vals[vals.length - 2];
      const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));
      const status = latest >= 120 ? "green" : latest >= 90 ? "amber" : "red";

      return {
        value:       `$${latest.toFixed(0)}`,
        change,
        trend:       vals.slice(-6).map(v => parseFloat(v.toFixed(1))),
        unit:        "USD/t iron ore",
        status,
        statusLabel: status === "green" ? "Strong Demand" : status === "amber" ? "Moderate" : "Weak Demand",
      };
    },
  },

];
