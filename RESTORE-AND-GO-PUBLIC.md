# SafeHer — backup, restore & go-public guide

Saved: 2026-10-06. This folder/ZIP is the complete SafeHer website project:
the 3D cursor-reactive frontend, the waitlist Edge Function, and the frozen
production build that is currently live.

## What is inside

| Path | Purpose |
| --- | --- |
| `src/App.tsx`, `src/globals.css` | The whole 3D site (React 19 + Tailwind v4) |
| `index.html` | Document shell, fonts, metadata |
| `functions/` | Deno Edge Function: waitlist `join` + `ping` (`adapter.mjs` must stay unchanged) |
| `dist/` | The exact frozen build that is published right now (no rebuild needed to republish) |
| `lib/api.ts` | Safe same-origin fetch helper used by the form |
| `dev/` | Local-only test harness + fixtures (never deployed) |
| `components/`, `hooks/`, `vendor/`, `scripts/` | Starter UI kit, build scripts |
| `.SafeHer.qoder.site` | Local preview descriptor (regenerable; safe to ignore if missing) |

Not included on purpose: `node_modules/` (reinstallable), `.tools/` (portable
Node used only for building), and any credentials — the project stores none.
Database credentials are injected by the platform at runtime, never in source.

## Live deployment facts (reuse these, don't recreate them)

- Site: `https://safeher-u5967r8up3y.qoder.website` — **public** since
  2026-10-06 (access revision 2); everyone can open it and join the waitlist
- Project ID: `01a111dc-2b72-7aa0-b4c6-fd3ceba6c367`
- Site ID: `01a111dc-2b73-7d55-8844-2a4ee2a18b14`
- Database schema version: `1` (table `app.waitlist`, UNIQUE email)
- Access policy: anonymous **insert only** — nobody can read the waitlist
  emails, even after the site goes public. Keep it that way.
- Last published action: `7b469a2c-9f6e-4a29-85eb-08a81311c67e`

## Restore on any machine

1. Install Node.js 22.x (the starter rejects other majors).
2. Unzip this archive into its own folder and open that folder in Qoder.
3. `npm ci` then `npm run build` (output lands in `dist/`).
4. Optional local preview: `npm run dev` and open the printed loopback URL.
   The waitlist form needs the Function; locally use the fixture server in
   `dev/function-local-node.mjs` as the proxy target, exactly as configured in
   `vite.config.ts`.

## Make the site public (whenever you're ready)

The site, Function and database already exist in the cloud — going public is
an audience change, not a new deployment. Two equivalent ways:

- **Easiest:** open this folder in Qoder and say *"make the SafeHer site
  public"*. Qoder will switch the access mode to `public` on this existing
  site (no rebuild, no second site) and the same URL becomes reachable by
  everyone.
- **Manual:** in Qoder Sites Settings for this site, change access from
  *private* to *public*.

Intermediate option: keep it private and invite specific people by email
("selected" mode) — useful for investor or pilot demos before launch.

Status: done on 2026-10-06 — the site is public now. To hide it again, switch
the mode back to `private` the same way (Qoder command or Sites Settings).

After going public, the waitlist form works for real visitors immediately;
signups land in the `waitlist` table and remain unreadable by the public.

## Update the site later

Edit `src/`, run `npm run build`, then ask Qoder to publish from this folder.
Always reuse the Project/Site IDs above — never create a second site for the
same product, or the waitlist data and URL will split.
