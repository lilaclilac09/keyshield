# KeyShield Pitch Materials

Executive pitch deck and assets for investors, hackathon judges, and stakeholders.

---

## Contents

| File | Description |
|------|-------------|
| [PITCH_DECK.md](PITCH_DECK.md) | Executive slides (8–10 slides) in Markdown |
| [PRESENTATION_SCRIPT.md](PRESENTATION_SCRIPT.md) | 2-minute demo script (technical points + flow) |
| [assets/DIAGRAMS.md](assets/DIAGRAMS.md) | All Mermaid diagrams (flows, architecture, MPC, routing) |
| [assets/](assets/) | Rendered diagram images (optional; see Export below) |

---

## Export to PDF with Rendered Diagrams

The pitch deck is in Markdown with embedded Mermaid. To get a PDF with rendered diagrams:

**Note**: Marp uses Puppeteer/Chrome for PDF export. If export fails (e.g. "Target closed"), try running in a local terminal with Chrome installed, or use Option 3 (render diagrams separately).

### Option 1: Marp (recommended for slide-style PDF)

```bash
# Install Marp CLI
npm i -g @marp-team/marp-cli

# From repo root: export PITCH_DECK.md to PDF (Marp renders Mermaid)
marp docs/pitch/PITCH_DECK.md --allow-local-files -o docs/pitch/PITCH_DECK.pdf
```

Marp supports Mermaid in slides; diagrams in fenced code blocks will render.

### Option 2: md-to-pdf (single long-form PDF)

```bash
# Install md-to-pdf (supports Mermaid via Puppeteer)
npm i -g md-to-pdf

# From repo root
md-to-pdf docs/pitch/PITCH_DECK.md -o docs/pitch/PITCH_DECK.pdf
```

### Option 3: Render diagrams first, then PDF

1. **Export Mermaid to PNG/SVG** (from [assets/DIAGRAMS.md](assets/DIAGRAMS.md)):
   ```bash
   npm i -g @mermaid-js/mermaid-cli
   # Extract each mermaid block to a .mmd file, then:
   mmdc -i diagram1.mmd -o docs/pitch/assets/architecture_diagram.png
   ```
2. **Reference images in PITCH_DECK.md** (e.g. `![Architecture](assets/architecture_diagram.png)`).
3. **Export Markdown to PDF** with any tool (Pandoc, md-to-pdf, VS Code “Markdown PDF” extension).

### Script (root package.json)

From repo root you can add:

```json
"scripts": {
  "docs:pitch-pdf": "marp docs/pitch/PITCH_DECK.md --allow-local-files -o docs/pitch/PITCH_DECK.pdf"
}
```

Then run: `npm run docs:pitch-pdf` (after installing Marp).

---

## Diagram Assets

- **architecture_diagram.png** — Full architecture (client, privacy, blockchain, routing).
- **flow_comparison.png** — Detection flow: Bitwarden vs KeyShield.
- **roadmap_timeline.png** — Optional: roadmap Gantt or timeline.

Generate these from the Mermaid sources in [assets/DIAGRAMS.md](assets/DIAGRAMS.md) using mermaid-cli, or use a Mermaid renderer (e.g. GitHub, VS Code) and export/screenshot.

---

## Quick Links

- [Technical architecture](../technical/TECHNICAL_ARCHITECTURE.md)
- [Product roadmap](../roadmap/PRODUCT_ROADMAP.md)
- [Implementation plan](../roadmap/IMPLEMENTATION_PLAN.md)
