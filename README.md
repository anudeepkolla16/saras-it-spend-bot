# IT Spend Slack Bot

Posts a weekly usage-based spend report to **#it-team** every Monday at 9:00 AM IST.

Covers:
- **Claude (Anthropic)** — fetched automatically via Anthropic API
- **GCP** — set manually via env var (or extend with GCP Billing API)

---

## Setup

### 1. Install Node.js
Requires Node.js 18+. Download from https://nodejs.org

### 2. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your actual keys
```

You need:
| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `SLACK_BOT_TOKEN` | https://api.slack.com/apps → your app → OAuth |
| `GCP_CURRENT_SPEND` | GCP Billing Console → update weekly |

### 3. Set up Slack App (one-time)
1. Go to https://api.slack.com/apps → **Create New App**
2. Add OAuth scopes: `chat:write`, `chat:write.public`
3. Install to your workspace
4. Copy the **Bot User OAuth Token** → set as `SLACK_BOT_TOKEN`
5. Invite the bot to **#it-team**: `/invite @your-bot-name`

### 4. Test it
```bash
node index.js
```

---

## Scheduling (every Monday 9:00 AM IST)

### Option A: Linux/Mac Cron
```bash
crontab -e
# Add this line (3:30 AM UTC = 9:00 AM IST):
30 3 * * 1 cd /path/to/it-spend-slack-bot && node index.js >> /var/log/it-spend-bot.log 2>&1
```

### Option B: GitHub Actions (recommended — no server needed)
Create `.github/workflows/weekly-report.yml`:
```yaml
name: Weekly IT Spend Report
on:
  schedule:
    - cron: '30 3 * * 1'  # Monday 9:00 AM IST
  workflow_dispatch:        # Manual trigger

jobs:
  post-report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: node index.js
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          SLACK_CHANNEL_ID: ${{ secrets.SLACK_CHANNEL_ID }}
          GCP_CURRENT_SPEND: ${{ secrets.GCP_CURRENT_SPEND }}
```
Add your secrets in **GitHub repo → Settings → Secrets**.

### Option C: n8n / Zapier
- Trigger: Schedule (every Monday 9:00 AM IST)
- Action: Run script or HTTP request to a deployed version

---

## GCP Automation (future enhancement)
To auto-fetch GCP spend, replace `getGCPSpend()` in `index.js` with a call to:
- **GCP Billing API** (requires service account)
- **BigQuery billing export** (if you have it set up)
