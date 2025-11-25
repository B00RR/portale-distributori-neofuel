import pathlib
text = pathlib.Path('style.css').read_text()
count = 0
errors = []
for i,ch in enumerate(text, 1):
    if ch == '{':
        count += 1
    elif ch == '}':
        count -= 1
        if count < 0:
            errors.append(f'extra closing brace at {i}')
if count != 0:
    errors.append(f'{count} unmatched opening braces')
print('Errors:' if errors else 'No brace errors', errors)
