# KenPom Field Definitions Reference

Complete glossary of all KenPom metrics and their meanings.

---

## Core Efficiency Metrics

### AdjEM (Adjusted Efficiency Margin)

**Formula:** AdjO - AdjD

The difference between a team's adjusted offensive and defensive efficiency. Represents expected point differential per 100 possessions against an average D1 team on a neutral court.

| Range | Quality |
|-------|---------|
| > 25 | Elite |
| 15-25 | Good |
| 0-15 | Average |
| < 0 | Poor |

---

### AdjO / AdjOE (Adjusted Offensive Efficiency)

Points scored per 100 possessions, adjusted for opponent and location.

| Range | Quality |
|-------|---------|
| > 120 | Elite |
| 110-120 | Good |
| 100-110 | Average |
| < 100 | Poor |

---

### AdjD / AdjDE (Adjusted Defensive Efficiency)

Points allowed per 100 possessions, adjusted for opponent and location. **Lower is better.**

| Range | Quality |
|-------|---------|
| < 90 | Elite |
| 90-98 | Good |
| 98-105 | Average |
| > 105 | Poor |

---

### AdjT / AdjTempo (Adjusted Tempo)

Possessions per 40 minutes, adjusted for opponent tempo.

| Range | Pace |
|-------|------|
| > 72 | Very Fast |
| 68-72 | Fast |
| 65-68 | Average |
| < 65 | Slow |

---

### Pythag (Pythagorean Expectation)

Expected win percentage based on points scored vs allowed, adjusted for schedule. Derived from the Pythagorean theorem applied to basketball.

**Formula:** Points Scored^11.5 / (Points Scored^11.5 + Points Allowed^11.5)

---

## Tempo & Possession Metrics

### APL / APLO / APLD (Average Possession Length)

Average time in seconds per possession. APLO = offensive, APLD = defensive.

| Range | Style |
|-------|-------|
| > 18 | Very deliberate |
| 16-18 | Deliberate |
| 14-16 | Average |
| < 14 | Fast |

---

### Raw Tempo vs Adjusted Tempo

- **Raw Tempo:** Actual possessions per 40 minutes
- **Adjusted Tempo:** Tempo adjusted for opponent's pace; better for comparing teams

---

## Four Factors Metrics

Dean Oliver's Four Factors explain ~90% of winning. Importance weights for NCAA basketball:

| Factor | Importance |
|--------|------------|
| eFG% | ~40% |
| TO% | ~25% |
| OR% | ~20% |
| FTRate | ~15% |

---

### eFG% (Effective Field Goal Percentage)

**Formula:** (FGM + 0.5 × 3PM) / FGA

Field goal percentage weighted to give 50% extra credit for made threes.

| Side | Elite | Poor |
|------|-------|------|
| Offense | > 55% | < 48% |
| Defense | < 45% | > 52% |

---

### TO% (Turnover Percentage)

**Formula:** Turnovers / Possessions × 100

Percentage of possessions ending in turnovers.

| Side | Elite | Poor |
|------|-------|------|
| Offense | < 15% | > 20% |
| Defense | > 22% | < 17% |

---

### OR% (Offensive Rebound Percentage)

**Formula:** Offensive Rebounds / (Offensive Rebounds + Opponent Defensive Rebounds) × 100

Percentage of available offensive rebounds grabbed.

| Side | Elite | Poor |
|------|-------|------|
| Offense | > 35% | < 25% |
| Defense | < 25% | > 32% |

---

### FTRate (Free Throw Rate)

**Formula:** FTA / FGA

Free throw attempts relative to field goal attempts. Measures ability to get to the line.

| Side | Elite | Poor |
|------|-------|------|
| Offense | > 0.40 | < 0.28 |
| Defense | < 0.25 | > 0.35 |

---

## Shooting Metrics

### 3P% (Three-Point Percentage)

Made threes / attempted threes.

- **Elite:** > 38%
- **Average:** 33-35%
- **Poor:** < 30%

---

### 2P% (Two-Point Percentage)

Made twos / attempted twos.

- **Elite:** > 54%
- **Average:** 48-50%
- **Poor:** < 46%

---

### FT% (Free Throw Percentage)

Made free throws / attempted free throws.

- **Elite:** > 76%
- **Average:** 70-72%
- **Poor:** < 68%

---

### 3PA% (Three-Point Attempt Rate)

**Formula:** 3PA / FGA

Percentage of field goal attempts that are three-pointers. Measures offensive style.

