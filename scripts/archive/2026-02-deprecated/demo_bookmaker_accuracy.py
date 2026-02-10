"""Demonstration script for bookmaker accuracy analysis.

This script shows the bookmaker accuracy backtesting system, including:
- Spread accuracy metrics (MAE, RMSE, directional accuracy)
- Totals accuracy metrics
- Systematic bias detection
- Bookmaker rankings

Usage:
    uv run python scripts/demo_bookmaker_accuracy.py
"""

import logging
from datetime import date
from pathlib import Path

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.services.bookmaker_accuracy import BookmakerAccuracyAnalyzer

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    """Demonstrate bookmaker accuracy analysis capabilities."""
    # Paths
    odds_db_path = Path("data/odds_api/odds_api.sqlite3")

    # Check if data exists
    if not odds_db_path.exists():
        logger.warning(f"Database not found: {odds_db_path}")
        logger.info("Run collect_hybrid.py first to gather data")
        return

    logger.info("=" * 70)
    logger.info("BOOKMAKER ACCURACY BACKTESTING DEMO")
    logger.info("=" * 70)
    logger.info("")

    # Initialize
    db = OddsAPIDatabase(odds_db_path)
    analyzer = BookmakerAccuracyAnalyzer(db)

    # Get database stats
    logger.info("[OK] Database Coverage Statistics:")
    stats = db.get_database_stats()
    logger.info(f"  - Total events: {stats['total_events']}")
    logger.info(f"  - Events with scores: {stats['events_with_scores']}")
    logger.info(f"  - Coverage: {stats['events_with_scores'] / max(stats['total_events'], 1):.1%}")
    logger.info(f"  - Date range: {stats['date_range'][0]} to {stats['date_range'][1]}")
    logger.info("")

    if stats["events_with_scores"] < 10:
        logger.warning("[WARNING] Insufficient data for meaningful analysis")
        logger.info("Need at least 10 completed games with scores")
        return

    # Show top bookmakers by coverage
    logger.info("[OK] Top Bookmakers by Coverage:")
    for i, book in enumerate(stats["bookmaker_coverage"][:5], 1):
        logger.info(
            f"  {i}. {book['book_key']:20s} "
            f"{book['games_covered']:>4} games ({book['coverage_pct']:.1f}%)"
        )
    logger.info("")

    # Analyze spread accuracy for top bookmaker
    if stats["bookmaker_coverage"]:
        top_book = stats["bookmaker_coverage"][0]
        book_key = top_book["book_key"]
        games_covered = top_book["games_covered"]

        if games_covered >= 30:
            logger.info(f"[OK] Analyzing Spread Accuracy: {book_key}")
            logger.info("-" * 70)

            try:
                # Parse date range
                start_date = date.fromisoformat(stats["date_range"][0])
                end_date = date.fromisoformat(stats["date_range"][1])

                metrics = analyzer.calculate_spread_accuracy(
                    book_key=book_key,
                    start_date=start_date,
                    end_date=end_date,
                    min_games=10,
                )

                logger.info(f"Sample size: {metrics['sample_size']} games")
                logger.info(f"Mean Absolute Error (MAE): {metrics['mae']:.2f} points")
                logger.info(f"Root Mean Squared Error (RMSE): {metrics['rmse']:.2f} points")
                logger.info(f"Favorite cover rate: {metrics['favorite_cover_pct']:.1%}")

                # Interpretation
                logger.info("")
                if metrics["mae"] < 8.0:
                    logger.info("[OK] ACCURACY: Excellent (MAE < 8 points)")
                elif metrics["mae"] < 10.0:
                    logger.info("[OK] ACCURACY: Good (MAE < 10 points)")
                else:
                    logger.info("[WARNING] ACCURACY: Below average (MAE > 10 points)")

                logger.info("")

                # Detect biases
                logger.info(f"[OK] Checking for Systematic Biases: {book_key}")
                logger.info("-" * 70)

                biases = analyzer.detect_systematic_biases(
                    book_key=book_key,
                    market_type="spreads",
                    start_date=start_date,
                    end_date=end_date,
                )

                if biases["overestimates_favorites"]:
                    logger.info("[WARNING] BIAS DETECTED: Overestimates favorites")
                    logger.info(
                        f"  -> Favorites cover only {biases.get('favorite_cover_pct', 0):.1%} "
                        "(expected: ~50%)"
                    )
                    logger.info("  -> EDGE OPPORTUNITY: Bet underdogs at this book")
                elif biases["overestimates_underdogs"]:
                    logger.info("[WARNING] BIAS DETECTED: Overestimates underdogs")
                    logger.info(
                        f"  -> Favorites cover {biases.get('favorite_cover_pct', 0):.1%} "
                        "(expected: ~50%)"
                    )
                    logger.info("  -> EDGE OPPORTUNITY: Bet favorites at this book")
                else:
                    logger.info("[OK] No significant bias detected (within 48-52%)")

                logger.info("")

            except Exception as e:
                logger.error(f"[ERROR] Analysis failed: {e}")

        # Try totals analysis
        if games_covered >= 30:
            logger.info(f"[OK] Analyzing Totals Accuracy: {book_key}")
            logger.info("-" * 70)

            try:
                metrics = analyzer.calculate_totals_accuracy(
                    book_key=book_key,
                    start_date=start_date,
                    end_date=end_date,
                    min_games=10,
                )

                logger.info(f"Sample size: {metrics['sample_size']} games")
                logger.info(f"Mean Absolute Error (MAE): {metrics['mae']:.2f} points")
                logger.info(f"Root Mean Squared Error (RMSE): {metrics['rmse']:.2f} points")
                logger.info(f"Over percentage: {metrics['over_pct']:.1%}")
                logger.info("")

                # Check for bias
                if abs(metrics["over_pct"] - 0.5) > 0.02:  # >2% deviation
                    if metrics["over_pct"] < 0.48:
                        logger.info("[WARNING] BIAS: Games go under more than expected")
                        logger.info("  -> EDGE OPPORTUNITY: Bet unders at this book")
                    elif metrics["over_pct"] > 0.52:
                        logger.info("[WARNING] BIAS: Games go over more than expected")
                        logger.info("  -> EDGE OPPORTUNITY: Bet overs at this book")
                else:
                    logger.info("[OK] No significant bias in totals")

                logger.info("")

            except Exception as e:
                logger.debug(f"Totals analysis skipped: {e}")

    # Try ranking bookmakers if we have multiple
    if len(stats["bookmaker_coverage"]) >= 2:
        logger.info("[OK] Ranking All Bookmakers (Spreads)")
        logger.info("-" * 70)

        try:
            rankings = analyzer.rank_bookmakers(
                market_type="spreads",
                metric="mae",
                min_games=10,
            )

            if len(rankings) > 0:
                logger.info(
                    f"{'Rank':<6}{'Bookmaker':<20}{'MAE':<10}{'RMSE':<10}"
                    f"{'Fav Cover %':<15}{'Games':<8}"
                )
                logger.info("-" * 70)

                for _, row in rankings.head(10).iterrows():
                    logger.info(
                        f"{int(row['rank']):<6}{row['book_key']:<20}"
                        f"{row['mae']:<10.2f}{row['rmse']:<10.2f}"
                        f"{row['favorite_cover_pct']:<15.1%}{int(row['sample_size']):<8}"
                    )

                logger.info("")
                logger.info(f"[OK] Most accurate: {rankings.iloc[0]['book_key']}")
                logger.info(f"[OK] Least accurate: {rankings.iloc[-1]['book_key']}")

        except Exception as e:
            logger.debug(f"Ranking failed: {e}")

    # Summary
    logger.info("")
    logger.info("=" * 70)
    logger.info("[OK] Bookmaker accuracy analysis complete!")
    logger.info("")
    logger.info("KEY INSIGHTS:")
    logger.info("  1. MAE (Mean Absolute Error): Measures average prediction error")
    logger.info("     - Lower is better (sharp books typically have MAE < 8 points)")
    logger.info("")
    logger.info("  2. Directional Accuracy: Should be close to 50% (efficient market)")
    logger.info("     - Deviations >2% indicate potential exploitable bias")
    logger.info("")
    logger.info("  3. EDGE IDENTIFICATION:")
    logger.info("     - If book overestimates favorites -> bet underdogs")
    logger.info("     - If book overestimates underdogs -> bet favorites")
    logger.info("     - If book overestimates overs -> bet unders")
    logger.info("     - If book overestimates unders -> bet overs")
    logger.info("=" * 70)

    db.close()


if __name__ == "__main__":
    main()
