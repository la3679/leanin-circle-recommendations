"""Optional maintainer tool: render docs/DESIGN.md using reportlab and pypdf.

The PDF is committed; Python is not required to install, run, or test the API.
Run from the project root: python scripts/render_design.py
"""
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph


root = Path(__file__).resolve().parent.parent
output = root / 'output' / 'pdf' / 'technical-design.pdf'
output.parent.mkdir(parents=True, exist_ok=True)
styles = {
    'title': ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=18,
                            leading=22, spaceAfter=14, textColor=colors.HexColor('#162638')),
    'heading': ParagraphStyle('heading', fontName='Helvetica-Bold', fontSize=10.5,
                              leading=14, spaceBefore=9, spaceAfter=4,
                              keepWithNext=True, textColor=colors.HexColor('#162638')),
    'body': ParagraphStyle('body', fontName='Helvetica', fontSize=10.2,
                           leading=13.6, spaceAfter=7, alignment=TA_LEFT,
                           textColor=colors.HexColor('#20252b')),
}
story = []
for block in (root / 'docs' / 'DESIGN.md').read_text(encoding='utf-8').strip().split('\n\n'):
    kind = 'title' if block.startswith('# ') else 'heading' if block.startswith('## ') else 'body'
    content = block.lstrip('# ').replace('\n', ' ')
    story.append(Paragraph(escape(content), styles[kind]))
SimpleDocTemplate(str(output), pagesize=letter, leftMargin=44, rightMargin=44,
                  topMargin=36, bottomMargin=36, title='Circle recommendation API technical design',
                  author='', pageCompression=1).build(story)
pages = len(PdfReader(output).pages)
if pages != 1:
    raise RuntimeError(f'Design must fit exactly one page, got {pages}')
print(f'Created one-page design: {output}')
