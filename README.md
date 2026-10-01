# AI Meeting Assistant — Producer

Angular camera producer for AI Meeting Assistant. The producer will capture a photo,
send it to the existing Azure Function, and let the separate Client display the
analysis received through SignalR.

## Current scope

This first increment contains the standalone Angular application, a mobile-friendly
capture panel, public endpoint configuration, unit tests, and CI. Camera capture
and upload are not implemented yet; the controls are intentionally disabled.
Opening this application does not request camera permission or call the backend.

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
- `captureIntervalMs`: planned interval between capture attempts, default `45_000`.

The capture panel reads the configured interval through `PRODUCER_CONFIG`.
The upload service and scheduler will use the same configuration in later increments.
This is build-time frontend configuration, not an Azure server-side app setting.
Rebuild and redeploy after changing it. Do not place Foundry keys or other secrets here.

## Structure

- `src/app/core/config`: typed configuration and injection token.
- `src/app/features/capture`: capture panel and its tests.
- `src/app/app.ts`: application shell.
- `.github/workflows/ci.yml`: reproducible install, formatting, build, and tests.

Camera and upload services will be added under `core/camera` and `core/api` when
their functionality is implemented. The Producer does not need a SignalR client.

## Verification

```powershell
npm run format:check
npm run build
npm test -- --watch=false
```

`npm run format` applies formatting. `npm test` runs the interactive test command.
Tests verify disabled capture controls, the configured interval, and shell configuration.
They do not exercise a real camera, Foundry, or Azure infrastructure.

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

## Next increments

1. Rear camera preview and manual JPEG capture.
2. Multipart upload with `file`, `sessionId`, and a unique `requestId`.
3. Photograph-aware question analysis in the existing Foundry adapter.
4. Start/Stop capture every 45 seconds, one request at a time, and Screen Wake Lock.
5. Azure deployment and Samsung S25 end-to-end verification.

The existing Function analyzes synchronously before responding with HTTP 202.
The future Producer must wait for that request to finish and avoid overlapping uploads.
