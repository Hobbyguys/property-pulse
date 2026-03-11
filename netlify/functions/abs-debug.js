// abs-debug.js — inspect RES_DWELL structure to find WA region code
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "text/csv, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // Get all RES_DWELL data, last 1 observation — just need to see all region codes
    const url = "https://data.api.abs.gov.au/rest/data/ABS,RES_DWELL/all?lastNObservations=1&format=csv&detail=dataonly";
    const r = await httpGet(url);
    const lines = r.body.trim().split("\n").filter(l => l.trim());
    const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
    });
    // Return unique region codes and all distinct values per column
    const regionCodes = [...new Set(rows.map(r => r.REGION))].sort();
    const measureCodes = [...new Set(rows.map(r => r.MEASURE))].sort();
    const freqCodes = [...new Set(rows.map(r => r.FREQ))].sort();
    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      headers,
      regionCodes,
      measureCodes,
      freqCodes,
      sampleRows: rows.slice(0, 6),
    }, null, 2)};
  } catch(e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
