// netlify/functions/imf-commodity.js
// Iron ore price via API Ninjas /v1/commodityprices (free tier, 3000 calls/month)
const https = require("https");

function httpGet(url, apiKey) {
  return new Promise((resolve, reject) => {
    https.get(url, {
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
  const API_KEY = "8O2psrYLsboMKmQ7FfSEV9RtfEidOM781mSO1Yoc";

  try {
    const { status, json } = await httpGet(
      "https://api.api-ninjas.com/v1/commodityprices?name=iron%20ore",
      API_KEY
    );

    if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(json)}`);

    // Response: { name, price, updated } or array — log shape for debug
    // Handle both array and single object
    const item = Array.isArray(json) ? json[0] : json;
    if (!item || item.price == null) throw new Error("Unexpected shape: " + JSON.stringify(json).slice(0, 200));

    const latest = parseFloat(item.price);
    if (isNaN(latest)) throw new Error("Non-numeric price: " + item.price);

    const status2 = latest >= 120 ? "green" : latest >= 90 ? "amber" : "red";

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `$${latest.toFixed(0)}`,
      change: null,   // API Ninjas spot price only — no historical series
      trend: [],
      unit: "USD/t iron ore",
      status: status2,
      statusLabel: status2 === "green" ? "Strong Demand" : status2 === "amber" ? "Moderate" : "Weak Demand",
      note: item.updated ? `Updated ${item.updated}` : "Live spot price",
    })};
  } catch (err) {
    console.error("imf-commodity:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
