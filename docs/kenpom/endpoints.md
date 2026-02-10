# KenPom Data Endpoints Reference

Complete documentation of all KenPom.com data access methods.

**Data structure:** Output layout and file naming are documented in [data-structure.md](data-structure.md).

## Data Access Methods

KenPom data can be accessed two ways:

| Method                 | Auth Type          | Use Case                              |
| ---------------------- | ------------------ | ------------------------------------- |
| **kenpompy library**   | Subscription login | HTML scraping, full endpoint coverage |
| **REST API (api.php)** | API key            | Direct JSON, cleaner field names      |

---

## kenpompy Library Endpoints

### Authentication

```python
from kenpompy.utils import login

browser = login(email, password)
# Returns: CloudScraper session with auth cookies
```

---

### 1. Summary Endpoints (`kenpompy.summary`)

#### get_efficiency(browser, season)

**URL:** `https://kenpom.com/summary.php`
**Min Year:** 1999

Returns adjusted efficiency, tempo, and average possession length.

| Column                        | Type  | Description                       |
| ----------------------------- | ----- | --------------------------------- |
| Team                          | str   | Team name                         |
| Conference                    | str   | Conference name                   |
| Tempo-Adj                     | float | Adjusted tempo (poss/40 min)      |
| Tempo-Adj.Rank                | int   | Adjusted tempo rank               |
| Tempo-Raw                     | float | Raw tempo                         |
| Tempo-Raw.Rank                | int   | Raw tempo rank                    |
| Avg. Poss Length-Offense      | float | Offensive possession length (sec) |
| Avg. Poss Length-Offense.Rank | int   | Off APL rank                      |
| Avg. Poss Length-Defense      | float | Defensive possession length (sec) |
| Avg. Poss Length-Defense.Rank | int   | Def APL rank                      |
| Off. Efficiency-Adj           | float | Adjusted offensive efficiency     |
| Off. Efficiency-Adj.Rank      | int   | Adj OE rank                       |
| Off. Efficiency-Raw           | float | Raw offensive efficiency          |
| Off. Efficiency-Raw.Rank      | int   | Raw OE rank                       |
| Def. Efficiency-Adj           | float | Adjusted defensive efficiency     |
| Def. Efficiency-Adj.Rank      | int   | Adj DE rank                       |
| Def. Efficiency-Raw           | float | Raw defensive efficiency          |
| Def. Efficiency-Raw.Rank      | int   | Raw DE rank                       |

---

#### get_fourfactors(browser, season)

**URL:** `https://kenpom.com/stats.php`
**Min Year:** 1999

Returns Dean Oliver's Four Factors for offense and defense.

| Column          | Type  | Description                   |
| --------------- | ----- | ----------------------------- |
| Team            | str   | Team name                     |
| Conference      | str   | Conference name               |
| AdjTempo        | float | Adjusted tempo                |
| AdjTempo.Rank   | int   | Tempo rank                    |
| AdjOE           | float | Adjusted offensive efficiency |
| AdjOE.Rank      | int   | AdjOE rank                    |
| Off-eFG%        | float | Offensive effective FG%       |
| Off-eFG%.Rank   | int   | Off eFG% rank                 |
| Off-TO%         | float | Offensive turnover %          |
| Off-TO%.Rank    | int   | Off TO% rank                  |
| Off-OR%         | float | Offensive rebound %           |
| Off-OR%.Rank    | int   | Off OR% rank                  |
| Off-FTRate      | float | Offensive free throw rate     |
| Off-FTRate.Rank | int   | Off FTRate rank               |
| AdjDE           | float | Adjusted defensive efficiency |
| AdjDE.Rank      | int   | AdjDE rank                    |
| Def-eFG%        | float | Defensive eFG% allowed        |
| Def-eFG%.Rank   | int   | Def eFG% rank                 |
| Def-TO%         | float | Defensive turnover % forced   |
| Def-TO%.Rank    | int   | Def TO% rank                  |
| Def-OR%         | float | Defensive rebound % allowed   |
| Def-OR%.Rank    | int   | Def OR% rank                  |
| Def-FTRate      | float | Defensive FTRate allowed      |
| Def-FTRate.Rank | int   | Def FTRate rank               |

---

#### get_teamstats(browser, season, defense=False)

