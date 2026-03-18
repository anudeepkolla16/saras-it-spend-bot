/**
 * IT Spend Weekly Slack Bot
 * Posts GCP + Claude (Anthropic) usage spend to #it-team every Monday at 9:00 AM IST
 *
 * Setup:
 *   npm install
 *   Set environment variables (see .env.example)
 *   Schedule via cron: 0 3 * * 1  (3:30 AM UTC = 9:00 AM IST)
 */

const https = require("https");

// ─── Config ────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || "C0A2U0TJ2R1"; // #it-team
const GCP_MONTHLY_BUDGET = parseFloat(process.env.GCP_MONTHLY_BUDGET || "0");

// ─── Helpers ───────────────────────────────────────────────────────────────
function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function getDateRange() {
  const now = new Date();
  // Month-to-date: 1st of current month → today
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const fmt = (d) => d.toISOString().split("T")[0];
  return { start: fmt(start), end: fmt(now) };
}

// ─── Fetch Claude (Anthropic) Usage ────────────────────────────────────────
async function getAnthropicSpend() {
  const { start, end } = getDateRange();

  const options = {
    hostname: "api.anthropic.com",
    path: `/v1/usage?start_date=${start}&end_date=${end}`,
    method: "GET",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
  };

  const res = await httpsRequest(options);

  if (res.status !== 200) {
    console.error("Anthropic API error:", res.body);
    return null;
  }

  // Sum up total cost across all models
  const data = res.body;
  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  if (data.data && Array.isArray(data.data)) {
    for (const entry of data.data) {
      totalCost += entry.cost_usd || 0;
      inputTokens += entry.input_tokens || 0;
      outputTokens += entry.output_tokens || 0;
    }
  }

  return { totalCost, inputTokens, outputTokens, start, end };
}

// ─── GCP Spend (manual / placeholder) ─────────────────────────────────────
// GCP requires Billing API + service account setup.
// Replace this function with a real GCP Billing API call if needed.
async function getGCPSpend() {
  // If you have a GCP_CURRENT_SPEND env var set (e.g. from a billing export), use it.
  const spend = parseFloat(process.env.GCP_CURRENT_SPEND || "0");
  return { totalCost: spend };
}

// ─── Format Slack Message ──────────────────────────────────────────────────
function buildMessage(claude, gcp) {
  const now = new Date();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const year = now.getFullYear();
  const today = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const fmt = (n) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const claudeBlock = claude
    ? `*Claude (Anthropic)*\n• MTD Spend: *${fmt(claude.totalCost)}*\n• Input tokens: ${claude.inputTokens.toLocaleString()}\n• Output tokens: ${claude.outputTokens.toLocaleString()}`
    : `*Claude (Anthropic)*\n• ⚠️ Could not fetch data`;

  const gcpBlock =
    gcp && gcp.totalCost > 0
      ? `*GCP*\n• MTD Spend: *${fmt(gcp.totalCost)}*${GCP_MONTHLY_BUDGET > 0 ? `\n• Budget: ${fmt(GCP_MONTHLY_BUDGET)} | Used: ${((gcp.totalCost / GCP_MONTHLY_BUDGET) * 100).toFixed(1)}%` : ""}`
      : `*GCP*\n• ⚠️ No spend data available (set GCP_CURRENT_SPEND env var)`;

  const total =
    (claude?.totalCost || 0) + (gcp?.totalCost || 0);

  return `📊 *Weekly IT Usage Spend Report* — ${monthName} ${year} (MTD as of ${today})

${claudeBlock}

${gcpBlock}

━━━━━━━━━━━━━━━━━━━
💰 *Total Usage-Based Spend: ${fmt(total)}*

_This is an automated report. For questions, contact the IT team._`;
}

// ─── Post to Slack ─────────────────────────────────────────────────────────
async function postToSlack(message) {
  const body = JSON.stringify({
    channel: SLACK_CHANNEL_ID,
    text: message,
    mrkdwn: true,
  });

  const options = {
    hostname: "slack.com",
    path: "/api/chat.postMessage",
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const res = await httpsRequest(options, body);

  if (!res.body.ok) {
    throw new Error(`Slack error: ${res.body.error}`);
  }

  console.log("✅ Message posted to Slack:", res.body.ts);
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Running IT Spend Slack Bot...");

  if (!ANTHROPIC_API_KEY) {
    console.error("❌ Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }
  if (!SLACK_BOT_TOKEN) {
    console.error("❌ Missing SLACK_BOT_TOKEN");
    process.exit(1);
  }

  const [claude, gcp] = await Promise.all([
    getAnthropicSpend(),
    getGCPSpend(),
  ]);

  const message = buildMessage(claude, gcp);
  console.log("\nMessage preview:\n", message, "\n");

  await postToSlack(message);
  console.log("✅ Done.");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
