"""Collect KenPom ratings for the daily data pipeline.

Lightweight script for GitHub Actions workflow that fetches current season
KenPom ratings and four factors data. Designed for daily automated collection.

Usage:
    # Collect current season ratings
    uv run python scripts/collect_kenpom_for_pipeline.py

    # Collect specific season
    uv run python scripts/collect_kenpom_for_pipeline.py --season 2025

Environment:
    KENPOM_API_KEY: Required - Your KenPom API key
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def check_api_key() -> str | None:
    """Check that KENPOM_API_KEY environment variable is set.

    Returns:
        API key or None if not found
    """
    api_key = os.getenv("KENPOM_API_KEY")
    if not api_key:
        logger.warning(
            "KENPOM_API_KEY environment variable not set. KenPom data collection will be skipped."
        )
        logger.warning("To enable: export KENPOM_API_KEY='your_key_here'")
        return None
    return api_key


async def collect_ratings(
    output_dir: Path,
    season: int,
    api_key: str,
) -> dict[str, int]:
    """Collect KenPom ratings for a season.

    Args:
        output_dir: Directory to write ratings parquet file
        season: Season year (e.g., 2026)
        api_key: KenPom API key

    Returns:
        Collection metrics
    """
    from sports_betting_edge.adapters.kenpom import KenPomAdapter

    logger.info("=" * 80)
    logger.info(f"COLLECTING KENPOM RATINGS - SEASON {season}")
    logger.info("=" * 80)

    adapter = KenPomAdapter(api_key=api_key)

    try:
        # Fetch ratings
        logger.info("Fetching team ratings...")
        ratings_data = await adapter.get_ratings(season=season)

        if not ratings_data:
            logger.warning(f"No ratings data returned for season {season}")
            return {"teams": 0}

        # Convert to DataFrame
        ratings_df = pd.DataFrame(ratings_data)
        logger.info(f"  Retrieved {len(ratings_df)} teams")

        # Add fetch metadata
        ratings_df["fetched_at"] = datetime.now().isoformat()

        # Write to parquet
        output_file = output_dir / f"ratings_{season}.parquet"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        ratings_df.to_parquet(output_file, index=False)
        logger.info(f"  Wrote {output_file}")

        # Log sample
        if len(ratings_df) > 0:
            top5 = ratings_df.nsmallest(5, "RankAdjEM")[["TeamName", "AdjEM", "RankAdjEM"]]
            logger.info("\nTop 5 teams by AdjEM:")
            for _, row in top5.iterrows():
                logger.info(
                    f"  {row['RankAdjEM']:3.0f}. {row['TeamName']:30s} ({row['AdjEM']:+.2f})"
                )

        return {"teams": len(ratings_df)}

    finally:
        await adapter.close()


async def collect_four_factors(
    output_dir: Path,
    season: int,
    api_key: str,
) -> dict[str, int]:
    """Collect KenPom four factors for a season.

    Args:
        output_dir: Directory to write four factors parquet file
        season: Season year (e.g., 2026)
        api_key: KenPom API key

    Returns:
        Collection metrics
    """
    from sports_betting_edge.adapters.kenpom import KenPomAdapter

    logger.info("\nCollecting four factors...")

    adapter = KenPomAdapter(api_key=api_key)

    try:
        # Fetch four factors
        ff_data = await adapter.get_four_factors(season=season)

        if not ff_data:
            logger.warning(f"No four factors data returned for season {season}")
            return {"teams": 0}

        # Convert to DataFrame
        ff_df = pd.DataFrame(ff_data)
        logger.info(f"  Retrieved {len(ff_df)} teams")

        # Add fetch metadata
        ff_df["fetched_at"] = datetime.now().isoformat()

        # Write to parquet
        output_file = output_dir / f"four-factors_{season}.parquet"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        ff_df.to_parquet(output_file, index=False)
        logger.info(f"  Wrote {output_file}")

        return {"teams": len(ff_df)}

    finally:
        await adapter.close()


async def collect_hca(
    output_dir: Path,
    season: int,
) -> dict[str, int]:
    """Collect KenPom home court advantage data for a season.

    Args:
        output_dir: Directory to write HCA parquet file
        season: Season year (e.g., 2026)

    Returns:
        Collection metrics
    """
    from sports_betting_edge.adapters.kenpom import KenPomAdapter

    logger.info("\nCollecting home court advantage data...")

    adapter = KenPomAdapter()

    try:
        hca_data = adapter.get_hca()

        if not hca_data:
            logger.warning(f"No HCA data returned for season {season}")
            return {"teams": 0}

        hca_df = pd.DataFrame(hca_data)
        logger.info(f"  Retrieved HCA for {len(hca_df)} teams")

        hca_df["fetched_at"] = datetime.now().isoformat()

        output_file = output_dir / f"hca_{season}.parquet"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        hca_df.to_parquet(output_file, index=False)
        logger.info(f"  Wrote {output_file}")

        return {"teams": len(hca_df)}

    finally:
        await adapter.close()


async def main_async(args: argparse.Namespace) -> None:
    """Run KenPom collection (async main).

    Args:
        args: Command line arguments
    """
    # Check for API key
    api_key = check_api_key()
    if not api_key:
        logger.warning("\n[WARNING] Skipping KenPom collection - no API key found")
        logger.warning(
            "The pipeline will continue, but predictions may be degraded without KenPom data."
        )
        sys.exit(0)  # Exit successfully to not fail the pipeline

    start_time = datetime.now()

    try:
        # Collect ratings
        ratings_dir = args.kenpom_dir / "ratings" / "season"
        ratings_metrics = await collect_ratings(
            output_dir=ratings_dir,
            season=args.season,
            api_key=api_key,
        )

        # Collect four factors
        ff_dir = args.kenpom_dir / "four-factors" / "season"
        ff_metrics = await collect_four_factors(
            output_dir=ff_dir,
            season=args.season,
            api_key=api_key,
        )

        # Collect HCA (uses web scraping, no API key needed)
        hca_dir = args.kenpom_dir / "hca" / "season"
        hca_metrics = await collect_hca(
            output_dir=hca_dir,
            season=args.season,
        )

        # Summary
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info("")
        logger.info("=" * 80)
        logger.info("KENPOM COLLECTION SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Season: {args.season}")
        logger.info(f"Ratings: {ratings_metrics['teams']} teams")
        logger.info(f"Four Factors: {ff_metrics['teams']} teams")
        logger.info(f"HCA: {hca_metrics['teams']} teams")
        logger.info(f"Elapsed: {elapsed:.1f}s")
        logger.info("[OK] KenPom collection complete!")
        logger.info("=" * 80)

    except Exception as e:
        logger.error(f"KenPom collection failed: {e}", exc_info=True)
        logger.warning("\n[WARNING] KenPom collection failed but pipeline will continue")
        logger.warning("Predictions may be degraded without KenPom data.")
        sys.exit(0)  # Exit successfully to not fail the pipeline


def main() -> None:
    """Run KenPom collection (sync wrapper)."""
    parser = argparse.ArgumentParser(
        description="Collect KenPom ratings and four factors for pipeline"
    )
    parser.add_argument(
        "--kenpom-dir",
        type=Path,
        default=Path("data/kenpom"),
        help="Path to KenPom data directory (default: data/kenpom)",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=2026,
        help="Season year to collect (default: 2026)",
    )

    args = parser.parse_args()

    logger.info(f"Starting KenPom collection for season {args.season}...")
    logger.info(f"Output directory: {args.kenpom_dir}")
    logger.info("")

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
