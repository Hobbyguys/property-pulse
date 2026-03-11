// netlify/functions/imf-commodity.js
// Adds full debug output so we can see exactly what comes back
const https = require("https");
const http  = require("http");

function httpGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "Accept": "application/json, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error(`Redirect ${res.statusCode} with no Location header`));
        const next = loc.startsWith("http") ? loc : new URL(loc, url).href;
        return httpGet(next, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  const urls = [
    "https://www.imf.org/external/datamapper/api/v1/PIORECR?periods=10",
    "https://www.imf.org/external/datamapper/api/v1/PIORECR",
    "https://datamapper.imf.org/api/v1/PIORECR?periods=10",
  ];

  const results = {};
  for (const url of urls) {
    try {
      const r = await httpGet(url);
      results[url] = {
        status: r.status,
        contentType: r.headers["content-type"],
        bodyPreview: r.body.slice(0, 300),
      };
    } catch (e) {
      results[url] = { error: e.message };
    }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify(results, null, 2) };
};
