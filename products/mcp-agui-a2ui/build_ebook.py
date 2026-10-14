"""
Build script for 'MCP, AG-UI & A2UI: The New Frontend Stack' eBook.
Compiles Markdown chapters into:
1. Master Markdown: book.md and exports/mcp-agui-a2ui.md
2. Valid EPUB 3 ebook: book.epub and exports/mcp-agui-a2ui.epub
3. Print/Digital PDF: book.pdf and exports/mcp-agui-a2ui.pdf using ReportLab
Target: 65-75 professionally designed PDF pages.
"""

import os
import re
import json
import zipfile
import html
import shutil
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


def sanitize_text(text):
    """Replaces all em dashes and en dashes with standard hyphens."""
    if not text:
        return ""
    text = re.sub(r"\s*[\u2014\u2013]\s*", " - ", text)
    text = text.replace("&mdash;", " - ").replace("&ndash;", " - ")
    return text


def load_chapters():
    chapters = []
    for ch_meta in PROJECT_META["chapters"]:
        ch_path = MANUSCRIPT_DIR / ch_meta["file"]
        if ch_path.exists():
            with open(ch_path, "r", encoding="utf-8") as f:
                content = f.read()
            clean_content = sanitize_text(content)
            chapters.append({
                "id": ch_meta["id"],
                "file": ch_meta["file"],
                "title": sanitize_text(ch_meta["title"]),
                "content": clean_content,
            })
    return chapters


def build_markdown_bundle(chapters):
    combined = []
    title = sanitize_text(PROJECT_META["title"])
    subtitle = sanitize_text(PROJECT_META["subtitle"])
    author = sanitize_text(PROJECT_META["author"])
    version = PROJECT_META["version"]
    date_str = PROJECT_META["date"]

    combined.append(f"# {title}\n\n")
    combined.append(f"### {subtitle}\n\n")
    combined.append(f"**Author:** {author}  \n")
    combined.append(f"**Version:** {version} | **Date:** {date_str}  \n")
    combined.append(f"**Publisher:** None  \n\n")
    combined.append("---\n\n")

    for ch in chapters:
        combined.append(ch["content"])
        combined.append("\n\n---\n\n")

    master_md = "".join(combined)

    book_md_path = BASE_DIR / "book.md"
    book_rc1_md_path = BASE_DIR / "book-rc1.md"
    export_md_path = EXPORTS_DIR / "mcp-agui-a2ui.md"

    with open(book_md_path, "w", encoding="utf-8") as f:
        f.write(master_md)

    with open(book_rc1_md_path, "w", encoding="utf-8") as f:
        f.write(master_md)

    with open(export_md_path, "w", encoding="utf-8") as f:
        f.write(master_md)

    print(f"[OK] Master Markdown exported to {book_md_path}, {book_rc1_md_path}, and {export_md_path}")
    return master_md


def format_inline(text):
    text = sanitize_text(text)
    escaped = html.escape(text)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*(.+?)\*", r"<em>\1</em>", escaped)
    escaped = re.sub(r"`(.+?)`", r"<code>\1</code>", escaped)
    return escaped


def markdown_to_html(md_text):
    lines = md_text.split("\n")
    html_lines = []
    in_code = False
    code_lang = ""
    code_buffer = []

    for line in lines:
        line = sanitize_text(line)
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


