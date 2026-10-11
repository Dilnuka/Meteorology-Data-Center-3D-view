# DoM Tier III Data Center — 3D Digital Twin

Interactive browser-based digital twin of the Department of Meteorology data center. Orbit the room, walk inside at eye level, and inspect racks, cooling, power, and fire systems.

> **Demo note:** Telemetry and the gas-discharge drill are illustrative simulations for familiarization — not live facility data.

## Share this with the office

**Live demo link (anyone can open — no login):**

### https://dilnuka.github.io/Meteorology-Data-Center-3D-view/

Copy that URL into your office group chat / email / Teams.

| Platform | What to send |
| --- | --- |
| WhatsApp / Teams / Email | The live demo link above |
| GitHub | Source code: https://github.com/Dilnuka/Meteorology-Data-Center-3D-view |

## How many people opened the link?

Visits are counted automatically (one count per browser session).

**Check the current visit count here:**

https://api.counterapi.dev/v1/dom-meteorology-dc/pageviews

You will see JSON like `{ "count": 42 }` — that number is how many sessions have opened the demo.

### Optional: Google Analytics (richer reports)

1. Create a free GA4 property at [analytics.google.com](https://analytics.google.com/)
2. Copy your Measurement ID (`G-XXXXXXXX`)
3. In `index.html`, add this **before** the main script:

```html
<script>window.__GA_MEASUREMENT_ID = 'G-XXXXXXXX';</script>
```

Then rebuild and push. You get users, devices, countries, and page views in the GA dashboard.

## Controls

| Action | Desktop | Phone / tablet |
| --- | --- | --- |
| Orbit | Left-drag | One finger drag |
| Zoom | Scroll wheel | Pinch |
| Pan | Right-drag | Two-finger drag |
| Inspect | Click an asset | Tap an asset (or Menu → Jump to a system) |
| Walk | **Walk** → WASD + mouse look · **Esc** exits | **Walk** → drag to look · left stick · **Exit Walk** |
| Light / Night | Sun/moon button in the top bar | Same |
| Help | **?** button or press `?` | **?** button |

## Run locally

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

## Deploy

Pushing to `main` runs GitHub Actions and publishes GitHub Pages automatically.

Repo must stay **public** for the free share link to work for people without GitHub accounts.

## Disclaimer

This twin is for orientation and discussion. Confirm engineering decisions against official drawings and tender documents.
