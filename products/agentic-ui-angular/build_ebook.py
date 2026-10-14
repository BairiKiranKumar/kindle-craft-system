"""
Build script for Agentic UI with Angular eBook.
Compiles Markdown chapters into:
1. Consolidated Markdown (book.md / exports/agentic-ui-with-angular.md)
2. Valid EPUB 3 ebook (exports/agentic-ui-with-angular.epub)
3. Print/Digital PDF (exports/agentic-ui-with-angular.pdf) using ReportLab
"""

import os
import re
import json
import zipfile
import html
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Image as RLImage,
    PageBreak,
    Preformatted,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable,
)
from reportlab.pdfgen import canvas

BASE_DIR = Path(__file__).resolve().parent
MANUSCRIPT_DIR = BASE_DIR / "manuscript"
EXPORTS_DIR = BASE_DIR / "exports"
ASSETS_DIR = BASE_DIR / "assets"
PROJECT_FILE = BASE_DIR / "project.json"

EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

with open(PROJECT_FILE, "r", encoding="utf-8") as f:
    PROJECT_META = json.load(f)


def load_chapters():
    chapters = []
    for ch_meta in PROJECT_META["chapters"]:
        ch_path = MANUSCRIPT_DIR / ch_meta["file"]
        if ch_path.exists():
            with open(ch_path, "r", encoding="utf-8") as f:
                content = f.read()
            chapters.append({
                "id": ch_meta["id"],
                "file": ch_meta["file"],
                "title": ch_meta["title"],
                "content": content,
            })
    return chapters


def build_markdown_bundle(chapters):
    combined = []
    combined.append(f"# {PROJECT_META['title']}\n")
    combined.append(f"### {PROJECT_META['subtitle']}\n\n")
    combined.append(f"**Author:** {PROJECT_META['author']}  \n")
    combined.append(f"**Version:** {PROJECT_META['version']} | **Date:** {PROJECT_META['date']}\n\n")
    combined.append("---\n\n")

    for ch in chapters:
        combined.append(ch["content"])
        combined.append("\n\n---\n\n")

    master_md = "".join(combined)
    
    with open(BASE_DIR / "book.md", "w", encoding="utf-8") as f:
        f.write(master_md)
    
    with open(EXPORTS_DIR / "agentic-ui-with-angular.md", "w", encoding="utf-8") as f:
        f.write(master_md)
        
    print(f"[OK] Markdown bundle exported: {EXPORTS_DIR / 'agentic-ui-with-angular.md'}")
    return master_md


def markdown_to_html(md_text):
    """
    Lightweight, robust markdown to HTML converter for EPUB and PDF flowables.
    Handles code blocks, headers, lists, blockquotes, bold/italic, inline code, and tables.
    """
    lines = md_text.split("\n")
    html_lines = []
    in_code = False
    code_lang = ""
    code_buffer = []

    for line in lines:
        if line.startswith("```"):
            if not in_code:
                in_code = True
                code_lang = line[3:].strip()
                code_buffer = []
            else:
                in_code = False
                escaped = html.escape("\n".join(code_buffer))
                html_lines.append(f'<pre class="code-block language-{code_lang}"><code>{escaped}</code></pre>')
                code_buffer = []
            continue

        if in_code:
            code_buffer.append(line)
            continue

        # Headers
        if line.startswith("# "):
            html_lines.append(f"<h1>{html.escape(line[2:].strip())}</h1>")
        elif line.startswith("## "):
            html_lines.append(f"<h2>{html.escape(line[3:].strip())}</h2>")
        elif line.startswith("### "):
            html_lines.append(f"<h3>{html.escape(line[4:].strip())}</h3>")
        elif line.startswith("#### "):
            html_lines.append(f"<h4>{html.escape(line[5:].strip())}</h4>")
        elif line.startswith("> "):
            callout = line[2:].strip()
            html_lines.append(f'<blockquote class="callout"><p>{format_inline(callout)}</p></blockquote>')
        elif line.startswith("- ") or line.startswith("* "):
            item = line[2:].strip()
            html_lines.append(f'<li class="list-item">{format_inline(item)}</li>')
        elif re.match(r"^\d+\.\s+", line):
            item = re.sub(r"^\d+\.\s+", "", line).strip()
            html_lines.append(f'<li class="numbered-item">{format_inline(item)}</li>')
        elif line.strip() == "---":
            html_lines.append("<hr />")
        elif line.strip() == "":
            html_lines.append("")
        else:
            html_lines.append(f"<p>{format_inline(line)}</p>")

    return "\n".join(html_lines)


