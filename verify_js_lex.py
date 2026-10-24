with open('frontend/js/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

state = 'NORMAL'
template_stack = []
stack = []
line_num = 1
col_num = 0

quote_opened_line = None
quote_opened_col = None

i = 0
n = len(text)
while i < n:
    c = text[i]
    col_num += 1
    if c == '\n':
        line_num += 1
        col_num = 0
        if state == 'LINE_COMMENT':
            state = 'NORMAL'
        elif state == 'SINGLE_QUOTE' or state == 'DOUBLE_QUOTE':
            # In JavaScript, single or double quoted strings CANNOT span across newlines without \
            print(f"ERROR: Multi-line string without backslash at line {quote_opened_line}:{quote_opened_col} (hit newline at {line_num})")
            state = 'NORMAL'
        i += 1
        continue

    if state in ('SINGLE_QUOTE', 'DOUBLE_QUOTE', 'TEMPLATE_LITERAL'):
        if c == '\\':
            i += 2
            col_num += 1
            continue
        if state == 'SINGLE_QUOTE' and c == "'":
            state = 'NORMAL'
            i += 1
            continue
        if state == 'DOUBLE_QUOTE' and c == '"':
            state = 'NORMAL'
            i += 1
            continue
        if state == 'TEMPLATE_LITERAL':
            if c == '`':
                state = template_stack.pop() if template_stack else 'NORMAL'
                i += 1
                continue
            elif c == '$' and i + 1 < n and text[i+1] == '{':
                template_stack.append('TEMPLATE_LITERAL')
                state = 'NORMAL'
                i += 2
                col_num += 1
                continue
        i += 1
        continue

    if state == 'BLOCK_COMMENT':
        if c == '*' and i + 1 < n and text[i+1] == '/':
            state = 'NORMAL'
            i += 2
            col_num += 1
            continue
        i += 1
        continue

    if state == 'LINE_COMMENT':
        i += 1
        continue

    if c == '/' and i + 1 < n:
        if text[i+1] == '/':
            state = 'LINE_COMMENT'
            i += 2
            col_num += 1
            continue
        elif text[i+1] == '*':
            state = 'BLOCK_COMMENT'
            i += 2
            col_num += 1
            continue

    if c == "'":
        state = 'SINGLE_QUOTE'
        quote_opened_line = line_num
        quote_opened_col = col_num
        i += 1
        continue
    if c == '"':
        state = 'DOUBLE_QUOTE'
        quote_opened_line = line_num
        quote_opened_col = col_num
        i += 1
        continue
    if c == '`':
        state = 'TEMPLATE_LITERAL'
        i += 1
        continue

    i += 1

print("Done scanning. State is:", state)
