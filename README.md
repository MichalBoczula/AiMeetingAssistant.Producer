# AI Meeting Assistant — Producer

Angular camera producer for AI Meeting Assistant. It captures photos automatically,
sends them to the existing Azure Function, and lets the separate Client display
the analysis received through SignalR.

## Current scope

The page has one camera icon and a live preview. Tap the icon to start the rear
camera, grant permission, and send the first JPEG once a video frame is ready.
Further capture attempts run every 30 seconds. Tap the same icon to stop.
There is no manual photo or upload button, and opening the page does not access the camera.

Each upload contains `file`, `sessionId`, and a unique `requestId`. The Producer
does not receive the AI answer; open the existing Client to see it through SignalR.
Photos are not intentionally persisted by this application.

Only one capture/upload can be pending at a time. A tick during an upload is
skipped, without queuing or catching up. Stop releases the camera, timer, and
screen wake lock. An upload already sent is allowed to finish; restart remains
disabled until it settles. Stop cannot cancel analysis already running on Azure.

Keep the page visible and the phone unlocked. Hiding the page stops the session;
return and tap the icon to resume. Screen Wake Lock is requested when supported,
but the operating system may refuse or release it; the page displays a notice.
This browser app does not promise background or locked-screen capture.

## Requirements

- Node.js 24.19.0 (see `.nvmrc`).
- npm 11.9.0 (see `packageManager` in `package.json`).

Use the same versions locally and in CI. The repository uses Angular 21,
TypeScript 5.9, SCSS, and Vitest; it does not use SSR or a router.

## Development

```powershell
npm install --global npm@11.9.0
npm ci
npm start
```

Open `http://localhost:4201`. Port 4201 leaves port 4200 available for the existing
Client. Install Node.js first if it is not already available.

## Configuration

Edit `producerConfig` in `src/app/app.config.ts`:

- `analyzeScreenshotEndpoint`: full public Function URL ending in
  `/api/analyze-screenshot`.
- `captureIntervalMs`: interval between capture attempts, default `30_000`.

The capture panel, upload service, and scheduler use `PRODUCER_CONFIG`.
This is build-time frontend configuration, not an Azure server-side app setting.
Rebuild and redeploy after changing it. Do not place Foundry keys or other secrets here.

## Structure

- `src/app/core/config`: typed configuration and injection token.
- `src/app/core/camera`: rear camera/JPEG adapter and Screen Wake Lock lifecycle.
- `src/app/core/api`: multipart HTTP upload to the existing Function.
- `src/app/features/capture`: single-button panel and automatic capture session.
- `src/app/app.ts`: application shell.
- `.github/workflows/ci.yml`: reproducible install, formatting, build, and tests.

The Producer does not need a SignalR client. Camera and upload adapters can be
replaced with test doubles when testing the scheduler.

## Verification

```powershell
npm run format:check
npm run build
npm test -- --watch=false
```

`npm run format` applies formatting. `npm test` runs the interactive test command.
Tests cover the camera/JPEG adapter, multipart contract, scheduling, pending
upload exclusion, Stop/start races, visibility, 429 cooldown, and wake lock.
They use browser/HTTP doubles and do not exercise a real camera, Foundry, or Azure.

## Error behavior

- Camera permission or capture errors stop the session with a visible message.
- HTTP 429 pauses new captures for at least 60 seconds, or longer when a readable
  `Retry-After` header says so. Stop/Start does not bypass this cooldown.
- HTTP 502 displays the analysis failure and tries a fresh photo on a future tick.
- Other HTTP or network errors stop the session. The failed POST is never replayed.
  A network error may still have reached the server; check the connection before restarting.
- A slow/pending upload remains visible as Sending and blocks further captures.

The service currently returns no `Retry-After` header. If one is added, expose it
through Function CORS for browser access; otherwise the 60-second minimum applies.

## Build and deployment

```powershell
npm run build
```

Static output is `dist/ai-meeting-assistant-producer/browser`. This directory will
be deployed to a separate Azure Static Web App in the deployment increment.
No deployment or Azure resource provisioning is configured by this PR.

Later, add the Producer origin to Function App CORS. For local development, that
origin is `http://localhost:4201`. Camera testing on a phone requires HTTPS;
plain HTTP to a computer's LAN address is not equivalent to localhost.
The existing Client retains its own Function and SignalR CORS origins.

## Samsung S25 smoke test after deployment

1. Deploy the browser output over HTTPS and add its exact origin to Function CORS.
2. Open the Producer on the phone and the existing Client on another screen.
3. Tap the camera icon, allow camera access, and point the rear camera at the training
   question. Keep all answer choices visible and the text sharp.
4. Verify a JPEG request reaches the Function immediately, followed by capture
   attempts every 30 seconds, and the Client receives the response.
5. Change the question, then verify a later answer corresponds to the new frame.
6. Tap the icon to stop: camera indicator and preview should disappear, with no new uploads.
7. Repeat with denied permission, a hidden page, a slow request, and a rate-limit response.

The rear camera preference and 1920x1080 resolution are requested as ideal
constraints; actual device settings may differ. JPEG quality is 0.9. Verify text
readability on the actual phone; no cropping or separate OCR is performed here.

## Remaining integration work

1. Photograph-aware question instructions in the existing Foundry adapter.
2. Consistent error events in the backend and Client.
3. Azure deployment, CORS, and Samsung S25 end-to-end verification.

The existing Function analyzes synchronously before responding with HTTP 202.
The future Producer must wait for that request to finish and avoid overlapping uploads.