**URL:** `https://kenpom.com/teamstats.php`
**Min Year:** 1999

Returns detailed shooting and play statistics.

| Column                | Type  | Description                                 |
| --------------------- | ----- | ------------------------------------------- |
| Team                  | str   | Team name                                   |
| Conference            | str   | Conference name                             |
| 3P%                   | float | Three-point percentage                      |
| 3P%.Rank              | int   | 3P% rank                                    |
| 2P%                   | float | Two-point percentage                        |
| 2P%.Rank              | int   | 2P% rank                                    |
| FT%                   | float | Free throw percentage                       |
| FT%.Rank              | int   | FT% rank                                    |
| Blk%                  | float | Block percentage                            |
| Blk%.Rank             | int   | Block% rank                                 |
| Stl%                  | float | Steal percentage                            |
| Stl%.Rank             | int   | Steal% rank                                 |
| NST%                  | float | Non-steal turnover %                        |
| NST%.Rank             | int   | NST% rank                                   |
| A%                    | float | Assist percentage                           |
| A%.Rank               | int   | Assist% rank                                |
| 3PA%                  | float | Three-point attempt rate                    |
| 3PA%.Rank             | int   | 3PA% rank                                   |
| AdjOE/AdjDE           | float | Adjusted efficiency (O or D based on param) |
| AdjOE.Rank/AdjDE.Rank | int   | Efficiency rank                             |

---

#### get_pointdist(browser, season)

**URL:** `https://kenpom.com/pointdist.php`
**Min Year:** 1999

Returns scoring distribution percentages.

| Column      | Type  | Description                   |
| ----------- | ----- | ----------------------------- |
| Team        | str   | Team name                     |
| Conference  | str   | Conference name               |
| Off-FT      | float | % of offense from free throws |
| Off-FT.Rank | int   | Off FT% rank                  |
| Off-2P      | float | % of offense from 2-pointers  |
| Off-2P.Rank | int   | Off 2P% rank                  |
| Off-3P      | float | % of offense from 3-pointers  |
| Off-3P.Rank | int   | Off 3P% rank                  |
| Def-FT      | float | % of defense from FT allowed  |
| Def-FT.Rank | int   | Def FT% rank                  |
| Def-2P      | float | % of defense from 2P allowed  |
| Def-2P.Rank | int   | Def 2P% rank                  |
| Def-3P      | float | % of defense from 3P allowed  |
| Def-3P.Rank | int   | Def 3P% rank                  |

---

#### get_height(browser, season)

**URL:** `https://kenpom.com/height.php`
**Min Year:** 2007

Returns height, experience, and roster continuity.

| Column          | Type  | Description                         |
| --------------- | ----- | ----------------------------------- |
| Team            | str   | Team name                           |
| Conference      | str   | Conference name                     |
| AvgHgt          | float | Average height (inches)             |
| AvgHgt.Rank     | int   | Avg height rank                     |
| EffHgt          | float | Effective height (minutes-weighted) |
| EffHgt.Rank     | int   | Eff height rank                     |
| C-Hgt           | float | Center height                       |
| C-Hgt.Rank      | int   | Center height rank                  |
| PF-Hgt          | float | Power forward height                |
| PF-Hgt.Rank     | int   | PF height rank                      |
| SF-Hgt          | float | Small forward height                |
| SF-Hgt.Rank     | int   | SF height rank                      |
| SG-Hgt          | float | Shooting guard height               |
| SG-Hgt.Rank     | int   | SG height rank                      |
| PG-Hgt          | float | Point guard height                  |
| PG-Hgt.Rank     | int   | PG height rank                      |
| Experience      | float | Team experience (years)             |
| Experience.Rank | int   | Experience rank                     |
| Bench           | float | Bench minutes %                     |
| Bench.Rank      | int   | Bench rank                          |
| Continuity      | float | Continuity %                        |
| Continuity.Rank | int   | Continuity rank                     |

---

### 2. Miscellaneous Endpoints (`kenpompy.misc`)

#### get_pomeroy_ratings(browser, season)

**URL:** `https://kenpom.com/index.php`
**Min Year:** 1999

Main ratings table from the KenPom homepage.

