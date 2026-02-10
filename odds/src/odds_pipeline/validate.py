from __future__ import annotations

from odds_pipeline.util import american_to_implied_prob


def validate_normalization_math() -> None:
    # Moneyline conversion sanity.
    p1 = american_to_implied_prob(-110)
    p2 = american_to_implied_prob(110)
    if not (0.0 < p1 < 1.0 and 0.0 < p2 < 1.0):
        raise AssertionError("Implied probability out of range")

    # Spread normalization rules are enforced by schema + normalize SQL:
    # - spread_magnitude is ABS(point)
    # - favorite row requires point < 0, underdog row requires point > 0


def main() -> None:
    validate_normalization_math()


if __name__ == "__main__":
    main()

