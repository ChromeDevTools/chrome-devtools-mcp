# GitHub Actions Daily Data Pipeline

## Overview

Fully automated daily data collection and staging consolidation workflow running on GitHub Actions. Eliminates need for local scheduling and ensures consistent daily updates.

**What it does:**
1. Collects raw data from ESPN and The Odds API (via `collect_hybrid.py`)
2. Consolidates raw data into ML-ready staging files (via `consolidate_staging.py`)
3. Commits updated staging files back to repository
4. Creates GitHub issue on failure for alerting

**Benefits:**
- No local machine required - runs in cloud
- Consistent execution schedule
- Automatic error notifications
- Full audit trail via git commits
- Free for public repositories

## Setup

### 1. Configure GitHub Secrets

Add required API credentials to your repository secrets:

1. Navigate to: `Settings` → `Secrets and variables` → `Actions`
2. Click **New repository secret**
3. Add the following secret:
   - Name: `ODDS_API_KEY`
   - Value: Your Odds API key from https://the-odds-api.com/

### 2. Enable Actions

If this is your first GitHub Action in the repository:

1. Navigate to: `Actions` tab in GitHub
2. Click **I understand my workflows, go ahead and enable them**

The workflow file is already in `.github/workflows/daily-data-pipeline.yml`.

### 3. Verify Workflow is Scheduled

1. Go to `Actions` tab
2. Click on **Daily Data Pipeline** workflow
3. Confirm the cron schedule shows: `At 14:00 UTC daily` (6 AM Pacific)

## Workflow Details

### Schedule

**Default**: Daily at 6:00 AM Pacific (14:00 UTC)

To change schedule, edit `.github/workflows/daily-data-pipeline.yml`:

```yaml
on:
  schedule:
    # Run daily at 6 AM Pacific (2 PM UTC)
    - cron: '0 14 * * *'
```

**Cron syntax:**
- `0 14 * * *` = 14:00 UTC (6:00 AM Pacific) daily
- `0 10,14,18,22 * * *` = 10:00, 14:00, 18:00, 22:00 UTC (4x daily)
- `0 6 * * 1-5` = 06:00 UTC Monday-Friday only

### Jobs

The workflow runs three sequential jobs:

#### 1. Collect (`collect`)
- Runs `scripts/collect_hybrid.py`
- Collects events from ESPN (comprehensive coverage)
- Collects odds from The Odds API (betting lines)
- Stores in SQLite database
- Uploads artifacts for consolidation

#### 2. Consolidate (`consolidate`)
- Depends on `collect` job completion
- Runs `scripts/consolidate_staging.py`
- Consolidates raw data into staging layer:
  - `events.parquet` - Unified event catalog
  - `line_features.parquet` - Pre-computed line movements
  - `team_ratings.parquet` - KenPom ratings with name mapping
  - `metadata.json` - Build timestamp and coverage stats
- Commits staging updates to repository (scheduled runs only)
- Uploads staging artifacts

#### 3. Notify (`notify`)
- Only runs on failure
- Creates GitHub issue with error details
- Labels: `automation`, `bug`
- Includes workflow run URL for debugging

## Manual Triggers

You can manually trigger the workflow with custom options:

1. Go to `Actions` tab
2. Click **Daily Data Pipeline**
3. Click **Run workflow** dropdown
4. Configure options:
   - **Skip odds collection**: Run ESPN collection only (saves API credits)
   - **Force staging rebuild**: Rebuild even if staging is recent
5. Click **Run workflow**

### Common Manual Scenarios

**Test collection without using API credits:**
```
✓ Skip odds collection (ESPN only)
✗ Force staging rebuild
```

**Force full rebuild:**
```
✗ Skip odds collection
✓ Force staging rebuild
```

## Monitoring

### View Workflow Runs

1. Navigate to `Actions` tab
2. Click **Daily Data Pipeline**
3. View run history with status indicators:
   - ✓ Green = Success
   - ✗ Red = Failed
   - ◷ Yellow = Running

### Check Logs

Click on any workflow run to see detailed logs for each job:

1. **Collect** - Raw data collection logs
2. **Consolidate** - Staging consolidation logs
3. **Notify** - Error notification (if failed)

### Download Artifacts

Each workflow run uploads artifacts for inspection:

- **raw-data** (7 days retention)
  - `odds_api.sqlite3` - Raw SQLite database
  - `hybrid_collection.log` - Collection logs

- **staging-data** (30 days retention)
  - `*.parquet` - Staging layer files
  - `metadata.json` - Build metadata

To download:
1. Click on workflow run
2. Scroll to **Artifacts** section
3. Click artifact name to download ZIP

### Git Commits

Successful runs commit staging updates:

```
commit abc123...
Author: github-actions[bot]

chore: update staging data

Automated daily update from data pipeline

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

View commit history: `git log --grep="staging data"`

## Monitoring Staging Data

### Check Latest Build

```bash
# View staging metadata
cat data/staging/metadata.json

# Output:
{
  "built_at": "2026-02-05T14:05:23.456789",
  "coverage": {
    "events": 555,
    "with_scores": 555,
    "with_line_features": 551,
    "teams_with_ratings": 362
  },
  "feature_coverage_pct": 99.3,
  "score_coverage_pct": 100.0
}
```

### Verify Staging Files

```bash
# Check file sizes
ls -lh data/staging/

