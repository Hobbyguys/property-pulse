// netlify/functions/abs-approvals.js
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
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        if (!location) return reject(new Error("Redirect with no location header"));
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
    const url = "https://api.data.abs.gov.au/data/ABS/ABS_BA/1.5.1.M?startPeriod=2023-01&detail=dataonly&format=jsondata";
    const json = await httpGet(url);
    const obs = json?.data?.dataSets?.[0]?.observations;
    if (!obs) throw new Error("No observations in response");
    const vals = Object.entries(obs)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([, v]) => v[0]).filter(v => v != null && v > 0);
    if (vals.length < 2) throw new Error("Not enough data points");
    const latest = Math.round(vals[vals.length - 1]);
    const prev   = Math.round(vals[vals.length - 2]);
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));
    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: latest.toLocaleString(), change,
      trend: vals.slice(-6).map(v => Math.round(v)), unit: "dwellings/mo",
      status: latest >= 2000 ? "green" : latest >= 1400 ? "amber" : "red",
      statusLabel: change >= 0 ? "Rising Supply" : "Declining Supply",
    })};
  } catch (err) {
    console.error("abs-approvals:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
