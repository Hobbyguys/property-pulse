// netlify/functions/abs-population.js
// ABS Estimated Resident Population — Western Australia (state 5), annual
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
    // ERP_Q = National, State & Territory Population (quarterly)
    // Key: measure=1 (ERP), region=5 (WA), sex=3 (persons), age=TT (all ages), freq=Q
    const url = "https://data.api.abs.gov.au/rest/data/ABS,ERP_Q/1.5.3.TT.Q?startPeriod=2020&format=jsondata&detail=dataonly";
    const json = await httpGet(url);

    const obs = json?.data?.dataSets?.[0]?.observations;
    if (!obs) throw new Error("No observations returned");

    const vals = Object.entries(obs)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([, v]) => v[0])
      .filter(v => v != null && v > 0);

    if (vals.length < 5) throw new Error("Not enough data points");

    // Compare latest quarter vs same quarter last year for YoY growth
    const latest = vals[vals.length - 1];
    const yearAgo = vals[vals.length - 5]; // ~4 quarters back
    const growth = ((latest - yearAgo) / yearAgo) * 100;
    const prevGrowth = ((vals[vals.length - 2] - vals[vals.length - 6]) / vals[vals.length - 6]) * 100;

    // Build a 6-point trend of YoY growth rates
    const trend = [];
    for (let i = vals.length - 6; i < vals.length; i++) {
      if (i >= 4) trend.push(parseFloat((((vals[i] - vals[i-4]) / vals[i-4]) * 100).toFixed(2)));
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `+${growth.toFixed(1)}%`,
      change: parseFloat((growth - prevGrowth).toFixed(2)),
      trend: trend.slice(-6),
      unit: "%",
      status: growth >= 1.5 ? "green" : growth >= 0.5 ? "amber" : "red",
      statusLabel: growth >= 1.5 ? "Strong Growth" : growth >= 0.5 ? "Moderate" : "Slowing",
    })};
  } catch (err) {
    console.error("abs-population:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
