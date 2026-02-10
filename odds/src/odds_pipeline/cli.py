from __future__ import annotations

import argparse
import json

from odds_pipeline.collect_odds import collect_odds
from odds_pipeline.collect_scores import collect_scores
from odds_pipeline.backfill import backfill
from odds_pipeline.collect_espn import collect_espn_last_days
from odds_pipeline.collect_action_network import collect_action_network_odds_page
from odds_pipeline.collect_kenpom import collect_kenpom_team_metrics
from odds_pipeline.freshness import check_freshness
from odds_pipeline.normalize import normalize_window
from odds_pipeline.predict import predict
from odds_pipeline.schema import init_schema
from odds_pipeline.train import train
from odds_pipeline.validate import main as validate_main


def _cmd_init_schema(_: argparse.Namespace) -> int:
    init_schema()
    return 0


def _cmd_collect_odds(args: argparse.Namespace) -> int:
    inserted = collect_odds(
        sport=args.sport,
        regions=args.regions,
        markets=args.markets,
        odds_format=args.odds_format,
        date_format=args.date_format,
    )
    print(json.dumps({"inserted": inserted}))
    return 0


def _cmd_collect_scores(args: argparse.Namespace) -> int:
    inserted = collect_scores(sport=args.sport, days_from=args.days_from, date_format=args.date_format)
    print(json.dumps({"inserted": inserted}))
    return 0


def _cmd_normalize(args: argparse.Namespace) -> int:
    counts = normalize_window(window_days=args.window_days)
    print(json.dumps(counts))
    return 0


def _cmd_freshness_guard(args: argparse.Namespace) -> int:
    result = check_freshness(window_days=args.window_days)
    print(json.dumps({"ok": result.ok, "details": result.details}))
    return 0 if result.ok else 2


def _cmd_train(args: argparse.Namespace) -> int:
    result = train(window_days=args.window_days)
    print(json.dumps(result.__dict__))
    return 0


def _cmd_predict(args: argparse.Namespace) -> int:
    artifact = predict(model_version=args.model_version, window_days=args.window_days, limit=args.limit)
    print(json.dumps({"model_version": artifact.model_version, "generated_at": artifact.generated_at, "rows": len(artifact.sample)}))
    return 0


def _cmd_validate(_: argparse.Namespace) -> int:
    validate_main()
    print(json.dumps({"ok": True}))
    return 0


def _cmd_backfill(args: argparse.Namespace) -> int:
    result = backfill(
        sport=args.sport,
        lookback_days=args.lookback_days,
        regions=args.regions,
        markets=args.markets,
    )
    print(json.dumps(result))
    return 0


def _cmd_collect_espn(args: argparse.Namespace) -> int:
    inserted = collect_espn_last_days(lookback_days=args.lookback_days)
    print(json.dumps({"inserted": inserted}))
    return 0


def _cmd_collect_action(args: argparse.Namespace) -> int:
    inserted = collect_action_network_odds_page()
    print(json.dumps({"inserted": inserted}))
    return 0


def _cmd_collect_kenpom(args: argparse.Namespace) -> int:
    inserted = collect_kenpom_team_metrics(season=args.season, metric_type=args.metric_type)
    print(json.dumps({"inserted": inserted}))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="odds-pipeline")
    sub = p.add_subparsers(required=True)

    s = sub.add_parser("init-schema", help="Initialize Postgres schema")
    s.set_defaults(func=_cmd_init_schema)

    s = sub.add_parser("collect-odds", help="Collect odds snapshots")
    s.add_argument("--sport", required=True)
    s.add_argument("--regions", default="us")
    s.add_argument("--markets", default="h2h,spreads,totals")
    s.add_argument("--odds-format", default="american")
    s.add_argument("--date-format", default="iso")
    s.set_defaults(func=_cmd_collect_odds)

    s = sub.add_parser("collect-scores", help="Collect rolling scores")
    s.add_argument("--sport", required=True)
    s.add_argument("--days-from", type=int, default=5)
    s.add_argument("--date-format", default="iso")
    s.set_defaults(func=_cmd_collect_scores)

    s = sub.add_parser("normalize", help="Normalize raw -> canonical for window")
    s.add_argument("--window-days", type=int, default=None)
    s.set_defaults(func=_cmd_normalize)

    s = sub.add_parser("freshness-guard", help="Fail if odds/scores are stale for window")
    s.add_argument("--window-days", type=int, default=None)
    s.set_defaults(func=_cmd_freshness_guard)

    s = sub.add_parser("train", help="Train model artifacts (placeholder baseline)")
    s.add_argument("--window-days", type=int, default=None)
    s.set_defaults(func=_cmd_train)

    s = sub.add_parser("predict", help="Generate prediction artifacts (placeholder baseline)")
    s.add_argument("--model-version", required=True)
    s.add_argument("--window-days", type=int, default=None)
    s.add_argument("--limit", type=int, default=50)
    s.set_defaults(func=_cmd_predict)

    s = sub.add_parser("validate", help="Run fast invariants/normalization checks")
    s.set_defaults(func=_cmd_validate)

    s = sub.add_parser("backfill", help="Bounded rolling-window backfill and re-normalize")
    s.add_argument("--sport", required=True)
    s.add_argument("--lookback-days", type=int, default=5)
    s.add_argument("--regions", default="us")
    s.add_argument("--markets", default="h2h,spreads,totals")
    s.set_defaults(func=_cmd_backfill)

    s = sub.add_parser("collect-espn", help="Collect ESPN schedules/scores for last N days")
    s.add_argument("--lookback-days", type=int, default=5)
    s.set_defaults(func=_cmd_collect_espn)

    s = sub.add_parser("collect-action-network", help="Collect Action Network NCAAB odds page (best-effort)")
    s.set_defaults(func=_cmd_collect_action)

    s = sub.add_parser("collect-kenpom", help="Collect KenPom team metrics via kenpompy")
    s.add_argument("--season", type=int, default=2026)
    s.add_argument("--metric-type", choices=["pomeroy_ratings", "efficiency", "four_factors"], default="pomeroy_ratings")
    s.set_defaults(func=_cmd_collect_kenpom)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

