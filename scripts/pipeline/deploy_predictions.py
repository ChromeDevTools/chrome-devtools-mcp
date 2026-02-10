"""Deploy predictions: generate summary markdown and copy to latest.csv.

Actions:
- Read the predictions CSV (calibrated if available, else raw)
- Generate predictions/{date}_summary.md with game count, top edges, model info
- Copy final CSV to predictions/latest.csv for stable reference
- Log deployment status

Exit code 0 = success, 1 = failure.
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
from datetime import date
from pathlib import Path

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def _parse_prob(value: object) -> float:
    """Convert probability value to float, handling '74%' style strings."""
    s = str(value)
    if s.endswith("%"):
        return float(s.rstrip("%")) / 100.0
    return float(s)


def _normalize_prob_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Convert percentage-string probability columns to float [0, 1]."""
    prob_cols = [
        "favorite_cover_prob",
        "underdog_cover_prob",
        "over_prob",
        "under_prob",
    ]
    df = df.copy()
    for col in prob_cols:
        if col in df.columns and not pd.api.types.is_numeric_dtype(df[col]):
            df[col] = df[col].apply(_parse_prob)
    return df


def generate_summary(df: pd.DataFrame, target_date: str) -> str:
    """Generate a markdown summary of the day's predictions."""
    df = _normalize_prob_columns(df)
    lines: list[str] = []
    lines.append(f"# Predictions Summary - {target_date}")
    lines.append("")
    lines.append(f"**Games**: {len(df)}")
    lines.append(f"**Generated**: {target_date}")
    lines.append("")

    # Spread edges - biggest underdog cover probabilities
    if "underdog_cover_prob" in df.columns:
        lines.append("## Top Spread Edges (Underdog Cover)")
        top_spreads = df.nlargest(5, "underdog_cover_prob")
        for _, row in top_spreads.iterrows():
            prob = row["underdog_cover_prob"]
            home = row.get("home_team", "?")
            away = row.get("away_team", "?")
            fav = row.get("favorite_team", "?")
            mag = row.get("spread_magnitude", 0)
            lines.append(f"- {away} @ {home} | Fav: {fav} -{mag} | Underdog cover: {prob:.1%}")
        lines.append("")

    # Totals edges - biggest over/under probabilities
    if "over_prob" in df.columns:
        lines.append("## Top Over Edges")
        top_over = df.nlargest(3, "over_prob")
        for _, row in top_over.iterrows():
            prob = row["over_prob"]
            home = row.get("home_team", "?")
            away = row.get("away_team", "?")
            total = row.get("predicted_total", row.get("total_points", 0))
            lines.append(
                f"- {away} @ {home} | Predicted total: {total:.1f} | Over prob: {prob:.1%}"
            )
        lines.append("")

        lines.append("## Top Under Edges")
        top_under = df.nlargest(3, "under_prob")
        for _, row in top_under.iterrows():
            prob = row["under_prob"]
            home = row.get("home_team", "?")
            away = row.get("away_team", "?")
            total = row.get("predicted_total", row.get("total_points", 0))
            lines.append(
                f"- {away} @ {home} | Predicted total: {total:.1f} | Under prob: {prob:.1%}"
            )
        lines.append("")

    # Model info
    lines.append("## Model Info")
    if "totals_method" in df.columns:
        methods = df["totals_method"].value_counts()
        for method, count in methods.items():
            lines.append(f"- Totals method `{method}`: {count} games")
    if "total_disconnect" in df.columns:
        high_disconnect = df[df["total_disconnect"].abs() > 10]
        if not high_disconnect.empty:
            lines.append(f"- **{len(high_disconnect)} game(s) with total disconnect > 10 pts**")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy predictions: summary and latest copy")
    parser.add_argument(
        "--date",
        default=date.today().isoformat(),
        help="Date in YYYY-MM-DD format (default: today)",
    )
    parser.add_argument(
        "--predictions-dir",
        default="predictions",
        help="Predictions directory (default: predictions/)",
    )
    args = parser.parse_args()

    predictions_dir = Path(args.predictions_dir)

    # Find the best available CSV
    calibrated = predictions_dir / f"{args.date}_calibrated.csv"
    raw = predictions_dir / f"{args.date}.csv"

    if calibrated.exists():
        csv_path = calibrated
        logger.info("Using calibrated predictions: %s", csv_path)
    elif raw.exists():
        csv_path = raw
        logger.info("Using raw predictions: %s", csv_path)
    else:
        logger.error(
            "No predictions found for %s in %s",
            args.date,
            predictions_dir,
        )
        sys.exit(1)

    df = pd.read_csv(csv_path)
    if df.empty:
        logger.error("Predictions file is empty")
        sys.exit(1)

    # Generate summary markdown
    summary = generate_summary(df, args.date)
    summary_path = predictions_dir / f"{args.date}_summary.md"
    summary_path.write_text(summary, encoding="utf-8")
    logger.info("Summary written to %s", summary_path)

    # Copy to latest.csv
    latest_path = predictions_dir / "latest.csv"
    shutil.copy2(csv_path, latest_path)
    logger.info("Copied %s -> %s", csv_path.name, latest_path)

    logger.info(
        "Deployment complete: %d games, source=%s",
        len(df),
        csv_path.name,
    )


if __name__ == "__main__":
    main()
