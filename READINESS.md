# Outcome readiness review

This branch preserves the home screen and existing dashboard. Analytics gains a separate real-world readiness meter. Existing historical predictions are preserved; no retroactive range claims are made.

## Saved predictions

Select a completed practice exam or graded essay in Analytics, enter its class, teacher, current running grade and your own guess, then lock the range. One locked readiness record is allowed per assessment. Predictions and baselines have no editing endpoint. Outcomes are recorded once against that record. Source IDs are account-scoped. The plain-Claude baseline is a separate metered request against the frozen information and cannot be added after the outcome. Historical outcomes provided to that comparison belong to other assessments and precede the new prediction.

The target coverage is 80%, not an assertion of achieved accuracy. Until 30 prior class/teacher/type outcomes exist, ranges use a provisional ±20-point width around the existing prediction center. Afterward, an empirical absolute-error quantile sets the width. Observational residual calibration does not guarantee future coverage. Bounds are clipped to 0–100. Dashboard metrics report realized coverage, mean width and midpoint error against the student guess, running grade and prospective Claude interval. Each comparison displays its sample count; cohorts can differ when a baseline is missing. Do not interpret these as a randomized trial or a statistically validated product claim.

## Question auditing

A separate model call receives questions and source text, without proposed keys. Source quotations must match the supplied material. Qualitative answers are compared with this independent pass. Computational checks use a bounded operation schema covering arithmetic, powers, roots, logs, exponentials, linear equations, median, sample/population standard deviation, sample variance, binomial mass/CDF and normal CDF (approximate absolute error below 8e-8). Up to 32 intermediate steps can reference earlier computed values; no generated code is executed. Binomial calculations are limited to n ≤ 10,000. Explicitly requested decimal rounding is supported. The code computes numeric keys and corrects a mismatched key when a unique numeric choice (or written numeric response) is available.

**This is not a universal symbolic solver.** Unsupported expressions, units, proofs, qualitative science, insufficient evidence, ambiguous numeric options and extraction failures are flagged unverified. A computed result validates the extracted operation, not the model's interpretation of natural language. Mismatch/unverified warnings appear during practice; audit details appear after submission. Difficulty tags are preserved. Flagged questions can still affect practice scores; review them before treating those scores as strong readiness evidence. Additional subject-specific solvers and validated templates would be needed to claim full computational coverage.

Audit calls and repeated essay grading consume existing credits. No Stripe settings are changed.

## Essay grading

Three separate grade calls use the teacher rubric when provided, otherwise the explicitly labeled generic writing criteria. Previous teacher feedback is withheld from these scoring calls to avoid accidentally including the target grade. Original runs are retained. The UI shows midpoint spread, rubric kind, and low confidence above a 10-point spread. The combined displayed interval spans all three runs; it is not itself a statistically validated 80% interval. The separately locked readiness interval is evaluated prospectively.

Teacher rubrics can be pasted or uploaded as PDF, DOCX or TXT while creating an essay. Extracted criteria are shown for review before grading; extraction uses no AI credits. Documents over the rubric's 12,000-character limit are rejected with a request to select the rubric pages, rather than silently truncated. Rubrics and assignment instructions stay fixed within that essay's history.

## Scripts

- `STUDYPREDICT_ORIGIN=https://your-host STUDYPREDICT_COOKIE=... node scripts/evaluation/plain-claude.mjs PREDICTION_ID` runs the same metered prospective comparison endpoint as the UI. Supply your own session cookie securely via environment settings, never commit it. Run before entering the actual outcome.
- `node scripts/evaluation/key-audit.mjs exported-questions.json` reports mismatch rate among checked questions and unverified rate. Input is an array of questions or an object with a `questions` array containing saved `keyAudit` fields. This reports stored verification results; it does not pretend to independently solve unsupported subjects.
- `node scripts/evaluation/essays.mjs ./samples --run` makes three paid provider calls per sample using `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL`. Samples are JSON files containing `essay`, `actualGrade` (0–100), optional `assignment`, `rubric`, and `className`. Actual grades and identifiers are withheld from Claude. Output includes per-sample errors, spread, token usage and overall MAE. Uses the application's grading prompt/schema; these offline evaluation calls are billed directly to the configured provider key, outside customer credit wallets. The results are retrospective benchmarks, never prospective public-accuracy records. Node 24 supports importing the shared schema's TypeScript file.

