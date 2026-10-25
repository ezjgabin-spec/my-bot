# Outcome readiness review

This branch preserves the home screen and existing dashboard. Analytics gains a separate real-world readiness meter. Existing historical predictions are preserved; no retroactive range claims are made.

## Saved predictions

Select a completed practice exam or graded essay in Analytics, enter its class, teacher, current running grade and your own guess, then lock the range. One locked readiness record is allowed per assessment. Predictions and baselines have no editing endpoint. Outcomes are recorded once against that record. Source IDs are account-scoped. The plain-Claude baseline is a separate metered request against the frozen information and cannot be added after the outcome. Historical outcomes provided to that comparison belong to other assessments and precede the new prediction.

The target coverage is 80%, not an assertion of achieved accuracy. Until 30 prior class/teacher/type outcomes exist, ranges use a provisional ±20-point width around the existing prediction center. Afterward, an empirical absolute-error quantile sets the width. Observational residual calibration does not guarantee future coverage. Bounds are clipped to 0–100. Dashboard metrics report realized coverage, mean width and midpoint error against the student guess, running grade and prospective Claude interval. Each comparison displays its sample count; cohorts can differ when a baseline is missing. Do not interpret these as a randomized trial or a statistically validated product claim.

## Question auditing

A separate model call receives questions and source text, without proposed keys. Source quotations must match the supplied material. Qualitative answers are compared with this independent pass. Computational checks use a bounded operation schema: sum, product, mean, difference, ratio, power and sample standard deviation. The code computes numeric keys and corrects a mismatched key when a unique numeric choice (or written numeric response) is available.

**This is not a universal symbolic solver.** Unsupported expressions, units, proofs, qualitative science, insufficient evidence, ambiguous numeric options and extraction failures are flagged unverified. A computed result validates the extracted operation, not the model's interpretation of natural language. Mismatch/unverified warnings appear during practice; audit details appear after submission. Difficulty tags are preserved. Flagged questions can still affect practice scores; review them before treating those scores as strong readiness evidence. Additional subject-specific solvers and validated templates would be needed to claim full computational coverage.

Audit calls and repeated essay grading consume existing credits. No Stripe settings are changed.

## Essay grading

Three separate grade calls use the teacher rubric when provided, otherwise the explicitly labeled generic writing criteria. Previous teacher feedback is withheld from these scoring calls to avoid accidentally including the target grade. Original runs are retained. The UI shows midpoint spread, rubric kind, and low confidence above a 10-point spread. The combined displayed interval spans all three runs; it is not itself a statistically validated 80% interval. The separately locked readiness interval is evaluated prospectively.

## Scripts

- `STUDYPREDICT_ORIGIN=https://your-host STUDYPREDICT_COOKIE=... node scripts/evaluation/plain-claude.mjs PREDICTION_ID` runs the same metered prospective comparison endpoint as the UI. Supply your own session cookie securely via environment settings, never commit it. Run before entering the actual outcome.
- `node scripts/evaluation/key-audit.mjs exported-questions.json` reports mismatch rate among checked questions and unverified rate. Input is an array of questions or an object with a `questions` array containing saved `keyAudit` fields. This reports stored verification results; it does not pretend to independently solve unsupported subjects.
- `node scripts/evaluation/essays.mjs ./samples --run` makes three paid provider calls per sample using `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL`. Samples are JSON files containing `essay`, `actualGrade` (0–100), optional `assignment`, `rubric`, and `className`. Actual grades and identifiers are withheld from Claude. Output includes per-sample errors, spread, token usage and overall MAE. Uses the application's grading prompt/schema; these offline evaluation calls are billed directly to the configured provider key, outside customer credit wallets. The results are retrospective benchmarks, never prospective public-accuracy records. Node 24 supports importing the shared schema's TypeScript file.

## Public accuracy

`/accuracy` and `/api/accuracy` expose aggregates only, suppressing results until 30 matched predictions/outcomes. A baseline's metric is separately suppressed if it has fewer than 30 comparisons. No names, classes, teachers, essays or individual grades are returned publicly. Outcomes are self-reported and may be biased. If Cloudflare Access protects the entire hostname upstream, its owner must explicitly exempt these two paths before they are reachable anonymously; this branch does not change Access or deployment settings.

## Review status

No deployment or merge is authorized. Real provider accuracy remains unmeasured until graded samples and prospective outcomes are collected. Automated tests use provider mocks and do not establish model accuracy.
