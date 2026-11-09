"""Erzeugt Auswahlfragen aus den Wochennotizen mit Claude und legt sie als Entwürfe an.

Pro Notiz zwei Aufrufe an Claude Sonnet 5.5:
  1. Erzeugen: Single-Choice- und Mehrfachauswahl-Fragen auf Klausurniveau mit Begründung und Quelle
  2. Prüfen:   jede Frage gegen Notiz und Text der zitierten Folienseite (cache/text/), Durchgefallenes fliegt raus

Wie viele Fragen welcher Art je Notiz entstehen, steht in config.yaml unter "auswahlfragen".

Aufruf (im Ordner Lernassistent):
  .venv/bin/python -m generator.generate_mc                        # nur auflisten, keine API-Kosten
  .venv/bin/python -m generator.generate_mc --notiz "MAK W03"      # Probelauf mit API, schreibt nichts
  .venv/bin/python -m generator.generate_mc --modul MAK --schreiben  # als Entwürfe anlegen
  .venv/bin/python -m generator.generate_mc --schreiben              # alle Notizen ohne Fragen

Mit --schreiben werden Notizen übersprungen, zu denen es schon generierte Fragen gibt
(außer mit --neu). Die Entwürfe gibst du in der App frei. ANTHROPIC_API_KEY steht in .env.
"""

import argparse
import hashlib
import json
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from importer.import_lesemodus import parse_note
from importer.import_notes import PROJECT_DIR, Supabase, find_notes

MODEL = "claude-sonnet-5-5"
# Dollar pro Million Token (Claude Sonnet 5.5): Eingabe, Ausgabe, Cache schreiben, Cache lesen
PREISE = {"input": 2.0, "output": 10.0, "cache_write": 2.5, "cache_read": 0.2}
TEXT_DIR = PROJECT_DIR / "cache" / "text"
SEITE = re.compile(r"^--- Seite (\d+) ---$", re.MULTILINE)
MAX_FOLIENTEXT = 4000
# Verbindungsabbrüche mitten in einer gestreamten Antwort wiederholt das SDK nicht selbst
VERSUCHE = 3

SYSTEM = """Du erstellst und prüfst Auswahlfragen für die Klausurvorbereitung eines Studenten der \
Wirtschaftswissenschaften an der Martin-Luther-Universität Halle-Wittenberg.

Grundlage ist ausschließlich seine Wochennotiz zu einer Vorlesung. Sie ist aus den Folien \
zusammengefasst, jede Aussage trägt einen Quellenverweis auf die PDF-Seite im Format \
[[Datei.pdf#page=N|Kürzel S. N]]. Abschnitte, die als "Eigene Ergänzung, nicht aus den Folien" \
markiert sind, gehören nicht zum Prüfungsstoff.

Schreibstil: Deutsch, duzen, keine Emojis, keine Gedankenstriche. Formeln in LaTeX mit $...$. \
Begriffe, Notation und Formelschreibweise genau wie in der Notiz, damit sie zur Klausur passen."""

AUFGABE_ERZEUGEN = """Erstelle zu dieser Wochennotiz genau {single} Single-Choice-Fragen und genau \
{multiple} Mehrfachauswahl-Fragen.

- Klausurniveau: Verständnis, Anwendung und, wo die Notiz Formeln oder Verfahren enthält, kleine \
Rechnungen. Verteile die Fragen über die wichtigsten Kernaussagen der Woche, nicht alle zum selben Punkt.
- Jede Frage hat genau vier Antworten, ohne Buchstaben oder Nummern davor (sie werden gemischt).
- Single Choice: genau eine Antwort ist richtig, keine der falschen ist vertretbar.
- Mehrfachauswahl: eine bis drei Antworten sind richtig. Die Frage endet mit "(mehrere Antworten möglich)".
- Falsche Antworten sind plausibel: typische Fehlvorstellungen, vertauschte Begriffe, Rechenfehler. \
Ähnliche Länge wie die richtigen. Kein "alle genannten", kein "keine der genannten", keine doppelten Verneinungen.
- richtig: Positionen der richtigen Antworten in der Liste, gezählt ab 0.
- begruendung: ein bis vier Sätze, warum die richtigen Antworten stimmen und woran die falschen scheitern.
- quelle_datei und quelle_seite: aus dem Verweis in der Notiz, der den Inhalt der Frage belegt. \
Dateiname genau wie im Verweis, ohne Ordner. Die Seite ist die PDF-Seite aus "#page=N"."""

