# One-press helpers for Logi Options+ buttons (Smart Actions -> "Launch application" -> a .cmd next to this file).
# None of these call a paid API or deploy anything.
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("status", "qwen-toggle", "latest-log", "new-task", "run-task")]
    [string]$Action,

    # run-task only: "gemini" = agy, "copilot", "gemini-backup"
    [string]$Worker = "gemini"
)

$Root    = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent   # beer-league
$LogDir  = Join-Path $Root "docs\ai\logs"
$TaskDir = Join-Path $Root "docs\ai\tasks"
$QwenScripts = "C:\llm\scripts"

function Test-Qwen {
    try { Invoke-RestMethod -Uri "http://localhost:8000/v3/models" -TimeoutSec 3 | Out-Null; $true } catch { $false }
}

switch ($Action) {
    "status" {
        # Presence and local health only: no prompts are sent to any worker
        $rows = @(
            @{ Name = "Gemini CLI";     Ok = [bool](Get-Command gemini -ErrorAction SilentlyContinue) },
            @{ Name = "Copilot CLI";    Ok = [bool](Get-Command copilot -ErrorAction SilentlyContinue) },
            @{ Name = "Antigravity";    Ok = Test-Path "$env:LOCALAPPDATA\agy\bin\agy.exe" },
            @{ Name = "Qwen server";    Ok = Test-Qwen },
            @{ Name = "DeepSeek key";   Ok = [bool][Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User") }
        )
        foreach ($r in $rows) {
            $mark = if ($r.Ok) { "OK  " } else { "--  " }
            Write-Host ($mark + $r.Name) -ForegroundColor $(if ($r.Ok) { "Green" } else { "DarkGray" })
        }
        $latest = Get-ChildItem $LogDir -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
        if ($latest) { Write-Host "`nLatest worker log: $($latest.Name) ($($latest.LastWriteTime))" }
        Read-Host "`nPress Enter to close"
    }
    "qwen-toggle" {
        if (Test-Qwen) {
            & (Join-Path $QwenScripts "stop_qwen_server.ps1")
            Write-Host "Qwen server stopped." -ForegroundColor Yellow
        }
        else {
            & (Join-Path $QwenScripts "start_qwen_server.ps1")
            Write-Host "Starting Qwen... waiting for it to be ready."
            for ($i = 0; $i -lt 60 -and -not (Test-Qwen); $i++) { Start-Sleep -Seconds 2 }
            if (Test-Qwen) { Write-Host "Qwen ready at http://localhost:8000/v3" -ForegroundColor Green }
            else { Write-Host "Qwen did not come up in 2 minutes. See C:\llm\logs\ovms_qwen.log" -ForegroundColor Red }
        }
        Start-Sleep -Seconds 3
    }
    "latest-log" {
        $latest = Get-ChildItem $LogDir -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
        if ($latest) { Start-Process notepad.exe $latest.FullName } else { Write-Host "No worker logs yet."; Start-Sleep 3 }
    }
    "new-task" {
        $n = (Get-ChildItem $TaskDir -Filter "TASK-*.md" | ForEach-Object { if ($_.Name -match '^TASK-(\d+)') { [int]$Matches[1] } } | Measure-Object -Maximum).Maximum + 1
        $goal = Read-Host "What should the worker do? (one line, blank = empty template)"
        $file = Join-Path $TaskDir ("TASK-{0:D3}-new.md" -f $n)
        if (-not $goal) { Copy-Item (Join-Path $TaskDir "_TEMPLATE.md") $file; Start-Process notepad.exe $file; break }
        # Claude (Haiku, read-only tools) fills the template from the project's own docs
        $prompt = @"
Fill in docs/ai/tasks/_TEMPLATE.md as a worker task packet for this goal: $goal
First read CLAUDE.md, docs/ai/DECISIONS.md, docs/ai/STATUS.md and docs/ai/PROJECT.md, then look at the relevant code to find real file paths and an existing example to imitate.
Use only checks that CLAUDE.md lists as verified. Keep the template's headings and its pre-filled stop/report lines.
Replace TASK-NNN with TASK-$('{0:D3}' -f $n). Mark anything you could not confirm as "UNCONFIRMED:".
Output only the finished markdown, no preamble.
"@
        Write-Host "Drafting with Claude (Haiku)..."
        Push-Location $Root
        $out = $prompt | claude -p --model haiku --allowedTools "Read,Glob,Grep"
        Pop-Location
        if ($LASTEXITCODE -ne 0 -or -not $out) { Write-Host "Claude failed; using empty template." -ForegroundColor Red; Copy-Item (Join-Path $TaskDir "_TEMPLATE.md") $file }
        else { Set-Content $file ($out -join "`n") -Encoding utf8 }
        Start-Process notepad.exe $file
    }
    "run-task" {
        # Runs the newest TASK-*.md through the guarded wrapper. Uses your worker subscription, not Claude.
        # Pending dashboard queue messages for this worker are merged automatically. If no task exists,
        # the wrapper runs queue-only.
        $task = Get-ChildItem $TaskDir -Filter "TASK-*.md" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
        $wrapper = Join-Path $Root "scripts\invoke-worker.ps1"
        if ($task) {
            Write-Host "Task:   $($task.Name)`nWorker: $Worker`n"
            & pwsh -NoProfile -File $wrapper -TaskFile $task.FullName -Worker $Worker
        }
        else {
            Write-Host "No TASK-*.md found. Checking the dashboard queue for $Worker...`n"
            & pwsh -NoProfile -File $wrapper -Worker $Worker
        }
        Read-Host "`nDone. Press Enter to close"
    }
}
