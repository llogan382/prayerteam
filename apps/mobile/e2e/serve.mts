// A tiny static server for the exported web build. Any path that isn't a file
// is answered with index.html, the same single-page rewrite CloudFront does (ADR 0001).
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const [root, port] = [resolve(process.argv[2]!), Number(process.argv[3])];
const indexHtml = join(root, "index.html");

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

async function fileFor(url: string | undefined): Promise<string> {
  try {
    const pathname = decodeURIComponent(new URL(url ?? "/", "http://localhost").pathname);
    const candidate = normalize(join(root, pathname));
    if (candidate.startsWith(root + sep) && (await stat(candidate)).isFile()) return candidate;
  } catch {
    // Malformed URL or missing file: fall through to the single-page shell.
  }
  return indexHtml;
}

createServer(async (req, res) => {
  const file = await fileFor(req.url);
  res.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