# Count rows
uv run python -c "
import pandas as pd

events = pd.read_parquet('data/staging/events.parquet')
features = pd.read_parquet('data/staging/line_features.parquet')
ratings = pd.read_parquet('data/staging/team_ratings.parquet')

print(f'Events: {len(events)} games')
print(f'Line features: {len(features)} games ({len(features)/len(events)*100:.1f}% coverage)')
print(f'Team ratings: {len(ratings)} teams')
"
```

## Error Handling

### Automatic Issue Creation

On workflow failure, an issue is automatically created:

**Title:** `Daily Data Pipeline Failed - 2026-02-05`

**Body:**
```
The daily data pipeline workflow has failed.

**Workflow Run:** https://github.com/omalleyandy/sports-betting-edge/actions/runs/12345

**Date:** 2026-02-05T14:05:23.456Z

Please check the logs and investigate the failure.
```

**Labels:** `automation`, `bug`

### Common Failures

#### ODDS_API_KEY not set
**Symptom:** Collect job fails with "ODDS_API_KEY environment variable not set"

**Fix:**
1. Go to `Settings` → `Secrets and variables` → `Actions`
2. Verify `ODDS_API_KEY` secret exists and is correct
3. Re-run workflow

#### API Quota Exceeded
**Symptom:** Collect job fails with HTTP 429 or quota error

**Fix:**
1. Check API quota at https://the-odds-api.com/
2. Upgrade API plan or reduce collection frequency
3. Use manual trigger with "Skip odds collection" enabled

#### KenPom Data Missing
**Symptom:** Consolidate job fails with "KenPom ratings not found"

**Fix:**
1. Ensure `data/kenpom/ratings/season/ratings_2026.parquet` exists
2. Run KenPom collection locally: `uv run python scripts/collect_kenpom_ratings.py`
3. Commit and push KenPom data
4. Re-run workflow

#### Staging Validation Failed
**Symptom:** Consolidate job completes but validation fails

**Fix:**
1. Check consolidation logs in workflow run
2. Verify raw database has data: Download raw-data artifact
3. Investigate specific validation error in logs
4. Fix issue locally and test with `uv run python scripts/consolidate_staging.py`

## Cost Analysis

### GitHub Actions Minutes

**Free tier (public repositories):**
- Unlimited minutes for public repos
- This workflow uses ~5-10 minutes per run
- **Cost: $0**

**Private repositories:**
- 2,000 minutes/month free (Free plan)
- 3,000 minutes/month (Pro plan)
- This workflow: ~10 min/day = 300 min/month
- **Cost: Free within tier limits**

### API Credits

**The Odds API usage per run:**
- 1 credit for odds (if not skipped)
- Minimal credits for ESPN (free API)
- **Daily: 30 credits/month**
- **Monthly: 900 credits (well within 500K free tier)**

## Workflow File Location

`.github/workflows/daily-data-pipeline.yml`

To modify workflow:
1. Edit the YAML file locally
2. Commit and push changes
3. GitHub Actions automatically picks up changes

## Integration with Training Pipeline

The staging layer is automatically updated daily. Training scripts use these files:

```python
from sports_betting_edge.services.feature_engineering import FeatureEngineer

# FeatureEngineer automatically loads from staging
engineer = FeatureEngineer(staging_path="data/staging/")

# Build features for training
features = engineer.build_training_features()
```

**Recommended training workflow:**
1. **Daily:** Staging layer auto-updates (GitHub Actions)
2. **Weekly:** Retrain models locally using fresh staging data
3. **Monthly:** Evaluate model performance and adjust

## Troubleshooting

### Workflow Not Running

**Check:**
1. Workflow enabled in Actions tab?
2. Repository has `ODDS_API_KEY` secret?
3. Cron schedule correct? (14:00 UTC = 6 AM Pacific)
4. GitHub Actions minutes available? (check usage in Settings)

### Manual Run Succeeds, Scheduled Run Fails

**Possible causes:**
- Scheduled runs use `schedule` trigger, manual uses `workflow_dispatch`
- Different permissions or secrets configuration
- Check if commit step is causing issues (only runs on schedule)

**Debug:**
1. Review workflow logs for differences
2. Test locally: `uv run python scripts/collect_hybrid.py`
3. Verify secrets are available to scheduled runs

### Staging Files Not Updating

**Check:**
1. Consolidate job succeeded?
2. Commit step succeeded? (check logs)
3. Are there merge conflicts? (check git status)
4. Is staging directory in `.gitignore`? (should NOT be)

## Advanced Configuration

### Change Commit Behavior

Edit workflow to **not** commit staging files:

```yaml
- name: Commit staging updates
  if: false  # Disable commits
  run: |
    ...
```

### Add Notifications

Add Slack/Discord notification on success:

```yaml
- name: Notify success
  if: success()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "Daily data pipeline succeeded"
      }
```

### Run on Multiple Schedules

Add multiple cron expressions:

```yaml
on:
  schedule:
    - cron: '0 14 * * *'  # 6 AM PT daily
    - cron: '0 22 * * *'  # 2 PM PT daily (game days)
```

## References

- GitHub Actions docs: https://docs.github.com/en/actions
- Cron syntax: https://crontab.guru/
- The Odds API: https://the-odds-api.com/
- Staging layer: `scripts/consolidate_staging.py`
- Collection script: `scripts/collect_hybrid.py`
