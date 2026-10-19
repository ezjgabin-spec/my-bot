# Gen 2 implementation stages

Each stage is reviewed independently. No automatic merging, deployment, Stripe changes, or replacement of the live prediction formula is authorized.

## Stage 1: Flashcard Studio

- Free manual cards and deterministic Smart Import (equals, colons, tabs, spaced dashes, and numbered/bulleted lists).
- Editable preview, visible skipped lines, duplicate-pair filtering, and explicit Save. No AI calls or test allowance deductions for import, manual creation, saving, or review.
- Existing deck IDs, mastery queues, one-time yellow behavior, animations and undo are preserved. Existing desktop files gain an empty draft collection without discarding decks.
- AI Smart Flashcards accepts saved documents or pasted guides, 5–100 requested cards, and at most 400,000 characters. All source sections are processed; small decks cannot represent every detail. Exact duplicate questions are removed, and the preview reports if fewer unique cards remain.
- Server-side access requires an active paid plan or family access. Existing Ultra subscribers retain access. This stage reuses current billing balances and does not set new tier prices or allowances.
- Each AI call uses existing reservations, provider usage reconciliation and pricing, under the distinct `flashcards` operation. A request ID replays its saved preview without another generation. Running or failed requests cannot automatically run twice; starting a new request is an explicit billable action. Interrupted requests keep their existing metering reconciliation rules.
- Preview bodies expire after seven days when subsequent generations are requested; request tombstones remain to prevent duplicate calls. Saved decks never expire. A failed multi-section request may consume credits for work already processed.
- Red/yellow cards linked to the selected material inform quiz topic selection. Self-marked green cards are never used as assessment scores or prediction inputs.
- Technical limits: 500 cards and 800 KB per save, 100,000 characters per deterministic import. These are request-size protections, not monthly creation/review quotas.

No new infrastructure or secrets are required for this stage. Existing Claude configuration is needed only for AI Smart Flashcards. Existing document upload/interpretation prepares files for the saved-document source.

## Remaining stages

2. Simple/Advanced test builder: saved teacher settings, exact format distributions, coherent shared passages, explicit adaptive versus exam preparation modes.
3. Math workspace: accessible drawing tools, saved strokes, metered recognition with student confirmation, step-aware grading and partial credit.
4. Prospective prediction research and reality checks: retain production predictions, snapshot 5–10 versioned candidates before outcomes, isolate assessment formats, evaluate MAE/median error/bias/stability without leakage. Include the capped personalized adjustment candidate and a simple-average baseline.
5. Writing Lab: Study grading/rubrics and uncertainty; Plus revisions/model examples/Humanize with a visible combined credit bound; private owner benchmarks hide actual grades from the independent model estimate.
6. Feature/plan cost dashboard, reviewed Free/Study/Plus rollout, configurable allowances, signup/monthly free-test entitlements and integration. Planned prices are $0/$4.99/$9.99; no new allowances have been chosen, and existing Stripe products and subscription balances remain unchanged pending approval.

The earlier public-pricing/account-privacy work is preserved separately on the local `codex/account-pricing-checkpoint` branch. Main subsequently received verified password accounts; integrate the compatible privacy/public-page pieces in a separate review rather than replacing that newer authentication system.
