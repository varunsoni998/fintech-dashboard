const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const PROPERTY_ID = Deno.env.get("GA4_PROPERTY_ID");
    const JSON_RAW    = Deno.env.get("GA4_SERVICE_ACCOUNT_JSON");

    if (!PROPERTY_ID) throw new Error("Missing GA4_PROPERTY_ID secret");
    if (!JSON_RAW)    throw new Error("Missing GA4_SERVICE_ACCOUNT_JSON secret");

    let creds: any;
    try {
      creds = JSON.parse(JSON_RAW);
    } catch (e: any) {
      throw new Error(`JSON parse failed: ${e.message}`);
    }

    const token = await getAccessToken(creds);

    const [overview, pages, geo] = await Promise.all([
      runReport(token, PROPERTY_ID, {
        dateRanges: [
          { startDate: "30daysAgo", endDate: "today" },
          { startDate: "60daysAgo", endDate: "31daysAgo" },
        ],
        metrics: [
          { name: "screenPageViews" },
          { name: "activeUsers" },
          { name: "averageSessionDuration" },
          { name: "sessions" },
        ],
      }),
      runReport(token, PROPERTY_ID, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
      runReport(token, PROPERTY_ID, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "country" }, { name: "deviceCategory" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      }),
    ]);

    return new Response(JSON.stringify({ overview, pages, geo }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("FUNCTION ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

async function runReport(token: string, propertyId: string, body: any) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return res.json();
}

function toBase64Url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Decode a base64 PEM body to raw bytes using Deno's built-in atob (no external import needed).
function pemToBuffer(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .replace(/\s+/g, "")
    .trim();

  // Diagnostics: check for anything that isn't valid base64, and check length.
  const invalidCharMatch = cleaned.match(/[^A-Za-z0-9+/=]/);
  if (invalidCharMatch) {
    const idx = invalidCharMatch.index!;
    const context = cleaned.slice(Math.max(0, idx - 15), idx + 15);
    throw new Error(
      `Invalid base64 character "${invalidCharMatch[0]}" (code ${cleaned.charCodeAt(idx)}) ` +
      `at position ${idx} of ${cleaned.length}. Context: ...${context}...`
    );
  }
  if (cleaned.length % 4 !== 0) {
    throw new Error(
      `Base64 length (${cleaned.length}) is not a multiple of 4 after cleaning. ` +
      `First 20 chars: ${cleaned.slice(0, 20)} | Last 20 chars: ${cleaned.slice(-20)}`
    );
  }

  let binary: string;
  try {
    binary = atob(cleaned);
  } catch (e: any) {
    throw new Error(
      `atob() threw despite passing validation: ${e.message}. ` +
      `Cleaned length: ${cleaned.length}. First 30: ${cleaned.slice(0, 30)}`
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getAccessToken(creds: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header  = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64Url(JSON.stringify({
    iss:   creds.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  }));

  const signingInput = `${header}.${payload}`;
  const signingBytes = new TextEncoder().encode(signingInput);

  const keyBytes = pemToBuffer(creds.private_key);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signingBytes);
  const sigB64Url = toBase64Url(new Uint8Array(signature));

  const jwt = `${signingInput}.${sigB64Url}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Token fetch failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}