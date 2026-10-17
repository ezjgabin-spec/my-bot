# StudyPredict AI for Windows

StudyPredict supports a Windows desktop app and a Cloudflare-hosted edition for practice tests and school-grade predictions.

**For a shareable online link with separate accounts, see [Cloudflare setup](CLOUDFLARE.md).** It uses email-code sign-in, private D1/R2 storage, and the owner's shared Anthropic key. Anyone with a verified email can sign in by default, with daily AI request limits.

The desktop edition described below stores study data on your PC and uses your own Anthropic API key. It needs no account login, hosting, Supabase project, or database setup.

Uploads support PDF, DOCX, and TXT files up to **20 MB**, PDFs up to **500 pages**, and extracted notes up to **500,000 characters**. Readable PDFs have no minimum text length, though more study material usually produces better questions. Long documents are sampled across sections for each AI request, with focus-topic matches prioritized; the original extracted notes are retained. Scanned PDFs require OCR first. Complex PDFs can still hit hosting CPU or memory limits.

In **Tests & history**, use **Delete test** or **Delete exam**, or select a subject and choose **Delete subject**. A confirmation describes the related attempts, grades, and predictions that will be removed. Saved study materials remain available for reuse. Deletes affect only the signed-in account and cannot be undone in the app.

## Run it on Windows

1. Download the Windows x64 ZIP and choose **Extract All**. Keep the extracted folder together.
2. Open **StudyPredict AI.exe** inside that folder.
3. In **Settings**, paste your full Anthropic key into **Anthropic API key**, then click **Save settings**. Paste only the key, starting with `sk-ant-`. The **Get an Anthropic API key** button opens Anthropic's key page.
4. Click **Create a practice test**. Create an exam, add notes or a document, and generate your test.

An Anthropic API account with credits is required for AI requests; a Claude chat subscription does not supply API credits. The default model is `claude-sonnet-4-6`; it can be changed in Settings. A saved key is not proof that the account has credits or access to that model. Provider errors appear when you make a request.

This is an unsigned development build. Windows may display an unknown-publisher warning. The app has no automatic updater; a new build must be downloaded manually. It targets Windows 10/11 x64.

## Keep it available

The packaged app enables **Start when I sign in to Windows** on its first launch. You can turn this off in Settings or Windows Startup Apps. Closing the window hides it in the system tray; clicking the tray icon reopens it. Right-click the icon and choose **Quit StudyPredict** to exit.

The PC must be awake and signed in for the app to run. It does not prevent sleep, run while the computer is shut down, or generate tests automatically in the background. Saved work remains available after a restart. Keep the extracted app folder in a permanent location; if you move it, save the startup setting again.

## Practice and prediction workflow

- Create a school exam with a subject, name, and optional date. Paste notes, upload PDF/DOCX/TXT, or reuse saved material. Legacy DOC files must first be converted; scanned PDFs need OCR. Upload limits are 20 MB per file, 500 PDF pages, 500,000 extracted characters, and 20 MB expanded DOCX content.
- Choose question count, difficulty, format, and an optional timer. Generated tests are validated and saved before an attempt starts.
- Answers and review flags autosave. Check the save indicator before leaving; failed saves have a retry action. Timers continue while the window is closed or the app is stopped. Reopening an expired attempt submits the last saved answers. Answer keys and rubrics remain hidden until grading finishes.
- Multiple choice uses deterministic grading. Claude grades written/math answers against rubrics, including partial credit. Blank answers score zero. AI grading can make mistakes; review its feedback.
- Submission saves feedback, totals, and the prediction together. Repeated submissions do not duplicate results. Failed grading keeps submitted answers frozen and permits retry. Interrupted grading can be retried after its five-minute lease expires.
- Enter the actual school grade to compare it with the saved forecast and improve future calibration. Correcting a grade preserves its original timestamp and previous forecasts. Create a new exam for practice after recording the actual grade.

## Data and privacy

