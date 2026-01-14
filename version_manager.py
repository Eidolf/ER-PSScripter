#!/usr/bin/env python3
import sys
import re
from datetime import datetime
import argparse
import os

VERSION_FILE = "VERSION"

def read_version():
    if not os.path.exists(VERSION_FILE):
        return "0.0.0"
    with open(VERSION_FILE, "r") as f:
        return f.read().strip()

def write_version(version):
    with open(VERSION_FILE, "w") as f:
        f.write(version)
    # print(f"Updated VERSION to {version}") # Quietly update
    pass

def get_date_parts():
    now = datetime.now()
    return now.year, now.month, now.strftime("%Y%m%d.%H%M")

def parse_version(version_str):
    # Regex to parse YYYY.MM.PATCH(-suffix)?
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$", version_str)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2)), int(match.group(3)), match.group(4)

def calculate_next_version(current_version, release_type):
    year, month, timestamp = get_date_parts()
    parsed = parse_version(current_version)
    
    if parsed:
        curr_year, curr_month, curr_patch, curr_suffix = parsed
    else:
        # Fallback if version file is empty or invalid
        curr_year, curr_month, curr_patch, curr_suffix = 0, 0, 0, None

    # Logic: Reset patch if Year/Month changes, else increment patch
    if year != curr_year or month != curr_month:
        new_patch = 1
    else:
        # If we are just bumping dev or stable on same month, increment patch
        # Note: If previous was nightly/beta, we generally keep the patch or increment?
        # Standard logic: same month -> increment patch
        new_patch = curr_patch + 1

    base_version = f"{year}.{month}.{new_patch}"

    if release_type == "stable":
        return base_version
    elif release_type == "beta":
        return f"{base_version}-beta"
    elif release_type == "nightly":
        # Nightly often reuses the base version but adds unique timestamp
        # To avoid patch explosion, nightly might not stick to strict Patch+1 if run multiple times a day
        # But for simplicity, we follow the requested format: YYYY.MM.PATCH-nightly.TIMESTAMP
        return f"{base_version}-nightly.{timestamp}"
    elif release_type == "dev":
        return f"{base_version}-dev"
    else:
        raise ValueError(f"Unknown release type: {release_type}")

def main():
    parser = argparse.ArgumentParser(description="Manage project versioning.")
    parser.add_argument("--release-type", choices=["stable", "beta", "nightly", "dev"], required=True, help="Type of release")
    parser.add_argument("--write", action="store_true", help="Write new version to VERSION file")
    
    args = parser.parse_args()
    
    current_version = read_version()
    new_version = calculate_next_version(current_version, args.release_type)
    
    print(new_version)
    
    if args.write:
        write_version(new_version)

if __name__ == "__main__":
    main()
