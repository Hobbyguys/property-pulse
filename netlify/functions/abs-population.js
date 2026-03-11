// netlify/functions/abs-population.js
// ABS ERP_Q — WA Estimated Resident Population, quarterly % change (YoY)
// Confirmed: ERP_Q returns 200. Using CSV format.
// From debug output series like "0:1:4:3:0" had value 1.46 (a % growth rate ~= WA annual)
// Safest approach: get all data, filter for WA state-level percentage change series
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "text/csv, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // Request last 8 quarters, all series, CSV
    const url = "https://data.api.abs.gov.au/rest/data/ABS,ERP_Q/all?lastNObservations=8&format=csv&detail=dataonly";
    const csv = await httpGet(url);

    const lines = csv.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) throw new Error("Empty CSV from ERP_Q");

    const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
    });

    // Filter: WA state = 5WA or similar, MEASURE = percentage change YoY
    // From debug JSON data: "0:1:4:3:0" = {1.46, 1.93} — looks like WA annual growth %
    // ERP_Q dimensions (from structure 200 response): MEASURE, REGION_TYPE, REGION, TSEST, FREQ
    // Try REGION containing "5" (WA state code) and MEASURE=0 (% change) or MEASURE with small values
    const waGrowthRows = rows.filter(r => {
      const region = r.REGION || "";
      const measure = r.MEASURE || "";
      // WA state-level: region code "5" for state total
      return region === "5" && measure === "0";
    });

    if (waGrowthRows.length === 0) {
      // Fallback: find WA ERP count and compute YoY ourselves
      const waErpRows = rows.filter(r => (r.REGION || "") === "5" && (r.MEASURE || "") === "1");
      if (waErpRows.length >= 5) {
        waErpRows.sort((a, b) => (a.TIME_PERIOD || "").localeCompare(b.TIME_PERIOD || ""));
        const vals = waErpRows.map(r => parseFloat(r.OBS_VALUE)).filter(v => !isNaN(v) && v > 0);
        const latest = vals[vals.length - 1];
        const yearAgo = vals[vals.length - 5];
        const growth = ((latest - yearAgo) / yearAgo) * 100;
        const prev = vals.length >= 6 ? ((vals[vals.length - 2] - vals[vals.length - 6]) / vals[vals.length - 6]) * 100 : growth;
        return { statusCode: 200, headers: CORS, body: JSON.stringify({
          value: `+${growth.toFixed(1)}%`, change: parseFloat((growth - prev).toFixed(2)),
          trend: vals.slice(-8).map((v, i, a) => i >= 4 ? parseFloat((((v - a[i-4]) / a[i-4]) * 100).toFixed(2)) : null).filter(v => v !== null).slice(-6),
          unit: "%", status: growth >= 1.5 ? "green" : growth >= 0.5 ? "amber" : "red",
          statusLabel: growth >= 1.5 ? "Strong Growth" : growth >= 0.5 ? "Moderate" : "Slowing",
        })};
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({
        error: `No WA rows found. Columns: ${headers.join(",")}. Sample: ${JSON.stringify(rows.slice(0,2))}`
      })};
    }

    waGrowthRows.sort((a, b) => (a.TIME_PERIOD || "").localeCompare(b.TIME_PERIOD || ""));
    const vals = waGrowthRows.map(r => parseFloat(r.OBS_VALUE)).filter(v => !isNaN(v));
    const latest = vals[vals.length - 1];
    const prev   = vals[vals.length - 2] ?? latest;

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `+${latest.toFixed(1)}%`,
      change: parseFloat((latest - prev).toFixed(2)),
      trend: vals.slice(-6),
      unit: "%",
      status: latest >= 1.5 ? "green" : latest >= 0.5 ? "amber" : "red",
      statusLabel: latest >= 1.5 ? "Strong Growth" : latest >= 0.5 ? "Moderate" : "Slowing",
    })};
  } catch (err) {
    console.error("abs-population:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