def build_epub(chapters):
    epub_export_path = EXPORTS_DIR / "mcp-agui-a2ui.epub"
    epub_root_path = BASE_DIR / "book.epub"
    cover_image_path = ASSETS_DIR / "cover.jpg"
    if not cover_image_path.exists():
        cover_image_path = ASSETS_DIR / "cover.png"

    css_content = """
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #0f172a;
        margin: 5%;
        padding: 0;
    }
    h1 { color: #1e3a8a; font-size: 2em; border-bottom: 2px solid #3b82f6; padding-bottom: 0.3em; margin-top: 1.5em; }
    h2 { color: #1d4ed8; font-size: 1.5em; margin-top: 1.2em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
    h3 { color: #2563eb; font-size: 1.2em; margin-top: 1em; }
    p { margin: 0.8em 0; text-align: justify; }
    code { font-family: "Courier New", Courier, monospace; background: #f1f5f9; color: #0f172a; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #0f172a; color: #f8fafc; padding: 1em; border-radius: 6px; overflow-x: auto; font-family: "Courier New", Courier, monospace; font-size: 0.85em; }
    pre code { background: transparent; color: #f8fafc; padding: 0; }
    blockquote.callout { border-left: 4px solid #2563eb; background: #eff6ff; margin: 1em 0; padding: 0.6em 1em; border-radius: 0 4px 4px 0; }
    li { margin: 0.4em 0; }
    .cover-img { width: 100%; height: auto; display: block; max-height: 98vh; object-fit: contain; }
    """

    with zipfile.ZipFile(epub_export_path, "w") as z:
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)

        container_xml = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""
        z.writestr("META-INF/container.xml", container_xml, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/styles.css", css_content, compress_type=zipfile.ZIP_DEFLATED)

        if cover_image_path.exists():
            z.write(cover_image_path, "OEBPS/cover.jpg", compress_type=zipfile.ZIP_DEFLATED)

        cover_xhtml = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Cover</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body style="margin:0;padding:0;text-align:center;">
  <img src="cover.jpg" alt="Book Cover" class="cover-img"/>
</body>
</html>"""
        z.writestr("OEBPS/cover.xhtml", cover_xhtml, compress_type=zipfile.ZIP_DEFLATED)

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

        ncx_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:mcp-agui-a2ui-2026-oct"/>
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

        content_opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>{html.escape(PROJECT_META['title'])}</dc:title>
    <dc:creator>{html.escape(PROJECT_META['author'])}</dc:creator>
    <dc:identifier id="BookID">urn:uuid:mcp-agui-a2ui-2026-oct</dc:identifier>
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
        z.writestr("OEBPS/content.opf", content_opf, compress_type=zipfile.ZIP_DEFLATED)

    shutil.copyfile(epub_export_path, epub_root_path)
    shutil.copyfile(epub_export_path, BASE_DIR / "book-rc1.epub")
    print(f"[OK] EPUB 3 bundle exported: {epub_export_path}, {epub_root_path}, and {BASE_DIR / 'book-rc1.epub'}")


class NumberedCanvas(canvas.Canvas):
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
            header_text = "MCP, AG-UI & A2UI: The New Frontend Stack - @kiranbuildswithai"
            self.drawString(54, 750, header_text)
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 744, 558, 744)

        # Running footer
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 36, page_str)
        self.drawString(54, 36, "@kiranbuildswithai - October 2026")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 46, 558, 46)

        self.restoreState()


def parse_markdown_table(table_lines):
    rows = []
    for line in table_lines:
        line = line.strip()
        if not line.startswith("|") or not line.endswith("|"):
            continue
        cells = [c.strip() for c in line.split("|")[1:-1]]
        if all(re.match(r"^:?-+:?$", c) for c in cells):
            continue
        rows.append(cells)

    if not rows or len(rows) < 2:
        return None

    num_cols = max(len(r) for r in rows)
    col_width = 504 / num_cols

    base_style = getSampleStyleSheet()["Normal"]
    th_style = ParagraphStyle(
        "THStyle",
        parent=base_style,
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
    )
    td_style = ParagraphStyle(
        "TDStyle",
        parent=base_style,
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#0f172a"),
    )

    table_data = []
    for row_idx, row in enumerate(rows):
        formatted_row = []
        for cell in row:
            p_style = th_style if row_idx == 0 else td_style
            formatted_row.append(Paragraph(format_inline(cell), p_style))
        while len(formatted_row) < num_cols:
            formatted_row.append(Paragraph("", td_style))
        table_data.append(formatted_row)

    table = Table(table_data, colWidths=[col_width] * num_cols)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    return table


def build_pdf(chapters):
    pdf_export_path = EXPORTS_DIR / "mcp-agui-a2ui.pdf"
    pdf_root_path = BASE_DIR / "book.pdf"
    cover_image_path = ASSETS_DIR / "cover.jpg"
    if not cover_image_path.exists():
        cover_image_path = ASSETS_DIR / "cover.png"

    doc = SimpleDocTemplate(
        str(pdf_export_path),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    base_styles = getSampleStyleSheet()

    style_part_title = ParagraphStyle(
        "PartTitle",
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=14,
        spaceBefore=140,
        alignment=1, # Centered
    )

    style_part_sub = ParagraphStyle(
        "PartSubtitle",
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#2563eb"),
        spaceAfter=24,
        alignment=1,
    )

    style_part_desc = ParagraphStyle(
        "PartDesc",
        fontName="Helvetica-Oblique",
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#475569"),
        leftIndent=40,
        rightIndent=40,
        alignment=1,
    )

    style_h1 = ParagraphStyle(
        "BookH1",
        parent=base_styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=12,
        spaceBefore=16,
        keepWithNext=True,
    )

    style_h2 = ParagraphStyle(
        "BookH2",
        parent=base_styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#1e3a8a"),
        spaceAfter=7,
        spaceBefore=12,
        keepWithNext=True,
    )

    style_h3 = ParagraphStyle(
        "BookH3",
        parent=base_styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#2563eb"),
        spaceAfter=5,
        spaceBefore=9,
        keepWithNext=True,
    )

    style_body = ParagraphStyle(
        "BookBody",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=7,
    )

    style_list = ParagraphStyle(
        "BookList",
        parent=style_body,
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=4,
    )

    style_callout = ParagraphStyle(
        "BookCallout",
        parent=style_body,
        fontName="Helvetica-Oblique",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1e3a8a"),
        leftIndent=14,
        rightIndent=14,
        spaceBefore=6,
        spaceAfter=8,
    )

    style_code = ParagraphStyle(
        "BookCode",
        fontName="Courier",
        fontSize=7.4,
        leading=9.8,
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
        img = RLImage(str(cover_image_path), width=5.5 * inch, height=7.33 * inch)
        story.append(img)
        story.append(PageBreak())

    # 2. Title & Legal Page
    story.append(Spacer(1, 36))
    story.append(Paragraph(sanitize_text(PROJECT_META["title"]), style_h1))
    story.append(Paragraph(sanitize_text(PROJECT_META["subtitle"]), style_h2))
    story.append(Spacer(1, 18))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#2563eb"), spaceAfter=18))
    story.append(Paragraph(f"<b>Author:</b> {PROJECT_META['author']}", style_body))
    story.append(Paragraph(f"<b>Edition:</b> {PROJECT_META['date']} (First Edition)", style_body))
    story.append(Paragraph("<b>Publisher:</b> None", style_body))
    story.append(Paragraph("<b>License:</b> All rights reserved. Technical publication.", style_body))
    story.append(Spacer(1, 24))
    story.append(Paragraph(
        "<b>Notice of Rights:</b> All rights reserved. No part of this publication may be reproduced, "
        "stored in a retrieval system, or transmitted in any form without prior permission. "
        "Model Context Protocol (MCP) is maintained by the open MCP Working Group. "
        "AG-UI and A2UI standards are maintained by their respective technical consortia.",
        style_callout,
    ))
    story.append(PageBreak())

    # 3. Table of Contents
    story.append(Paragraph("Table of Contents", style_h1))
    story.append(Spacer(1, 8))
    toc_data = []
    for idx, ch in enumerate(chapters):
        label = "Frontmatter" if idx == 0 else ("Appendix" if "Appendix" in ch["title"] else f"Chapter {idx}")
        toc_data.append([
            Paragraph(f"<b>{ch['title']}</b>", style_body),
            Paragraph(label, style_body),
        ])

    t = Table(toc_data, colWidths=[384, 120])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(PageBreak())

    # Helper function to append Part Dividers
    def add_part_divider(part_title, part_subtitle, part_desc):
        story.append(Paragraph(part_title, style_part_title))
        story.append(Paragraph(part_subtitle, style_part_sub))
        story.append(HRFlowable(width="60%", thickness=1.5, color=colors.HexColor("#2563eb"), spaceAfter=20, spaceBefore=10))
        story.append(Paragraph(part_desc, style_part_desc))
        story.append(PageBreak())

    # 4. Chapters Flow with Part Divider Pages
    for ch_idx, ch in enumerate(chapters):
        # Insert Part Divider Pages at boundaries
        if ch_idx == 1:
            add_part_divider(
                "Part I",
                "Foundations of the Agentic Frontend",
                "Deconstructing the broken chat-widget paradigm and establishing the formal architectural boundaries between tool discovery (MCP), event streaming (AG-UI), and generative presentation (A2UI)."
            )
        elif ch_idx == 5:
            add_part_divider(
                "Part II",
                "Real-Time Protocols, State & Approvals",
                "Engineering client vs. server tool execution boundaries, fine-grained reactive state synchronization via RFC 6902 JSON Patches, and cryptographic Human-in-the-Loop approval gates."
            )
        elif ch_idx == 8:
            add_part_divider(
                "Part III",
                "Enterprise Capstone & Hardening",
                "Constructing the end-to-end Enterprise AI Customer-Support Dashboard, live telemetry inspection, dynamic resolution cards, OpenTelemetry tracing, and production security hardening."
            )
        elif ch_idx == 12:
            add_part_divider(
                "Appendix",
                "Protocol Reference & Compatibility Matrix",
                "Definitive wire-message contracts, JSON-RPC 2.0 schemas, Server-Sent Events interfaces, and comprehensive platform interoperability tables."
            )

        story.append(Paragraph(ch["title"], style_h1))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#93c5fd"), spaceAfter=12))

        lines = ch["content"].split("\n")
        in_code = False
        code_lines = []
        in_table = False
        table_lines = []

        for raw_line in lines:
            line = sanitize_text(raw_line)

            if line.startswith("```"):
                if not in_code:
                    in_code = True
                    code_lines = []
                else:
                    in_code = False
                    raw_code = "\n".join(code_lines)
                    p_code = Preformatted(raw_code, style_code)
                    story.append(p_code)
                    story.append(Spacer(1, 3))
                    code_lines = []
                continue

            if in_code:
                code_lines.append(line)
                continue

            if line.strip().startswith("|") and line.strip().endswith("|"):
                in_table = True
                table_lines.append(line)
                continue
            else:
                if in_table:
                    in_table = False
                    tbl = parse_markdown_table(table_lines)
                    if tbl:
                        story.append(Spacer(1, 4))
                        story.append(tbl)
                        story.append(Spacer(1, 6))
                    table_lines = []

            if line.startswith("# "):
                continue
            elif line.startswith("## "):
                story.append(Paragraph(html.escape(line[3:].strip()), style_h2))
            elif line.startswith("### "):
                story.append(Paragraph(html.escape(line[4:].strip()), style_h3))
            elif line.startswith("#### "):
                story.append(Paragraph(html.escape(line[5:].strip()), style_h3))
            elif line.startswith("> "):
                clean_text = format_inline(line[2:].strip())
                story.append(Paragraph(f"<b>Architecture Note:</b> <i>{clean_text}</i>", style_callout))
            elif line.startswith("- ") or line.startswith("* "):
                clean_text = format_inline(line[2:].strip())
                story.append(Paragraph(f"- {clean_text}", style_list))
            elif re.match(r"^\d+\.\s+", line):
                clean_text = format_inline(re.sub(r"^\d+\.\s+", "", line).strip())
                num_prefix = re.match(r"^\d+\.", line).group(0)
                story.append(Paragraph(f"{num_prefix} {clean_text}", style_list))
            elif line.strip() == "---":
                story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=8, spaceBefore=8))
            elif line.strip() == "":
                continue
            else:
                clean_text = format_inline(line)
                story.append(Paragraph(clean_text, style_body))

        if in_table and table_lines:
            tbl = parse_markdown_table(table_lines)
            if tbl:
                story.append(Spacer(1, 4))
                story.append(tbl)
                story.append(Spacer(1, 6))

        story.append(PageBreak())

    # Build PDF with NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    shutil.copyfile(pdf_export_path, pdf_root_path)
    shutil.copyfile(pdf_export_path, BASE_DIR / "book-rc1.pdf")
    print(f"[OK] PDF bundle exported: {pdf_export_path}, {pdf_root_path}, and {BASE_DIR / 'book-rc1.pdf'}")


def main():
    print("=== Building 'MCP, AG-UI & A2UI: The New Frontend Stack' eBook ===")
    chapters = load_chapters()
    print(f"Loaded {len(chapters)} chapters.")

    build_markdown_bundle(chapters)
    build_epub(chapters)
    build_pdf(chapters)
    print("=== Build Completed Successfully! ===")


if __name__ == "__main__":
    main()
