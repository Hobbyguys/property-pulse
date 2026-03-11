// netlify/functions/imf-commodity.js
// Iron ore — RBA Table I2 (Index of Commodity Prices) via direct XLS, parsed as text
// Fallback: scrape the RBA monthly release page for the headline index figure
// Strategy: RBA i02hist.xls is tab-separated, we parse iron ore row from it
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error(`Redirect no Location`));
        return httpGet(loc.startsWith("http") ? loc : new URL(loc, url).href, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.setEncoding("binary");
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, contentType: res.headers["content-type"], body: data }));
    }).on("error", reject);
  });
}

const URLS_TO_TEST = [
  // RBA chart pack data API (powers their live charts)
  "https://www.rba.gov.au/chart-pack/data/commodity-prices.json",
  "https://www.rba.gov.au/statistics/tables/csv/i02hist.csv",
  // Direct XLS — check status + content-type
  "https://www.rba.gov.au/statistics/tables/xls/i02hist.xls",
];

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const results = {};
  for (const url of URLS_TO_TEST) {
    try {
      const r = await httpGet(url);
      results[url] = {
        status: r.status,
        contentType: r.contentType,
        // Show first 400 chars — if XLS it'll be binary garbage, if CSV/JSON it'll be readable
        preview: r.body.slice(0, 400).replace(/[^\x20-\x7E\n\r\t]/g, "?"),
      };
    } catch(e) {
      results[url] = { error: e.message };
    }
  }
  return { statusCode: 200, headers: CORS, body: JSON.stringify(results, null, 2) };
};
