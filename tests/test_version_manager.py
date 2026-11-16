import unittest
from datetime import datetime, timezone

from version_manager import calculate_next_version, parse_stable_tag


class VersionManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.november = datetime(2026, 11, 13, 9, 18, tzinfo=timezone.utc)

    def test_new_month_starts_at_patch_one(self) -> None:
        version = calculate_next_version(
            "stable",
            ["2026.10.4", "v2026.10.5-nightly.20261028.2122"],
            now=self.november,
        )

        self.assertEqual(version, "2026.11.1")

    def test_multiple_nightlies_share_candidate_and_have_unique_run_ids(self) -> None:
        tags = [
            "2026.10.4",
            "v2026.11.1-nightly.20261112.1611.100",
        ]
        first = calculate_next_version(
            "nightly",
            tags,
            now=self.november,
            run_id="101",
        )
        second = calculate_next_version(
            "nightly",
            tags,
            now=self.november,
            run_id="102",
        )

        self.assertEqual(first, "2026.11.1-nightly.20261113.0918.101")
        self.assertEqual(second, "2026.11.1-nightly.20261113.0918.102")

    def test_stable_after_nightlies_uses_same_candidate(self) -> None:
        nightly_tags = [
            "2026.10.4",
            "v2026.11.1-nightly.20261112.1611.100",
            "v2026.11.1-nightly.20261113.0918.101",
        ]

        stable = calculate_next_version("stable", nightly_tags, now=self.november)

        self.assertEqual(stable, "2026.11.1")

    def test_repeated_stable_run_increments_from_stable_tag(self) -> None:
        stable = calculate_next_version(
            "stable",
            [
                "2026.10.4",
                "v2026.11.1",
                "v2026.11.2-nightly.20261114.1015.202",
            ],
            now=self.november,
        )

        self.assertEqual(stable, "2026.11.2")

    def test_existing_unprefixed_history_is_preserved_and_used(self) -> None:
        history = [
            "2026.9.4",
            "2026.10.4",
            "2026.10.5-nightly.20261028.2122",
            "2026.11.1-nightly.20261112.1611",
        ]

        self.assertEqual(parse_stable_tag("2026.10.4"), (2026, 10, 4))
        self.assertEqual(parse_stable_tag("v2026.10.4"), (2026, 10, 4))
        self.assertIsNone(parse_stable_tag("2026.10.5-nightly.20261028.2122"))
        self.assertEqual(
            calculate_next_version("stable", history, now=self.november),
            "2026.11.1",
        )

    def test_nightly_requires_a_unique_numeric_run_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "numeric unique run ID"):
            calculate_next_version("nightly", [], now=self.november)

    def test_only_stable_and_nightly_are_supported(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unsupported release type: beta"):
            calculate_next_version("beta", [], now=self.november)


if __name__ == "__main__":
    unittest.main()
