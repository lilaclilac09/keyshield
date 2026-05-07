import ast, re

with open('src/python-legacy/tests/test_security_fixes.py', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
result = []
depth = 0
i = 0
while i < len(lines):
    line = lines[i]
    if re.match(r'^<<<<<<< Updated upstream:', line):
        depth += 1
        result.append('')
        i += 1
        continue
    if re.match(r'^>>>>>>> Stashed changes:', line):
        if depth > 0:
            while i < len(lines) and not (lines[i].startswith('<<<<<<<') or lines[i].startswith('=======')):
                i += 1
            if i < len(lines) and lines[i].startswith('======='):
                result.append('')
        depth -= 1
        i += 1
        continue
    if re.match(r'^=======$', line) and depth > 0:
        while i < len(lines) and not (lines[i].startswith('<<<<<<<') or lines[i].startswith('>>>>>>>')):
            i += 1
        continue
    if depth == 0:
        result.append(line)
    i += 1

with open('v2-mvp/tests/test_security_fixes.py', 'w', encoding='utf-8') as f:
    f.write('\n'.join(result))

ast.parse('\n'.join(result))
print(f"OK - {len(result)} lines, parsed successfully")