AUFGABE_PRUEFEN = """Prüfe die folgenden Auswahlfragen zu dieser Wochennotiz streng, jede einzeln:

1. Ist die als richtig markierte Lösung laut Notiz und Folientext korrekt?
2. Single Choice: Ist wirklich genau eine Antwort richtig und keine falsche vertretbar? \
Mehrfachauswahl: Stimmt jede einzelne Markierung?
3. Steht der Inhalt auf der angegebenen Folienseite? Der Text dieser Seiten steht unten. \
Fehlt er, prüfe nur gegen die Notiz.
4. Ist die Frage eindeutig und ohne Vorwissen außerhalb der Notiz lösbar?

Urteil "ok" nur, wenn alle vier Punkte erfüllt sind, sonst "verwerfen". Begründe jedes Urteil in einem Satz.

Fragen:
{fragen}

Folientext der zitierten Seiten:
{folien}"""

SCHEMA_FRAGEN = {
    "type": "object",
    "properties": {
        "fragen": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "typ": {"type": "string", "enum": ["single_choice", "multiple_choice"]},
                    "frage": {"type": "string"},
                    "antworten": {"type": "array", "items": {"type": "string"}},
                    "richtig": {"type": "array", "items": {"type": "integer"}},
                    "begruendung": {"type": "string"},
                    "quelle_datei": {"type": "string"},
                    "quelle_seite": {"type": "integer"},
                },
                "required": ["typ", "frage", "antworten", "richtig", "begruendung", "quelle_datei", "quelle_seite"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["fragen"],
    "additionalProperties": False,
}

SCHEMA_URTEILE = {
    "type": "object",
    "properties": {
        "urteile": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "nr": {"type": "integer"},
                    "urteil": {"type": "string", "enum": ["ok", "verwerfen"]},
                    "grund": {"type": "string"},
                },
                "required": ["nr", "urteil", "grund"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["urteile"],
    "additionalProperties": False,
}


class Abgelehnt(Exception):
    """Claude hat die Anfrage abgelehnt oder nicht zu Ende geschrieben."""


class Verbindung(Exception):
    """Die Verbindung zur API ist auch nach mehreren Versuchen abgebrochen."""


@dataclass
class Frage:
    modul: str
    woche: int
    notiz: str
    typ: str
    frage: str
    antworten: list[str]
    richtig: list[int]
    begruendung: str
    quelle_datei: str
    quelle_seite: int
    hash: str = field(init=False)

    def __post_init__(self):
        normiert = " ".join(self.frage.split())
        self.hash = hashlib.sha256(f"{self.modul}|{self.typ}|{normiert}".encode()).hexdigest()

    def als_zeile(self) -> dict:
        correct = self.richtig[0] if self.typ == "single_choice" else sorted(self.richtig)
        return {
            "module": self.modul,
            "week": self.woche,
            "type": self.typ,
            "question": self.frage,
            "answer": self.begruendung,
            "options": {"choices": self.antworten, "correct": correct},
            "source_file": self.quelle_datei,
            "source_page": self.quelle_seite,
            "origin": "generator",
            "origin_ref": self.notiz,
            "content_hash": self.hash,
            "status": "entwurf",
        }


@dataclass
class Kosten:
    input: int = 0
    output: int = 0
    cache_write: int = 0
    cache_read: int = 0

    def add(self, usage) -> None:
        self.input += usage.input_tokens or 0
        self.output += usage.output_tokens or 0
        self.cache_write += getattr(usage, "cache_creation_input_tokens", 0) or 0
        self.cache_read += getattr(usage, "cache_read_input_tokens", 0) or 0

    @property
    def dollar(self) -> float:
        return sum(getattr(self, k) * PREISE[k] for k in PREISE) / 1e6


def anzahl(cfg: dict, modul: str) -> tuple[int, int]:
    """Single und Multiple je Notiz: Moduleintrag vor Vorgabe."""
    standard = cfg.get("auswahlfragen", {"single": 4, "multiple": 2})
    eigen = (cfg.get("module", {}).get(modul) or {}).get("auswahlfragen") or {}
    return int(eigen.get("single", standard["single"])), int(eigen.get("multiple", standard["multiple"]))


def strukturfehler(f: dict) -> str | None:
    """Was das JSON-Format nicht erzwingen kann, prüfen wir hier."""
    if len(f["antworten"]) != 4 or any(not a.strip() for a in f["antworten"]):
        return "nicht genau vier Antworten"
    if len(set(a.strip() for a in f["antworten"])) != 4:
        return "doppelte Antworten"
    richtig = f["richtig"]
    if not richtig or len(set(richtig)) != len(richtig) or any(i < 0 or i > 3 for i in richtig):
        return "ungültige Lösungspositionen"
    if f["typ"] == "single_choice" and len(richtig) != 1:
        return "Single Choice ohne genau eine Lösung"
    if f["typ"] == "multiple_choice" and len(richtig) > 3:
        return "Mehrfachauswahl mit vier richtigen Antworten"
    if f["quelle_seite"] < 1 or not f["quelle_datei"].lower().endswith(".pdf"):
        return "Quelle fehlt"
    return None


def folienseite(datei: str, seite: int, text_dir: Path = TEXT_DIR) -> str | None:
    """Text einer PDF-Seite aus cache/text/<Kürzel>/<Datei>.txt (von scanner/extract.py)."""
    stem = unicodedata.normalize("NFC", Path(datei).stem)
    for txt in text_dir.rglob("*.txt"):
        if unicodedata.normalize("NFC", txt.stem) != stem:
            continue
        teile = SEITE.split(txt.read_text(encoding="utf-8"))
        # teile = [vorspann, "1", text1, "2", text2, ...]
        seiten = {int(teile[i]): teile[i + 1].strip() for i in range(1, len(teile) - 1, 2)}
        if seite in seiten:
            return seiten[seite][:MAX_FOLIENTEXT]
    return None


def frage_claude(client, notiz_text: str, aufgabe: str, schema: dict, effort: str, kosten: Kosten) -> dict:
    """Ein Aufruf mit festem JSON-Format. Ohne Prompt-Cache: Das JSON-Format gehört zum gecachten
    Anfang und ist bei Erzeugen und Prüfen verschieden, der Cache würde nur Schreibaufschlag kosten.

    Gestreamt, damit die Verbindung während Claude nachdenkt nicht still steht und von Router
    oder VPN gekappt wird. Bricht sie trotzdem ab, versuchen wir es mit wachsender Pause erneut.
    """
    import anthropic

    for versuch in range(1, VERSUCHE + 1):
        try:
            with client.beta.messages.stream(
                model=MODEL,
                max_tokens=32000,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system=SYSTEM,
                output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Wochennotiz:\n\n{notiz_text}"},
                        {"type": "text", "text": aufgabe},
                    ],
                }],
            ) as stream:
                resp = stream.get_final_message()
            break
        except anthropic.APIConnectionError:
            if versuch == VERSUCHE:
                raise Verbindung(f"Verbindung {VERSUCHE} Mal unterbrochen")
            pause = 10 * versuch
            print(f"  Verbindung unterbrochen, neuer Versuch in {pause} Sekunden")
            time.sleep(pause)
    kosten.add(resp.usage)
    if resp.stop_reason == "refusal":
        raise Abgelehnt("Claude hat die Anfrage abgelehnt")
    if resp.stop_reason == "max_tokens":
        raise Abgelehnt("Antwort war zu lang und wurde abgeschnitten")
    text = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text)


