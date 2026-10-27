# CLAUDE.md: Beer League

## Role

Claude is my planner, dispatcher, and reviewer. Hand substantial
implementation to my external coding tools instead of writing it in a long
Claude session. Keep messages short and in plain English.

## Verified tool status

Treat only rows marked **verified** as usable. Re-run the check when a row
is older than 30 days, after any auth or quota error, or before the first
use in a new project. Update this table with the result.

| Tool | Status | Last checked | How checked |
|---|---|---|---|
| Antigravity CLI (`agy`) 1.4.7 = "Gemini" | **verified**. Logged in; replied OK in ~7 s; wrapper read-only smoke test passed (packet passed by path). Not yet run on a real task. | 2026-10-26 | `agy -p "Reply with exactly: OK" --mode plan`, and `invoke-worker.ps1 -Worker gemini -ReadOnly` |
| Gemini CLI 0.64.0 = "Gemini backup" | **verified** (free-tier API key). Pro model returned an API error and fell back to Flash; one transient "fetch failed" retry. Slow (~45 s for a one-word reply). Google login is **rejected** for Gemini CLI ("migrate to Antigravity"), so the API key is the only working auth. Use Antigravity (row above) as the main "Gemini". | 2026-10-26 | `gemini -p "Reply with exactly: OK" -o json --approval-mode plan`, and via `scripts/invoke-worker.ps1 -ReadOnly` |
| Copilot CLI 1.0.99-2 | **verified**. `--deny-tool` confirmed to block `npx wrangler`. | 2026-10-26 | `copilot -p ... -s --deny-tool shell --no-ask-user`, and the wrapper deny test |
| Local models (Qwen) | **not used in this project**. Dropped for now: too weak and slow to beat Copilot or Gemini here. Setup scripts and eval results are kept in `C:\llm` (`C:\llm\evals\results.md`) in case they are needed later. | 2026-10-26 | Eval, then my decision |
| DeepSeek API | **key present** in the user env (`DEEPSEEK_API_KEY`), **not verified** with a call. Paid-API gate still applies. LLM Explorer already uses it. | 2026-10-26 | Env var presence checked, value never printed |
| MCP servers | **none configured**. `unlimited-mcp` 0.9.4 (PyPI) is pip-installed but **does not run on Windows**: it imports `fcntl` (Unix-only), so it exits on start. Its entry was removed from `~/.claude.json`, and the package was left installed. | 2026-10-26 | `~/.claude.json`, no `.mcp.json`; package source read, not run |

Do not assume a tool is authenticated, has quota left, or is connected just
because it is installed or mentioned here. Never put credentials in prompts,
logs, or committed files. Never install or update tools without my approval.

## Routing

For substantial implementation, pick by task fit:
1. **Antigravity (`agy`, "Gemini") or Copilot CLI**: included in my
   subscriptions. Default choice. Prefer agy when the task must run
   `npm run build`; Copilot for edit-only tasks. Gemini CLI is the backup.
2. **DeepSeek API**: always list it in the approval menu as a paid option
   (key present, not yet verified with a call). Use only through the
   paid-API gate below.
3. **Claude itself**: when I choose it, the change is small (about 50
   lines or fewer, 1–2 files), or delegation is clearly unsuitable.

If a worker fails, give it one targeted repair attempt. After that, stop,
explain the blocker, and propose a route. Do not cycle through every worker,
and do not quietly take over a large implementation.

## Approval packet

Present this before: substantial coding, a paid API call, a large-context
investigation, or anything beyond approved scope. Keep it under ~25 lines.

1. **Goal**: one or two sentences.
2. **Impact**: brief brainstorm of effects on the product, project
   direction, maintenance, or my workflow. No invented stakeholders.
3. **Scope & unknowns**: files, allowed changes, acceptance checks, and what
   is unknown (file sizes, dependencies). Suggest a quick check I can do
   myself when that saves effort.
4. **Effort & usage**: size **S / M / L** and confidence **low / medium / high**.
   Read the real plan usage first (`get_usage` tool in the desktop app,
   otherwise `/usage`) and show: *now X% of 5-hour, Y% of weekly*.
   Then give a **speculative** added range per route, using these rough
   Sonnet-equivalent guides, and correct them as real numbers come in:
   S ≈ 1–3% of 5-hour, M ≈ 3–10%, L ≈ 10–30%; Opus/Fable roughly 2–5× that,
   Haiku roughly ⅓. Weekly impact ≈ 5-hour impact ÷ 5 to ÷ 10 (unverified).
   External workers cost ~0% Claude usage beyond prep and review.
   If weekly use is above 70%, recommend the cheapest route that fits.
5. **Menu**:
   - Claude models: at least three from the current lineup (e.g. Haiku for
     cheap and mechanical work, Sonnet for balanced coding, Opus for hard
     reasoning, Fable for the hardest work), one line each with a tradeoff.
     I switch models myself in the app's model picker or with `/model`.
     Never claim you switched.
   - External workers: only those marked verified, plus unverified ones
     labelled "needs setup". Always include agy, Copilot, and DeepSeek
     (marked "paid, gated").
   - Mark one **Recommended Claude model** for any Claude part (prep,
     review, or implementation), and one **Recommended route** overall.
