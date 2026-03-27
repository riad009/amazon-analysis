import nodemailer from "nodemailer";

// ─── SMTP Transport ─────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false, // true for 465, false for 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ─── Send Email ─────────────────────────────────────────────────────────────

interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    if (!from || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return { success: false, error: "Email credentials not configured" };
    }

    try {
        const info = await transporter.sendMail({
            from: `"SellerOS" <${from}>`,
            to,
            subject,
            html,
        });

        console.log(`[Mailer] ✅ Email sent to ${to} — messageId: ${info.messageId}`);
        return { success: true };
    } catch (err) {
        console.error("[Mailer] ❌ Failed to send email:", err);
        return { success: false, error: String(err) };
    }
}

// ─── Email Template ─────────────────────────────────────────────────────────

interface CampaignSummary {
    totalCampaigns: number;
    totalSpend: number;
    totalSales: number;
    totalOrders: number;
    totalClicks: number;
    totalImpressions: number;
    overallAcos: number;
    overallRoas: number;
    dateRange: string;
    profileName: string;
}

export function buildPerformanceEmailHTML(summary: CampaignSummary): string {
    const {
        totalCampaigns, totalSpend, totalSales, totalOrders,
        totalClicks, totalImpressions, overallAcos, overallRoas,
        dateRange, profileName,
    } = summary;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#18181b,#27272a);border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">📊 SellerOS Report</h1>
      <p style="color:#a1a1aa;margin:6px 0 0;font-size:13px;">${profileName} · ${dateRange}</p>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e4e4e7;border-top:none;">
      <h2 style="margin:0 0 20px;font-size:16px;color:#18181b;font-weight:600;">Campaign Performance Summary</h2>

      <!-- Metrics Grid -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e4e4e7;border-radius:8px 0 0 0;width:50%;">
            <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Total Spend</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#18181b;">$${totalSpend.toFixed(2)}</p>
          </td>
          <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e4e4e7;border-left:none;border-radius:0 8px 0 0;width:50%;">
            <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Total Sales</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#059669;">$${totalSales.toFixed(2)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#fff;border:1px solid #e4e4e7;border-top:none;width:50%;">
            <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">ACOS</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:${overallAcos > 30 ? '#dc2626' : overallAcos > 20 ? '#d97706' : '#059669'};">${overallAcos.toFixed(1)}%</p>
          </td>
          <td style="padding:12px 16px;background:#fff;border:1px solid #e4e4e7;border-top:none;border-left:none;width:50%;">
            <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">ROAS</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:${overallRoas >= 3 ? '#059669' : overallRoas >= 2 ? '#d97706' : '#dc2626'};">${overallRoas.toFixed(2)}x</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e4e4e7;border-top:none;width:50%;">
            <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Orders</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#18181b;">${totalOrders.toLocaleString()}</p>
          </td>
          <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e4e4e7;border-top:none;border-left:none;width:50%;">
            <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Clicks</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#18181b;">${totalClicks.toLocaleString()}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#fff;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 0 8px;width:50%;">
            <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Impressions</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#18181b;">${totalImpressions.toLocaleString()}</p>
          </td>
          <td style="padding:12px 16px;background:#fff;border:1px solid #e4e4e7;border-top:none;border-left:none;border-radius:0 0 8px 0;width:50%;">
            <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Campaigns</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#18181b;">${totalCampaigns}</p>
          </td>
        </tr>
      </table>

      <!-- Footer note -->
      <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;text-align:center;">
        This is an automated report from SellerOS · Powered by Dra Soft
      </p>
    </div>
  </div>
</body>
</html>`;
}