def erzeuge(client, notiz, single: int, multiple: int, kosten: Kosten) -> tuple[list[Frage], list[tuple[str, str]]]:
    """Fragen erzeugen und prüfen. Gibt behaltene Fragen und (Frage, Grund) für verworfene zurück."""
    roh = frage_claude(client, notiz.text, AUFGABE_ERZEUGEN.format(single=single, multiple=multiple),
                       SCHEMA_FRAGEN, "high", kosten)["fragen"]
    verworfen, kandidaten = [], []
    for f in roh:
        grund = strukturfehler(f)
        if grund:
            verworfen.append((f["frage"], grund))
        else:
            kandidaten.append(f)
    if not kandidaten:
        return [], verworfen

    nummeriert = "\n\n".join(
        f"Nr. {i}: ({f['typ']}) {f['frage']}\n"
        + "\n".join(f"  [{'x' if j in f['richtig'] else ' '}] {a}" for j, a in enumerate(f["antworten"]))
        + f"\n  Begründung: {f['begruendung']}\n  Quelle: {f['quelle_datei']} S. {f['quelle_seite']}"
        for i, f in enumerate(kandidaten, start=1)
    )
    seiten = sorted({(f["quelle_datei"], f["quelle_seite"]) for f in kandidaten})
    folien = "\n\n".join(
        f"### {d} S. {s}\n{folienseite(d, s) or '(Folientext nicht gefunden)'}" for d, s in seiten
    )
    urteile = frage_claude(client, notiz.text, AUFGABE_PRUEFEN.format(fragen=nummeriert, folien=folien),
                           SCHEMA_URTEILE, "medium", kosten)["urteile"]
    ok = {u["nr"] for u in urteile if u["urteil"] == "ok"}
    gruende = {u["nr"]: u["grund"] for u in urteile}

    behalten = []
    for i, f in enumerate(kandidaten, start=1):
        if i in ok:
            behalten.append(Frage(notiz.modul, notiz.woche, notiz.notiz, f["typ"], f["frage"].strip(),
                                  [a.strip() for a in f["antworten"]], f["richtig"], f["begruendung"].strip(),
                                  Path(f["quelle_datei"]).name, f["quelle_seite"]))
        else:
            verworfen.append((f["frage"], f"Prüfung: {gruende.get(i, 'kein Urteil')}"))
    return behalten, verworfen


