# Automatic Startup Guide - Overtime.ag Collection Service

## Quick Setup (Automated)

### Step 1: Import Task to Task Scheduler

Open **PowerShell as Administrator** and run:

```powershell
# Import the pre-configured task
Register-ScheduledTask -Xml (Get-Content "C:\Users\omall\Documents\python_projects\sports-betting-edge\scripts\OvertimeCollectorTask.xml" | Out-String) -TaskName "OvertimeCollector" -Force

# Verify it was created
Get-ScheduledTask -TaskName "OvertimeCollector"
```

**That's it!** The service will now:
- Start automatically 2 minutes after boot
- Run continuously collecting odds every 15 minutes
- Restart on failure (up to 3 times)
- Log to `logs/overtime_service_YYYYMMDD.log`

### Step 2: Verify Setup

```powershell
# Check task status
Get-ScheduledTask -TaskName "OvertimeCollector" | Select-Object TaskName,State,LastRunTime,NextRunTime

# Start it manually to test
Start-ScheduledTask -TaskName "OvertimeCollector"

# Wait a few seconds, then check logs
Get-Content "C:\Users\omall\Documents\python_projects\sports-betting-edge\logs\overtime_service_$(Get-Date -Format 'yyyyMMdd').log" -Tail 20
```

### Step 3: Monitor

```powershell
# View running task
Get-ScheduledTask -TaskName "OvertimeCollector" | Get-ScheduledTaskInfo

# View recent log entries
Get-Content "logs\overtime_service_$(Get-Date -Format 'yyyyMMdd').log" -Tail 50 -Wait

# View collected data
uv run python scripts/view_collected_odds.py
```

---

## Manual Setup (If Automated Fails)

### Option 1: Task Scheduler GUI

1. Open **Task Scheduler** (search in Start menu)

2. Click **"Create Task"** (not "Create Basic Task")

3. **General Tab**:
   - Name: `OvertimeCollector`
   - Description: `Collects overtime.ag sports betting odds every 15 minutes`
   - ✓ Run whether user is logged on or not
   - ✓ Run with highest privileges (optional)
   - Configure for: Windows 10

4. **Triggers Tab**:
   - Click **New...**
   - Begin the task: **At startup**
   - Delay task for: **2 minutes**
   - ✓ Enabled
   - Click **OK**

5. **Actions Tab**:
   - Click **New...**
   - Action: **Start a program**
   - Program/script: `powershell.exe`
   - Add arguments:
     ```
     -NoProfile -ExecutionPolicy Bypass -File "C:\Users\omall\Documents\python_projects\sports-betting-edge\scripts\start_overtime_service.ps1"
     ```
   - Start in: `C:\Users\omall\Documents\python_projects\sports-betting-edge`
   - Click **OK**

6. **Conditions Tab**:
   - ✓ Start only if the following network connection is available: Any connection
   - ☐ Stop if the computer switches to battery power

7. **Settings Tab**:
   - ✓ Allow task to be run on demand
   - ✓ Run task as soon as possible after a scheduled start is missed
   - ✓ If the task fails, restart every: **1 minute** (Attempt to restart up to: **3 times**)
   - If the running task does not end when requested: **Do not stop**
   - If the task is already running: **Do not start a new instance**

8. Click **OK**

9. Enter your Windows password if prompted

### Option 2: PowerShell Command

Run this in **PowerShell as Administrator**:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\omall\Documents\python_projects\sports-betting-edge\scripts\start_overtime_service.ps1"' `
    -WorkingDirectory "C:\Users\omall\Documents\python_projects\sports-betting-edge"

$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName "OvertimeCollector" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Collects overtime.ag sports betting odds every 15 minutes for NCAA Men's Basketball analysis"
```

---

## Managing the Service

### Start/Stop/Status

```powershell
# Start
Start-ScheduledTask -TaskName "OvertimeCollector"

# Stop
Stop-ScheduledTask -TaskName "OvertimeCollector"

# Status
Get-ScheduledTask -TaskName "OvertimeCollector" | Format-List *

# Check if running
Get-ScheduledTask -TaskName "OvertimeCollector" | Get-ScheduledTaskInfo
```

### View Logs

```powershell
# Today's log
Get-Content "logs\overtime_service_$(Get-Date -Format 'yyyyMMdd').log"

# Follow live (like tail -f)
Get-Content "logs\overtime_service_$(Get-Date -Format 'yyyyMMdd').log" -Wait -Tail 20

