# Pre-tool hook shared by the workers. Reads the tool call as JSON on stdin, prints a decision as JSON.
#   agy:     wired up in ..\.agents\hooks.json (input toolCall.name/args, output decision)
#   Copilot: wired up in ..\.github\hooks\worker-guard.json with -Strict (input toolName/toolArgs,
#            output permissionDecision)
# Default: deny the list below, allow the local checks, otherwise leave it to the worker ("ask").
# -Strict: shell commands must also match $StrictAllow, or they are denied.
# Test by hand: '{"toolName":"powershell","toolArgs":{"command":"wrangler --version"}}' | pwsh -NoProfile -File worker-guard.ps1 -Strict
param(
    [switch]$Strict,
    [ValidateRange(1, 850)]
    [int]$ApprovalTimeoutSeconds = 840
)
# invoke-worker.ps1 -StrictGuard sets this for the worker's whole run
if ($env:BEER_LEAGUE_GUARD_STRICT -eq "1") { $Strict = $true }

$Deny = @(
    '\bnpm(\.cmd)?\s+(run(-script)?\s+)?deploy\b',
    '\bwrangler\b',
    # Also catches options in front, e.g. git -C "<folder>" push
    '\bgit\b[^;&|]*\s(push|reset)\b',
    '(^|[\s;&|(])(rm|del|erase|rd|rmdir|ri)(\s|$)',
    '\bRemove-Item\b',
    # Installing packages needs the user
    '\b(pip3?|uv|npm|pnpm|yarn|winget|choco)(\.exe|\.cmd)?\s+(install|add|i)\b',
    '-m\s+pip\s+install\b',
    # Live sync scripts write to Neon; publishing is only allowed as a dry run
    '\b(espn_sync|nba_sync|backup_db|sync_runner)\.py\b',
    'publish_rankings\.py(?!.*--dry-run)'
)
# Optional "cd <dir>;" in front and "| Select-Object ..." / "2>&1" behind a single command
$Pre = '^\s*((cd|Set-Location|Push-Location)\s+[^;&|]+\s*(;|&&)\s*)?'
$Post = '(\s+2>&1)?(\s*\|\s*(Select-Object|Out-String)[^;&|]*)?\s*$'
# A whole command that is exactly one of these runs without asking
$Allow = $Pre + '(npm(\.cmd)?\s+run\s+build|git\s+(status|diff|log))(\s[^;&|]*?)?' + $Post
# agy's portrait post-processing scripts, only from its own brain\<conversation>\scratch folder (TASK-003b)
$AllowPortraitNode = '^\s*(&\s*)?node(\.exe)?\s+["'']?C:[\\/]Users[\\/]kcorn[\\/]\.gemini[\\/]antigravity-cli[\\/]brain[\\/][0-9a-fA-F-]+[\\/]scratch[\\/]process_(one|portraits)\.mjs["'']?(\s[^;&|]*)?' + $Post
# -Strict: the only shell commands allowed (TASK-002 needs: sync venv Python on model scripts, the dry-run
# publish and the offline runner test; plus read-only git and file listing)
$Py = '(&\s*)?["'']?[^"'';&|]*\.venv[\\/]Scripts[\\/]python(\.exe)?["'']?\s+'
$StrictAllow = $Pre + '(' +
    $Py + '[^;&|]*?(build_model|pull_\w+)\.py\b[^;&|]*' +
    '|' + $Py + '[^;&|]*?publish_rankings\.py\s[^;&|]*--dry-run[^;&|]*' +
    '|' + $Py + '[^;&|]*?test_sync_runner\.py[^;&|]*' +
    '|git\s+(status|diff|log)(\s[^;&|]*?)?' +
    '|(Get-ChildItem|Get-Content|Test-Path|Get-Item|ls|dir|cat|type)(\s[^;&|]*?)?' +
    ')' + $Post

$in = $input | Out-String | ConvertFrom-Json
if ($in.toolCall) { $name = $in.toolCall.name; $toolArgs = $in.toolCall.args; $copilot = $false }
else {
    $name = $in.toolName; $toolArgs = $in.toolArgs; $copilot = $true
    if ($toolArgs -is [string]) { try { $toolArgs = $toolArgs | ConvertFrom-Json } catch { } }
}
# Check every argument value, so the rule holds whatever the command field is called
$text = if ($toolArgs -is [string]) { $toolArgs } else { ($toolArgs.PSObject.Properties.Value | ForEach-Object { "$_" }) -join "`n" }
$cmd = if ($toolArgs -is [string]) { $toolArgs } elseif ($toolArgs.CommandLine) { $toolArgs.CommandLine } else { $toolArgs.command }
$isShell = $name -in @("run_command", "powershell", "bash", "shell")

# The deny list is about commands that run; reading or editing a file that mentions them is fine
$hit = if ($isShell) { $Deny | Where-Object { $text -match $_ } | Select-Object -First 1 }
if ($hit) {
    $decision = "deny"; $reason = "Blocked by beer-league worker guard (deploys, pushes, resets, deletes, live sync scripts and real publishes need the user). Matched: $hit"
}
elseif ($Strict -and $isShell -and $cmd -notmatch $StrictAllow) {
    $decision = "deny"; $reason = "Blocked by beer-league worker guard: only the task's Python checks, read-only git and file listing may run."
}
elseif ($isShell -and ($cmd -match $Allow -or $cmd -match $AllowPortraitNode -or ($Strict -and $cmd -match $StrictAllow))) {
    $decision = "allow"; $reason = "Local check allowed by beer-league worker guard."
}
elseif ($isShell -and $env:BEER_LEAGUE_DASHBOARD -ne "1") {
    # The old way (Jason 2026-10-28, dashboard not working): any other command is refused at once
    $decision = "deny"; $reason = "Blocked by beer-league worker guard: command is not on the allow list."
}
else {
    $decision = "ask"; $reason = ""
}