class Generator(Supabase):
    def bearbeitete_notizen(self) -> set[str]:
        r = self._check(self.s.get(f"{self.url}/rest/v1/items", params={
            "select": "origin_ref", "origin": "eq.generator", "limit": 10000}, timeout=30))
        return {row["origin_ref"] for row in r.json()}

    def als_entwuerfe(self, fragen: list[Frage]) -> int:
        """Legt Entwürfe samt Lernstand an. Schon vorhandene Fragen (gleicher Hash) werden übersprungen."""
        if not fragen:
            return 0
        r = self._check(self.s.post(
            f"{self.url}/rest/v1/items", params={"on_conflict": "user_id,content_hash", "select": "id"},
            json=[f.als_zeile() for f in fragen],
            headers={"Prefer": "return=representation,resolution=ignore-duplicates"}, timeout=60))
        neu = r.json()
        if neu:
            self._check(self.s.post(f"{self.url}/rest/v1/card_states",
                                    json=[{"item_id": row["id"]} for row in neu], timeout=60))
        return len(neu)


def zeige(f: Frage) -> None:
    art = "Single Choice" if f.typ == "single_choice" else "Mehrfachauswahl"
    print(f"\n  [{art}] {f.frage}")
    for j, a in enumerate(f.antworten):
        print(f"    [{'x' if j in f.richtig else ' '}] {a}")
    print(f"    Begründung: {f.begruendung}")
    print(f"    Quelle: {f.quelle_datei} S. {f.quelle_seite}")


