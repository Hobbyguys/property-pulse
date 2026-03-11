// netlify/functions/abs-population.js
const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-AU,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; PropertyPulse/1.0)",
        "Referer": "https://www.abs.gov.au/",
      }
    };
    https.get(url, options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 403) return reject(new Error("ABS returned 403 — try again later"));
        if (res.statusCode !== 200) return reject(new Error(`ABS HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON from ABS")); }
      });
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    const url = "https://api.data.abs.gov.au/data/ABS/ERP_ASGS2016/1.5.3.A?startPeriod=2017&detail=dataonly&format=jsondata";
    const json = await httpsGet(url);
    const obs = json?.data?.dataSets?.[0]?.observations;
    if (!obs) throw new Error("No observations in ABS ERP response");
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
