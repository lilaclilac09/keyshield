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
REQUIRED_BLOCK = "```txt\n" + "\n".join(field + ":" for field in FIELDS) + "\n```"
LABEL = re.compile(r"^(" + "|".join(re.escape(field) for field in FIELDS) + r"):(.*)$")


def _last_closer(body):
    last, fence, selected, lines = None, None, False, []
    for line in body.splitlines():
        if fence is None:
            opening = re.fullmatch(r" {0,3}(`{3,}|~{3,})(.*)", line)
            if not opening:
                continue
            marker, suffix = opening.groups()
            if marker[0] == "`" and "`" in suffix:
                continue
            fence = marker
            selected = re.fullmatch(r" {0,3}```txt[ \t]*", line) is not None
            lines = []
        elif re.fullmatch(r" {0,3}" + re.escape(fence[0]) + "{" + str(len(fence)) + r",}[ \t]*", line):
            if (selected and re.fullmatch(r" {0,3}```[ \t]*", line)
                    and any(value.startswith("root cause:") for value in lines)):
                last = lines
            fence, selected, lines = None, False, []
        elif selected:
            lines.append(line)
    return last


def _value(line):
    line = line.lstrip()
    if re.match(r"- \[ \](?:\s|$)", line):
        return ""
    line = re.sub(r"^- \[[xX]\](?:\s+|$)", "", line)
    if line.startswith("- "):
        line = line[2:]
    return line.strip()


def problems(body):
    block = _last_closer(body)
    if block is None:
        return ["required evidence closer (one fenced txt block):\n" + REQUIRED_BLOCK]
    labels, values, current = [], {}, None
    for line in block:
        match = LABEL.match(line)
        if match:
            current = match[1]
            labels.append(current)
            values.setdefault(current, []).append(_value(match[2]))
        elif current:
            values[current].append(_value(line))
    values = {field: " ".join(value for value in parts if value) for field, parts in values.items()}
    found = []
    if labels != FIELDS:
        found.append("fields must appear exactly once, at line start, in order: " + ", ".join(FIELDS))
    for field in FIELDS:
        if field not in values:
            found.append(f"missing field `{field}:`")
        elif not values[field]:
            found.append(f"empty field `{field}:`")
    verdict = values.get("safe to merge", "")
    if verdict and verdict.lower() not in SAFE_TO_MERGE:
        found.append(f"`safe to merge:` must be one of {sorted(SAFE_TO_MERGE)}, got {verdict!r}")
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
    for problem in found:
        print(f"ACCEPTANCE.md: {problem}")
    if not found:
        print("ACCEPTANCE.md: evidence closer complete")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
