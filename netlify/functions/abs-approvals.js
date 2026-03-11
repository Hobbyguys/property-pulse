// netlify/functions/abs-approvals.js
// ABS RES_DWELL — Residential Dwellings approved, WA (Perth + Rest of WA), quarterly
// Confirmed working dataflow. WA regions: 5GPER (Perth) + 5RWAU (Rest of WA)
// Measure 1 = total dwellings approved, FREQ = Q (quarterly)
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
    // Fetch last 8 quarters for WA — both Perth (5GPER) and Rest of WA (5RWAU), measure 1
    const url = "https://data.api.abs.gov.au/rest/data/ABS,RES_DWELL/1.5GPER+5RWAU.Q?lastNObservations=8&format=csv&detail=dataonly";
    const csv = await httpGet(url);

    const lines = csv.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) throw new Error("Empty CSV from RES_DWELL");

    const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
    });

    // Group by TIME_PERIOD and sum Perth + Rest of WA
    const byPeriod = {};
    for (const row of rows) {
      const period = row.TIME_PERIOD;
      const val = parseFloat(row.OBS_VALUE);
      if (!isNaN(val)) {
        byPeriod[period] = (byPeriod[period] || 0) + val;
      }
    }

    const periods = Object.keys(byPeriod).sort();
    if (periods.length < 2) throw new Error(`Not enough periods. Found: ${periods.length}`);

    const vals = periods.map(p => Math.round(byPeriod[p]));
    const latest = vals[vals.length - 1];
    const prev   = vals[vals.length - 2];
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: latest.toLocaleString(),
      change,
      trend: vals.slice(-6),
      unit: "dwellings/qtr WA",
      status: latest >= 7000 ? "green" : latest >= 5000 ? "amber" : "red",
      statusLabel: change >= 0 ? "Rising Supply" : "Declining Supply",
    })};
  } catch (err) {
    console.error("abs-approvals:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
