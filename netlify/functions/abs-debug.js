// netlify/functions/abs-debug.js — tests BA and ERP_Q with correct keys
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data.slice(0, 2000) }));
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const results = {};

  const tests = [
    // BA = Building Approvals, WA state code is 5, measure 1 = total dwellings, M = monthly
    ["BA_WA", "https://data.api.abs.gov.au/rest/data/ABS,BA/1.5.M?lastNObservations=3&format=jsondata&detail=dataonly"],
    // Try alternate — just 'all' to see what comes back
    ["BA_all", "https://data.api.abs.gov.au/rest/data/ABS,BA/all?lastNObservations=1&format=jsondata&detail=dataonly"],
    // ERP_Q structure — get the dimension metadata so we know the codes
    ["ERP_Q_structure", "https://data.api.abs.gov.au/rest/dataflow/ABS/ERP_Q?references=descendants&format=jsondata"],
  ];

  for (const [name, url] of tests) {
    try {
      const r = await httpGet(url);
      results[name] = { status: r.status, preview: r.body };
    } catch(e) {
      results[name] = { error: e.message };
    }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify(results, null, 2) };
};
