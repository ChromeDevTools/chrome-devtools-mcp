"""Collect Overtime.ag game lines snapshot for the daily pipeline.

One-shot collection of all target sports (College Basketball, College Extra,
NFL) via the Overtime REST API. Designed to run as a parallel Tier 2 job
alongside Odds API, KenPom, and ESPN collection.

Requires OV_CUSTOMER_ID and OV_PASSWORD in .env for Playwright auth.

Usage:
    uv run python scripts/collection/collect_overtime_snapshot.py
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def check_credentials() -> bool:
    """Check that Overtime credentials are configured.

    Returns:
        True if credentials are available, False otherwise.
    """
    from sports_betting_edge.config.settings import settings

    if not settings.ov_customer_id or not settings.ov_password:
        logger.warning("OV_CUSTOMER_ID / OV_PASSWORD not set. Overtime collection will be skipped.")
        return False
    return True


async def main_async() -> None:
    """Run Overtime.ag snapshot collection."""
    from sports_betting_edge.config.settings import settings
    from sports_betting_edge.services.overtime_api_collection import (
        _parse_target_sports,
        collect_all_target_sports,
    )

    targets = _parse_target_sports(settings.overtime_target_sports)
    target_labels = [f"{s}/{t}" for s, t in targets]
    logger.info("Targets: %s", ", ".join(target_labels))

    start = time.monotonic()
    results = await collect_all_target_sports(targets=targets)
    elapsed = time.monotonic() - start

    # Log per-sport results
    for key, count in results.items():
        logger.info("  %s: %d lines", key, count)

    total = sum(results.values())
    logger.info(
        "[OK] Overtime snapshot complete! %d total lines in %.1fs",
        total,
        elapsed,
    )


def main() -> None:
    """Run Overtime snapshot collection (sync wrapper)."""
    logger.info("Starting Overtime.ag snapshot collection...")

    if not check_credentials():
        logger.warning("[WARNING] Skipping Overtime collection - no credentials")
        sys.exit(0)

    try:
        asyncio.run(main_async())
    except Exception as e:
        logger.error("Overtime collection failed: %s", e, exc_info=True)
        logger.warning("[WARNING] Overtime collection failed but pipeline will continue")
        sys.exit(0)  # Don't fail the pipeline


if __name__ == "__main__":
    main()
