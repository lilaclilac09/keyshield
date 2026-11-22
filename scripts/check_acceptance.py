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
    "\u5e94\u8be5\u597d\u4e86",
    "\u5dee\u4e0d\u591a\u597d\u4e86",
]


def _field_re(field):
    return re.compile(rf"^{re.escape(field)}\s*:(.*)$", re.IGNORECASE)


def _fence_after(line, fence):
    match = re.match(r" {0,3}(`{3,}|~{3,})(.*)$", line)
    if not match:
        return fence
    marker, suffix = match.groups()
    if fence is None:
        return (marker[0], len(marker))
    if marker[0] == fence[0] and len(marker) >= fence[1] and not suffix.strip():
        return None
    return fence


def _visible_lines(body):
    lines, fence, comment = [], None, False
    for line in body.splitlines():
        if fence is not None or (not comment and _fence_after(line, None) is not None):
            lines.append(line)
            fence = _fence_after(line, fence)
            continue
        visible, pos = [], 0
        while pos < len(line):
            if comment:
                end = line.find("-->", pos)
                if end == -1:
                    break
                comment, pos = False, end + 3
            else:
                start = line.find("<!--", pos)
                if start == -1:
                    visible.append(line[pos:])
                    break
                visible.append(line[pos:start])
                comment, pos = True, start + 4
        clean = "".join(visible)
        lines.append(clean)
        if not comment:
            fence = _fence_after(clean, fence)
    return lines


def closer_values(body):
    """Field -> value from the last closer block: unindented labels from `root cause:` to `safe to merge:`."""
    lines = _visible_lines(body)
    starts = [i for i, line in enumerate(lines) if _field_re(FIELDS[0]).match(line)]
    if not starts:
        return {}
    fence = None
    for line in lines[:starts[-1]]:
        fence = _fence_after(line, fence)
    outer_fence = fence
    values, current = {}, None
    for line in lines[starts[-1]:]:
        stripped = line.strip()
        next_fence = _fence_after(line, fence)
        if next_fence != fence:
            if current == FIELDS[-1] or (fence == outer_fence and next_fence is None):
                break
            fence = next_fence
            continue
        if (((fence is None or current == FIELDS[-1]) and re.match(r" {0,3}#{1,6}\s", line))
                or (current == FIELDS[-1] and not stripped)):
            break
        if re.match(r"[-*+]\s+\[ \](?:\s|$)", stripped):
            continue
        match = next(((f, _field_re(f).match(line)) for f in FIELDS if _field_re(f).match(line)), None) if fence == outer_fence else None
        if match:
            current = match[0]
            if current in values:
                break
            values[current] = [match[1].group(1).strip()]
        elif current and stripped:
            values[current].append(re.sub(r"^[-*+]\s+", "", stripped))
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
