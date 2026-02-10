"""Analyze bookmaker accuracy and generate reports.

This script calculates accuracy metrics for all bookmakers and generates
comparison reports to identify which books are most/least accurate.

Usage:
    # Analyze spread accuracy for all bookmakers
    uv run python scripts/analyze_bookmaker_accuracy.py analyze-spreads \
        --start-date 2025-11-01 --end-date 2026-02-01

    # Analyze totals accuracy
    uv run python scripts/analyze_bookmaker_accuracy.py analyze-totals

    # Find systematic biases for a specific bookmaker
    uv run python scripts/analyze_bookmaker_accuracy.py find-biases \
        --book-key fanduel --market spreads

    # Identify best bookmaker by spread range
    uv run python scripts/analyze_bookmaker_accuracy.py best-by-range \
        --market spreads
"""

import logging
from datetime import date
from pathlib import Path

import typer

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.services.bookmaker_accuracy import BookmakerAccuracyAnalyzer

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

app = typer.Typer(help="Bookmaker accuracy analysis tools")


DEFAULT_DB_PATH = "data/odds_api/odds_api.sqlite3"
DEFAULT_SAVE_DIR = "data/analysis"


@app.command()
def analyze_spreads(
    start_date: str = "2025-11-01",
    end_date: str = "2026-02-01",
    save_dir: str = DEFAULT_SAVE_DIR,
    min_games: int = 50,
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    """Analyze spread accuracy for all bookmakers.

    Calculates MAE, RMSE, and directional accuracy metrics.
    """
    logger.info("[OK] Analyzing spread accuracy...")
    logger.info(f"Date range: {start_date} to {end_date}")
    logger.info(f"Minimum games: {min_games}\n")

    db = OddsAPIDatabase(db_path)
    analyzer = BookmakerAccuracyAnalyzer(db)

    # Get rankings
    rankings = analyzer.rank_bookmakers(
        market_type="spreads",
        metric="mae",
        start_date=date.fromisoformat(start_date),
        end_date=date.fromisoformat(end_date),
        min_games=min_games,
    )

    if len(rankings) == 0:
        logger.warning("[WARNING] No bookmakers found with sufficient data")
        return

    # Display results
    logger.info("=" * 80)
    logger.info("SPREAD ACCURACY RANKINGS (by Mean Absolute Error)")
    logger.info("=" * 80)
    logger.info(
        f"{'Rank':<6}{'Bookmaker':<20}{'MAE':<10}{'RMSE':<10}{'Dir. Acc.':<12}{'Games':<10}"
    )
    logger.info("-" * 80)

    for _, row in rankings.iterrows():
        logger.info(
            f"{int(row['rank']):<6}{row['book_key']:<20}"
            f"{row['mae']:<10.2f}{row['rmse']:<10.2f}"
            f"{row['directional_accuracy']:<12.1%}{int(row['sample_size']):<10}"
        )

    logger.info("=" * 80)
    logger.info(f"\nBest overall (MAE): {rankings.iloc[0]['book_key']}")
    logger.info(f"Worst overall (MAE): {rankings.iloc[-1]['book_key']}")

    # Save results
    save_path = Path(save_dir) / "bookmaker_accuracy_spreads.csv"
    save_path.parent.mkdir(parents=True, exist_ok=True)
    rankings.to_csv(save_path, index=False)

    logger.info(f"\n[OK] Results saved to: {save_path}")


@app.command()
def analyze_totals(
    start_date: str = "2025-11-01",
    end_date: str = "2026-02-01",
    save_dir: str = DEFAULT_SAVE_DIR,
    min_games: int = 50,
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    """Analyze totals accuracy for all bookmakers.

    Calculates MAE, RMSE, and over/under percentages.
    """
    logger.info("[OK] Analyzing totals accuracy...")
    logger.info(f"Date range: {start_date} to {end_date}")
    logger.info(f"Minimum games: {min_games}\n")

    db = OddsAPIDatabase(db_path)
    analyzer = BookmakerAccuracyAnalyzer(db)

    rankings = analyzer.rank_bookmakers(
        market_type="totals",
        metric="mae",
        start_date=date.fromisoformat(start_date),
        end_date=date.fromisoformat(end_date),
        min_games=min_games,
    )

    if len(rankings) == 0:
        logger.warning("[WARNING] No bookmakers found with sufficient data")
        return

    # Display results
    logger.info("=" * 80)
    logger.info("TOTALS ACCURACY RANKINGS (by Mean Absolute Error)")
    logger.info("=" * 80)
    logger.info(f"{'Rank':<6}{'Bookmaker':<20}{'MAE':<10}{'RMSE':<10}{'Over %':<12}{'Games':<10}")
    logger.info("-" * 80)

    for _, row in rankings.iterrows():
        logger.info(
            f"{int(row['rank']):<6}{row['book_key']:<20}"
            f"{row['mae']:<10.2f}{row['rmse']:<10.2f}"
            f"{row['over_pct']:<12.1%}{int(row['sample_size']):<10}"
        )

    logger.info("=" * 80)
    logger.info(f"\nBest overall (MAE): {rankings.iloc[0]['book_key']}")
    logger.info(f"Worst overall (MAE): {rankings.iloc[-1]['book_key']}")

    # Save results
    save_path = Path(save_dir) / "bookmaker_accuracy_totals.csv"
    save_path.parent.mkdir(parents=True, exist_ok=True)
    rankings.to_csv(save_path, index=False)

    logger.info(f"\n[OK] Results saved to: {save_path}")


@app.command()
def find_biases(
    book_key: str = "fanduel",
    market: str = "spreads",
    start_date: str | None = None,
    end_date: str | None = None,
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    """Detect systematic biases for a specific bookmaker.

    Args:
        book_key: Bookmaker to analyze (e.g., fanduel, pinnacle)
        market: Market type (spreads or totals)
        start_date: Optional start date (YYYY-MM-DD)
        end_date: Optional end date (YYYY-MM-DD)
    """
    logger.info(f"[OK] Analyzing systematic biases: {book_key} ({market})\n")

    db = OddsAPIDatabase(db_path)
    analyzer = BookmakerAccuracyAnalyzer(db)

    start = date.fromisoformat(start_date) if start_date else None
    end = date.fromisoformat(end_date) if end_date else None

    biases = analyzer.detect_systematic_biases(
        book_key=book_key, market_type=market, start_date=start, end_date=end
    )

    logger.info("=" * 60)
    logger.info(f"SYSTEMATIC BIAS ANALYSIS: {book_key}")
    logger.info("=" * 60)
    logger.info(f"Market: {market}")
    logger.info(f"Sample size: {biases['sample_size']} games\n")

    if market == "spreads":
        logger.info(f"Favorite cover rate: {biases.get('favorite_cover_pct', 0):.1%}")
        logger.info("Expected (efficient market): 50.0%\n")

        if biases["overestimates_favorites"]:
            logger.info("[WARNING] BIAS DETECTED: Overestimates favorites")
            logger.info("-> Recommendation: Bet underdogs at this book")
        elif biases["overestimates_underdogs"]:
            logger.info("[WARNING] BIAS DETECTED: Overestimates underdogs")
            logger.info("-> Recommendation: Bet favorites at this book")
        else:
            logger.info("[OK] No significant bias detected (within 48-52%)")

    elif market == "totals":
        logger.info(f"Over rate: {biases.get('over_pct', 0):.1%}")
        logger.info("Expected (efficient market): 50.0%\n")

        if biases["overestimates_overs"]:
            logger.info("[WARNING] BIAS DETECTED: Overestimates overs")
            logger.info("-> Recommendation: Bet unders at this book")
        elif biases["overestimates_unders"]:
            logger.info("[WARNING] BIAS DETECTED: Overestimates unders")
            logger.info("-> Recommendation: Bet overs at this book")
        else:
            logger.info("[OK] No significant bias detected (within 48-52%)")

    logger.info("=" * 60)


@app.command()
def best_by_range(
    market: str = "spreads",
    start_date: str | None = None,
    end_date: str | None = None,
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    """Identify which bookmaker is most accurate for each range.

    For spreads: 0-3, 3.5-7, 7.5-20
    For totals: 0-135, 135-150, 150-200
    """
    logger.info(f"[OK] Finding best bookmakers by {market} range...\n")

    db = OddsAPIDatabase(db_path)
    analyzer = BookmakerAccuracyAnalyzer(db)

    start = date.fromisoformat(start_date) if start_date else None
    end = date.fromisoformat(end_date) if end_date else None

    best_by_range_result = analyzer.identify_best_by_range(
        market_type=market, start_date=start, end_date=end
    )

    if not best_by_range_result:
        logger.warning("[WARNING] Insufficient data for range analysis")
        return

    logger.info("=" * 60)
    logger.info(f"BEST BOOKMAKER BY {market.upper()} RANGE")
    logger.info("=" * 60)

    for range_key, book_key in best_by_range_result.items():
        logger.info(f"{range_key:20s} -> {book_key}")

    logger.info("=" * 60)


@app.command()
def database_stats(db_path: str = DEFAULT_DB_PATH) -> None:
    """Show database coverage statistics."""
    logger.info("[OK] Database coverage statistics\n")

    db = OddsAPIDatabase(db_path)
    stats = db.get_database_stats()

    logger.info("=" * 60)
    logger.info("DATABASE STATISTICS")
    logger.info("=" * 60)
    logger.info(f"Total events: {stats['total_events']}")
    logger.info(f"Events with scores: {stats['events_with_scores']}")
    logger.info(f"Coverage: {stats['events_with_scores'] / max(stats['total_events'], 1):.1%}\n")

    logger.info(f"Date range: {stats['date_range'][0]} to {stats['date_range'][1]}\n")

    logger.info("Bookmaker coverage (spreads):")
    logger.info(f"{'Bookmaker':<20}{'Games':<10}{'Coverage %':<12}")
    logger.info("-" * 60)

    for book in stats["bookmaker_coverage"][:10]:  # Show top 10
        logger.info(
            f"{book['book_key']:<20}{book['games_covered']:<10}{book['coverage_pct']:<12.1f}%"
        )

    logger.info("=" * 60)


if __name__ == "__main__":
    app()
