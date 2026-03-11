// netlify/functions/abs-debug.js
// Temporary diagnostic — shows us exactly what the ABS API returns
// Visit: /.netlify/functions/abs-debug to see raw output
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
        if (!loc) return reject(new Error("Redirect with no Location header"));
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data.slice(0, 3000) }));
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  const tests = [
    // Test 1: list all available ABS dataflows (to find correct IDs)
    "https://data.api.abs.gov.au/rest/dataflow/ABS?detail=allstubs&format=jsondata",
    // Test 2: try ERP_Q population
    "https://data.api.abs.gov.au/rest/data/ABS,ERP_Q/all?lastNObservations=2&format=jsondata&detail=dataonly",
    // Test 3: try building approvals
    "https://data.api.abs.gov.au/rest/data/ABS,ABS_BA/all?lastNObservations=2&format=jsondata&detail=dataonly",
  ];

  const results = {};
  for (const url of tests) {
    try {
      const r = await httpGet(url);
      results[url] = { status: r.status, preview: r.body };
    } catch(e) {
      results[url] = { error: e.message };
    }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify(results, null, 2) };
};
