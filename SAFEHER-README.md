# Qoder Sites React starter

A React, TypeScript, Vite and Tailwind frontend with a bundled Shadcn component catalog. Vite produces static files in `dist/`. Server behavior belongs in the optional Qoder Sites Function, not a Node or framework server.

## Develop

Use Node 22.12 or later in the 22.x series:

```sh
npm ci
npm run dev
```

Use the loopback URL printed by Vite. Edit `src/App.tsx`, `src/globals.css` and the title/description in `index.html`. Replace the sample page with the requested product before presenting a first meaningful preview. Import existing UI primitives from `@/components/ui/<component>` and compose them for the site's design. The neutral starter theme is a starting point, not the finished visual direction.

For production output:

```sh
npm run build
npm run preview
```

The build fixes `NODE_ENV=production` before loading Vite, independently of the terminal environment. It checks the frontend and bundled component types and emits `dist/index.html` and assets. `npm run preview` serves this output locally. Reuse passing checks while source is unchanged; no additional unit-test suite or browser QA is required by the template.

On Windows, `start-dev.bat` starts the dev server using the bundled Node 22 in `.tools/` (the project requires Node 22.x, so a system Node 24 will fail the engine guard).

## Live demo (scream detection)

Route `/live-demo` is an on-device scream detector. It captures the microphone with an `AudioWorklet` (ScriptProcessor fallback), classifies sound with MediaPipe YAMNet, and when a scream is detected runs a 10-second "Are you OK?" countdown that fires a simulated SOS panel with a Web Audio siren if not cancelled. A sensitivity slider sets the trigger threshold (0.3–0.8) and a 30s cooldown prevents re-triggering.

All audio is processed locally in the browser — nothing is recorded or uploaded, and there is no backend for this page. The MediaPipe runtime loads from the jsDelivr CDN; the YAMNet model is bundled at `public/models/yamnet.tflite` and the audio worklet at `public/worklets/mic-processor.js`. Source: `src/pages/LiveDemo.tsx`, `src/hooks/useScreamDetector.ts`, `src/lib/siren.ts`. Client-side routing is hand-rolled in `src/router.tsx`, and `vercel.json` provides the SPA fallback so the deep link resolves.

Detection uses a general-purpose sound model and is not guaranteed; use the in-page "Simulate scream" button to walk the countdown → SOS → reset flow without a microphone.

## Optional Function

The default page is entirely static and does not call a Function. For server behavior, adapt the public, credential-free example in `functions/handler.ts`. `functions/index.ts` is the Deno deployment entry point. With Deno installed, use a separate terminal:

```sh
npm run check:function
npm run dev:function
```

The local service binds to `127.0.0.1:8000`; Vite development and built preview proxy `/functions/v1/app` to it, preserving the path. For example:

```sh
curl --fail 'http://127.0.0.1:5173/functions/v1/app?name=Visitor'
```

Use Vite's actual port if it differs. The same frontend request after deployment is routed by Qoder Sites. Local proxy configuration is not production routing. Keep local-only servers and fixtures in `dev/`, outside both publication directories. The included Function has no dependencies; add self-contained runtime imports as required. Frontend npm dependencies are not automatically installed in Functions.

## Publish with Qoder Sites

Open a local conversation in this project and follow the `sites-hosting` skill. Workspace registration is optional. Use the directory returned by `get_local_context` with:

- `webDirectory: "dist"` after the build.
- `spa: true` — required, since `/live-demo` is a client-side deep route that needs the fallback.
- `functionDirectory: "functions"` only if the application uses the Function. Omit it for static-only delivery.

The Sites tools prepare artifacts and generate the publication descriptor; publish completed hosted work by default, unless the user explicitly requests a preview first or defers publication. Do not upload the project root, `node_modules`, `dev`, or source as the web artifact. A successful build or release does not prove an external integration works.

For a database-backed React page, the installed `sites-building` Skill provides `assets/database-react/App.tsx` and a matching three-file database Function. Follow its `references/database.md` to connect the page, apply the reviewed schema and publish. These optional assets stay in the Skill rather than being copied into every static project.

For database or Storage, follow the corresponding `sites-building` references and `sites-management` capability workflow. For AI, follow `sites-build-agent-app` and keep Cloud Agents access in the Function. Application credentials belong in server-side Sites Settings; frontend environment variables are public. This starter does not implement visitor login, database permissions, Cloud resource coordination or QCA sessions; add those only for the requested feature using the existing skills.

See `PROVENANCE.md` and `vendor/` for source attribution and the preserved stylesheet license.
