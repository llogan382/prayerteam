// Expo configures Metro for monorepos automatically (SDK 52+). The one
// addition: in development, /api/* is proxied to the local API server, so
// the web app calls same-origin /api as it does behind CloudFront, and a
// native dev build can reach the API through the dev server (src/api.ts).
const { getDefaultConfig } = require("expo/metro-config");
const { isApiPath, proxyApi } = require("./api-proxy.js");

const config = getDefaultConfig(__dirname);
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3000";

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) =>
    isApiPath(req.url) ? proxyApi(req, res, apiOrigin) : middleware(req, res, next),
};

module.exports = config;
