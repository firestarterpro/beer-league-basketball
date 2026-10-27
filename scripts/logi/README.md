LOGI OPTIONS+ SHORTCUTS
=======================

One-press helpers for the MX Keys, MX Dialpad, and Lift mouse. Every button
runs a .cmd file that calls logi-actions.ps1. Nothing calls a paid API and
nothing deploys.

Requirement: pwsh (PowerShell 7) on PATH.


STATUS AT A GLANCE
------------------

status.cmd            Health check - OK/-- for each tool, plus newest worker log.   [Tested]
latest-log.cmd        Opens newest docs/ai/logs/*.log in Notepad.                   [Tested]
qwen-toggle.cmd       Starts Qwen if down, stops it if up.                          [Untested]
new-task.cmd          Asks for a one-line goal; Claude (Haiku, read-only) fills the template from project docs + code. Blank = empty template.[Untested]
run-task-agy.cmd      Runs newest TASK-*.md via invoke-worker.ps1 (Gemini/agy), merging pending dashboard queue messages. Falls back to queue-only when no task exists. [Untested]
run-task-copilot.cmd  Same, using Copilot. Edits only - no npm.                  [Untested]


WHAT EACH BUTTON DOES
---------------------

status.cmd  [Tested]
  - Prints OK / -- for: Gemini CLI, Copilot CLI, Antigravity (agy file present),
    Qwen server (pings localhost:8000), DeepSeek key (user env var), and the
    latest worker log name.
  - Sends no prompts.
  - Waits for Enter before closing.

latest-log.cmd  [Tested]
  - Opens the newest file in docs/ai/logs/*.log in Notepad.

qwen-toggle.cmd  [Untested]
  - If Qwen is running, stops it.
  - If Qwen is down, starts it via C:\llm\scripts and waits up to 2 minutes
    for it to be ready.

new-task.cmd  [Untested]
  - Copies docs/ai/tasks/_TEMPLATE.md to the next free TASK-NNN-new.md.
  - Opens it in Notepad.
  - Creates a file in the repo.

run-task-agy.cmd  [Untested]
  - Runs the newest TASK-*.md through invoke-worker.ps1 with worker "gemini" (agy).
  - Merges any pending messages queued in the AI Control Center dashboard for agy.
  - If no TASK-*.md exists, runs queue-only. Exits cleanly if the queue is empty too.
  - Uses your Gemini subscription, not Claude.

run-task-copilot.cmd  [Untested]
  - Same as above, with worker "copilot".
  - Edits only - no npm.
  - Preview the composed packet (including queued messages) without invoking a
    worker or changing the queue:

    pwsh -NoProfile -File scripts\invoke-worker.ps1 -Worker gemini -DryRun


HOW TO BIND A BUTTON IN OPTIONS+
--------------------------------

1. Open Options+, select the device, select the button or key.
2. Choose Smart Actions > Launch application.
3. Browse to the .cmd file in this folder.
4. Save.
5. Optional: use a different profile per app (for example, a Claude app
   profile for the Dialpad).


SUGGESTED LAYOUT
----------------

Lift mouse
  - Side button 1: open the Actions Ring (Claude Desktop plugin tiles: session
    status, one-press permission answers, interrupt).
  - Side button 2: status.cmd.

MX Dialpad (Claude app profile)
  - Dial: scroll.
  - Keys: Esc, Enter, qwen-toggle.cmd, latest-log.cmd.

MX Keys
  - Spare F-keys: new-task.cmd, latest-log.cmd.

Smart Action "start work"
  - Opens the beer-league folder, then runs status.cmd.


NOTES AND CAVEATS
-----------------

- Keep the curl hooks to localhost:8765 in ~/.claude/settings.json. The Claude
  Desktop plugin relies on them.
- Unverified: whether Shift+Tab changes the permission mode in the desktop app.
- Antigravity (agy) shows -- until it is installed and logged in.
- The Lift and MX Keys have no haptics.