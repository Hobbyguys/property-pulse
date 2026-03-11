// netlify/functions/abs-population.js
// ABS ERP_Q — WA population growth (YoY %)
// From debug: ERP_Q works, series key format is MEASURE:REGION_TYPE:REGION:ADJUSTMENT:FREQ
// We use CSV format which is much easier to parse than SDMX-JSON
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "text/csv",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // ERP_Q: get WA (region 5WA or 5) total persons, quarterly, estimated (TSEST=20)
    // Use CSV format — much easier to parse
    const url = "https://data.api.abs.gov.au/rest/data/ABS,ERP_Q/all?startPeriod=2022&format=csv&detail=dataonly";
    const csv = await httpGet(url);
    const rows = parseCSV(csv);

    // Filter: WA state-level rows, total persons
    // Region codes for WA at state level: "5" or starts with "5"
    // Measure: ERP (Estimated Resident Population)
    const waRows = rows.filter(r => {
      const region = (r.REGION || "").toUpperCase();
      const measure = (r.MEASURE || "").toUpperCase();
      const tsest = r.TSEST || r.ADJUSTMENT || "";
      // WA state code is 5, measure is ERP, adjustment/tsest = 20 (estimated)
      return region === "5" && (measure === "1" || measure === "ERP") && tsest === "20";
    });

    if (waRows.length < 5) {
      // Try broader filter — just WA region
      const waAny = rows.filter(r => (r.REGION || "") === "5");
      return { statusCode: 200, headers: CORS, body: JSON.stringify({
        error: `WA ERP rows: ${waRows.length}, WA any rows: ${waAny.length}, sample: ${JSON.stringify(rows.slice(0,2))}` 
      })};
    }

    // Sort by time period
    waRows.sort((a, b) => (a.TIME_PERIOD || "").localeCompare(b.TIME_PERIOD || ""));
    const vals = waRows.map(r => parseFloat(r.OBS_VALUE)).filter(v => !isNaN(v) && v > 0);

    // YoY growth comparing to 4 quarters ago
    const latest   = vals[vals.length - 1];
    const yearAgo  = vals[vals.length - 5];
    const growth   = ((latest - yearAgo) / yearAgo) * 100;
    const prev     = vals[vals.length - 2];
    const prevYear = vals[vals.length - 6] || yearAgo;
    const prevGrowth = ((prev - prevYear) / prevYear) * 100;

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      value: `+${growth.toFixed(1)}%`,
      change: parseFloat((growth - prevGrowth).toFixed(2)),
      trend: vals.slice(-8).map((v, i, arr) => i >= 4 ? parseFloat((((v - arr[i-4]) / arr[i-4]) * 100).toFixed(2)) : null).filter(v => v !== null),
      unit: "%",
      status: growth >= 1.5 ? "green" : growth >= 0.5 ? "amber" : "red",
      statusLabel: growth >= 1.5 ? "Strong Growth" : growth >= 0.5 ? "Moderate" : "Slowing",
    })};
  } catch (err) {
    console.error("abs-population:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
