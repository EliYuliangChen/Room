# Project Room — Phase 4 visual refinement

大学小组作业的本地责任记录 Demo，涵盖**分工 → 提交 → 确认 → 追踪 → 报告**。白板支持按阶段和按成员查看任务、进度与审核。应用在桌面浏览器中运行，首次启动时项目和用户列表为空。

## Run on macOS or Windows

Install [Node.js 22 LTS](https://nodejs.org/en/download) with npm. On macOS, choose arm64 for Apple Silicon or x64 for Intel. Run these commands in the project folder.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. One command starts Vite and Express; both bind to `127.0.0.1`. API health: **http://127.0.0.1:3001/api/health**. Stop with Ctrl+C. Keep the same browser/hostname to retain the active local profile.

```sh
npm run typecheck
npm run test
npm run build
npm start
```

`npm start` serves the built frontend and API together at **http://127.0.0.1:3001**; build first. Invitation URLs use the current origin. Existing development URLs need the development server; copy a new invite URL when switching to built mode.

Initial installation downloads the locked packages from the public npm registry, including the platform packages for esbuild, Rollup and the Resvg artwork tool. Enable npm optional dependencies for these binaries. Runtime uses bundled illustrations, local fonts and SQLite via WebAssembly. GitHub Actions checks clean installation, build, tests and local startup for both Mac architectures.

## Move to a Mac

```sh
git clone https://github.com/EliYuliangChen/Room.git
cd Room
npm ci
npm run dev
```

For a fresh demo, open the local URL and create a profile. To continue using existing projects, stop the API on both computers and move `data/app.sqlite` together with `data/uploads/` privately into the Mac clone’s `data/` folder. Start the app and select your existing profile. Browser session preferences belong to each browser.

Git tracks the application under `client/`, `server/` and `shared/`, bundled artwork and notices in `client/public/`, build and test configuration, `package.json`, `package-lock.json`, scripts, tests and handoff documentation. Local data, uploads, backups, environment files, installed dependencies, build output, design references and QA captures are excluded by `.gitignore`.

## Functional flows

- **Blank start and local identities:** manually create the first profile; no seed accounts or projects. Switch identities globally, including inside the workspace. Only joined projects/data appear for the selected profile. No password verification or Google OAuth.
- **Project setup:** three-step wizard, multiple parallel stages, direct tasks and one optional subtask level, local invite code/link, eight-member cap and mandatory per-project avatar. Pre-cut PNG upload/presets, saved reuse, proportional scale, flip and position persist.
- **Whiteboard planning:** click anywhere on the room Whiteboard, or focus it and press Enter/Space. Its overview shows equal-member team progress and a separate approved work-unit count. Use **By stage / By member** to filter real work; stage cards show approved leaf counts, progress and the latest task deadline in that stage. Expand task cards for details and use **Manage plan** for stage/project changes. Task status follows the evidence/review workflow.
- **Initial agreement:** on the Whiteboard, the creator freely edits a draft's responsibilities, descriptions, structure and deadlines. Each leaf needs one project-member owner and a personal DDL. At least two members and one leaf are required for **Confirm Initial Plan**; no individual Accept is needed for this first plan.
- **Formal evidence:** Submit Your Part lists only the current profile's assigned leaves. Submit real files, http(s) links and/or meaningful plain text. Each version is immutable, time-stamped and independently reviewed. A pending version cannot be silently replaced; revisions keep their earlier history.
- **Peer review:** Today → To Approve opens Review Detail within the board. The submitter cannot vote on their own work. More than half of the other members must Approve; a minority dissent does not veto the majority. Request Changes requires a reason. When approval becomes impossible, resubmission opens with fresh votes. The owner sees a highlighted Today → Needs revision action that opens the current version’s review notes; it clears after resubmission.
- **Democratic plan changes:** task/project descriptions and DDLs, scope, structure and responsibility changes go through a before/after/reason request. Proposer starts with one Yes; regular changes need a majority of all members, followed by creator application. Transfers also require the target owner's explicit consent. Application records a public announcement and activity event. Stale approved targets cannot overwrite newer changes.
- **History:** splitting/merging/retiring work preserves prior task rows, submissions, versions, files, votes and audit records. Grouping parents never double-count. Reassignment requires the new owner's evidence; old-owner submissions remain historical.
- **Progress/report:** every member has equal weight. A at 2/8 (25%) plus B at 2/4 (50%) yields **37.5%**, not 4/12. A zero-task member is 0%/Unassigned. On-time uses the submission time of the eventually accepted version, independently of approval time. No completions means N/A on-time. Contribution is copyable plain text, with a neutral objective-records note.
- **Files:** separate stage-organized file/link/note library, with actual downloads and author/creator edit/delete. Library uploads do not change completion. Resources from retired stages remain accessible.
- **Unused drafts:** the creator can archive a draft from My Projects while no other profile has joined. The project stays readable under Completed, even without a selected avatar. Multi-member and ongoing projects retain the normal Finish Project vote.
- **Chat and profiles:** one plain-text project thread with actual author/time and per-profile unread receipts; member desks open current work/progress and recent submissions. Presence means the selected simulated identity, with no working-time tracking. Same-origin tabs signal successful chat sends, submissions and review votes locally, so a closed chat shows its unread badge without polling or opening the conversation.
- **Notifications:** relevant assignment/review/request/consent/result/announcement notices, plus de-duplicated 24-hour and overdue personal-DDL reminders on local opening/refresh. No reminders run while the process is stopped. Today appears only on the Whiteboard's right side.
- **Finish:** creator proposes Finish Project; team majority archives immediately. Reaching 100% alone does not archive. Archived project content is server-enforced read-only; history, file downloads, chat reading and report copying remain available.

**Local invitations:** use another profile in the same app/database. A localhost URL cannot invite classmates on another computer. The profile header is a simulation mechanism, not production access control.

Read **[DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md)** for an actual four-person demo, including submit, dissent, resubmit, request, consent, report and archive. Users/projects are created by hand, never automatically populated.

## Persistence and upgrade

```text
data/app.sqlite    Real SQLite database, generated locally and gitignored
data/uploads/     Original avatars/evidence/library file bytes, gitignored
```

SQLite runs through `sql.js` (local WebAssembly) to avoid native compiler setup on Windows. Every successful mutation commits a transaction and atomically writes a binary SQLite file before returning success. One API process owns a data directory; stale locks recover after an interrupted process.

Migrations **1 → 2 → 3 → 4 → 5** preserve existing Phase 1 profile/project/task IDs and add formal evidence, decisions, resources, chat and locked outcome thresholds. Migration 4 repairs older version-3 databases missing the chat read-sequence field. Migration 5 repairs the missing task submission cursor in legacy version-4 databases. Both preserve existing records and any already-present cursors. Do not delete your database to upgrade. For a backup, stop the API and copy the **whole data directory**, including uploads. The first normal startup applies migrations without creating business records.

Each tab’s `sessionStorage` holds its active profile ID and unfinished wizard input. `localStorage` holds only the last-selected default for newly opened tabs, so existing tabs keep independent profiles across reloads. Saved work, votes, consent, notifications, chat and receipt state live in SQLite. Original files stay local and can be downloaded after restart. Deleting a library resource hides it while retaining the file/audit record; no background garbage collection runs.

For a separate blank instance without deleting your existing work:

```powershell
# Stop the current API first:
$env:DATA_DIR = 'data-second-demo'
npm run dev
```

On macOS, use `DATA_DIR=data-second-demo npm run dev` in the project folder.

`DATA_DIR` defaults to `data/`, relative to this project folder. `API_PORT` defaults to `3001`; leave it unchanged in development because Vite's proxy uses `3001`. Built mode can run on a different `API_PORT`. `Refresh room`, reopening and profile switching fetch current local data; there is no background realtime service.

## Upload limits

- Avatars: original PNG, up to 5 MB, 4096px per side / 12 megapixels, decoded/CRC-checked. Existing transparency is preserved. No automatic cutout or stylization.
- Evidence: up to five files, 20 MB each. Library: one file per item, 20 MB.
- Evidence/library types: PNG, JPEG, PDF, TXT, MD, CSV, ZIP, DOCX, PPTX, XLSX. Basic type/signature checks, generated filenames and member-protected attachment downloads. Active uploaded HTML/scripts are not served.
- UTF-8 upload names (including Chinese and mixed-language names) persist for avatars, evidence and shared files. Downloads retain the original name and bytes.
- Text and links are rendered as ordinary escaped text/http(s) anchors. Links are not fetched or analyzed automatically.

## Source map and verification

```text
client/src/pages/Workspace.tsx         Workspace + single panel controller
client/src/components/{Scene,Art}.tsx Shared modular office and avatar layers
client/src/components/Select.tsx      Consistent keyboard-operated listboxes
client/src/art-direction.css          Phase 3 type, panel and scene composition
scripts/compose-assets.ts             Rebuild vectors and metadata locally
client/src/features/workspace/        Whiteboard, review, requests, drawers, chat, notices
client/src/lib/{api,copy,assets}.ts    Typed client, primary copy and asset registry
shared/{types,metrics}.ts             Shared data contracts and exact arithmetic
server/src/db.ts                     SQLite persistence and migrations
server/src/routes-workflows.ts       Phase 2 API and member/archive guards
server/src/workflow.ts               Draft/change rules, consent, reminders and reports
server/src/project-view.ts           Derived tasks, versions, members and metrics
server/src/files.ts                  Real local file handling
tests/phase1.test.ts                  Setup/avatars and actual process-restart baseline
tests/phase2.test.ts                  Governance, persistence, math and read-only tests
```

The suite contains **69 tests** covering persistence, workflows, artwork, cross-tab updates, Unicode uploads and the Whiteboard. `npm run build` includes client and server type checks. An intermittent SQLite snapshot rename failure remains under investigation on Windows.

Phase 3 ships 25 replaceable asset entries: generated transparent furniture/cutouts plus authored ink SVG props and four different office thumbnails. Landing, Avatar Setup and Workspace reuse the same room layers. Real labels, records and hotspots remain HTML. New presets share client/server paths; old saved PNGs and uploaded originals remain intact. There are no runtime image services.

```powershell
npm run assets # Rebuild authored vectors and registry from checked-in layers; no network
```

The Workspace scales its room to the available window. Eight-member offices scroll horizontally. Artwork sources, bounds, layers and replacement instructions are in [ASSET_MANIFEST.md](ASSET_MANIFEST.md) and [ASSET_GENERATION_PHASE3.md](ASSET_GENERATION_PHASE3.md).