## Public accuracy

`/accuracy` and `/api/accuracy` expose aggregates only, suppressing results until 30 matched predictions/outcomes. A baseline's metric is separately suppressed if it has fewer than 30 comparisons. No names, classes, teachers, essays or individual grades are returned publicly. Outcomes are self-reported and may be biased. If Cloudflare Access protects the entire hostname upstream, its owner must explicitly exempt these two paths before they are reachable anonymously; this branch does not change Access or deployment settings.

## Review status

No deployment or merge is authorized. Real provider accuracy remains unmeasured until graded samples and prospective outcomes are collected. Automated tests use provider mocks and do not establish model accuracy.

## Same-stage personal comparison

Completed test results and readiness analytics now compare the latest distinct practice test with the same-numbered practice test before earlier real exams. For example: practice #2 was 65%, the real grade was 89%; practice #2 for the current exam is 78%, a 13-percentage-point improvement at the same stage. This is a contextual readiness signal, not an automatic 13-point increase in the predicted real grade.

Comparisons require matching class, teacher, effective question format and difficulty. Class/teacher labels ignore case and extra whitespace. Attempts are sorted by completion time, and only the first completed attempt on each distinct generated test counts as a stage. A previous exam must have a real outcome recorded before the comparison cutoff. Essays, the same assessment, later outcomes, missing stages and incompatible tags are excluded. The UI shows the number of matched earlier exams and up to five recent examples. Matching tags alone do not establish equal difficulty across topics.

On recording a real grade through the readiness meter, timestamped practice stages are frozen beside that outcome. Earlier readiness records can use original attempts still present in storage, limited to completions before the actual grade timestamp; no missing scores are invented. Historical exams without known class/teacher/outcome links cannot be confidently matched. Once an exam has a locked readiness record, its stored class/teacher tags take precedence over form input. The comparison updates from current practice results without changing any locked prediction range. These comparisons require no extra AI requests or credits.

## Older results and essay stages

Analytics → Class and teacher history tags current or older tests and essays. Tagging older graded work freezes its available pre-result stages as historical context in a separate account-scoped collection. It never creates a backdated readiness prediction or adds those outcomes to prospective error/coverage statistics. Missing/deleted original attempts cannot be reconstructed. Locked prediction tags remain immutable.

Writing Lab → Grade my essay now accepts a revised draft for a saved essay. Each grading revision preserves the exact text and rubric used while retaining the original. A stage is the first grade of a distinct draft (whitespace-only changes and repeated grading do not advance it). Historical essay comparisons require the same class, teacher, normalized rubric and grading method, and an earlier numeric actual grade. Single-pass legacy grades are not treated as equivalent to the new three-run method. Generic-rubric comparisons are still only context; matching rubrics do not establish equal assignment difficulty. Letter-only outcomes are excluded from percentage comparisons.

Recording a numeric outcome through the exam, essay, or readiness form links and freezes the associated readiness outcome and its stage history. Conflicting later changes are rejected. Essay grading is blocked after any real teacher outcome; new assignments require a new essay. A real grade arriving while a grading request is running prevents that result from being saved as a pre-result forecast. Changes in current practice or drafts do not rewrite a locked range.

All benchmark matching and context tagging are deterministic and require no AI usage. Essay grading and answer audits remain metered. Validation of achieved accuracy still requires real graded samples and prospective outcomes; automated checks cannot replace that evidence.

## Verification for private comparisons

- 207 automated tests pass, including D1 account isolation, frozen outcomes, same-stage comparisons, rubric extraction, changed-draft grading and bounded numeric computations.
- Five browser checks pass, including preserving the analytics layout on mobile, the 65 → 78 / actual 89 example, tagging older essays, and uploading a rubric before grading an edited draft.
- Type checking, production build, Cloudflare/OpenNext build and targeted lint pass. Repository-wide lint still has unrelated pre-existing failures in legacy pages.
- No live provider calls or production deployments were made. Accuracy evaluation scripts are ready for real sample data; their existence does not demonstrate predictive accuracy.
