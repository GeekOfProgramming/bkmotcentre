import { onRequestPost } from '../functions/api/contact.js';

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
          waitUntil: (promise) => ctx.waitUntil(promise),
          next: () => env.ASSETS.fetch(request)
        });
      }

      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('Origin') || 'https://bkmotcentre.uk';
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept',
            'Access-Control-Max-Age': '86400',
            'Vary': 'Origin'
          }
        });
      }

      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
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
