#!/usr/bin/env python3
"""Calculate ER-PSScripter release versions from stable Git tags."""

import argparse
import re
import subprocess
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path

VERSION_FILE = Path("VERSION")
STABLE_TAG_PATTERN = re.compile(r"^v?(?P<year>\d{4})\.(?P<month>\d{1,2})\.(?P<patch>\d+)$")
RUN_ID_PATTERN = re.compile(r"^\d+$")


def parse_stable_tag(tag: str) -> tuple[int, int, int] | None:
    """Return a stable CalVer tuple for either legacy or prefixed tags."""
    match = STABLE_TAG_PATTERN.fullmatch(tag)
    if match is None:
        return None

    year = int(match.group("year"))
    month = int(match.group("month"))
    patch = int(match.group("patch"))
    if year < 1 or not 1 <= month <= 12 or patch < 1:
        return None
    return year, month, patch


def get_git_tags() -> list[str]:
    """Read all local Git tags, raising an error if Git cannot provide them."""
    try:
        result = subprocess.run(
            ["git", "tag", "--list"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise RuntimeError("Git is required to determine the stable version.") from error
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() or str(error)
        raise RuntimeError(f"Unable to read Git tags: {detail}") from error
    return result.stdout.splitlines()


def calculate_next_version(
    release_type: str,
    tags: Iterable[str],
    now: datetime | None = None,
    run_id: str | None = None,
) -> str:
    """Calculate the current-month stable candidate from stable tags only."""
    if release_type not in {"stable", "nightly"}:
        raise ValueError(f"Unsupported release type: {release_type}")

    current_time = datetime.now(timezone.utc) if now is None else now
    if current_time.tzinfo is None:
        raise ValueError("The supplied time must include a timezone.")
    current_time = current_time.astimezone(timezone.utc)
    current_period = (current_time.year, current_time.month)

    stable_versions = [
        version
        for tag in tags
        if (version := parse_stable_tag(tag)) is not None
    ]
    latest_stable = max(stable_versions, default=None)

    if latest_stable is not None and latest_stable[:2] > current_period:
        raise ValueError(
            "The latest stable tag is in a future UTC month; refusing to create "
            "a version that would move backwards."
        )

    if latest_stable is not None and latest_stable[:2] == current_period:
        patch = latest_stable[2] + 1
    else:
        patch = 1

    base_version = f"{current_time.year}.{current_time.month}.{patch}"
    if release_type == "stable":
        return base_version

    if run_id is None or RUN_ID_PATTERN.fullmatch(run_id) is None:
        raise ValueError("Nightly releases require a numeric unique run ID.")

    timestamp = current_time.strftime("%Y%m%d.%H%M")
    return f"{base_version}-nightly.{timestamp}.{run_id}"


def write_version(version: str) -> None:
    """Write the stable VERSION mirror."""
    VERSION_FILE.write_text(f"{version}\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--release-type",
        choices=("nightly", "stable"),
        required=True,
    )
    parser.add_argument("--run-id")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write the calculated stable version to VERSION.",
    )
    args = parser.parse_args()

    if args.write and args.release_type != "stable":
        parser.error("--write is only supported for stable releases.")

    try:
        version = calculate_next_version(
            args.release_type,
            get_git_tags(),
            run_id=args.run_id,
        )
    except (RuntimeError, ValueError) as error:
        parser.error(str(error))

    print(version)
    if args.write:
        write_version(version)


if __name__ == "__main__":
    main()
