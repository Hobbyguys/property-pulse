// netlify/functions/abs-approvals.js
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
    const url = "https://api.data.abs.gov.au/data/ABS/ABS_BA/1.5.1.M?startPeriod=2023-01&detail=dataonly&format=jsondata";
    const json = await httpsGet(url);
    const obs = json?.data?.dataSets?.[0]?.observations;
    if (!obs) throw new Error("No observations in ABS BA response");
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
