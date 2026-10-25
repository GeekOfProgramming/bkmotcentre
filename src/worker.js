import { onRequestPost, onRequestOptions } from '../functions/api/contact.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Canonical 301 Redirect: www.bkmotcentre.uk -> bkmotcentre.uk
    if (url.hostname === 'www.bkmotcentre.uk') {
      url.hostname = 'bkmotcentre.uk';
      return Response.redirect(url.toString(), 301);
    }

    // Handle Contact & Booking API
    if (url.pathname === '/api/contact') {
      if (request.method === 'POST') {
        return onRequestPost({
          request,
          env,
          params: {},
          data: {},
          waitUntil: (promise) => ctx?.waitUntil?.(promise),
          next: () => env.ASSETS.fetch(request)
        });
      }

      if (request.method === 'OPTIONS') {
        return onRequestOptions({
          request,
          env,
          params: {},
          data: {},
          waitUntil: (promise) => ctx?.waitUntil?.(promise),
          next: () => env.ASSETS.fetch(request)
        });
      }

      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      );
    }

    // Serve Static Assets with custom 404 fallback
    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status === 404) {
      const notFoundUrl = new URL('/404.html', request.url);
      const notFoundResponse = await env.ASSETS.fetch(new Request(notFoundUrl, request));
      return new Response(notFoundResponse.body, {
        status: 404,
        statusText: 'Not Found',
        headers: notFoundResponse.headers
      });
    }

    return assetResponse;
  }
};