- **Three-heavy:** > 45%
- **Average:** 35-40%
- **Inside-oriented:** < 30%

---

### TS% (True Shooting Percentage)

**Formula:** Points / (2 × (FGA + 0.44 × FTA))

Overall shooting efficiency accounting for free throws and three-pointers.

- **Elite:** > 62%
- **Good:** 56-62%
- **Average:** 52-56%
- **Poor:** < 52%

---

## Turnover Metrics

### Stl% (Steal Percentage)

**Formula:** Steals / Opponent Possessions × 100

Percentage of opponent possessions ending in a steal.

- **Elite Defense:** > 12%
- **Average:** 9-10%

---

### NST% (Non-Steal Turnover Percentage)

**Formula:** (Turnovers - Steals) / Possessions × 100

Turnovers not caused by steals (travels, bad passes, shot clock violations, etc.). Measures ball-handling discipline.

- **Disciplined:** < 10%
- **Careless:** > 14%

---

## Rebounding Metrics

### A% (Assist Percentage)

**Formula:** Assists / Field Goals Made × 100

Percentage of made field goals that were assisted. Measures ball movement.

- **Good ball movement:** > 60%
- **Isolation-heavy:** < 50%

---

### Blk% (Block Percentage)

**Formula:** Blocks / Opponent 2PA × 100

Percentage of opponent two-point attempts blocked.

- **Elite shot-blocking:** > 12%
- **Average:** 8-10%
- **Poor:** < 6%

---

## Height & Experience Metrics

### AvgHgt (Average Height)

Team's average height across all players in inches.

- **Tall:** > 77" (6'5")
- **Average:** 75-77" (6'3"-6'5")
- **Short:** < 75" (6'3")

---

### EffHgt (Effective Height)

Minutes-weighted average height. More representative of actual lineup height since it weights starters more heavily.

---

### C-Hgt, PF-Hgt, SF-Hgt, SG-Hgt, PG-Hgt

Height by position (Center, Power Forward, Small Forward, Shooting Guard, Point Guard).

---

### Experience

Average years of college experience (0-4 scale).

- **Very Experienced:** > 2.5
- **Experienced:** 2.0-2.5
- **Average:** 1.5-2.0
- **Young:** < 1.5

---

### Bench

Percentage of minutes played by non-starters.

- **Deep bench:** > 35%
- **Average depth:** 28-32%
- **Shallow bench:** < 25%

---

### Continuity

Percentage of minutes played by returning players from previous season.

- **High continuity:** > 70%
- **Average:** 50-70%
- **Low continuity:** < 40%

---

## Strength of Schedule Metrics

### SOS-AdjEM

Overall strength of schedule measured by average opponent AdjEM.

- **Elite schedule:** > 10
- **Strong schedule:** 5-10
- **Average:** 0-5
- **Weak schedule:** < 0

---

### SOS-OppO / SOSO

Average opponent adjusted offensive efficiency faced.

---

### SOS-OppD / SOSD

Average opponent adjusted defensive efficiency faced.

---

### NCSOS-AdjEM / NCSOS

Non-conference strength of schedule. Important for committee evaluation.

---

## Luck Metrics

### Luck

Deviation from expected win-loss record based on game-by-game efficiency.

- **Positive:** Team overperforming in close games
- **Negative:** Team underperforming in close games
- **Range:** Typically -0.10 to +0.10

A team with +0.05 luck has won about 2-3 more close games than expected.

---

## Home Court Advantage Metrics

### HCA (Home Court Advantage)

Expected point swing for home team, team-specific. Average is about 3.5 points.

| Range | HCA Strength |
|-------|--------------|
| > 4.5 | Strong HCA |
| 3.5-4.5 | Average HCA |
| < 3.0 | Weak HCA |

---

### Elev (Elevation)

Arena elevation in feet above sea level. High altitude venues (> 5,000 ft) can provide additional home advantage due to visitor fatigue.

Notable high-elevation arenas:
- Colorado (5,430 ft)
- Air Force (7,258 ft)
- BYU (4,551 ft)

---

### PF (Personal Fouls Factor)

Component of HCA related to foul differential at home vs away.

---

### Pts (Points Factor)

Component of HCA related to points scored/allowed at home vs away.

---

## Player Statistics

### ORtg (Offensive Rating)

Points produced per 100 possessions used by the player.

- **Elite:** > 125
- **Good:** 115-125
- **Average:** 105-115
- **Poor:** < 100

---

### Poss% (Possessions Used)

Percentage of team possessions used by player while on court.

