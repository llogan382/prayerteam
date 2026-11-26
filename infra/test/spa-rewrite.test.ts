import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { rewriteUri, spaRewriteFunctionCode } from '../src/spa-rewrite.ts';

describe('SPA rewrite', () => {
  it.each([
    ['/', '/index.html'],
    ['/teams/abc', '/index.html'],
    ['/teams/abc/', '/index.html'],
    ['/_expo/static/x.js', '/_expo/static/x.js'],
    ['/favicon.ico', '/favicon.ico'],
    ['/.well-known/apple-app-site-association', '/.well-known/apple-app-site-association'],
  ])('rewrites %s to %s', (uri, expected) => {
    expect(rewriteUri(uri)).toBe(expected);
  });

  it('ships code whose handler rewrites the request uri', () => {
    const request = { uri: '/teams/abc', headers: {} };
    const result = runInNewContext(`${spaRewriteFunctionCode}\nhandler(event);`, {
      event: { request },
    });
    expect(result).toEqual({ uri: '/index.html', headers: {} });
  });
});
