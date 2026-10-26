# Nightly league sync for Windows Task Scheduler.
# Setup (once): in this folder run
#   python -m venv .venv
#   .\.venv\Scripts\pip install -r requirements.txt
#   copy .env.example .env   (then fill it in)
# Automatic runs are handled by sync_runner.py (see SETUP.md step 7). Use this for a full run by hand.

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$log = Join-Path $PSScriptRoot ("logs\nightly-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot "logs") | Out-Null

# The same steps sync_runner.py runs at 6am (ESPN, NBA schedule and stats, heat rankings, backup).
# Running it by hand also tells the scheduler the morning run is done.
& $py sync_runner.py run nightly *>> $log

# Heat rankings run inside it once BUILD_MODEL_DIR is set in .env.

Add-Content $log ("finished " + (Get-Date))
