// netlify/functions/imf-commodity.js
// WA Commodity Indicators via metalpriceapi.com (free tier)
// Shows: Gold (XAU), Silver (XAG), AUD/USD rate
// All three are in the base /v1/latest endpoint — single API call
const https = require("https");

function apiGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" }
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

function rateToUSD(rate) {
  // rates[X] = how many X per 1 USD, so USD price = 1/rate
  return rate ? parseFloat((1 / rate).toFixed(2)) : null;
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const API_KEY = process.env.metalpriceapi_key;
  if (!API_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "metalpriceapi_key env var not set" }) };

  try {
    // Single call gets everything we need
    const { status, json } = await apiGet(
      `https://api.metalpriceapi.com/v1/latest?api_key=${API_KEY}&base=USD&currencies=XAU,XAG,AUD`
    );

    if (status !== 200 || !json.success) {
      throw new Error(`API error ${status}: ${JSON.stringify(json).slice(0, 200)}`);
    }

    const r = json.rates;

    // Gold: XAU rate = troy oz per USD → invert for USD/oz
    const goldUSD  = rateToUSD(r.XAU);   // USD per troy oz
    // Silver: XAG rate = troy oz per USD → invert
    const silverUSD = rateToUSD(r.XAG);  // USD per troy oz
    // AUD/USD: AUD rate = AUD per 1 USD → invert for USD per AUD
    const audUSD   = r.AUD ? parseFloat((1 / r.AUD).toFixed(4)) : null;

    if (!goldUSD || !silverUSD || !audUSD) {
      throw new Error("Missing rates: " + JSON.stringify({ XAU: r.XAU, XAG: r.XAG, AUD: r.AUD }));
    }

    // Now fetch historical (30 days) for sparklines on all three
    const end   = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 42);
    const fmt = d => d.toISOString().split("T")[0];

    const hist = await apiGet(
      `https://api.metalpriceapi.com/v1/timeframe?api_key=${API_KEY}&base=USD&currencies=XAU,XAG,AUD&start_date=${fmt(start)}&end_date=${fmt(end)}`
    );

    // Build sparklines — sample weekly (every 7th day)
    let goldTrend = [], silverTrend = [], audTrend = [];
    let goldChange = null, silverChange = null, audChange = null;

    if (hist.json?.success && hist.json?.rates) {
      const dates = Object.keys(hist.json.rates).sort();
      const weekly = dates.filter((_, i) => i % 7 === 0).slice(-6);

      goldTrend   = weekly.map(d => parseFloat((1 / hist.json.rates[d].XAU).toFixed(0)));
      silverTrend = weekly.map(d => parseFloat((1 / hist.json.rates[d].XAG).toFixed(2)));
      audTrend    = weekly.map(d => parseFloat((1 / hist.json.rates[d].AUD).toFixed(4)));

      if (dates.length >= 2) {
        const prev = hist.json.rates[dates[dates.length - 2]];
        goldChange   = parseFloat((((goldUSD   - 1/prev.XAU) / (1/prev.XAU)) * 100).toFixed(1));
        silverChange = parseFloat((((silverUSD - 1/prev.XAG) / (1/prev.XAG)) * 100).toFixed(1));
        audChange    = parseFloat((((audUSD    - 1/prev.AUD) / (1/prev.AUD)) * 100).toFixed(1));
      }
    }

    // Status based on AUD/USD (primary WA economy signal)
    // AUD > 0.65 = strong, 0.60-0.65 = moderate, < 0.60 = weak
    const audStatus = audUSD >= 0.65 ? "green" : audUSD >= 0.60 ? "amber" : "red";

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      // Primary display value = gold price (most recognisable)
      value: `$${goldUSD.toLocaleString()}`,
      change: goldChange,
      trend: goldTrend,
      unit: "USD/oz gold",
      status: audStatus,
      statusLabel: audStatus === "green" ? "Commodities Strong" : audStatus === "amber" ? "Moderate" : "Commodities Weak",
      // Extra fields for expanded card display
      indicators: [
        {
          label: "Gold",
          value: `$${goldUSD.toLocaleString()}`,
          unit: "USD/oz",
          change: goldChange,
          trend: goldTrend,
        },
        {
          label: "Silver",
          value: `$${silverUSD.toFixed(2)}`,
          unit: "USD/oz",
          change: silverChange,
          trend: silverTrend,
        },
        {
          label: "AUD/USD",
          value: audUSD.toFixed(4),
          unit: "exchange rate",
          change: audChange,
          trend: audTrend,
        },
      ],
    })};
  } catch (err) {
    console.error("imf-commodity:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
