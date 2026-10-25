import { onRequestPost } from '../functions/api/contact.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fall through to Cloudflare Workers Static Assets binding
    return env.ASSETS.fetch(request);
  }
};