| Column   | Type  | Description                   |
| -------- | ----- | ----------------------------- |
| Rk       | int   | Overall rank                  |
| Team     | str   | Team name                     |
| Conf     | str   | Conference                    |
| W-L      | str   | Win-loss record               |
| AdjEM    | float | Adjusted efficiency margin    |
| AdjO     | float | Adjusted offensive efficiency |
| AdjO.Rk  | int   | Adj OE rank                   |
| AdjD     | float | Adjusted defensive efficiency |
| AdjD.Rk  | int   | Adj DE rank                   |
| AdjT     | float | Adjusted tempo                |
| AdjT.Rk  | int   | Adj tempo rank                |
| Luck     | float | Luck rating                   |
| Luck.Rk  | int   | Luck rank                     |
| SOS      | float | Strength of schedule          |
| SOS.Rk   | int   | SOS rank                      |
| OppO     | float | Opponent offensive efficiency |
| OppO.Rk  | int   | OppO rank                     |
| OppD     | float | Opponent defensive efficiency |
| OppD.Rk  | int   | OppD rank                     |
| NCSOS    | float | Non-conference SOS            |
| NCSOS.Rk | int   | NCSOS rank                    |

---

### 3. FanMatch Endpoint (`kenpompy.FanMatch`)

#### FanMatch(browser, date)

**URL:** `https://kenpom.com/fanmatch.php?d={YYYY-MM-DD}`
**Min Year:** 2014

Game predictions and results for a specific date.

**Object Attributes:**

| Attribute                     | Type      | Description               |
| ----------------------------- | --------- | ------------------------- |
| url                           | str       | Full URL of page          |
| date                          | str       | Date scraped              |
| lines_o_night                 | list      | Best games of the night   |
| ppg                           | float     | Average points per game   |
| avg_eff                       | float     | Average efficiency        |
| pos_40                        | float     | Possessions per 40 min    |
| mean_abs_err_pred_total_score | float     | Prediction MAE for total  |
| bias_pred_total_score         | float     | Prediction bias for total |
| mean_abs_err_pred_mov         | float     | Prediction MAE for MOV    |
| record_favs                   | str       | Favorites record          |
| expected_record_favs          | str       | Expected favorites record |
| exact_mov                     | str       | Exact MOV predictions     |
| fm_df                         | DataFrame | Full game data            |

**fm_df Columns:**

| Column               | Type  | Description                       |
| -------------------- | ----- | --------------------------------- |
| Game                 | str   | Matchup description               |
| Location             | str   | Game location                     |
| ThrillScore          | float | Pre-game entertainment prediction |
| Comeback             | float | Comeback rating                   |
| Excitement           | float | Post-game excitement rating       |
| ThrillScoreRank      | int   | ThrillScore rank                  |
| ExcitementRank       | int   | Excitement rank                   |
| ComebackRank         | int   | Comeback rank                     |
| MVP                  | str   | Game MVP                          |
| Tournament           | str   | Tournament designation            |
| Possessions          | int   | Game possessions                  |
| PredictedWinner      | str   | Predicted winner                  |
| PredictedScore       | str   | Predicted score                   |
| WinProbability       | float | Win probability                   |
| PredictedPossessions | int   | Predicted possessions             |
| PredictedMOV         | int   | Predicted margin of victory       |
| PredictedLoser       | str   | Predicted loser                   |
| OT                   | str   | Overtime indicator                |
| Loser                | str   | Actual loser                      |
| LoserRank            | int   | Loser's rank                      |
| LoserScore           | int   | Loser's score                     |
| Winner               | str   | Actual winner                     |
| WinnerRank           | int   | Winner's rank                     |
| WinnerScore          | int   | Winner's score                    |
| ActualMOV            | int   | Actual margin of victory          |

---

## REST API Endpoints (api.php)

The REST API provides cleaner JSON responses but requires a separate API key.

### API Details

- **Base URL:** `https://kenpom.com`
- **Format:** JSON
- **Auth:** Bearer token in `Authorization` header

```
GET /api.php?endpoint=ratings&y=2025
Authorization: Bearer YOUR_API_KEY
```

### Python Client

```python
from src.api_client import KenPomAPI

# Set KENPOM_API_KEY environment variable or pass directly
api = KenPomAPI(api_key="your-api-key")
```

**Get your API key:** Log into KenPom.com and navigate to Account Settings.

---

### Working Endpoints (Verified January 2025)