def format_inline(text):
    text = re.sub(r"\s*[\u2014\u2013]\s*", " - ", text)
    text = text.replace("&mdash;", " - ").replace("&ndash;", " - ")
    escaped = html.escape(text)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*(.+?)\*", r"<em>\1</em>", escaped)
    escaped = re.sub(r"`(.+?)`", r"<code>\1</code>", escaped)
    return escaped


def build_epub(chapters):
    epub_path = EXPORTS_DIR / "agentic-ui-with-angular.epub"
    cover_image_path = ASSETS_DIR / "cover.jpg"

    css_content = """
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        margin: 5%;
        padding: 0;
    }
    h1 { color: #4338ca; font-size: 2em; border-bottom: 2px solid #e0e7ff; padding-bottom: 0.3em; margin-top: 1.5em; }
    h2 { color: #312e81; font-size: 1.5em; margin-top: 1.2em; border-bottom: 1px solid #f3f4f6; padding-bottom: 0.2em; }
    h3 { color: #3730a3; font-size: 1.2em; margin-top: 1em; }
    p { margin: 0.8em 0; text-align: justify; }
    code { font-family: "Courier New", Courier, monospace; background: #f3f4f6; color: #1e1b4b; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #1e1e2e; color: #f8fafc; padding: 1em; border-radius: 6px; overflow-x: auto; font-family: "Courier New", Courier, monospace; font-size: 0.85em; }
    pre code { background: transparent; color: #f8fafc; padding: 0; }
    blockquote.callout { border-left: 4px solid #6366f1; background: #eef2ff; margin: 1em 0; padding: 0.6em 1em; border-radius: 0 4px 4px 0; }
    li { margin: 0.4em 0; }
    .cover-img { width: 100%; height: auto; display: block; max-height: 98vh; object-fit: contain; }
    """

    with zipfile.ZipFile(epub_path, "w") as z:
        # 1. mimetype MUST be first, uncompressed
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)

        # 2. META-INF/container.xml
        container_xml = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""
        z.writestr("META-INF/container.xml", container_xml, compress_type=zipfile.ZIP_DEFLATED)

        # 3. Stylesheet
        z.writestr("OEBPS/styles.css", css_content, compress_type=zipfile.ZIP_DEFLATED)

        # 4. Cover Image
        if cover_image_path.exists():
            z.write(cover_image_path, "OEBPS/cover.jpg", compress_type=zipfile.ZIP_DEFLATED)

        # 5. Cover Page
        cover_xhtml = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Cover</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body style="margin:0;padding:0;text-align:center;">
  <img src="cover.jpg" alt="Book Cover" class="cover-img"/>
</body>
</html>"""
        z.writestr("OEBPS/cover.xhtml", cover_xhtml, compress_type=zipfile.ZIP_DEFLATED)

        # 6. Chapters XHTML
        manifest_items = [
            '<item id="style" href="styles.css" media-type="text/css"/>',
            '<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>',
            '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
        ]
        spine_items = ['<itemref idref="cover"/>']
        nav_points = ['<navPoint id="np-cover" playOrder="1"><navLabel><text>Cover</text></navLabel><content src="cover.xhtml"/></navPoint>']
        nav_links = ['<li><a href="cover.xhtml">Cover</a></li>']

        play_order = 2
        for idx, ch in enumerate(chapters):
            ch_id = f"ch_{idx:02d}"
            filename = f"chapter_{idx:02d}.xhtml"
            ch_html = markdown_to_html(ch["content"])
            full_html = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>{html.escape(ch["title"])}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  {ch_html}
</body>
</html>"""
            z.writestr(f"OEBPS/{filename}", full_html, compress_type=zipfile.ZIP_DEFLATED)
            manifest_items.append(f'<item id="{ch_id}" href="{filename}" media-type="application/xhtml+xml"/>')
            spine_items.append(f'<itemref idref="{ch_id}"/>')
            nav_points.append(f'<navPoint id="np-{ch_id}" playOrder="{play_order}"><navLabel><text>{html.escape(ch["title"])}</text></navLabel><content src="{filename}"/></navPoint>')
            nav_links.append(f'<li><a href="{filename}">{html.escape(ch["title"])}</a></li>')
            play_order += 1

        # 7. Navigation document nav.xhtml
        nav_xhtml = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      {''.join(nav_links)}
    </ol>
  </nav>
