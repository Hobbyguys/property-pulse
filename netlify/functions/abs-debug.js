// netlify/functions/abs-debug.js — finds building approvals dataflow ID
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
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    // Get full list of ABS dataflows, search for building approvals
    const r = await httpGet("https://data.api.abs.gov.au/rest/dataflow/all?detail=allstubs&format=jsondata");
    const json = JSON.parse(r.body);
    // Extract dataflow names and IDs, filter to building-related ones
    const dataflows = json?.data?.dataflows || [];
    const building = dataflows
      .map(d => ({ id: d.id, name: d.name?.en || d.names?.en || "" }))
      .filter(d => /build|approv|BA|dwell/i.test(d.name + d.id));
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ total: dataflows.length, building_related: building }, null, 2) };
  } catch(e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
