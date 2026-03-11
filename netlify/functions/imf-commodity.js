// netlify/functions/imf-commodity.js
const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON from IMF")); }
      });
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    const url = "https://www.imf.org/external/datamapper/api/v1/PIORECR?periods=10";
    const json = await httpsGet(url);

    const series = json?.values?.PIORECR?.WLD;
    if (!series) throw new Error("Unexpected IMF response shape");

    const vals = Object.keys(series).sort().map(y => series[y]).filter(v => v != null);
    if (vals.length < 2) throw new Error("Not enough data points");

    const latest = vals[vals.length - 1];
    const prev   = vals[vals.length - 2];
    const change = parseFloat((((latest - prev) / prev) * 100).toFixed(1));
    const status = latest >= 120 ? "green" : latest >= 90 ? "amber" : "red";

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        value:       `$${latest.toFixed(0)}`,
        change,
        trend:       vals.slice(-6).map(v => parseFloat(v.toFixed(1))),
        unit:        "USD/t iron ore",
        status,
        statusLabel: status === "green" ? "Strong Demand" : status === "amber" ? "Moderate" : "Weak Demand",
      }),
    };
  } catch (err) {
    console.error("imf-commodity:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