</body>
</html>"""
        z.writestr("OEBPS/nav.xhtml", nav_xhtml, compress_type=zipfile.ZIP_DEFLATED)
        manifest_items.append('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')

        # 8. toc.ncx for EPUB 2 backward compatibility
        ncx_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:agentic-ui-angular-2026"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{html.escape(PROJECT_META['title'])}</text></docTitle>
  <navMap>
    {''.join(nav_points)}
  </navMap>
</ncx>"""
        z.writestr("OEBPS/toc.ncx", ncx_xml, compress_type=zipfile.ZIP_DEFLATED)
        manifest_items.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')

        # 9. content.opf
        opf_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:agentic-ui-angular-2026</dc:identifier>
    <dc:title>{html.escape(PROJECT_META['title'])}: {html.escape(PROJECT_META['subtitle'])}</dc:title>
    <dc:creator>{html.escape(PROJECT_META['author'])}</dc:creator>
    <dc:language>en</dc:language>
    <dc:date>{PROJECT_META['date']}</dc:date>
    <meta property="dcterms:modified">2026-10-14T00:00:00Z</meta>
  </metadata>
  <manifest>
    {''.join(manifest_items)}
  </manifest>
  <spine toc="ncx">
    {''.join(spine_items)}
  </spine>
</package>"""
        z.writestr("OEBPS/content.opf", opf_xml, compress_type=zipfile.ZIP_DEFLATED)

    print(f"[OK] EPUB bundle exported: {epub_path} (size: {epub_path.stat().st_size} bytes)")


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas for ReportLab to inject running headers and 'Page X of Y' footers.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        # Don't draw header/footer on page 1 (cover)
        if self._pageNumber == 1:
            return

        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Running header on pages 3+
        if self._pageNumber >= 3:
            self.drawString(54, 750, "Agentic UI with Angular - Architecting Agentic AI with Open Standards")
            self.setStrokeColor(colors.HexColor("#e2e8f0"))
            self.setLineWidth(0.5)
            self.line(54, 744, 558, 744)

        # Running footer
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 36, page_str)
        self.drawString(54, 36, f"{PROJECT_META.get('author', 'Kiran Kumar Bairi')} • 2026")
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(54, 46, 558, 46)

        self.restoreState()


def build_pdf(chapters):
    pdf_path = EXPORTS_DIR / "agentic-ui-with-angular.pdf"
    cover_image_path = ASSETS_DIR / "cover.jpg"

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    base_styles = getSampleStyleSheet()

    # Custom typography styles
    style_h1 = ParagraphStyle(
        "BookH1",
        parent=base_styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#312e81"),
        spaceAfter=14,
        spaceBefore=18,
        keepWithNext=True,
    )

    style_h2 = ParagraphStyle(
        "BookH2",
        parent=base_styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#3730a3"),
        spaceAfter=8,
        spaceBefore=14,
        keepWithNext=True,
    )

    style_h3 = ParagraphStyle(
        "BookH3",
        parent=base_styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#4338ca"),
        spaceAfter=6,
        spaceBefore=10,
        keepWithNext=True,
    )

    style_body = ParagraphStyle(
        "BookBody",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=8,
    )

    style_list = ParagraphStyle(
        "BookList",
        parent=style_body,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4,
    )

    style_callout = ParagraphStyle(
        "BookCallout",
        parent=style_body,
        fontName="Helvetica-Oblique",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#312e81"),
        leftIndent=15,
        rightIndent=15,
        spaceBefore=6,
        spaceAfter=8,
    )

    style_code = ParagraphStyle(
        "BookCode",
        fontName="Courier",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#0f172a"),
        backColor=colors.HexColor("#f8fafc"),
        borderColor=colors.HexColor("#cbd5e1"),
        borderWidth=0.5,
        borderPadding=6,
        spaceBefore=6,
        spaceAfter=8,
    )

    story = []

    # 1. Front Cover Page
    if cover_image_path.exists():
        # 5.5 x 7.33 inches image centered on cover page
        img = RLImage(str(cover_image_path), width=5.5 * inch, height=7.33 * inch)
        story.append(img)
        story.append(PageBreak())

    # 2. Title & Legal Page
    story.append(Spacer(1, 40))
    story.append(Paragraph(PROJECT_META["title"], style_h1))
    story.append(Paragraph(PROJECT_META["subtitle"], style_h2))
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#6366f1"), spaceAfter=20))
    story.append(Paragraph(f"<b>Author:</b> {PROJECT_META['author']}", style_body))
    story.append(Paragraph(f"<b>Published:</b> {PROJECT_META['date']} (First Edition)", style_body))
    if PROJECT_META.get("publisher") and PROJECT_META.get("publisher") != "None":
        story.append(Paragraph(f"<b>Publisher:</b> {PROJECT_META['publisher']}", style_body))
    story.append(Paragraph("<b>License:</b> Enterprise Technical Publication. All rights reserved.", style_body))
    story.append(Spacer(1, 30))
    story.append(Paragraph(
        "<b>Notice of Rights:</b> All rights reserved. No part of this publication may be reproduced, "
        "stored in a retrieval system, or transmitted in any form without prior permission. Angular is a trademark of Google LLC. "
        "CopilotKit and AG-UI are open standards maintained by their respective working groups.",
        style_callout,
    ))
    story.append(PageBreak())

    # 3. Table of Contents
    story.append(Paragraph("Table of Contents", style_h1))
    story.append(Spacer(1, 10))
    toc_data = []
    for idx, ch in enumerate(chapters):
        toc_data.append([
            Paragraph(f"<b>{ch['title']}</b>", style_body),
            Paragraph(f"Chapter {idx}" if idx > 0 else "Introduction", style_body),
        ])
    
    t = Table(toc_data, colWidths=[380, 100])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(PageBreak())

    # 4. Chapters Flow
    for ch_idx, ch in enumerate(chapters):
        story.append(Paragraph(ch["title"], style_h1))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e0e7ff"), spaceAfter=14))

        lines = ch["content"].split("\n")
        in_code = False
        code_lines = []

        for raw_line in lines:
            line = re.sub(r"\s*[\u2014\u2013]\s*", " - ", raw_line).replace("&mdash;", " - ").replace("&ndash;", " - ")
            if line.startswith("```"):
                if not in_code:
                    in_code = True
                    code_lines = []
                else:
                    in_code = False
                    raw_code = "\n".join(code_lines)
                    p_code = Preformatted(raw_code, style_code)
                    story.append(p_code)
                    story.append(Spacer(1, 4))
                    code_lines = []
                continue

            if in_code:
                code_lines.append(line)
                continue

            if line.startswith("# "):
                # Skip duplicate main header
                continue
            elif line.startswith("## "):
                story.append(Paragraph(html.escape(line[3:].strip()), style_h2))
            elif line.startswith("### "):
                story.append(Paragraph(html.escape(line[4:].strip()), style_h3))
            elif line.startswith("> "):
                clean_text = format_inline(line[2:].strip())
                story.append(Paragraph(f"💡 <i>{clean_text}</i>", style_callout))
            elif line.startswith("- ") or line.startswith("* "):
                clean_text = format_inline(line[2:].strip())
                story.append(Paragraph(f"• {clean_text}", style_list))
            elif re.match(r"^\d+\.\s+", line):
                clean_text = format_inline(re.sub(r"^\d+\.\s+", "", line).strip())
                num_prefix = re.match(r"^\d+\.", line).group(0)
                story.append(Paragraph(f"{num_prefix} {clean_text}", style_list))
            elif line.strip() == "---":
                story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=10, spaceBefore=10))
            elif line.strip() == "":
                continue
            else:
                clean_text = format_inline(line)
                story.append(Paragraph(clean_text, style_body))

        story.append(PageBreak())

    # Build document with NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[OK] PDF bundle exported: {pdf_path} (size: {pdf_path.stat().st_size} bytes)")


def main():
    print("=== Building Agentic UI with Angular eBook ===")
    chapters = load_chapters()
    print(f"Loaded {len(chapters)} chapters.")

    build_markdown_bundle(chapters)
    build_epub(chapters)
    build_pdf(chapters)
    print("=== Build Completed Successfully! ===")


if __name__ == "__main__":
    main()