| Endpoint     | Method                     | Params                      | Description                        |
| ------------ | -------------------------- | --------------------------- | ---------------------------------- |
| ratings      | `get_ratings()`            | y, team_id, c               | Team ratings with efficiency       |
| archive      | `get_archive()`            | d, y, preseason, team_id, c | Historical ratings from past dates |
| teams        | `get_teams()`              | y, c                        | Team lookup with IDs and arenas    |
| conferences  | `get_conference_list()`    | y                           | Conference list                    |
| conf-ratings | `get_conferences()`        | y, c                        | Conference ratings                 |
| four-factors | `get_four_factors()`       | y, team_id, c, conf_only    | Dean Oliver's Four Factors         |
| pointdist    | `get_point_distribution()` | y, team_id, c, conf_only    | Point distribution by shot type    |
| height       | `get_height()`             | y, team_id, c               | Height/experience (2007+)          |
| misc-stats   | `get_misc_stats()`         | y, team_id, c, conf_only    | Shooting, blocks, steals, assists  |
| fanmatch     | `get_fanmatch()`           | d                           | Game predictions for a date        |

---

### Endpoint Field Reference

#### ratings

| Field        | Type  | Description                     |
| ------------ | ----- | ------------------------------- |
| DataThrough  | str   | Date of last update             |
| Season       | int   | Season year                     |
| TeamName     | str   | Team name                       |
| Seed         | int   | NCAA tournament seed (if any)   |
| ConfShort    | str   | Conference abbreviation         |
| Coach        | str   | Head coach name                 |
| Wins         | int   | Win count                       |
| Losses       | int   | Loss count                      |
| AdjEM        | float | Adjusted efficiency margin      |
| RankAdjEM    | int   | AdjEM rank                      |
| Pythag       | float | Pythagorean win expectation     |
| RankPythag   | int   | Pythag rank                     |
| AdjOE        | float | Adjusted offensive efficiency   |
| RankAdjOE    | int   | AdjOE rank                      |
| OE           | float | Raw offensive efficiency        |
| RankOE       | int   | OE rank                         |
| AdjDE        | float | Adjusted defensive efficiency   |
| RankAdjDE    | int   | AdjDE rank                      |
| DE           | float | Raw defensive efficiency        |
| RankDE       | int   | DE rank                         |
| Tempo        | float | Raw tempo                       |
| RankTempo    | int   | Tempo rank                      |
| AdjTempo     | float | Adjusted tempo                  |
| RankAdjTempo | int   | AdjTempo rank                   |
| Luck         | float | Luck rating                     |
| RankLuck     | int   | Luck rank                       |
| SOS          | float | Strength of schedule            |
| RankSOS      | int   | SOS rank                        |
| SOSO         | float | SOS - opponent offense          |
| RankSOSO     | int   | SOSO rank                       |
| SOSD         | float | SOS - opponent defense          |
| RankSOSD     | int   | SOSD rank                       |
| NCSOS        | float | Non-conference SOS              |
| RankNCSOS    | int   | NCSOS rank                      |
| APL_Off      | float | Avg possession length (offense) |
| RankAPL_Off  | int   | APL_Off rank                    |
| APL_Def      | float | Avg possession length (defense) |
| RankAPL_Def  | int   | APL_Def rank                    |

---

#### four-factors

| Field        | Type  | Description                   |
| ------------ | ----- | ----------------------------- |
| DataThrough  | str   | Date of last update           |
| ConfOnly     | bool  | Conference games only flag    |
| TeamName     | str   | Team name                     |
| Season       | int   | Season year                   |
| eFG_Pct      | float | Effective FG% (offense)       |
| RankeFG_Pct  | int   | eFG% rank                     |
| TO_Pct       | float | Turnover % (offense)          |
| RankTO_Pct   | int   | TO% rank                      |
| OR_Pct       | float | Offensive rebound %           |
| RankOR_Pct   | int   | OR% rank                      |
| FT_Rate      | float | Free throw rate (offense)     |
| RankFT_Rate  | int   | FT rate rank                  |
| DeFG_Pct     | float | Defensive eFG% allowed        |
| RankDeFG_Pct | int   | Def eFG% rank                 |
| DTO_Pct      | float | Defensive TO% forced          |
| RankDTO_Pct  | int   | Def TO% rank                  |
| DOR_Pct      | float | Defensive rebound % allowed   |
| RankDOR_Pct  | int   | Def OR% rank                  |
| DFT_Rate     | float | Defensive FT rate allowed     |
| RankDFT_Rate | int   | Def FT rate rank              |
| AdjOE        | float | Adjusted offensive efficiency |
| RankAdjOE    | int   | AdjOE rank                    |
| AdjDE        | float | Adjusted defensive efficiency |
| RankAdjDE    | int   | AdjDE rank                    |
| AdjTempo     | float | Adjusted tempo                |
| RankAdjTempo | int   | AdjTempo rank                 |