$approvalId = $null
$approvalDir = Join-Path $PSScriptRoot "..\docs\ai\approvals"
$pendingPath = Join-Path $approvalDir "pending.json"
$decidedPath = Join-Path $approvalDir "decided.json"
$lockPath = Join-Path $approvalDir "pending.lock"
$ownsApprovalLock = $false

# The approval dashboard is opt-in: set $env:BEER_LEAGUE_DASHBOARD = "1" to route refused commands there
if ($isShell -and ($decision -in @("ask", "deny")) -and $env:BEER_LEAGUE_DASHBOARD -eq "1") {
    try {
        New-Item -ItemType Directory -Force -Path $approvalDir | Out-Null
        if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
            $lockCreated = [System.IO.File]::GetCreationTimeUtc($lockPath)
            if ($lockCreated -lt (Get-Date).ToUniversalTime().AddMinutes(-15)) {
                Remove-Item -LiteralPath $lockPath -Force
            }
        }
        $lockStream = [System.IO.File]::Open(
            $lockPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        $lockStream.Dispose()
        $ownsApprovalLock = $true
        $approvalId = [guid]::NewGuid().ToString()
        $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
        $request = @{
            id = $approvalId
            projectPath = $projectRoot
            action = if ($cmd) { "$cmd" } else { "$text" }
            context = "Worker: $name. Guard reason: $(if ($reason) { $reason } else { 'Command requires human approval.' })"
            createdAt = (Get-Date).ToUniversalTime().ToString("o")
        } | ConvertTo-Json -Depth 8 -Compress
        $utf8 = [System.Text.UTF8Encoding]::new($false)
        $pendingTemp = "$pendingPath.$approvalId.tmp"
        [System.IO.File]::WriteAllText($pendingTemp, $request, $utf8)
        [System.IO.File]::Move($pendingTemp, $pendingPath, $true)

        $deadline = (Get-Date).AddSeconds($ApprovalTimeoutSeconds)
        $humanDecision = $null
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 1
            if (-not (Test-Path -LiteralPath $decidedPath -PathType Leaf)) { continue }
            try {
                $response = Get-Content -LiteralPath $decidedPath -Raw | ConvertFrom-Json -ErrorAction Stop
                if ($response.id -eq $approvalId -and $response.decision -in @("approve", "deny")) {
                    $humanDecision = $response.decision
                    break
                }
            }
            catch {
                # Ignore an incomplete decision write and keep waiting for a valid matching response.
            }
        }

        if ($humanDecision -eq "approve") {
            $decision = "allow"
            $reason = "Approved by human through the dashboard."
        }
        else {
            $decision = "deny"
            $reason = if ($humanDecision -eq "deny") { "Denied by human through the dashboard." } else { "Approval timed out; denied by default." }
        }
    }
    catch {
        $decision = "deny"
        $reason = "Approval queue unavailable; denied by default. $($_.Exception.Message)"
    }
    finally {
        if ($approvalId -and (Test-Path -LiteralPath $pendingPath -PathType Leaf)) {
            try {
                $current = Get-Content -LiteralPath $pendingPath -Raw | ConvertFrom-Json -ErrorAction Stop
                if ($current.id -eq $approvalId) { Remove-Item -LiteralPath $pendingPath -Force }
            }
            catch { Write-Warning "Could not remove the completed approval request: $($_.Exception.Message)" }
        }
        if ($ownsApprovalLock -and (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
            try { Remove-Item -LiteralPath $lockPath -Force }
            catch { Write-Warning "Could not remove the approval lock: $($_.Exception.Message)" }
        }
    }
}

# Audit trail in the shared Templar Archives log (read by the AI Control Center dashboard).
# TEMPLAR_GUARD_LOG overrides the path; [agent=...] tells the dashboard which worker acted.
$guardLog = if ($env:TEMPLAR_GUARD_LOG) { $env:TEMPLAR_GUARD_LOG } else { "C:\Templar Archives\logs\worker-guard.log" }
$agent = if ($copilot) { "copilot" } else { "agy" }
try {
    New-Item -ItemType Directory -Force -Path (Split-Path $guardLog) | Out-Null
    Add-Content -Path $guardLog -Encoding utf8 `
        -Value ("{0:s} {1}{2} [agent={3}] {4}: {5}" -f (Get-Date), $decision, $(if ($Strict) { " (strict)" }), $agent, $name, ($text -replace "`n", " | "))
}
catch { [Console]::Error.WriteLine("Could not write the guard log: $($_.Exception.Message)") }

if ($copilot) {
    # Empty output = Copilot's normal permission flow
    if ($decision -ne "ask") { @{ permissionDecision = $decision; permissionDecisionReason = $reason } | ConvertTo-Json -Compress }
}
else {
    $out = @{ decision = $decision }
    if ($reason) { $out.reason = $reason }
    # Headless agy auto-denies anything without a permission grant, so grant this one command
    if ($decision -eq "allow") { $out.permissionOverrides = @("command($cmd)") }
    $out | ConvertTo-Json -Compress
}
