"""Text aus PDFs ziehen, als Grundlage für Zusammenfassungen."""

import re
import unicodedata
from pathlib import Path

import pymupdf

# LaTeX-PDFs speichern Umlaute oft als "¨" vor dem Vokal ("J¨ahrlich").
LATEX_UMLAUT = re.compile(r"¨\s?([AEIOUaeiou])")


def fix_umlauts(text: str) -> str:
    text = LATEX_UMLAUT.sub(lambda m: m.group(1) + "̈", text)
    return unicodedata.normalize("NFC", text)


def pdf_to_text(pdf: Path, out_dir: Path) -> Path | None:
    if pdf.suffix.lower() != ".pdf":
        return None
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / (pdf.stem + ".txt")
    with pymupdf.open(pdf) as doc:
        pages = [f"--- Seite {i} ---\n{page.get_text()}" for i, page in enumerate(doc, start=1)]
    target.write_text(fix_umlauts("\n".join(pages)), encoding="utf-8")
    return target