---

#### pointdist

| Field       | Type  | Description                |
| ----------- | ----- | -------------------------- |
| DataThrough | str   | Date of last update        |
| ConfOnly    | bool  | Conference games only flag |
| Season      | int   | Season year                |
| TeamName    | str   | Team name                  |
| ConfShort   | str   | Conference abbreviation    |
| OffFt       | float | % of points from FT (off)  |
| RankOffFt   | int   | OffFt rank                 |
| OffFg2      | float | % of points from 2P (off)  |
| RankOffFg2  | int   | OffFg2 rank                |
| OffFg3      | float | % of points from 3P (off)  |
| RankOffFg3  | int   | OffFg3 rank                |
| DefFt       | float | % of points from FT (def)  |
| RankDefFt   | int   | DefFt rank                 |
| DefFg2      | float | % of points from 2P (def)  |
| RankDefFg2  | int   | DefFg2 rank                |
| DefFg3      | float | % of points from 3P (def)  |
| RankDefFg3  | int   | DefFg3 rank                |

---

#### height

| Field          | Type  | Description                         |
| -------------- | ----- | ----------------------------------- |
| DataThrough    | str   | Date of last update                 |
| Season         | int   | Season year                         |
| TeamName       | str   | Team name                           |
| ConfShort      | str   | Conference abbreviation             |
| AvgHgt         | float | Average height (inches)             |
| AvgHgtRank     | int   | AvgHgt rank                         |
| HgtEff         | float | Effective height (minutes-weighted) |
| HgtEffRank     | int   | HgtEff rank                         |
| Hgt5           | float | Position 5 (center) height          |
| Hgt5Rank       | int   | Hgt5 rank                           |
| Hgt4           | float | Position 4 (PF) height              |
| Hgt4Rank       | int   | Hgt4 rank                           |
| Hgt3           | float | Position 3 (SF) height              |
| Hgt3Rank       | int   | Hgt3 rank                           |
| Hgt2           | float | Position 2 (SG) height              |
| Hgt2Rank       | int   | Hgt2 rank                           |
| Hgt1           | float | Position 1 (PG) height              |
| Hgt1Rank       | int   | Hgt1 rank                           |
| Exp            | float | Team experience (years)             |
| ExpRank        | int   | Exp rank                            |
| Bench          | float | Bench minutes %                     |
| BenchRank      | int   | Bench rank                          |
| Continuity     | float | Roster continuity %                 |
| RankContinuity | int   | Continuity rank                     |

---

#### misc-stats

