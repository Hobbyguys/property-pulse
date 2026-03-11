// netlify/functions/imf-commodity.js
// Iron ore price via FRED (St. Louis Fed) — free, no API key, mirrors IMF PIORECRUSDM series
// Series: PIORECRUSDM = Global price of Iron Ore, USD per metric ton, monthly
// IMF blocks Netlify IPs directly; FRED does not.
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
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error("Invalid JSON: " + data.slice(0,100))); }});
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // FRED public API — no key required for this endpoint
    // Returns last 12 monthly observations of iron ore price (USD/metric ton)
    const url = "https://fred.stlouisfed.org/graph/fredgraph.json?id=PIORECRUSDM&vintage_date=&realtime_start=&realtime_end=&limit=12&sort_order=asc";
    const json = await httpGet(url);

    // FRED fredgraph.json returns: { "observations": [{ "date": "2024-01-01", "value": "123.45" }, ...] }
    // or sometimes just an array directly depending on endpoint used
    // Use the observations array
    let obs = json.observations || json;
    if (!Array.isArray(obs) || obs.length === 0) throw new Error("Unexpected FRED shape: " + JSON.stringify(json).slice(0, 200));

    const valid = obs
      .filter(o => o.value && o.value !== "." && !isNaN(parseFloat(o.value)))
      .map(o => ({ date: o.date, value: parseFloat(o.value) }));

    if (valid.length < 2) throw new Error(`Not enough valid FRED observations. Got ${obs.length} total.`);

    const latest = valid[valid.length - 1].value;
    const prev   = valid[valid.length - 2].value;
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));
    const trend  = valid.slice(-6).map(o => parseFloat(o.value.toFixed(1)));

    // Iron ore benchmarks (USD/t): >120 = strong WA export conditions, >90 = moderate, <90 = weak
    const status = latest >= 120 ? "green" : latest >= 90 ? "amber" : "red";

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `$${latest.toFixed(0)}`,
      change,
      trend,
      unit: "USD/t iron ore",
      status,
      statusLabel: status === "green" ? "Strong Demand" : status === "amber" ? "Moderate" : "Weak Demand",
    })};
  } catch (err) {
    console.error("imf-commodity:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