Study data is stored as `studypredict.json` in your Windows account's application data folder. **Settings → Open data folder** opens it. Successful writes use a serialized queue and atomic file replacement; `studypredict.json.bak` contains the previous successful version. A failed or damaged read does not silently reset your data.

To back up, open that folder, quit the app from the tray, and copy the folder somewhere safe. To restore the automatic backup, quit the app, preserve the damaged file separately, then copy `studypredict.json.bak` to `studypredict.json`. Study data itself is not encrypted. Extracted document text is retained; original uploaded files are not copied. There is no cloud sync or automatic migration from the earlier Supabase prototype.

The API key is stored separately using Electron safeStorage and Windows DPAPI. It is tied to your Windows account and is never returned to the app's page. Re-enter it after moving to another account or computer. There is no plaintext fallback. Selected notes are sent to Anthropic when generating questions; questions, rubrics, and relevant responses are sent for written grading. These requests use API credits.

The local study engine binds only to loopback, uses a random launch-specific session cookie, rejects foreign origins and hosts, and is accessible through the desktop window. The window uses context isolation and a sandbox, with a small validated IPC interface for settings. No network ports need to be opened.

## Prediction model

The engine in [src/lib/prediction.ts](src/lib/prediction.ts) is a transparent personal calibration model.

- Baseline: 65% latest practice score + 35% average + improvement bounded to ±3 points, with difficulty offsets of −10 (Easy), −6 (Medium), −2 (Hard), and −1 (Teacher-Level). These are initial assumptions, not population-validated coefficients.
- Calibration uses one school outcome per exam: its latest saved forecast before the actual grade was entered, also respecting the exam date when known. It excludes the target exam and future outcomes. Correcting an actual grade never rewrites past predictions.
- Residuals use recency, subject, difficulty, format, and topic similarity. Three units of prior weight shrink adjustments toward the baseline; individual residuals are capped at ±20 points.
- Ranges use errors from original saved forecasts and a sparse-data penalty. They are heuristic ranges, not statistically calibrated confidence intervals. Short tests receive additional uncertainty.
- Analytics reports prediction error in percentage points. Improvement trends require ten paired school outcomes; empty states remain empty until enough real data exists.

## Development and builds

Use Node 22.16+ or Node 24. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run desktop:prepare
npm run desktop
```

Electron's binary installation must be allowed by your package manager. A Linux development session needs a graphical display; Linux has no Windows login integration. Systems without a secure OS key store cannot save API keys through desktop Settings.

For a Windows installer and ZIP, run on Windows:

```sh
npm run desktop:win
```

For a Windows ZIP when building from Linux:

```sh
npm run desktop:win:zip
```

Outputs are in `release/`. Cross-building adds the matching Windows x64 canvas binding for PDF extraction. NSIS installer creation requires Windows or a suitable Wine installation; ZIP creation does not. The included manually triggered GitHub Actions workflow builds on Windows and uploads build artifacts without publishing a release.

For UI development, `npm run dev` starts the local Next.js interface on loopback. Optionally copy `.env.example` to `.env.local` and supply a development API key there; this is unnecessary for Windows desktop users. Never commit real keys. Do not expose this development server publicly. The `supabase/` folder is historical prototype material and is not used by the desktop app.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:browser
npm run desktop:prepare
npm run test:desktop
```

Playwright needs Chromium (`npx playwright install chromium`) or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` pointing to an installed browser. Desktop smoke tests need a display and an Electron binary. `node scripts/smoke-desktop.mjs release/win-unpacked/resources/app.asar` exercises the packaged JavaScript and server using the build machine's Electron.

Tests cover prediction, grading, document extraction, local persistence, submission recovery, deadline enforcement, session/origin checks, and UI interactions. Desktop smoke tests exercise settings, PDF/DOCX uploads, local saves, isolation from an outside browser, navigation, close-to-tray, and persistence after restart. AI tests use synthetic mocked provider responses, not real API calls.

Live Claude generation and written grading require your actual key and credits. Windows DPAPI, Windows startup registration, and the Windows executable must be verified on a Windows PC; Linux desktop tests do not establish those platform-specific behaviors.
