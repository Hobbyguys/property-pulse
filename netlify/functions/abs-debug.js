// netlify/functions/abs-debug.js — tests candidate building approvals dataflow IDs
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "text/csv, application/json, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data.slice(0, 500) }));
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const results = {};
  const candidates = [
    "BUILDING_APPROVALS_STATES",
    "BUILDING_APPROVALS",
    "ABS_BA_STATES",
    "BA_STATES",
    "DWELLING_APPROVALS",
    "DWELL_APPROVALS",
    "RES_DWELL_STATES",
    "RES_DWELL",
    "BUILDING_ACTIVITY",
  ];
  for (const id of candidates) {
    const url = `https://data.api.abs.gov.au/rest/data/ABS,${id}/all?lastNObservations=1&format=csv&detail=dataonly`;
    try {
      const r = await httpGet(url);
      results[id] = { status: r.status, ok: r.status === 200, preview: r.body.slice(0, 150) };
    } catch(e) {
      results[id] = { error: e.message };
    }
  }
  return { statusCode: 200, headers: CORS, body: JSON.stringify(results, null, 2) };
};
