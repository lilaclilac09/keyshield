# KeyShield marketing site

Static site served at https://ks.aileena.xyz (Vercel project `keyshield-landing`, root `sites/landing`).
No build step: `index.html` holds the page, CSS and JS. Production deploys on every push to `main`.

- `og.png` is the 1200×630 social card, `favicon.svg` and `apple-touch-icon.png` are the icons.
- Preview locally with `python3 -m http.server -d sites/landing 8765`.
- Copy rule: every claim must point to something in the repo. No invented customers, metrics, logos or pricing.
