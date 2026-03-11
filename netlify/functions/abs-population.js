// netlify/functions/abs-population.js
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "Accept": "application/json, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.abs.gov.au/",
      }
    }, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        if (!location) return reject(new Error("Redirect with no location header"));
        // Resolve relative redirects
        const next = location.startsWith("http") ? location : new URL(location, url).href;
        return httpGet(next, depth + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON")); }
      });
    });
    req.on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    const url = "https://api.data.abs.gov.au/data/ABS/ERP_ASGS2016/1.5.3.A?startPeriod=2017&detail=dataonly&format=jsondata";
    const json = await httpGet(url);
    const obs = json?.data?.dataSets?.[0]?.observations;
    if (!obs) throw new Error("No observations in response");
    const vals = Object.entries(obs)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([, v]) => v[0]).filter(v => v != null && v > 0);
    if (vals.length < 2) throw new Error("Not enough data points");
    const rates = [];
    for (let i = 1; i < vals.length; i++) {
      rates.push(parseFloat((((vals[i] - vals[i-1]) / vals[i-1]) * 100).toFixed(2)));
    }
    const latest = rates[rates.length - 1];
    const prev   = rates[rates.length - 2] ?? latest;
    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `+${latest.toFixed(1)}%`, change: parseFloat((latest - prev).toFixed(2)),
      trend: rates.slice(-6), unit: "%",
      status: latest >= 1.5 ? "green" : latest >= 0.5 ? "amber" : "red",
      statusLabel: latest >= 1.5 ? "Strong Growth" : latest >= 0.5 ? "Moderate" : "Slowing",
    })};
  } catch (err) {
    console.error("abs-population:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
