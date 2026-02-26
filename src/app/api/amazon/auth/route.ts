import { NextRequest, NextResponse } from "next/server";

/**
 * GET  /api/amazon/auth         → redirects to Amazon authorization page
 * GET  /api/amazon/auth?code=…  → exchanges auth code for refresh token
 *
 * This is a one-time setup helper. After obtaining the refresh token,
 * paste it into .env.local and restart the dev server.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    const clientId = process.env.AMAZON_ADS_CLIENT_ID;
    const clientSecret = process.env.AMAZON_ADS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return new NextResponse(
            html("❌ Missing Credentials", `
        <p>AMAZON_ADS_CLIENT_ID and AMAZON_ADS_CLIENT_SECRET must be set in <code>.env.local</code></p>
      `),
            { headers: { "Content-Type": "text/html" } }
        );
    }

    // If we got an error back from Amazon
    if (error) {
        return new NextResponse(
            html("❌ Authorization Error", `
        <p>Amazon returned an error: <strong>${error}</strong></p>
        <p>${searchParams.get("error_description") ?? ""}</p>
        <a href="/api/amazon/auth">Try again</a>
      `),
            { headers: { "Content-Type": "text/html" } }
        );
    }

    // Step 2: Exchange authorization code for tokens
    if (code) {
        try {
            const redirectUri = getRedirectUri(req);

            const tokenRes = await fetch("https://api.amazon.com/auth/o2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri,
                }),
            });

            const tokenData = await tokenRes.json();

            if (!tokenRes.ok || tokenData.error) {
                return new NextResponse(
                    html("❌ Token Exchange Failed", `
            <p>Error: <strong>${tokenData.error ?? tokenRes.status}</strong></p>
            <p>${tokenData.error_description ?? ""}</p>
            <a href="/api/amazon/auth">Try again</a>
          `),
                    { headers: { "Content-Type": "text/html" } }
                );
            }

            const refreshToken = tokenData.refresh_token;
            const accessToken = tokenData.access_token;

            // Also try to fetch profiles using the access token
            let profilesHtml = "";
            try {
                const profilesRes = await fetch(
                    "https://advertising-api.amazon.com/v2/profiles",
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Amazon-Advertising-API-ClientId": clientId,
                        },
                    }
                );
                const profiles = await profilesRes.json();
                if (Array.isArray(profiles) && profiles.length > 0) {
                    profilesHtml = `
            <h2>📋 Your Amazon Ads Profiles</h2>
            <p>Pick the Profile ID for the marketplace you want to use:</p>
            <table>
              <tr><th>Profile ID</th><th>Country</th><th>Account Name</th><th>Type</th></tr>
              ${profiles
                            .map(
                                (p: Record<string, unknown>) => `
                <tr>
                  <td><code>${(p as { profileId: number }).profileId}</code></td>
                  <td>${(p as { countryCode: string }).countryCode}</td>
                  <td>${((p as { accountInfo?: { name?: string } }).accountInfo?.name) ?? "N/A"}</td>
                  <td>${((p as { accountInfo?: { type?: string } }).accountInfo?.type) ?? "N/A"}</td>
                </tr>
              `
                            )
                            .join("")}
            </table>
          `;
                }
            } catch {
                profilesHtml = "<p><em>Could not fetch profiles — you may not have Amazon Ads API access approved yet.</em></p>";
            }

            return new NextResponse(
                html("✅ Authorization Successful!", `
          <h2>🔑 Refresh Token</h2>
          <p>Copy this refresh token and paste it into your <code>.env.local</code> file:</p>
          <div class="token-box">
            <code id="token">${refreshToken}</code>
            <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent).then(()=>this.textContent='✓ Copied!')">Copy</button>
          </div>
          
          ${profilesHtml}

          <h2>📝 Your .env.local should look like:</h2>
          <pre>
AMAZON_ADS_CLIENT_ID=${clientId}
AMAZON_ADS_CLIENT_SECRET=${clientSecret}
AMAZON_ADS_REFRESH_TOKEN=${refreshToken}
AMAZON_ADS_PROFILE_ID=${Array.isArray(profilesHtml) ? "PICK_FROM_TABLE_ABOVE" : "PICK_FROM_TABLE_ABOVE"}</pre>
          
          <p>⚠️ After updating <code>.env.local</code>, restart your dev server (<code>npm run dev</code>).</p>
        `),
                { headers: { "Content-Type": "text/html" } }
            );
        } catch (err) {
            return new NextResponse(
                html("❌ Error", `<p>${String(err)}</p><a href="/api/amazon/auth">Try again</a>`),
                { headers: { "Content-Type": "text/html" } }
            );
        }
    }

    // Step 1: Redirect to Amazon authorization page
    const redirectUri = getRedirectUri(req);
    const authUrl = new URL("https://www.amazon.com/ap/oa");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("scope", "advertising::campaign_management");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);

    return NextResponse.redirect(authUrl.toString());
}

function getRedirectUri(req: NextRequest): string {
    const host = req.headers.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    return `${protocol}://${host}/api/amazon/auth`;
}

function html(title: string, body: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>${title} | SellerOS</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 20px; background: #0f1117; color: #e4e4e7; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; color: #a1a1aa; }
    code { background: #1e1e2e; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
    pre { background: #1e1e2e; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 0.85em; line-height: 1.6; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #333; padding: 8px 12px; text-align: left; }
    th { background: #1e1e2e; }
    a { color: #60a5fa; }
    .token-box { background: #1e1e2e; padding: 12px 16px; border-radius: 8px; display: flex; align-items: center; gap: 12px; margin: 8px 0; }
    .token-box code { background: none; word-break: break-all; flex: 1; font-size: 0.8em; }
    .token-box button { background: #3b82f6; color: white; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
    .token-box button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}
