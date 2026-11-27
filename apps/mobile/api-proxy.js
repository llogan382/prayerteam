// Forwards /api/* to the API server, as CloudFront's /api/* behaviour does
// (ADR 0005). Used by the Metro dev server (metro.config.js) and the e2e
// static server (e2e/serve.mts). CommonJS so Metro's config can load it.
const http = require("node:http");

function isApiPath(url) {
  const path = (url ?? "/").split("?")[0];
  return path === "/api" || path.startsWith("/api/");
}

// Streams the request to `origin` unchanged and the answer back.
function proxyApi(req, res, origin) {
  const upstream = http.request(new URL(req.url ?? "/", origin), { method: req.method, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`API not reachable at ${origin}`);
  });
  req.pipe(upstream);
}

module.exports = { isApiPath, proxyApi };
