param(
    # Optional when the dashboard queue has messages for this worker.
    [string]$TaskFile,

    # "gemini" = Antigravity CLI (agy, Google login); "gemini-backup" = Gemini CLI on the free API key
    [ValidateSet("gemini", "gemini-backup", "copilot")]
    [string]$Worker = "gemini",

    [string]$WorkDir = "C:\Templar Archives\Basketball Bro\beer-league\site",

    # Dashboard queue written by ai-control-center. Override for tests or another checkout.
    [string]$QueueFile = "C:\Templar Archives\ai-control-center\dashboard\data\worker-queue.json",

    # Ignore queued messages for this run.
    [switch]$NoQueue,

    # Compose and print the packet, but do not invoke the worker or change the queue.
    [switch]$DryRun,

    # Read-only investigation: no file edits, no shell commands
    [switch]$ReadOnly,

    # agy only, user-approved per task: run commands without permission prompts. The worker-guard hook
    # (.agents\hooks.json) still hard-blocks deploys, pushes, resets, deletes, installs and live sync scripts.
    [switch]$SkipPermissions,

    # agy only: the guard hook denies every shell command outside its strict allow list
    # (task Python checks, read-only git, file listing)
    [switch]$StrictGuard
)

$ErrorActionPreference = "Stop"

function Update-QueueAfterRun {
    param(
        [string]$Path,
        [string[]]$ProcessedIds,
        [bool]$Success,
        [string]$ErrorText
    )
    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
        $queue = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
        if ($null -eq $queue.messages) { return }
        $messages = @($queue.messages)
        if ($Success) {
            $messages = @($messages | Where-Object { $ProcessedIds -notcontains [string]$_.id })
        }
        else {
            foreach ($m in $messages) {
                if ($ProcessedIds -contains [string]$m.id) {
                    $attempts = if ($null -eq $m.attempts) { 0 } else { [int]$m.attempts }
                    $m | Add-Member -NotePropertyName attempts -NotePropertyValue ($attempts + 1) -Force
                    $m | Add-Member -NotePropertyName lastError -NotePropertyValue $ErrorText -Force
                }
            }
        }
        $queue | Add-Member -NotePropertyName messages -NotePropertyValue $messages -Force
        $temp = "$Path.$PID.tmp"
        [System.IO.File]::WriteAllText($temp, ($queue | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
        for ($i = 0; $i -lt 3; $i++) {
            try { [System.IO.File]::Move($temp, $Path, $true); break }
            catch {
                if ($i -eq 2) { throw }
                Start-Sleep -Milliseconds 200
            }
        }
        if ($Success) { Write-Host "Cleared $($ProcessedIds.Count) queued message(s)." -ForegroundColor Green }
        else { Write-Warning "Worker failed; kept $($ProcessedIds.Count) queued message(s) for retry." }
    }
    catch {
        Write-Warning "Could not update the worker queue: $($_.Exception.Message)"
    }
}

if ($TaskFile) {
    if (-not (Test-Path -LiteralPath $TaskFile)) {
        Write-Error "Task packet not found: $TaskFile"
        exit 1
    }
    # Absolute, since the worker runs from WorkDir
    $TaskFile = (Resolve-Path -LiteralPath $TaskFile).Path
}

if (-not [System.IO.Path]::IsPathRooted($QueueFile)) {
    $QueueFile = Join-Path (Split-Path $PSScriptRoot -Parent) $QueueFile
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogDir = Join-Path $PSScriptRoot "..\docs\ai\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("worker-" + $Worker + "-" + $Timestamp + ".log")

$QueueTarget = if ($Worker -eq "gemini") { "agy" } else { $Worker }
$Queued = @()
$QueuedIds = @()

if (-not $NoQueue -and (Test-Path -LiteralPath $QueueFile)) {
    try {
        $rawQueue = Get-Content -LiteralPath $QueueFile -Raw
        if (-not $rawQueue.Trim()) { throw "Queue file is empty." }
        $queue = $rawQueue | ConvertFrom-Json
        $candidates = @($queue.messages | Where-Object {
            $_ -and $_.worker -eq $QueueTarget -and
            $_.message -and ([string]$_.message).Trim()
        })
        $totalChars = 0
        foreach ($m in $candidates) {
            $text = ([string]$m.message).Trim()
            if (-not $m.id) { throw "A queued message for $QueueTarget is missing its id." }
            if ($text.Length -gt 20000) {
                throw "Queued message $($m.id) is longer than 20,000 characters. Shorten or remove it."
            }
            if ($Queued.Count -ge 20) { break }
            if ($Queued.Count -gt 0 -and ($totalChars + $text.Length) -gt 20000) { break }
            $Queued += $m
            $totalChars += $text.Length
        }
        $QueuedIds = @($Queued | ForEach-Object { [string]$_.id })
    }
    catch {
        Write-Error "Could not read the worker queue at ${QueueFile}: $($_.Exception.Message)"
        exit 1
    }
}

$BaseTask = if ($TaskFile) { Get-Content -Raw -LiteralPath $TaskFile } else { "" }
$QueueText = ""
if ($Queued.Count -gt 0) {
    $lines = @(
        "## Queued messages",
        "",
        "The user queued these messages for this worker invocation. Address them in order after the task above (or as the task, if no task was supplied). If a message is ambiguous or conflicts with the current task, stop and report instead of guessing.",
        "",
        "The wrapper owns the dashboard queue file. Do not edit or clear ``worker-queue.json``."
    )
    for ($i = 0; $i -lt $Queued.Count; $i++) {
        $m = $Queued[$i]
        $lines += ""
        $lines += "### $($i + 1). $($m.createdAt) [$($m.id)]"
        $lines += ""
        $lines += ([string]$m.message).Trim()
    }
    $QueueText = $lines -join "`n"
}

if (-not $TaskFile -and $Queued.Count -eq 0) {
    Write-Host "Nothing to do: no task packet and no queued messages for $QueueTarget." -ForegroundColor Yellow
    exit 0
}

if ($TaskFile) {
    $TaskContent = $BaseTask
    if ($QueueText) { $TaskContent = $BaseTask.TrimEnd() + "`n`n---`n`n" + $QueueText }
}
else {
    $TaskContent = @(
        "# TASK: Queued messages",
        "",
        "**Objective:** Carry out the queued messages below in order.",
        "**Working directory:** $WorkDir",
        "**Allowed changes:** Only what the queued messages ask for.",
        "**Do not touch:** Unrelated files. Do not edit the dashboard queue file.",
        "**Done when:** Each queued message is addressed or explicitly reported as blocked.",
        "**Stop and report instead of guessing if:** A message is ambiguous, conflicts with another message, or needs a destructive action.",
        "**Report back:** What you changed, what you checked, and anything left undone.",
        "",
        $QueueText
    ) -join "`n"
}

$QueuePacketFile = $null
if ($Queued.Count -gt 0) {
    $QueuePacketFile = Join-Path $LogDir ("queue-" + $QueueTarget + "-" + $Timestamp + ".md")
}
$EffectiveTaskFile = if ($QueuePacketFile) { $QueuePacketFile } else { $TaskFile }

if ($DryRun) {
    Write-Host "Dry run - no worker invoked, queue unchanged." -ForegroundColor Yellow
    Write-Host "Worker:     $Worker (queue target: $QueueTarget)"
    Write-Host "Queue file: $QueueFile"
    Write-Host "Selected:   $($Queued.Count) message(s)"
    if ($QueuedIds.Count -gt 0) { Write-Host "IDs:        $($QueuedIds -join ', ')" }
    if ($QueuePacketFile) { Write-Host "Packet:     $QueuePacketFile (not written in dry run)" }
    Write-Host "`n--- Composed packet ---`n" -ForegroundColor Cyan
    Write-Host $TaskContent
    Write-Host "`n--- End packet ---" -ForegroundColor Cyan
    exit 0
}

if ($QueuePacketFile) {
    Set-Content -LiteralPath $QueuePacketFile -Value $TaskContent -Encoding utf8
}

# Commands no worker may run (deploys, publishing, history rewrites)
$DenyTools = @(
    "shell(npm run deploy)",
    "shell(wrangler:*)",
    "shell(npx wrangler:*)",
    "shell(git push)",
    "shell(git reset)",
    "shell(rm:*)",
    "shell(Remove-Item:*)"
)

$WorkerExit = 1
Push-Location $WorkDir
try {
    Write-Host "Dispatching $EffectiveTaskFile to $Worker in $WorkDir..." -ForegroundColor Cyan
    if ($Queued.Count -gt 0) {
        Write-Host "Merged $($Queued.Count) queued message(s) for $QueueTarget." -ForegroundColor Cyan
    }
    $LASTEXITCODE = 0
    if ($Worker -eq "gemini") {
        # Antigravity CLI: no deny list, only modes (plan = read-only, accept-edits = edits but asks before shell)
        $Mode = if ($ReadOnly) { "plan" } else { "accept-edits" }
        # agy ignores stdin, so point it at the packet file instead
        $AgyArgs = @("-p", "Read the task packet at `"$EffectiveTaskFile`" and carry it out.", "--add-dir", (Split-Path $EffectiveTaskFile -Parent), "--mode", $Mode)
        if ($SkipPermissions -and -not $ReadOnly) { $AgyArgs += "--dangerously-skip-permissions" }
        if ($StrictGuard) { $env:BEER_LEAGUE_GUARD_STRICT = "1" }
        agy @AgyArgs 2>&1 | Tee-Object -FilePath $LogFile
        Remove-Item Env:BEER_LEAGUE_GUARD_STRICT -ErrorAction SilentlyContinue
    }
    elseif ($Worker -eq "gemini-backup") {
        # Packet goes on stdin so long packets don't hit the command-line length limit
        $Mode = if ($ReadOnly) { "plan" } else { "auto_edit" }
        $TaskContent | gemini -p "Carry out the task packet provided on stdin." --approval-mode $Mode 2>&1 | Tee-Object -FilePath $LogFile
    }
    elseif ($Worker -eq "copilot") {
        $CopilotArgs = @("-p", $TaskContent, "-s", "--no-ask-user")
        if ($ReadOnly) {
            $CopilotArgs += @("--deny-tool", "write", "--deny-tool", "shell")
        }
        else {
            $CopilotArgs += @("--allow-tool", "write",
                              "--allow-tool", "shell(npm run build)",
                              "--allow-tool", "shell(git status)",
                              "--allow-tool", "shell(git diff)")
            foreach ($t in $DenyTools) { $CopilotArgs += @("--deny-tool", $t) }
        }
        copilot @CopilotArgs 2>&1 | Tee-Object -FilePath $LogFile
    }
    $WorkerExit = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
    Write-Host "`nWorker finished (exit $WorkerExit). Log saved to: $LogFile" -ForegroundColor $(if ($WorkerExit -eq 0) { "Green" } else { "Red" })
}
catch {
    $WorkerExit = 1
    Write-Host "Worker invocation failed: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Pop-Location
    if ($Queued.Count -gt 0) {
        if (Test-Path -LiteralPath $LogFile) {
            Add-Content -LiteralPath $LogFile -Value ("`n--- queue ---`nQueued message IDs: " + ($QueuedIds -join ", ") + "`nQueue packet: " + $EffectiveTaskFile) -Encoding utf8 -ErrorAction SilentlyContinue
        }
        Update-QueueAfterRun -Path $QueueFile -ProcessedIds $QueuedIds -Success ($WorkerExit -eq 0) -ErrorText "Worker exited with code $WorkerExit"
    }
}
exit $WorkerExit
