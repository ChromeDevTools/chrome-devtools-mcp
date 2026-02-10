"""Demonstration script for new market inefficiency features.

This script shows the expanded feature set for ML models, including:
- Sharp vs public divergence (Pinnacle vs FanDuel/DraftKings)
- Steam move detection and line movement velocity
- Market consensus and variance
- Key number positioning

Usage:
    uv run python scripts/demo_market_features.py
"""

import logging
from pathlib import Path

from sports_betting_edge.services.feature_engineering import FeatureEngineer

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    """Demonstrate new market inefficiency features."""
    # Paths
    kenpom_path = Path("data/kenpom")
    espn_path = Path("data/espn")
    odds_db_path = Path("data/odds_api/odds_api.sqlite3")

    # Check if data exists
    if not odds_db_path.exists():
        logger.warning(f"Database not found: {odds_db_path}")
        logger.info("Run collect_hybrid.py first to gather data")
        return

    logger.info("[OK] Initializing FeatureEngineer with market features enabled...")

    # Initialize
    engineer = FeatureEngineer(
        kenpom_path=kenpom_path, espn_path=espn_path, odds_db_path=odds_db_path
    )

    # Build dataset with all features
    logger.info("\n[OK] Building spreads dataset (2025-12-01 to 2025-12-15)...")
    logger.info("Features enabled: KenPom + bookmaker divergence + market inefficiency")

    try:
        X, y = engineer.build_spreads_dataset(
            start_date="2025-12-01",
            end_date="2025-12-15",
            include_market_features=True,
            include_bookmaker_features=True,
        )

        logger.info(f"\n[OK] Dataset shape: {X.shape[0]} games x {X.shape[1]} features")

        # Show feature categories
        logger.info("\nFeature categories:")

        kenpom_features = [c for c in X.columns if "adj_" in c or "efg" in c or "sos" in c]
        logger.info(f"  - KenPom features: {len(kenpom_features)}")

        bookmaker_features = [
            c for c in X.columns if any(book in c for book in ["pinnacle", "fanduel", "draftkings"])
        ]
        logger.info(f"  - Bookmaker-specific: {len(bookmaker_features)}")

        market_features = [
            c
            for c in X.columns
            if any(
                keyword in c
                for keyword in ["steam", "velocity", "consensus", "variance", "key_number"]
            )
        ]
        logger.info(f"  - Market signals: {len(market_features)}")

        # Show sample of new features
        logger.info("\nNew feature columns (sample):")
        new_feature_cols = [
            "pinnacle_closing_spread",
            "fanduel_closing_spread",
            "sharp_public_split",
            "total_steam_moves",
            "movement_velocity",
            "spread_variance",
            "near_key_number",
        ]
        for col in new_feature_cols:
            if col in X.columns:
                non_null = X[col].notna().sum()
                logger.info(f"  - {col:30s} ({non_null}/{len(X)} non-null)")

        # Check target distribution
        logger.info("\nTarget variable (favorite_covered):")
        logger.info(f"  - Favorites covered: {y.sum()} games")
        logger.info(f"  - Favorites failed: {len(y) - y.sum()} games")
        logger.info(f"  - Win rate: {y.mean():.1%}")

        # Summary
        logger.info("\n" + "=" * 60)
        logger.info(f"[OK] Successfully built dataset with {X.shape[1]} features!")
        logger.info(f"    Feature count increased from ~30 to {X.shape[1]} features")
        logger.info("    Dataset ready for XGBoost training")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"[ERROR] Failed to build dataset: {e}")
        raise

    finally:
        engineer.close()


if __name__ == "__main__":
    main()
