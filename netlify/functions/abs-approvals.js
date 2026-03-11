// netlify/functions/abs-approvals.js
// ABS RES_DWELL — WA residential dwellings approved (Perth + Rest of WA), quarterly
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
    const url = "https://data.api.abs.gov.au/rest/data/ABS,RES_DWELL/1.5GPER+5RWAU.Q?lastNObservations=8&format=csv&detail=dataonly";
    const csv = await httpGet(url);
    const lines = csv.trim().split("\n").filter(l => l.trim());
    const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
    });

    // Sum Perth + Rest of WA per quarter
    const byPeriod = {};
    for (const row of rows) {
      const val = parseFloat(row.OBS_VALUE);
      if (!isNaN(val)) byPeriod[row.TIME_PERIOD] = (byPeriod[row.TIME_PERIOD] || 0) + val;
    }

    const periods = Object.keys(byPeriod).sort();
    if (periods.length < 2) throw new Error("Not enough periods");

    const vals = periods.map(p => Math.round(byPeriod[p]));
    const latest = vals[vals.length - 1];
    const prev   = vals[vals.length - 2];
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));

    // WA quarterly benchmarks: >9000 = strong, >6500 = moderate, <6500 = low
    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: latest.toLocaleString(),
      change,
      trend: vals.slice(-6),
      unit: "dwellings/qtr WA",
      status: latest >= 9000 ? "green" : latest >= 6500 ? "amber" : "red",
      statusLabel: change >= 0 ? "Rising Supply" : "Declining Supply",
    })};
  } catch (err) {
    console.error("abs-approvals:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
