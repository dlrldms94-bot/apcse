const PAYPAL_API_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured.");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error("Failed to obtain PayPal access token.");
  }

  const data = await response.json();
  return data.access_token;
}

async function createPayPalOrder(registrationId, amount, currency) {
  const accessToken = await getAccessToken();
  const appUrl =
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3000";

  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: registrationId,
          description: "APCSE Pre-registration Fee",
          amount: {
            currency_code: currency,
            value: Number(amount).toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: `${appUrl}/register-complete.html?type=foreigner&registrationId=${registrationId}`,
        cancel_url: `${appUrl}/payment.html?registrationId=${registrationId}&cancelled=1`,
        brand_name: "APCSE",
        user_action: "PAY_NOW",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create PayPal order: ${error}`);
  }

  return response.json();
}

async function capturePayPalOrder(orderId) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to capture PayPal order: ${error}`);
  }

  return response.json();
}

module.exports = { createPayPalOrder, capturePayPalOrder };
