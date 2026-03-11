// netlify/functions/imf-commodity.js
// Iron ore price via API Ninjas
// Current price: /v1/commodityprice?name=iron+ore
// Historical:    /v1/commoditypricehistorical?name=iron+ore&interval=1d
const https = require("https");

function apiNinjas(path, apiKey) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.api-ninjas.com${path}`, {
      headers: {
        "X-Api-Key": apiKey,
        "Accept": "application/json",
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch(e) { reject(new Error("Invalid JSON: " + data.slice(0, 100))); }
      });
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const API_KEY = process.env.API_NINJAS_KEY;
  if (!API_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "API_NINJAS_KEY not set" }) };

  try {
    // Fetch current price + last 30 daily closes for sparkline
    const [current, historical] = await Promise.all([
      apiNinjas("/v1/commodityprice?name=iron+ore", API_KEY),
      apiNinjas("/v1/commoditypricehistorical?name=iron+ore&interval=1d", API_KEY),
    ]);

    if (current.status !== 200) throw new Error(`Current price HTTP ${current.status}: ${JSON.stringify(current.json)}`);

    const item = Array.isArray(current.json) ? current.json[0] : current.json;
    if (!item || item.price == null) throw new Error("Unexpected shape: " + JSON.stringify(current.json).slice(0, 200));

    const latest = parseFloat(item.price);
    if (isNaN(latest)) throw new Error("Non-numeric price: " + item.price);

    // Build trend from historical daily closes (returned newest-first)
    let trend = [];
    let change = null;
    if (historical.status === 200 && Array.isArray(historical.json) && historical.json.length >= 2) {
      const sorted = historical.json
        .filter(r => r.close != null)
        .sort((a, b) => a.timestamp - b.timestamp);
      // Sample ~6 evenly spaced points for sparkline
      const step = Math.max(1, Math.floor(sorted.length / 6));
      trend = sorted.filter((_, i) => i % step === 0).slice(-6).map(r => parseFloat(parseFloat(r.close).toFixed(1)));
      // Ensure latest is last point
      if (trend[trend.length - 1] !== latest) trend.push(latest);
      // Change vs previous close
      const prev = sorted[sorted.length - 2]?.close;
      if (prev) change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));
    }

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