| Field             | Type  | Description                   |
| ----------------- | ----- | ----------------------------- |
| DataThrough       | str   | Date of last update           |
| ConfOnly          | bool  | Conference games only flag    |
| Season            | int   | Season year                   |
| TeamName          | str   | Team name                     |
| ConfShort         | str   | Conference abbreviation       |
| FG3Pct            | float | 3-point percentage (offense)  |
| RankFG3Pct        | int   | FG3Pct rank                   |
| FG2Pct            | float | 2-point percentage (offense)  |
| RankFG2Pct        | int   | FG2Pct rank                   |
| FTPct             | float | Free throw percentage         |
| RankFTPct         | int   | FTPct rank                    |
| BlockPct          | float | Block percentage              |
| RankBlockPct      | int   | BlockPct rank                 |
| StlRate           | float | Steal rate                    |
| RankStlRate       | int   | StlRate rank                  |
| NSTRate           | float | Non-steal turnover rate       |
| RankNSTRate       | int   | NSTRate rank                  |
| ARate             | float | Assist rate                   |
| RankARate         | int   | ARate rank                    |
| F3GRate           | float | 3-point attempt rate          |
| RankF3GRate       | int   | F3GRate rank                  |
| Avg2PADist        | float | Average 2-point shot distance |
| RankAvg2PADist    | int   | Avg2PADist rank               |
| OppFG3Pct         | float | Opponent 3P% allowed          |
| RankOppFG3Pct     | int   | OppFG3Pct rank                |
| OppFG2Pct         | float | Opponent 2P% allowed          |
| RankOppFG2Pct     | int   | OppFG2Pct rank                |
| OppFTPct          | float | Opponent FT% allowed          |
| RankOppFTPct      | int   | OppFTPct rank                 |
| OppBlockPct       | float | Opponent block %              |
| RankOppBlockPct   | int   | OppBlockPct rank              |
| OppStlRate        | float | Opponent steal rate           |
| RankOppStlRate    | int   | OppStlRate rank               |
| OppNSTRate        | float | Opponent non-steal TO rate    |
| RankOppNSTRate    | int   | OppNSTRate rank               |
| OppARate          | float | Opponent assist rate          |
| RankOppARate      | int   | OppARate rank                 |
| OppF3GRate        | float | Opponent 3PA rate             |
| RankOppF3GRate    | int   | OppF3GRate rank               |
| OppAvg2PADist     | float | Opponent avg 2P distance      |
| RankOppAvg2PADist | int   | OppAvg2PADist rank            |

---

#### teams

| Field      | Type | Description             |
| ---------- | ---- | ----------------------- |
| Season     | int  | Season year             |
| TeamName   | str  | Team name               |
| TeamID     | int  | Unique team identifier  |
| ConfShort  | str  | Conference abbreviation |
| Coach      | str  | Head coach name         |
| Arena      | str  | Home arena name         |
| ArenaCity  | str  | Arena city              |
| ArenaState | str  | Arena state             |

---

#### conferences

| Field     | Type | Description             |
| --------- | ---- | ----------------------- |
| Season    | int  | Season year             |
| ConfID    | int  | Conference ID           |
| ConfShort | str  | Conference abbreviation |
| ConfLong  | str  | Full conference name    |

---

#### conf-ratings

| Field     | Type  | Description                       |
| --------- | ----- | --------------------------------- |
| Season    | int   | Season year                       |
| ConfShort | str   | Conference abbreviation           |
| ConfID    | int   | Conference ID                     |
| ConfLong  | str   | Full conference name              |
| Rank      | int   | Conference strength rank          |
| Rating    | float | NetRtg of .500 team in conference |

---

#### archive

| Field             | Type  | Description                   |
| ----------------- | ----- | ----------------------------- |
| ArchiveDate       | str   | Date of snapshot              |
| Season            | int   | Season year                   |
| Preseason         | bool  | Is preseason snapshot         |
| TeamName          | str   | Team name                     |
| Seed              | int   | Tournament seed               |
| Event             | str   | Tournament event              |
| ConfShort         | str   | Conference abbreviation       |
| AdjEM             | float | AdjEM at snapshot date        |
| RankAdjEM         | int   | AdjEM rank at snapshot        |
| AdjOE             | float | AdjOE at snapshot date        |
| RankAdjOE         | int   | AdjOE rank at snapshot        |
| AdjDE             | float | AdjDE at snapshot date        |
| RankAdjDE         | int   | AdjDE rank at snapshot        |
| AdjTempo          | float | AdjTempo at snapshot date     |
| RankAdjTempo      | int   | AdjTempo rank at snapshot     |
| AdjEMFinal        | float | Final AdjEM for comparison    |
| RankAdjEMFinal    | int   | Final AdjEM rank              |
| AdjOEFinal        | float | Final AdjOE                   |
| RankAdjOEFinal    | int   | Final AdjOE rank              |
| AdjDEFinal        | float | Final AdjDE                   |
| RankAdjDEFinal    | int   | Final AdjDE rank              |
| AdjTempoFinal     | float | Final AdjTempo                |
| RankAdjTempoFinal | int   | Final AdjTempo rank           |
| RankChg           | int   | Rank change from snapshot     |
| AdjEMChg          | float | AdjEM change from snapshot    |
| AdjTChg           | float | AdjTempo change from snapshot |

---

#### fanmatch