# Last 50 lines
Get-Content "logs\overtime_service_$(Get-Date -Format 'yyyyMMdd').log" -Tail 50
```

### Modify Configuration

Edit `scripts\start_overtime_service.ps1` to change:

```powershell
$env:COLLECTION_INTERVAL = "15"  # Change to 10, 30, 60, etc.
$env:COLLECTION_SPORTS = "Basketball,Football"  # Add more sports
$env:COLLECTION_SUBTYPES = "College Basketball,NFL"  # Match sports
```

Then restart the task:
```powershell
Stop-ScheduledTask -TaskName "OvertimeCollector"
Start-ScheduledTask -TaskName "OvertimeCollector"
```

### Disable (Without Deleting)

```powershell
Disable-ScheduledTask -TaskName "OvertimeCollector"
```

Re-enable:
```powershell
Enable-ScheduledTask -TaskName "OvertimeCollector"
```

### Remove Completely

```powershell
Unregister-ScheduledTask -TaskName "OvertimeCollector" -Confirm:$false
```

---

## Troubleshooting

### Task Won't Start

1. **Check Task Scheduler permissions**:
   ```powershell
   # Run as Administrator
   Get-ScheduledTask -TaskName "OvertimeCollector" | Get-ScheduledTaskInfo
   ```

2. **Verify PowerShell execution policy**:
   ```powershell
   Get-ExecutionPolicy
   # Should be RemoteSigned or Unrestricted
   ```

3. **Test the script manually**:
   ```powershell
   & "C:\Users\omall\Documents\python_projects\sports-betting-edge\scripts\start_overtime_service.ps1"
   ```

### No Data Being Collected

1. **Check logs**:
   ```powershell
   Get-Content "logs\overtime_service_*.log" | Select-String "ERROR"
   ```

2. **Verify network connectivity**:
   ```powershell
   Test-NetConnection overtime.ag -Port 443
   ```

3. **Check data directory**:
   ```powershell
   Get-ChildItem "data\overtime\basketball" -Recurse
   ```

### High Resource Usage

If the service uses too much CPU/memory:

1. **Increase collection interval**:
   Edit `scripts\start_overtime_service.ps1`:
   ```powershell
   $env:COLLECTION_INTERVAL = "30"  # or 60
   ```

2. **Reduce sports collected**:
   ```powershell
   $env:COLLECTION_SPORTS = "Basketball"  # Only one sport
   ```

---

## What Happens at Startup

1. **Computer boots** → Wait 2 minutes
2. **Task Scheduler** starts `start_overtime_service.ps1`
3. **Script** sets environment variables
4. **Service** starts collecting odds every 15 minutes
5. **Logs** written to `logs/overtime_service_YYYYMMDD.log`
6. **Data** saved to `data/overtime/basketball/*.parquet`

## Verification Checklist

After setup, verify:

- [ ] Task exists: `Get-ScheduledTask -TaskName "OvertimeCollector"`
- [ ] Task is enabled: State should be "Ready"
- [ ] Service is running: Check logs for recent collections
- [ ] Data is being saved: `ls data\overtime\basketball`
- [ ] No errors in logs: `Get-Content logs\*.log | Select-String "ERROR"`

## Daily Maintenance

### View Stats

```powershell
# Collections today
$logFile = "logs\overtime_service_$(Get-Date -Format 'yyyyMMdd').log"
$collections = Select-String "Collection complete" $logFile
Write-Host "Collections today: $($collections.Count)"

# Total games collected today
$games = Select-String "games saved" $logFile
$totalGames = ($games | ForEach-Object { [regex]::Match($_, '\d+').Value } | Measure-Object -Sum).Sum
Write-Host "Total games: $totalGames"
```

### Weekly Cleanup (Optional)

Delete old logs and data:

```powershell
# Delete logs older than 7 days
Get-ChildItem "logs\*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item

# Delete Parquet files older than 30 days
Get-ChildItem "data\overtime" -Recurse -Filter "*.parquet" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item
```

---

## Success Indicators

You know it's working when:

1. **Task Scheduler** shows:
   - Last Run Time: Recent timestamp
   - Last Run Result: Success (0x0)
   - Next Run Time: At startup

2. **Logs** show:
   ```
   INFO:__main__:[OK] Basketball - College Basketball: 6 games saved
   INFO:__main__:Collection complete: 6 games in 0.4s
   INFO:__main__:Next collection in 15 minutes
   ```

3. **Data directory** grows:
   ```
   data/overtime/basketball/
   ├── college_basketball_20260203_014101.parquet
   ├── college_basketball_20260203_014524.parquet
   ├── college_basketball_20260203_020000.parquet
   └── ...
   ```

4. **View script** shows recent odds:
   ```powershell
   uv run python scripts/view_collected_odds.py
   # Shows games with current lines
   ```

---

## Next Steps After Setup

1. **Let it run for 24 hours** - Build up historical data
2. **Check for line movements**:
   ```powershell
   uv run python scripts/view_collected_odds.py
   # Look for "LINE MOVEMENTS" section
   ```
3. **Invoke `/normalize-odds`** - Add implied probability calculations
4. **Create overtime adapter** - `/new_adapter overtime_ag`
5. **Integrate with KenPom** - Cross-reference team efficiency
6. **Build alerts** - Detect steam moves and sharp money

Your odds collection service is now running 24/7! 🎉
