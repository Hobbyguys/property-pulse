// netlify/functions/imf-commodity.js
// Iron ore price via stooq.com — free CSV, no API key, no auth
// Ticker: IRONORE (iron ore 62% Fe CFR China, USD/t) — stooq serves this as CSV
// Also try FMG.AX (Fortescue) as proxy if commodity ticker fails
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "text/csv,text/plain,*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://stooq.com/",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error(`Redirect no Location`));
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

function parseStooqCSV(csv) {
  const lines = csv.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return null;
  // Format: Date,Open,High,Low,Close,Volume
  const rows = lines.slice(1).map(l => {
    const [date, open, high, low, close] = l.split(",");
    return { date: date?.trim(), close: parseFloat(close) };
  }).filter(r => r.date && !isNaN(r.close) && r.close > 0);
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // Stooq monthly CSV for iron ore — last 12 months
    // Try the iron ore commodity ticker first, FMG.AX as fallback
    const tickers = [
      { sym: "ironore", label: "USD/t iron ore", scale: 1 },
      { sym: "fmg.au",  label: "AUD FMG proxy",  scale: 1 },
    ];

    let rows = null;
    let usedLabel = "";

    for (const { sym, label, scale } of tickers) {
      try {
        const url = `https://stooq.com/q/d/l/?s=${sym}&i=m`;
        const r = await httpGet(url);
        if (r.status === 200 && r.body.includes(",")) {
          rows = parseStooqCSV(r.body);
          if (rows && rows.length >= 2) {
            usedLabel = label;
            if (scale !== 1) rows = rows.map(r => ({ ...r, close: r.close * scale }));
            break;
          }
        }
      } catch(e) { /* try next */ }
    }

    if (!rows || rows.length < 2) {
      throw new Error("No usable stooq data");
    }

    const vals = rows.slice(-12).map(r => parseFloat(r.close.toFixed(1)));
    const latest = vals[vals.length - 1];
    const prev   = vals[vals.length - 2];
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));
    const latestDate = rows[rows.length - 1].date;

    const status = latest >= 120 ? "green" : latest >= 90 ? "amber" : "red";

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `$${latest.toFixed(0)}`,
      change,
      trend: vals.slice(-6),
      unit: usedLabel,
      status,
      statusLabel: status === "green" ? "Strong Demand" : status === "amber" ? "Moderate" : "Weak Demand",
      note: `As of ${latestDate}`,
    })};
  } catch (err) {
    console.error("imf-commodity:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
