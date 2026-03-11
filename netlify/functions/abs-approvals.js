// netlify/functions/abs-approvals.js
// ABS Building Approvals — Total dwellings, Western Australia, monthly
// New API base: https://data.api.abs.gov.au/rest/data/
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error("Redirect with no Location"));
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error("Invalid JSON")); } });
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // ABS_BA = Building Approvals
    // Key: measure=1 (number), type_of_building=10 (total), state=5 (WA), freq=M
    const url = "https://data.api.abs.gov.au/rest/data/ABS,ABS_BA/1.10.5.M?startPeriod=2023-01&format=jsondata&detail=dataonly";
    const json = await httpGet(url);

    const obs = json?.data?.dataSets?.[0]?.observations;
    if (!obs) throw new Error("No observations returned");

    const vals = Object.entries(obs)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([, v]) => v[0])
      .filter(v => v != null && v > 0);

    if (vals.length < 2) throw new Error("Not enough data points");

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
