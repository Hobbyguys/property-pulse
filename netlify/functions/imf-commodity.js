// netlify/functions/imf-commodity.js
// Iron ore price via metalpriceapi.com (free tier)
// Ticker: IRON, base: USD
// Rate returned is oz/USD so we convert: price per troy oz * 32150.7 = price per metric ton
// Actually metalpriceapi returns units relative to base currency — 1 USD = X units of metal
// So iron price in USD/t = 1 / rate * 1000 (if rate is per gram) or just 1/rate if per ton
// We'll log the raw rate first call so we can verify the conversion
const https = require("https");

function apiGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
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
  const API_KEY = process.env.metalpriceapi_key;
  if (!API_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "metalpriceapi_key env var not set" }) };

  try {
    // Latest price — base USD, get IRON
    const { status, json } = await apiGet(
      `https://api.metalpriceapi.com/v1/latest?api_key=${API_KEY}&base=USD&currencies=IRON`
    );

    if (status !== 200 || !json.success) {
      throw new Error(`API error ${status}: ${JSON.stringify(json).slice(0, 200)}`);
    }

    // Rate = how many IRON units per 1 USD
    // metalpriceapi returns IRON in USD per troy ounce equivalent
    // IRON rate is typically ~0.0058 meaning 1 USD buys 0.0058 "units"
    // To get USD/metric ton: 1 / rate * 1000 (if unit is per kg) or check raw
    const rawRate = json.rates?.IRON;
    if (rawRate == null) throw new Error("IRON not in rates: " + JSON.stringify(json).slice(0, 200));

    // metalpriceapi IRON is priced per metric ton in USD directly when base=USD
    // i.e. rate = USD per 1 ton means price = 1/rate ... but let's expose raw for verification
    // Based on docs: rates[IRON] = amount of IRON you get per 1 USD base
    // So USD price per ton = 1 / rawRate  (if IRON unit = metric ton)
    // Current iron ore ~$100/t means rawRate should be ~0.01
    const pricePerTon = parseFloat((1 / rawRate).toFixed(2));

    // Fetch historical — last 7 days for sparkline
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 42); // ~6 weeks to get 6 data points
    const fmt = d => d.toISOString().split("T")[0];

    const hist = await apiGet(
      `https://api.metalpriceapi.com/v1/timeframe?api_key=${API_KEY}&base=USD&currencies=IRON&start_date=${fmt(start)}&end_date=${fmt(end)}`
    );

    let trend = [];
    let change = null;

    if (hist.json?.success && hist.json?.rates) {
      const dates = Object.keys(hist.json.rates).sort();
      // Sample every 7th day (~weekly points)
      const weekly = dates.filter((_, i) => i % 7 === 0).slice(-6);
      trend = weekly.map(d => parseFloat((1 / hist.json.rates[d].IRON).toFixed(1)));
      if (dates.length >= 2) {
        const prev = 1 / hist.json.rates[dates[dates.length - 2]].IRON;
        change = parseFloat((((pricePerTon - prev) / prev) * 100).toFixed(1));
      }
    }

    const status2 = pricePerTon >= 120 ? "green" : pricePerTon >= 90 ? "amber" : "red";

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `$${pricePerTon.toFixed(0)}`,
      change,
      trend,
      unit: "USD/t iron ore",
      status: status2,
      statusLabel: status2 === "green" ? "Strong Demand" : status2 === "amber" ? "Moderate" : "Weak Demand",
      _debug: { rawRate, pricePerTon },
    })};
  } catch (err) {
    console.error("imf-commodity:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
