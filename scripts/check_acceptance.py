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
        char = re.escape(marker[0])
        if re.search(rf"(?<!{char}){re.escape(marker)}(?!{char})", suffix):
            return None
        return (marker[0], len(marker))
    if marker[0] == fence[0] and len(marker) >= fence[1] and not suffix.strip():
        return None
    return fence


def _visible_lines(body):
    lines, visible, removed = [], [], False

    def emit(text, hidden=False):
        nonlocal visible, removed
        parts = text.split("\n")
        for i, part in enumerate(parts):
            if hidden:
                removed = True
            else:
                visible.append(part)
            if i < len(parts) - 1:
                line = "".join(visible)
                if line.strip() or not removed:
                    lines.append(line)
                visible, removed = [], False

    pos, fence = 0, None
    while pos < len(body):
        if pos == 0 or body[pos - 1] == "\n":
            end = body.find("\n", pos)
            end = len(body) if end == -1 else end + 1
            line = body[pos:end].rstrip("\r\n")
            next_fence = _fence_after(line, fence)
            if fence is not None or next_fence is not None:
                emit(body[pos:end])
                fence, pos = next_fence, end
                continue
        if body.startswith("<!--", pos):
            end = body.find("-->", pos + 4)
            if end != -1:
                emit(body[pos:end + 3], hidden=True)
                pos = end + 3
                continue
        if body[pos] == "`":
            marker = re.match(r"`+", body[pos:]).group()
            closing = re.search(rf"(?<!`){marker}(?!`)", body[pos + len(marker):])
            if closing:
                end = pos + len(marker) + closing.end()
                emit(body[pos:end])
                pos = end
                continue
            emit(marker)
            pos += len(marker)
            continue
        emit(body[pos])
        pos += 1
    line = "".join(visible)
    if line.strip() or (visible and not removed):
        lines.append(line)
    return lines


def _value_text(text):
    text = text.strip()
    text = re.sub(r"^(?:[-*+]|\d+\.)(?:\s+|$)", "", text)
    checkbox = re.match(r"\[([ xX])\](?:\s+|$)", text)
    if checkbox:
        if checkbox[1] == " ":
            return ""
        text = text[checkbox.end():]
    return text.strip()


def closer_values(body):
    """Field -> value from the last closer block: unindented labels from `root cause:` to `safe to merge:`."""
    lines = _visible_lines(body)
    starts = [i for i, line in enumerate(lines) if _field_re(FIELDS[0]).match(line)]
    if not starts:
        return {}
    fence = None
    for line in lines[:starts[-1]]:
        fence = _fence_after(line, fence)
    values, current = {}, None
    for line in lines[starts[-1]:]:
        stripped = line.strip()
        next_fence = _fence_after(line, fence)
        if next_fence != fence:
            break
        if (re.match(r" {0,3}#{1,6}(?:\s|$)", line)
                or re.fullmatch(r" {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})", line)):
            break
        match = next(((f, _field_re(f).match(line)) for f in FIELDS if _field_re(f).match(line)), None)
        if current == FIELDS[-1]:
            if match:
                break
            value = _value_text(stripped)
            if value:
                values[current].append(value)
                break
            continue
        if match:
            current = match[0]
            if current in values:
                break
            value = _value_text(match[1].group(1))
            values[current] = [value]
            if current == FIELDS[-1] and value:
                break
        elif current and stripped:
            values[current].append(_value_text(stripped))
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
