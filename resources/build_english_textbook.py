"""Build the English reader from local textbook and workbook notes outside Git."""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_DIR = ROOT.parent / 'knou-study-notes' / '대학영어' / '교재'


def inline(text):
    escaped = html.escape(text, quote=False)
    escaped = escaped.replace('&lt;u&gt;', '<u>').replace('&lt;/u&gt;', '</u>')
    return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', escaped)


def fragment(text):
    blocks, paragraph, items = [], [], []

    def flush():
        if paragraph:
            blocks.append('<p>' + inline(' '.join(paragraph)) + '</p>')
            paragraph.clear()
        if items:
            blocks.append('<ul>' + ''.join('<li>' + inline(item) + '</li>' for item in items) + '</ul>')
            items.clear()

    for line in text.strip().splitlines():
        line = line.strip()
        if not line:
            flush()
        elif line.startswith('- '):
            if paragraph:
                flush()
            items.append(line[2:])
        else:
            if items:
                flush()
            paragraph.append(line)
    flush()
    return ''.join(blocks)


def sections(text):
    parts = re.split(r'^## (.+)$', text, flags=re.M)
    return dict(zip(parts[1::2], parts[2::2]))


def subsections(text):
    parts = re.split(r'^### (.+)$', text, flags=re.M)
    return [(title.strip(), body.strip()) for title, body in zip(parts[1::2], parts[2::2])]


def rows(text):
    result = []
    for line in text.splitlines():
        if line.startswith('|'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if cells[0].isdigit():
                result.append(cells)
    return result


def questions(text):
    result = []
    passage = ''
    for title, body in subsections(text):
        if not title.isdigit():
            passage = fragment(body.replace('> ', ''))
            continue
        prompt, _, explanation = body.partition('**해설:**')
        result.append({'number': int(title), 'passage': passage, 'prompt': fragment(prompt), 'explanation': fragment(explanation)})
    return result


def source_note(text):
    return ' '.join(line.removeprefix('>').strip() for line in text.split('\n## ', 1)[0].splitlines() if line.startswith('>'))


def reading_blocks(text):
    intro = re.split(r'^### ', text, maxsplit=1, flags=re.M)[0].strip()
    return ([('도입', intro)] if intro else []) + subsections(text)


def read_unit(book_path, workbook_path):
    book = book_path.read_text(encoding='utf-8').replace('\u2014', '-')
    workbook = workbook_path.read_text(encoding='utf-8').replace('\u2014', '-')
    b, w = sections(book), sections(workbook)
    translations = reading_blocks(w['본문 해석'])
    reading = reading_blocks(b['본문'])
    assert len(reading) == len(translations), 'Paragraph translation count differs'
    if all(title.isdigit() for title, _ in reading):
        assert [title for title, _ in reading] == [title for title, _ in translations], 'Paragraph numbers differ'
    verbs = []
    translated_verbs = dict(subsections(w.get('How to Use Verbs in Sentences', '')))
    for title, body in subsections(b.get('How to Use Verbs in Sentences', '')):
        pairs = re.findall(r'^- (.+)\n[ \t]+- (.+)$', translated_verbs[title], re.M)
        examples, _, checks = body.partition('**확인 사항**')
        original_examples = re.findall(r'^- (.+)$', examples, re.M)
        assert [english for english, _ in pairs] == original_examples, f'Verb examples differ: {title}'
        verbs.append({'title': title, 'examples': [{'english': en, 'korean': ko} for en, ko in pairs], 'checks': fragment(checks)})
    answer_section = next(value for key, value in w.items() if '정답' in key)
    answers = {int(row[0]): {'answer': row[1], 'evidence': row[2] if len(row) > 2 else '교재 수록 정답표'} for row in rows(answer_section)}
    exercises = questions(w['연습문제'])
    for item in exercises:
        item['answer'] = answers.get(item['number'])
    return {
        'id': re.search(r'Unit(\d+)', book_path.name).group(1),
        'title': book.splitlines()[0].removeprefix('# ').removesuffix(' - 교재'),
        'shortTitle': book.splitlines()[0].removeprefix('# ').split(':', 1)[0].removesuffix(' - 교재'),
        'bookSource': source_note(book), 'workbookSource': source_note(workbook),
        'paragraphs': [{'number': number, 'title': f'문단 {title}' if title.isdigit() else title,
                        'english': body, 'korean': translation[1]}
                       for number, ((title, body), translation) in enumerate(zip(reading, translations), 1)],
        'vocabulary': [{'number': int(row[0]), 'word': row[1], 'meaning': row[2]} for row in rows(b['어휘'])],
        'verbs': verbs, 'vocabularyExercises': questions(w.get('어휘 연습', '')), 'exercises': exercises,
        'answerNote': fragment('\n'.join(line for line in answer_section.splitlines() if not line.startswith('|'))),
        'confirmedAnswers': len(answers)
    }


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = text.replace('\r\n', '\n').replace('\u2014', '-')
    text = '\n'.join(line.rstrip() for line in text.splitlines()) + '\n'
    with path.open('w', encoding='utf-8', newline='\r\n') as output:
        output.write(text)


def build(source_dir, output_root):
    notes = source_dir.resolve()
    assert notes.is_dir(), f'Local source folder not found: {notes}'
    units = []
    for book in sorted(notes.glob('Unit[0-9][0-9]_*.md')):
        workbook = notes / ('Workbook_' + book.name)
        if workbook.exists():
            units.append(read_unit(book, workbook))
    assert units, 'No matching textbook/workbook pairs'
    template = (Path(__file__).parent / 'templates' / 'english-textbook.html').read_text(encoding='utf-8')
    payload = json.dumps({'units': units}, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    script_version = hashlib.sha256((ROOT / 'docs/assets/english-textbook.js').read_bytes()).hexdigest()[:12]
    page = template.replace('__TEXTBOOK_DATA__', payload).replace('__TEXTBOOK_SCRIPT_VERSION__', script_version)
    write(output_root / 'docs' / 'english-textbook.html', page)
    for unit in units:
        print(f"Unit {unit['id']}: {len(unit['paragraphs'])} paragraphs, {len(unit['vocabulary'])} words, {len(unit['verbs'])} verb groups, {len(unit['exercises'])} questions, {unit['confirmedAnswers']} confirmed answers")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=DEFAULT_SOURCE_DIR,
                        help='Local folder containing UnitNN_*.md and Workbook_UnitNN_*.md; sources are not copied')
    parser.add_argument('--source-root', dest='legacy_source_root', type=Path, help=argparse.SUPPRESS)
    parser.add_argument('--output-root', type=Path, default=ROOT)
    args = parser.parse_args()
    source_dir = args.source_dir
    if args.legacy_source_root:
        source_dir = args.legacy_source_root / '대학영어' / '교재'
    build(source_dir, args.output_root)
