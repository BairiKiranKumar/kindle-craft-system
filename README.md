# Kiran Kindle Craft System (KKCS) v1.0

**Agent-agnostic coloring-book workflow.** One folder. Many themes. One validated handoff. Produce a print interior, full-spread paperback cover, metadata/marketing pack, and quality checklist. **No auto-publishing, auto-sign-up, passwords, guarantees, or API expenditure.**

## Quick start

Requires Python 3.10+, Pillow, ReportLab, pypdf. In a terminal opened at this folder:

```bash
python -m pip install -r requirements.txt
python scripts/kiran.py new --theme birds --slug happy-little-birds --title "Happy Little Birds" --count 50
python scripts/kiran.py status --project happy-little-birds
```

Existing starter:

```bash
python scripts/kiran.py status --project little-animal-adventures
```

1. Open `AGENTS.md`, then `products/<slug>/HANDOFF.md`. Tell whichever AI agent you use to read both before changing anything.
2. Use the agent prompt in `docs/agent-workflow.md` to research and edit the 50 distinct illustration prompts in `scenes.json`. The agent must date its sources and **never invent Amazon sales**.
3. Generate **original, rights-cleared, clean high-resolution line art** outside the CLI using your available approved image generator. Save exact filenames as `assets/art/001.png` through `assets/art/050.png`; optionally make a separate, genuine color cover image at `assets/cover/front_art.png` (the CLI does **not** have image-generation API access). Recommend ~2550×3300 pixels for each 8.5×11 page.
4. Check each scene visually for age-suitability, anatomy, consistency, text/artifacts, rights and actual uniqueness. Only you may change `approved` and `rights_checked` to `true` for each item in `scenes.json`.
5. Write truthful `metadata.json` text and verify brand/trademark and rights. Change all four booleans in `project.json` **only after actual verification**: `rights_verified`, `brand_name_cleared`, `description_reviewed`, `age_range_checked`. Set `metadata.json` `claims_checked` true and choose relevant KDP categories from live picker.
6. Run:

```bash
python scripts/kiran.py validate --project little-animal-adventures
python scripts/kiran.py build --project little-animal-adventures
python scripts/kiran.py pricing --pages 52
```

7. Review `exports/interior_8.5x11_no_bleed.pdf`, `exports/cover_full_wrap.pdf`, `exports/kdp_manual_entry.txt`, `exports/product_manifest.json`, and `reviews/automated_qa.json`. **Review full cover against KDP's official cover template**, use KDP's Print Previewer, order a physical proof and inspect it before publication. A local PASS only means machine-readable checks passed, **not Amazon approval**.

## Output status

The included `products/little-animal-adventures/` has **50 original scene briefs**, book structure, working branding and metadata skeleton. Artwork, trademark clearance, Amazon categories and rights approvals are deliberately blocked until performed. **It is not upload-ready yet.**

## Tool handoff

- Cursor: `.cursor/rules/kiran-kindle-craft.mdc` + root `AGENTS.md`.
- Claude Code: `CLAUDE.md` + root `AGENTS.md`.
- Codex: root `AGENTS.md`.
- Antigravity / Gemini-based tools: `GEMINI.md` + root `AGENTS.md`.
- If a tool ignores its named instruction file, paste the universal prompt from `docs/agent-workflow.md`.

Only one agent edits production files at a time. Another agent should read `HANDOFF.md`, check Git status and continue, rather than re-creating files. Use Git commits after each approved stage.

## Production order

`01 research` -> `02 market differentiation` -> `03 prompts/scenes` -> `04 images` -> `05 image QA` -> `06 cover` -> `07 metadata` -> `08 local build & QA` -> `09 proof copy & KDP preview` -> `10 manual publish` -> `11 sales/experiments`.

A prompt alone does not generate images or cause KDP uploads. KDP credentials and banking/tax identifiers never belong in this repo.

## Critical KDP details (verified Oct 2026)

- KDP interior: printable **single pages**, no bleed, 8.5×11 inches in this template.
- KDP cover: one PDF spread, back+spine+front, 0.125-inch exterior bleed; **no spine text below 79 pages**.
- Current Amazon.com large-trim black ink white paper 24–110 pages printing cost is $2.84. US paperback rates: 50% below $9.99 and 60% at/above $9.99. Calculator supports **only these market/spec assumptions**; confirm live pricing in KDP.
- Coloring books generally are **not** low-content books; verify content-specific exceptions.
- AI-generated image disclosure required for cover or interior artwork. An AI tool used only for ideas or human-edited originals is different. See official content guideline.
- Coloring books are **excluded from Expanded Distribution**.
- KDP paperback distribution does not directly include Amazon.in. India-focused physical sales need a separate printer/distributor path.
- Royalties typically pay ~60 days after the month of sale, with withholding/tax/transfer conditions.

Official links:
https://kdp.amazon.com/en_US/help/topic/G201834340
https://kdp.amazon.com/en_US/help/topic/G201834330
https://kdp.amazon.com/en_US/help/topic/G200644110
https://kdp.amazon.com/en_US/help/topic/GGE5T76TWKA85DJM
https://kdp.amazon.com/en_US/help/topic/G201953020
https://kdp.amazon.com/en_US/help/topic/G201857950
https://kdp.amazon.com/en_US/help/topic/GQTT4W3T5AYK7L45
https://kdp.amazon.com/en_US/help/topic/G201834280

## Visual-review contact sheet

Once pages are present, run `python scripts/kiran.py contact --project <slug>` to export `reviews/contact_sheet.jpg` with up to 50 thumbnails and each page's human-approval status.

## Proof of engineering test

The CLI was smoke-tested against 24 synthetic, rights-free geometric illustrations (test-only data, never intended for sale). The test generated a 26-page 8.5x11 manuscript and a correct one-piece wrap cover, both checked for PDF page geometry. The synthetic fixtures were deleted from this handoff. This **does not** validate artistic quality, physical-print approval, IP status or Amazon acceptance for a finished product.
