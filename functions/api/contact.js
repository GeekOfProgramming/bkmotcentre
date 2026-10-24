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
    if (!name || !phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Name and Phone are required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Prepare log data
    const enquiryData = {
      timestamp: new Date().toISOString(),
      name,
      phone,
      email: email || "Not provided",
      service: service || "General Enquiry",
      message: message || "No message provided"
    };

    console.log("New BK MOT Centre Enquiry Received:", JSON.stringify(enquiryData));

    // Optional: If Discord or Slack Webhook is configured in Cloudflare Environment Variables
    if (env && env.NOTIFY_WEBHOOK_URL) {
      try {
        await fetch(env.NOTIFY_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `🚗 **New BK MOT Booking Enquiry**\n**Name:** ${name}\n**Phone:** ${phone}\n**Email:** ${email || 'N/A'}\n**Service:** ${service || 'General'}\n**Message:** ${message || 'N/A'}`
          })
        });
      } catch (webhookErr) {
        console.error("Webhook forwarding error:", webhookErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Enquiry successfully received by BK MOT Centre."
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
      JSON.stringify({ success: false, error: "Failed to process request: " + error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