def main() -> int:
    p = argparse.ArgumentParser(description="Auswahlfragen aus Wochennotizen mit Claude erzeugen")
    p.add_argument("--modul", help="nur dieses Modul (Kürzel, z. B. MAK)")
    p.add_argument("--notiz", help='nur Notizen, deren Name so beginnt, z. B. "MAK W03"')
    p.add_argument("--schreiben", action="store_true", help="Fragen als Entwürfe in Supabase anlegen")
    p.add_argument("--neu", action="store_true", help="auch Notizen bearbeiten, zu denen es schon Fragen gibt")
    args = p.parse_args()

    cfg = yaml.safe_load((PROJECT_DIR / "config.yaml").read_text(encoding="utf-8"))
    vault = Path(cfg["vault"]).expanduser()
    notizen = [n for n in (parse_note(pf, vault) for pf in find_notes(vault, args.modul, args.notiz)) if n]
    if not notizen:
        print("Keine passenden Wochennotizen gefunden.")
        return 1

    if not args.schreiben and not (args.modul or args.notiz):
        gesamt = 0
        for n in notizen:
            s, m = anzahl(cfg, n.modul)
            gesamt += s + m
            print(f"{n.modul} W{n.woche:02d} {n.titel}: {s} Single Choice, {m} Mehrfachauswahl")
        print(f"\n{len(notizen)} Notizen, bis zu {gesamt} Fragen, geschätzt etwa {len(notizen) * 0.15:.2f} Dollar.")
        print('Probelauf mit API für eine Notiz: --notiz "MAK W03". Anlegen als Entwürfe: --schreiben')
        return 0

    from dotenv import load_dotenv
    import anthropic

    load_dotenv(PROJECT_DIR / ".env")
    try:
        # Mehr Wiederholungen beim Verbindungsaufbau als die zwei des SDK
        client = anthropic.Anthropic(max_retries=4)
    except anthropic.AnthropicError:
        sys.exit("ANTHROPIC_API_KEY fehlt in .env (siehe .env.example).")

    db = None
    if args.schreiben:
        db = Generator()
        if not args.neu:
            fertig = db.bearbeitete_notizen()
            uebersprungen = [n for n in notizen if n.notiz in fertig]
            notizen = [n for n in notizen if n.notiz not in fertig]
            if uebersprungen:
                print(f"{len(uebersprungen)} Notizen haben schon Fragen und werden übersprungen (--neu erzwingt).")

    kosten = Kosten()
    behalten_gesamt = verworfen_gesamt = angelegt = 0
    fehlgeschlagen: list[str] = []
    for n in notizen:
        s, m = anzahl(cfg, n.modul)
        if s + m == 0:
            continue
        print(f"\n{n.modul} W{n.woche:02d} {n.titel}")
        try:
            behalten, verworfen = erzeuge(client, n, s, m, kosten)
        except Abgelehnt as e:
            print(f"  übersprungen: {e}")
            fehlgeschlagen.append(f"{n.modul} W{n.woche:02d} ({e})")
            continue
        except Verbindung as e:
            print(f"  übersprungen: {e}")
            fehlgeschlagen.append(f"{n.modul} W{n.woche:02d} (Verbindung)")
            continue
        except anthropic.AuthenticationError:
            sys.exit("Der API-Schlüssel wird nicht angenommen. Prüfe ANTHROPIC_API_KEY in .env.")
        except anthropic.APIStatusError as e:
            print(f"  übersprungen: API-Fehler {e.status_code}: {e.message}")
            fehlgeschlagen.append(f"{n.modul} W{n.woche:02d} (API-Fehler {e.status_code})")
            continue
        for f in behalten:
            zeige(f)
        for frage, grund in verworfen:
            print(f"\n  Verworfen ({grund}): {frage[:140]}")
        behalten_gesamt += len(behalten)
        verworfen_gesamt += len(verworfen)
        if db:
            angelegt += db.als_entwuerfe(behalten)
        print(f"\n  Bisherige Kosten: {kosten.dollar:.2f} Dollar")

    print(f"\nFragen behalten: {behalten_gesamt}, verworfen: {verworfen_gesamt}")
    print(f"Token: {kosten.input} Eingabe, {kosten.cache_write} in den Cache, {kosten.cache_read} aus dem Cache, "
          f"{kosten.output} Ausgabe. Kosten: {kosten.dollar:.2f} Dollar")
    if fehlgeschlagen:
        print(f"Nicht bearbeitet: {', '.join(fehlgeschlagen)}")
        if db:
            print("Ein erneuter Aufruf mit --schreiben holt nur diese Notizen nach.")
    if db:
        print(f"Als Entwürfe angelegt: {angelegt}. Freigeben in der App unter \"Entwürfe prüfen\".")
    else:
        print("Probelauf, nichts geschrieben. Zum Anlegen als Entwürfe mit --schreiben aufrufen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
