import pypdf
import zipfile
import re
from pathlib import Path
from PIL import Image

base = Path(__file__).parent

files_to_check = [
    ('book.pdf', 'book-rc1.pdf'),
    ('book.epub', 'book-rc1.epub'),
    ('book.md', 'book-rc1.md'),
    ('cover.png', 'cover-rc1.png')
]

print("=== Release Candidate Verification ===")

# 1. Cover format & header check
for cover_name in ['cover.png', 'cover-rc1.png']:
    cov_path = base / cover_name
    with open(cov_path, 'rb') as f:
        header = f.read(8).hex()
    im = Image.open(cov_path)
    print(f"[{cover_name}] Format: {im.format}, Size: {im.size}, Header: {header} ({'PASS (True PNG)' if header == '89504e470d0a1a0a' else 'FAIL'})")

# 2. PDF Page Count & Em Dashes
for pdf_name in ['book.pdf', 'book-rc1.pdf']:
    pdf_path = base / pdf_name
    reader = pypdf.PdfReader(str(pdf_path))
    num_pages = len(reader.pages)
    em_count = 0
    for idx, page in enumerate(reader.pages):
        text = page.extract_text() or ''
        if '\u2014' in text or '\u2013' in text:
            em_count += 1
    print(f"[{pdf_name}] Page Count: {num_pages} (Target: 65-75), Em Dashes: {em_count} ({'PASS' if 65 <= num_pages <= 75 and em_count == 0 else 'CHECK'})")

# 3. EPUB Zip Integrity
for epub_name in ['book.epub', 'book-rc1.epub']:
    epub_path = base / epub_name
    with zipfile.ZipFile(str(epub_path)) as z:
        bad = z.testzip()
        print(f"[{epub_name}] Zip Integrity: {'PASS (0 CRC errors)' if bad is None else f'FAIL ({bad})'}")

# 4. Markdown Em Dashes
for md_name in ['book.md', 'book-rc1.md']:
    md_path = base / md_name
    with open(md_path, 'r', encoding='utf-8') as f:
        md_text = f.read()
    em_dashes = len(re.findall(r'[\u2014\u2013]', md_text))
    print(f"[{md_name}] Em Dashes: {em_dashes} ({'PASS' if em_dashes == 0 else 'FAIL'})")