- **Primary option:** > 28%
- **Secondary option:** 22-28%
- **Role player:** < 20%

---

### ARate (Assist Rate)

Percentage of teammate field goals assisted by player while on court.

- **Elite passer:** > 30%
- **Good passer:** 20-30%
- **Non-playmaker:** < 15%

---

### FC40 (Fouls Committed per 40 min)

Personal fouls committed per 40 minutes played.

- **Foul prone:** > 4.5
- **Average:** 3.0-4.0
- **Disciplined:** < 2.5

---

### FD40 (Fouls Drawn per 40 min)

Personal fouls drawn per 40 minutes played.

- **Elite at drawing fouls:** > 6.0
- **Average:** 3.5-5.0
- **Rarely draws fouls:** < 2.5

---

## FanMatch Game Metrics

### ThrillScore

Pre-game prediction of how entertaining the game will be (0-100).

| Score | Entertainment Value |
|-------|-------------------|
| > 85 | Must-watch |
| 70-85 | Good game |
| 50-70 | Average |
| < 50 | Skip it |

---

### Excitement

Post-game measure of how exciting the game actually was. Based on lead changes, close scoring, and drama.

---

### Tension

How close/tense the game was throughout. High tension = competitive throughout.

---

### Comeback

Magnitude of any comeback that occurred. High value indicates a significant deficit was overcome.

---

### Dominance

How one-sided the game was. High = blowout.

---

### MVP

The player who had the biggest impact on the game outcome.

---

### WinProbability

Pre-game probability of the favored team winning based on efficiency metrics.

---

### PredictedMOV / ActualMOV

Predicted and actual margin of victory.

---

## Referee Metrics

### Ref Rating

Overall referee quality rating based on game management.

---

### Game Score

Average entertainment value of games officiated by this referee.

---

## Scouting Report Metrics

### ShotDist / DShotDist

Average shot distance in feet. Higher = more perimeter-oriented. Lower = more paint touches.

- **Perimeter-heavy:** > 14 ft
- **Balanced:** 11-14 ft
- **Paint-oriented:** < 11 ft

---

### PD1, PD2, PD3 (Point Distribution)

Percentage of points from free throws (PD1), two-pointers (PD2), and three-pointers (PD3).

**Example balanced distribution:** PD1=20%, PD2=50%, PD3=30%

---

## Interpreting Rankings

All rank columns are out of ~360+ D1 teams:

| Rank Range | Percentile | Quality |
|------------|------------|---------|
| 1-36 | Top 10% | Elite |
| 37-72 | Top 20% | Very Good |
| 73-108 | Top 30% | Good |
| 109-180 | 30-50% | Average |
| 181-252 | 50-70% | Below Average |
| 253-324 | 70-90% | Poor |
| 325-363 | Bottom 10% | Very Poor |

---

## Key Metric Combinations

### Power Rating

AdjEM is the primary power rating - single best predictor of team quality.

### Predicted Score

**Formula:** (AdjO_A - AdjD_B + AdjD_A - AdjO_B) / 2 + HCA

Where A is home team and B is away team.

### Efficiency Margin Prediction

To predict point differential:
1. Calculate each team's expected efficiency vs the other's defense
2. Multiply by expected possessions
3. Add home court advantage

### Luck-Adjusted Record

Actual record minus luck factor shows "true" record. Useful for identifying overperforming/underperforming teams.

---

## Data Quality Notes

1. **Early season:** Ratings are less stable with fewer games played (< 10 games)
2. **Preseason:** Archive ratings available for preseason projections
3. **Historical:** Data back to 1999 but some metrics start later
4. **Conference play:** Some stats available for conference-only games via `conference_only` parameter
5. **Neutral site:** Games classified as Home/Away/Neutral for adjustments
6. **Values as strings:** `get_pomeroy_ratings` returns values as strings; convert to numeric as needed

---

## Metric Aliases

Some metrics have different names depending on the endpoint:

| Concept | get_pomeroy_ratings | get_fourfactors | get_efficiency | Scouting Report |
|---------|--------------------|-----------------|--------------------|-----------------|
| Offensive Efficiency | AdjO | AdjOE | Off. Efficiency-Adj | OE |
| Defensive Efficiency | AdjD | AdjDE | Def. Efficiency-Adj | DE |
| Tempo | AdjT | AdjTempo | Tempo-Adj | Tempo |
| Experience | - | - | - | Experience |
| Possession Length | - | - | Avg. Poss Length | APLO/APLD |
