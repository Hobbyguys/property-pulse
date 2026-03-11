// netlify/functions/imf-commodity.js
// IMF Primary Commodity Prices — Iron Ore (PIORECR, USD per dry metric ton)
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
    const url = "https://www.imf.org/external/datamapper/api/v1/PIORECR?periods=10";
    const json = await httpGet(url);

    const series = json?.values?.PIORECR?.WLD;
    if (!series) throw new Error("Unexpected IMF response shape");

    const vals = Object.keys(series).sort().map(y => series[y]).filter(v => v != null);
    if (vals.length < 2) throw new Error("Not enough data points");

    const latest = vals[vals.length - 1];
    const prev   = vals[vals.length - 2];
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));
    const status = latest >= 120 ? "green" : latest >= 90 ? "amber" : "red";

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `$${latest.toFixed(0)}`,
      change,
      trend: vals.slice(-6).map(v => parseFloat(v.toFixed(1))),
      unit: "USD/t iron ore",
      status,
      statusLabel: status === "green" ? "Strong Demand" : status === "amber" ? "Moderate" : "Weak Demand",
    })};
  } catch (err) {
    console.error("imf-commodity:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
