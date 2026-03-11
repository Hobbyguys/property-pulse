// netlify/functions/imf-commodity.js
// Iron ore price — World Bank Open Data API (no key required)
// Indicator: PIORECR (IMF Primary Commodity: Iron Ore, USD per dry metric ton)
// World Bank mirrors this as: https://api.worldbank.org/v2/country/WLD/indicator/PIORECR
// Fallback: use annual data if monthly unavailable
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "application/json, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error(`Redirect ${res.statusCode} no Location`));
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error("Invalid JSON: " + data.slice(0, 100))); }});
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // World Bank Data API — free, no key, returns JSON
    // mrv=12 = most recent 12 values, per_page=12, format=json
    const url = "https://api.worldbank.org/v2/country/WLD/indicator/PIORECR?format=json&mrv=12&per_page=12";
    const json = await httpGet(url);

    // Response shape: [ { page, pages, ... }, [ { date, value, ... }, ... ] ]
    if (!Array.isArray(json) || json.length < 2) throw new Error("Unexpected WB shape: " + JSON.stringify(json).slice(0, 200));
    
    const records = json[1]
      .filter(r => r.value !== null && r.value !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (records.length < 2) throw new Error(`Not enough WB records. Got: ${json[1]?.length}`);

    const vals = records.map(r => parseFloat(r.value));
    const latest = vals[vals.length - 1];
    const prev   = vals[vals.length - 2];
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));
    const latestDate = records[records.length - 1].date;

    const status = latest >= 120 ? "green" : latest >= 90 ? "amber" : "red";

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `$${latest.toFixed(0)}`,
      change,
      trend: vals.slice(-6).map(v => parseFloat(v.toFixed(1))),
      unit: "USD/t iron ore",
      status,
      statusLabel: status === "green" ? "Strong Demand" : status === "amber" ? "Moderate" : "Weak Demand",
      note: `As of ${latestDate}`,
    })};
  } catch (err) {
    console.error("imf-commodity:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
