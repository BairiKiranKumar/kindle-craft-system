# AGENTS.md - Portable operating instructions for ALL coding agents

You are working on **Kiran Kindle Craft System**, a local ethical children's coloring-book publishing workflow. Your objective is a print-quality, unique and correctly described physical paperback, **NOT mass content flooding**.

## First read, each session
1. `README.md` and `rules/PUBLISHING_POLICY.md`.
2. The active `products/<slug>/HANDOFF.md`, `project.json`, `scenes.json`, `metadata.json`, `reviews/review.md`.
3. Run `python scripts/kiran.py status --project <slug>` and inspect Git diff.

## Immutable rules
- **Do not** bypass the `validate` command, falsify `approved`, `rights_checked`, `rights_verified`, `brand_name_cleared`, or metadata verification. Only Kiran manually sets human gate flags.
- Do not invent market data, reviews, bestseller ranks, sales, keyword volume, brand-clearance results, or ISBNs. Include source URL + date in research records.
- Do not claim copyright or trademark clearance without actual validation. Avoid copyrighted characters, artists' names, celebrity likenesses, brand logos, trademarked phrases and derivative covers.
- AI-produced cover and interior art must be disclosed at KDP by the user when applicable; no concealment or inaccurate 'human drawn' marketing claims.
- Do not store credentials, PAN, TIN, identity cards, bank details, OTPs, API tokens or private customer data in project files or logs.
- KDP uploads, account setup, tax forms, previews and publishing are manual user actions, not automated through an unofficial interface.
- For ages 3–5: clean bold outlines, anatomically coherent, few elements, distinct scenes, large white spaces; no weird fingers/limbs, illegible words, stray shading, gray smudges or copied public artwork.
- No rapid low-quality republishing or duplicated interiors under different titles. Each book must contain genuinely new value.
- For Amazon.com 8.5x11 B&W white, no-bleed interior and full-bleed wrap cover; **do not change specs without changing the script and verifying official KDP guidance**.
- Marketing copy must match actual book exactly. No promises of learning outcomes or false five-star endorsements.
- Do not automatically buy ads or spend image credits. Respect generator licensing and limits.

## Session procedure
At start: state stage, missing assets, next action. At end: write concise `HANDOFF.md`: what done, file changes, QA results, blocked items, next exact action. Commit to Git only if user requests.
Each stage should have objective evidence and a one-line conclusion. Favor quality and reproducibility over throughput.

## Commands
- New theme: `python scripts/kiran.py new --theme birds --slug happy-little-birds --title "Happy Little Birds"`
- Progress: `python scripts/kiran.py status --project <slug>`
- Quality check: `python scripts/kiran.py validate --project <slug>`
- Build finished: `python scripts/kiran.py build --project <slug>`
- Estimate: `python scripts/kiran.py pricing --pages 52`

## Agent independence
The scripts are pure local Python. GPT, Claude, Antigravity, Cursor, Codex may **author copy, source prompts, review images, or execute scripts** if enabled. None is assumed to have connected image-generation or KDP publishing APIs. Transfer knowledge through the project folder, not model chat history.