| Field           | Type  | Description                  |
| --------------- | ----- | ---------------------------- |
| GameId          | int   | Unique game identifier       |
| Date            | str   | Game date                    |
| Time            | str   | Game time                    |
| Location        | str   | Game location type           |
| Arena           | str   | Arena name                   |
| Team1           | str   | First team name              |
| Team1Rank       | int   | First team rank              |
| Team2           | str   | Second team name             |
| Team2Rank       | int   | Second team rank             |
| ThrillScore     | float | Pre-game entertainment score |
| PredictedWinner | str   | Predicted winner             |
| PredictedScore  | str   | Predicted final score        |
| PredictedMOV    | float | Predicted margin of victory  |
| WinProbability  | float | Win probability for favorite |
| ActualWinner    | str   | Actual winner (post-game)    |
| ActualScore     | str   | Actual final score           |
| ActualMOV       | int   | Actual margin of victory     |
| Excitement      | float | Post-game excitement rating  |
| Tension         | float | Post-game tension rating     |
| Comeback        | float | Comeback rating              |
| MVP             | str   | Game MVP                     |
| OT              | str   | Overtime indicator           |

---

### Unavailable Endpoints (Not in REST API)

The following endpoints are documented in older references but **do not work** via the REST API. Use kenpompy scraping instead if needed:

| Endpoint    | Alternative                                   |
| ----------- | --------------------------------------------- |
| efficiency  | Use `ratings` (contains AdjOE, AdjDE, APL)    |
| hca         | Use default 3.5 HCA or scrape via kenpompy    |
| schedule    | Scrape via kenpompy                           |
| playerstats | Scrape via kenpompy                           |
| refs        | Scrape via kenpompy                           |
| arenas      | Use `teams` (contains Arena, ArenaCity, etc.) |

---

## Conference Codes

| Code  | Conference            |
| ----- | --------------------- |
| A10   | Atlantic 10           |
| ACC   | Atlantic Coast        |
| AE    | America East          |
| Amer  | American Athletic     |
| ASun  | Atlantic Sun          |
| B10   | Big Ten               |
| B12   | Big 12                |
| BE    | Big East              |
| BSky  | Big Sky               |
| BSth  | Big South             |
| BW    | Big West              |
| CAA   | Colonial Athletic     |
| CUSA  | Conference USA        |
| Horz  | Horizon               |
| Ivy   | Ivy League            |
| MAAC  | Metro Atlantic        |
| MAC   | Mid-American          |
| MEast | Mid-Eastern Athletic  |
| MVC   | Missouri Valley       |
| MWC   | Mountain West         |
| NEC   | Northeast             |
| OVC   | Ohio Valley           |
| Pac   | Pac-12                |
| Pat   | Patriot               |
| SB    | Sun Belt              |
| SC    | Southern              |
| SEC   | Southeastern          |
| Slnd  | Southland             |
| Sum   | Summit                |
| SWAC  | Southwestern Athletic |
| WAC   | Western Athletic      |
| WCC   | West Coast            |

---

## Season Availability

| Data Type          | REST API    | kenpompy  |
| ------------------ | ----------- | --------- |
| Ratings            | 2002+       | 1999+     |
| Four Factors       | 2002+       | 1999+     |
| Point Distribution | 2002+       | 1999+     |
| Height/Experience  | 2007+       | 2007+     |
| FanMatch           | 2014+       | 2014+     |
| Misc Stats         | 2002+       | 1999+     |
| Archive            | 2002+       | N/A       |
| Player Stats       | N/A         | 2004+     |
| HCA                | N/A         | All years |
| Refs               | N/A         | 2016+     |
| Arenas             | N/A (teams) | 2010+     |

---

## Usage Examples

### REST API

```python
from src.api_client import KenPomAPI

api = KenPomAPI()

# Get current ratings
ratings = api.get_ratings(season=2025)

# Get four factors
ff = api.get_four_factors(season=2025)

# Get historical snapshot
archive = api.get_archive(season=2024, archive_date="2024-03-15")

# Get game predictions for a date
games = api.get_fanmatch(game_date="2025-01-24")

api.close()
```

### kenpompy Scraping

```python
from kenpompy.utils import login
import kenpompy.summary as kp

browser = login(email, password)

# Get efficiency stats
eff = kp.get_efficiency(browser, season="2025")

# Get four factors
ff = kp.get_fourfactors(browser, season="2025")
```
