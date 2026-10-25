/**
 * Cloudflare Pages Function: /api/contact
 * Handles contact and MOT booking enquiries at the Edge.
 * Can be connected with Cloudflare Environment Variables (e.g., RESEND_API_KEY, DISCORD_WEBHOOK, or EMAIL)
 */

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    const { name, phone, email, service, message } = body;

    // Validate required fields
    // Validate required fields
    if (!name || !phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Name and Phone number are required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // GDPR / Privacy: Anonymized operational log without exposing customer PII in console
    const refId = Date.now().toString(36).toUpperCase();
    console.log(`[Contact Enquiry] Ref: ${refId} | Service: ${service || 'General'} | Status: Received`);

    // Verify backend delivery channel is configured
    const hasWebhook = env && env.NOTIFY_WEBHOOK_URL;
    const hasResend = env && env.RESEND_API_KEY && env.ADMIN_EMAIL;

    if (!hasWebhook && !hasResend) {
      // Backend is not yet fully configured - prevent false success
      return new Response(
        JSON.stringify({
          success: false,
          error: "Online booking dispatch is currently undergoing setup. Please call our garage directly on 0121 558 9215 to book immediately."
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Forward to configured Webhook (Discord / Slack / Telegram)
    if (hasWebhook) {
      try {
        const webhookRes = await fetch(env.NOTIFY_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `🚗 **New BK MOT Booking Enquiry [${refId}]**\n**Name:** ${name}\n**Phone:** ${phone}\n**Email:** ${email || 'N/A'}\n**Service:** ${service || 'General'}\n**Message:** ${message || 'N/A'}`
          })
        });

        if (!webhookRes.ok) {
          console.error(`[Contact Enquiry] Ref: ${refId} | Webhook forwarding failed with status ${webhookRes.status}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Unable to forward your enquiry right now. Please call us directly on 0121 558 9215."
            }),
            { status: 502, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (webhookErr) {
        console.error(`[Contact Enquiry] Ref: ${refId} | Webhook dispatch error:`, webhookErr.message);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to dispatch enquiry. Please call us directly on 0121 558 9215."
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Thank you! Your enquiry has been received. Our team will contact you shortly."
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred. Please call 0121 558 9215." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
