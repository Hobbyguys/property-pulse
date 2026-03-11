// netlify/functions/abs-approvals.js
// ABS BA — Building Approvals, WA, monthly total dwellings
// Dataflow: BA (confirmed from ABS docs)
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "text/csv",
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

function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // BA dataflow, WA = state 5, measure 1 = total dwellings, monthly
    const url = "https://data.api.abs.gov.au/rest/data/ABS,BA/all?startPeriod=2023-01&format=csv&detail=dataonly";
    const csv = await httpGet(url);
    const rows = parseCSV(csv);

    // Filter to WA total dwellings (measure 1, region 5, no sub-type)
    const waRows = rows.filter(r => {
      const region  = r.REGION || r.STATE || "";
      const measure = r.MEASURE || "";
      return region === "5" && (measure === "1" || measure === "10");
    });

    if (waRows.length < 2) {
      // Return diagnostic info
      return { statusCode: 200, headers: CORS, body: JSON.stringify({
        error: `WA rows found: ${waRows.length}. Sample headers: ${JSON.stringify(rows[0])}`,
      })};
    }

    waRows.sort((a, b) => (a.TIME_PERIOD || "").localeCompare(b.TIME_PERIOD || ""));
    const vals = waRows.map(r => parseFloat(r.OBS_VALUE)).filter(v => !isNaN(v) && v > 0);

    const latest = Math.round(vals[vals.length - 1]);
    const prev   = Math.round(vals[vals.length - 2]);
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: latest.toLocaleString(),
      change,
      trend: vals.slice(-6).map(v => Math.round(v)),
      unit: "dwellings/mo",
      status: latest >= 2000 ? "green" : latest >= 1400 ? "amber" : "red",
      statusLabel: change >= 0 ? "Rising Supply" : "Declining Supply",
    })};
  } catch (err) {
    console.error("abs-approvals:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
