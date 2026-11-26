// The web behaviour's CloudFront Function (ADR 0001). Any path whose last
// segment has no file extension is an app route and gets the app shell.
// Real files, and anything under /.well-known/ (universal/app links), pass
// through. CloudFront Functions can't be run locally, so the pure function is
// tested directly and its own source is what ships.
//
// Keep `rewriteUri` to plain code (no imports or helpers): its source text becomes the
// CloudFront Function, which runs on the cloudfront-js-2.0 runtime.
export function rewriteUri(uri: string): string {
  if (uri.indexOf('/.well-known/') === 0) return uri;
  const lastSegment = uri.slice(uri.lastIndexOf('/') + 1);
  return lastSegment.indexOf('.') === -1 ? '/index.html' : uri;
}

export const spaRewriteFunctionCode = `${rewriteUri.toString()}
function handler(event) {
  const request = event.request;
  request.uri = rewriteUri(request.uri);
  return request;
}`;