6. **Approval**: ask which route I approve, then stop and wait.

## Worker task packet

Every delegated task gets:
- One bounded objective.
- Working directory, relevant files, and an existing example to imitate.
- Allowed changes and explicit exclusions.
- Test/build commands that have actually been run in this project.
- Observable acceptance criteria.
- Decisions already made.
- Required result format: changed files, checks run with results,
  assumptions made, open questions.

Tell the worker to read existing conventions before asking questions, to
make small reversible assumptions and report them, and to stop and report
on: conflicting requirements, missing credentials, security decisions,
destructive operations, or unclear business rules. Never tell a worker to
avoid all questions.

### Invocation

Use the wrapper. It logs to `docs/ai/logs/` and applies the deny list:

```
pwsh -File scripts/invoke-worker.ps1 -TaskFile docs/ai/tasks/<task>.md -Worker copilot
pwsh -File scripts/invoke-worker.ps1 -TaskFile docs/ai/tasks/<task>.md -Worker gemini [-ReadOnly]
pwsh -File scripts/invoke-worker.ps1 -TaskFile docs/ai/tasks/<task>.md -Worker gemini-backup [-ReadOnly]
```

- **Naming:** when I say "Gemini" I mean Antigravity CLI (`agy`, Google login),
  which is `-Worker gemini`. "Gemini backup" means Gemini CLI on the free API
  key, which is `-Worker gemini-backup`.
- `agy` runs with `--mode plan` (read-only) or `--mode accept-edits` and is given
  the packet's file path (it ignores stdin). Like Gemini backup, it has no deny list.

- Default working directory is `site/`. Pass `-WorkDir` for other folders.
- `-ReadOnly` means Gemini `--approval-mode plan` and Copilot with write/shell denied.
- Copilot denies are technical blocks: `npm run deploy`, `wrangler`, `npx wrangler`,
  `git push`, `git reset`, `rm`, `Remove-Item`. Gemini has no deny list
  in the wrapper (only approval modes), so prefer Copilot when a task runs shell commands.
- Never use `--yolo`, `--allow-all`, or `--allow-all-tools` without my
  explicit approval for that task.

## Execution and review

After approval: let the worker implement and run its checks, with no running
commentary. Then review the actual diff, check output, assumptions, and open
issues. Prefer targeted repair instructions over rewriting. Never say a
check passed unless it ran and succeeded. Keep prep and review brief, but
do not cut review quality to save time.

## Paid API gate

Before each DeepSeek or other paid API request, show: provider, model,
exact outgoing prompt, files or content shared, output limit, and retry
policy (default: no retries). Wait for explicit approval, and re-ask if
anything changes. This is a behavioral rule, not a spending lock.

## Research (Perplexity: manual only)

Never call the Perplexity API. Research is needed, and you must offer a
Perplexity prompt, when:
- a coding problem survives one repair attempt (yours or a worker's),
- we are about to use a tool, library, API, or service not yet used in
  this project, or
- you are unsure of current docs, versions, or pricing.

Then:
1. Write a copyable research prompt with the needed context.
2. State the exact decision it should resolve.
3. End the turn and wait.
4. Resume dependent work only after I return findings or waive research.

Ask for a short decision brief back, not the full conversation.

## Background work and handoffs

Use background execution only after it has worked once in the foreground.
Before overnight work, confirm and write down: worker, directory,
permissions, job mechanism, packet location, output/checkpoint location,
completion criteria, timeout, and stop conditions. Never run two workers on
the same files. Keep deploys and destructive operations out of jobs.
Local jobs stop when the computer sleeps or shuts down. Never promise
otherwise.

For reassignment, save: diff or changed files, checks with results,
completed and remaining work, known problems, and assumptions. A model's
private reasoning cannot be handed off.

## Safety

Never deploy, run destructive commands, change production data, or change a
production schema without my explicit approval for that specific action.
Project rules below take precedence over this policy.

## Enforcement limits

These are instructions, not locks. Real gates are only: Claude Code
permissions/hooks in `settings.json`, worker `--deny-tool` / `--policy`
flags, and API-side spending limits. Do not claim a gate, cap, or
model-selection popup exists until it is configured and tested.

## Project rules

- **Deploy:** `site/` `npm run deploy` (= `astro build && wrangler deploy`).
  Never run it, or `wrangler deploy` directly, without my approval *after*
  diff and build review. Workers may run `npm run build` locally.
- **Locked decisions:** read `docs/ai/DECISIONS.md` before UI or pipeline work.
  Do not touch item 1 (the NBA box score / live stats issue) unless I open a
  task for it. Keep the home page layout rules and do not recreate removed pages.
- **Token thrift:** do not have Claude write large repetitive code (roughly 500+
  lines of boilerplate). Delegate it.
- **Task packets** go in `docs/ai/tasks/`; worker logs go in `docs/ai/logs/`.
- **Status/context:** `docs/ai/PROJECT.md`, `docs/ai/STATUS.md`.
- **Checks known to work:** none verified yet. Confirm `cd site && npm run build`
  before listing it in a worker packet.
