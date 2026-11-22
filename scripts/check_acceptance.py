"""Check a PR body against ACCEPTANCE.md §8 (Aileen's evidence closer).

Usage: check_acceptance.py [FILE]  (default: PR body from $GITHUB_EVENT_PATH, else stdin)
"""
import json
import os
import re
import sys

FIELDS = [
    "root cause",
    "files changed",
    "checks run",
    "manual QA",
    "verification",
    "remaining risks",
    "manual steps",
    "safe to merge",
]
SAFE_TO_MERGE = {"yes", "no", "yes after manual env/config step"}
FORBIDDEN = [
    "should work",
    "should be fixed",
    "looks good",
    "应该好了",
    "差不多好了",
]


def _field_re(field):
    return re.compile(rf"^{re.escape(field)}\s*:(.*)$", re.IGNORECASE)


def closer_values(body):
    """Field -> value from the last closer block: unindented labels from `root cause:` to `safe to merge:`."""
    lines = body.splitlines()
    starts = [i for i, line in enumerate(lines) if _field_re(FIELDS[0]).match(line)]
    if not starts:
        return {}
    fenced = sum(l.strip().startswith("```") for l in lines[:starts[-1]]) % 2 == 1
    values, current = {}, None
    for line in lines[starts[-1]:]:
        stripped = line.strip()
        if stripped.startswith("```") or (not fenced and re.match(r" {0,3}#{1,6}\s", line)):
            break
        match = next(((f, _field_re(f).match(line)) for f in FIELDS if _field_re(f).match(line)), None)
        if match:
            current = match[0]
            if current in values:
                break
            values[current] = [match[1].group(1).strip()]
            if current == FIELDS[-1]:
                break
        elif current and stripped:
            values[current].append(stripped.lstrip("- ").strip())
    return {f: " ".join(v for v in vs if v) for f, vs in values.items()}


def problems(body):
    found = []
    values = closer_values(body)
    for field in FIELDS:
        if field not in values:
            found.append(f"missing field `{field}:`")
            continue
        value = values[field]
        if not value:
            found.append(f"empty field `{field}:`")
        elif field == "safe to merge" and value.strip("`*. ").lower() not in SAFE_TO_MERGE:
            found.append(f"`safe to merge:` must be one of {sorted(SAFE_TO_MERGE)}, got {value!r}")
    lowered = "\n".join(values.values()).lower()
    for phrase in FORBIDDEN:
        if phrase in lowered:
            found.append(f"forbidden claim {phrase!r}: give evidence instead")
    return found


def read_body(argv):
    if len(argv) > 1:
        with open(argv[1], encoding="utf-8") as f:
            return f.read()
    event = os.environ.get("GITHUB_EVENT_PATH")
    if event:
        with open(event, encoding="utf-8") as f:
            return (json.load(f).get("pull_request") or {}).get("body") or ""
    return sys.stdin.read()


def main(argv):
    found = problems(read_body(argv))
    for p in found:
        print(f"ACCEPTANCE.md: {p}")
    if not found:
        print("ACCEPTANCE.md: evidence closer complete")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
