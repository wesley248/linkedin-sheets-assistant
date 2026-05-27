# LinkedIn Sheets Assistant

A Chrome (MV3) extension that turns your Google Sheet into a LinkedIn DM cockpit:

1. You navigate to a LinkedIn profile (`linkedin.com/in/<slug>`).
2. The extension finds the matching row in your sheet (by `profile_url`).
3. It renders your message template with `{{firstName}}`-style tokens.
4. You copy the draft into LinkedIn manually.
5. You click **Mark sent** or **Mark replied** and the status writes back to the sheet.

**No auto-send, no scheduling, no cookie reuse, no detection evasion.** This is a drafting + tracking assistant. Every send is a human action inside the LinkedIn UI.

---

## Setup

### 1. Create the Google OAuth client

1. Go to <https://console.cloud.google.com/apis/credentials> → **Create credentials → OAuth client ID**.
2. Application type: **Web application** (not Chrome Extension — we use `launchWebAuthFlow`, which is portable across unpacked installs).
3. Authorized redirect URI: paste the URL shown in the extension's Options page. It looks like
   `https://<extension-id>.chromiumapp.org/`.
4. Enable the **Google Sheets API** for the same project: <https://console.cloud.google.com/apis/library/sheets.googleapis.com>.

### 2. Load the extension

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → point at this repo's root.
3. Pin the extension. Open its **Options** page.

### 3. Configure

In the Options page:

| Field | What it is |
| --- | --- |
| OAuth Client ID | The client ID from step 1 |
| Spreadsheet ID | The `<ID>` from `https://docs.google.com/spreadsheets/d/<ID>/edit` |
| Sheet name | The tab name (default: `Connections`) |
| Column mapping | Header text in your sheet for each canonical field |

Click **Test sign-in** to trigger the OAuth consent flow once. The token is cached in `chrome.storage.session` for the duration of the browser session.

### 4. Sheet schema

Minimum columns (rename them via the Options page):

| profile_url | first_name | last_name | template | status | last_touched_at | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `https://linkedin.com/in/...` | Wesley | Longueira | `Hey {{firstName}}, ...` | open | (auto) | (free text) |

- `profile_url` is matched after normalization (lowercase, trailing slash stripped, query params removed).
- `template` accepts `{{firstName}}`, `{{lastName}}`, `{{fullName}}`, and any other header as `{{header_name}}`.
- `status` is overwritten with `sent` or `replied` when you click the corresponding button.
- `last_touched_at` is overwritten with an ISO-8601 timestamp on every status change.

---

## How it works

```
content.js (linkedin.com/in/*)
   └── messages ──► background.js (service worker)
                      ├── lib/auth.js     (chrome.identity.launchWebAuthFlow)
                      └── lib/sheets.js   (Sheets v4 REST)
```

- **content script** is presentation-only: it draws the floating panel, reads the current URL, renders the template, and dispatches `lsa:lookup` / `lsa:markStatus` messages.
- **service worker** owns OAuth tokens and the Sheets cache (30s TTL, busted on every write).
- **OAuth** uses the implicit flow via `chrome.identity.launchWebAuthFlow` — no backend, no service account, no client secret.

---

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker — message broker |
| `content.js` | Floating panel injected on LinkedIn profiles |
| `content.css` | Scoped styles for the panel (dark theme, `#lsa-panel` namespace) |
| `lib/auth.js` | Google OAuth via `launchWebAuthFlow` |
| `lib/sheets.js` | Minimal Sheets v4 client (read + batchUpdate) |
| `lib/template.js` | `{{token}}` substitution with canonical aliases |
| `lib/url.js` | LinkedIn URL → canonical `/in/<slug>` key |
| `options/` | Settings page (sheet ID, column map, OAuth client ID) |
| `test/` | Node-based unit tests for the pure helpers |

---

## Out of scope (and intentionally so)

- Auto-sending DMs
- Scheduled / paced outreach
- Reply detection (LinkedIn doesn't expose this without scraping; mark replies manually)
- Server-side anything

---

## Tests

```
node --test 'test/*.test.js'
```

Covers the pure logic in `lib/url.js` and `lib/template.js`. Browser-facing code (Sheets client, content script, options UI) is exercised manually inside Chrome — see the **Manual QA checklist** in the PR description.
