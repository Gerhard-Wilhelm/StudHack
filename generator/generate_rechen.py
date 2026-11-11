"""Macht aus den Übungsaufgaben der Wochennotizen Rechenaufgaben mit Zahleneingabe und legt sie als Entwürfe an.

Es entstehen keine neuen Aufgaben. Der Generator zerlegt den Abschnitt "Übungsaufgaben" selbst in
Aufgaben und Teile (Text bis zu einem Lösungs-Callout plus das Callout). Claude sagt nur, welche Teile
eine Rechenaufgabe bilden und welche Endergebnisse du in der App eintippst. Frage und Lösung kopiert der
Generator wörtlich aus der Notiz, das spart den größten Teil der Ausgabe-Token.

Pro Notiz zwei Aufrufe an Claude Sonnet 5.5:
  1. Auswählen:  Aufgaben mit Zahlenergebnis, Eingabefelder mit Sollwert und Toleranz, fehlende Angaben
  2. Prüfen:     jeder Sollwert gegen die Lösung in der Notiz, Durchgefallenes fliegt raus

Module mit "rechenaufgaben: false" in config.yaml werden übersprungen (z. B. WiPo).

Aufruf (im Ordner Lernassistent):
  .venv/bin/python -m generator.generate_rechen                          # nur auflisten, keine API-Kosten
  .venv/bin/python -m generator.generate_rechen --notiz "IuF W04"        # Probelauf mit API, schreibt nichts
  .venv/bin/python -m generator.generate_rechen --modul STA1 --schreiben  # als Entwürfe anlegen
  .venv/bin/python -m generator.generate_rechen --schreiben              # alle Notizen ohne Rechenaufgaben

Mit --schreiben werden Notizen übersprungen, zu denen es schon Rechenaufgaben gibt
(außer mit --neu). Die Entwürfe gibst du in der App frei. ANTHROPIC_API_KEY steht in .env.
"""

import argparse
import hashlib
import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from generator.generate_mc import Abgelehnt, Kosten, Verbindung, folienseite, frage_claude
from importer.import_lesemodus import parse_note
from importer.import_notes import PROJECT_DIR, Supabase, find_notes

MAX_FELDER = 4
# Großzügig, damit auch Notizen mit 30 und mehr Übungsaufgaben nicht abgeschnitten werden
MAX_AUSGABE = 64000
# Grobe Schätzung pro Notiz für die Auflistung, der Probelauf zeigt die echten Kosten
DOLLAR_JE_NOTIZ = 0.10

SYSTEM = """Du bereitest Übungsaufgaben für die Klausurvorbereitung eines Studenten der \
Wirtschaftswissenschaften an der Martin-Luther-Universität Halle-Wittenberg als Rechenaufgaben \
mit Zahleneingabe auf und prüfst sie.

Grundlage ist ausschließlich seine Wochennotiz zu einer Vorlesung. Sie ist aus den Folien und \
Übungsblättern zusammengefasst, jede Aussage trägt einen Quellenverweis auf die PDF-Seite im Format \
[[Datei.pdf#page=N|Kürzel S. N]]. Aufgaben und Lösungen, die als "KI-Aufgabe", "KI-Lösung" oder \
"KI-Rechnung" markiert sind, stammen nicht aus dem Material. Diese Kennzeichnung bleibt erhalten.

Schreibstil: Deutsch, duzen, keine Emojis, keine Gedankenstriche. Formeln in LaTeX mit $...$ und $$...$$. \
Begriffe, Notation und Formelschreibweise genau wie in der Notiz, damit sie zur Klausur passen."""

AUFGABE_UEBERNEHMEN = """Unten steht der Abschnitt "Übungsaufgaben" dieser Wochennotiz, zerlegt in \
nummerierte Aufgaben. Jede Aufgabe hat einen oder mehrere Teile, markiert als [Teil N.k]: Aufgabentext \
bis zu einem Lösungs-Callout, dann die Lösung. Text ohne Markierung ist Vorspann oder Kontext.

Wähle jede Aufgabe, deren Lösung mindestens ein Zahlenergebnis hat, als Rechenaufgabe.

- Erfinde keine neuen Aufgaben. Aufgaben ohne Zahlenergebnis (nur Zuordnen, Begründen, Buchungssätze, \
Diagramme, Auswahlfragen, Essay) lässt du weg.
- aufgabe und teile: Nummer der Aufgabe und die Teile, die zusammen die Rechenaufgabe bilden. Gehören \
mehrere Teile zu einer Aufgabe mit a), b), c), nimm alle, die zusammengehören. Stehen unter einer \
Überschrift mehrere eigenständige Aufgaben, wird jede eine eigene Rechenaufgabe. Die Frage besteht \
später aus dem Titel und den Aufgabentexten der gewählten Teile, die Lösung aus deren Lösungen, beides wörtlich.
- zusatz: nur Angaben, die zum Lösen fehlen, weil sie in der Notiz in einem Vorspann, einer früheren \
Aufgabe oder einem nicht gewählten Teil stehen, und Fragen nach Feldern, die der Aufgabentext nicht \
stellt. Ein bis drei Sätze, mit Zahlen genau wie in der Notiz. Sonst leer lassen.
- eingaben: ein bis {max} Felder für die Endergebnisse, auf die es in der Klausur ankommt, in der \
Reihenfolge der Teilaufgaben. Nur Ergebnisse, nach denen der Aufgabentext fragt. Fragt er nicht \
ausdrücklich danach (etwa "Prüfe, ob ..."), schreib die Frage in zusatz, z. B. "Gib außerdem den \
internen Zinssatz in % an." Keine Zwischenergebnisse, außer eine Teilaufgabe fragt genau danach. \
Hat eine Aufgabe mehr als {max} solche Ergebnisse, bilde mehrere Rechenaufgaben aus denselben oder \
verschiedenen Teilen, jede mit eigenen Feldern.
  - label: kurz, mit Teilaufgabe, z. B. "a) Kapitalwert" oder "Median".
  - wert: das Ergebnis aus der Lösung als Zahl mit Punkt als Dezimaltrennzeichen. \
Bei Prozent der Prozentwert (5,25 % ist 5.25).
  - toleranz: erlaubte Abweichung, damit Rundung akzeptiert wird: eine halbe Einheit der letzten \
Stelle, mit der die Lösung das Ergebnis angibt (1102,50 ergibt 0.005, 0,33 ergibt 0.005). \
Hängt das Ergebnis an gerundeten Zwischenwerten, großzügiger, höchstens 1 % des Werts. \
Bei Stückzahlen und anderen ganzen Zahlen 0.
  - einheit: "€", "%", "Stück", "Jahre" und so weiter, leer wenn es keine gibt.
- quelle_datei und quelle_seite: aus dem Verweis, der die Aufgabe belegt (Übungsblatt oder Folie). \
Dateiname genau wie im Verweis, ohne Ordner. Die Seite ist die PDF-Seite aus "#page=N"."""

AUFGABE_PRUEFEN = """Prüfe die folgenden Rechenaufgaben zu dieser Wochennotiz streng, jede einzeln:

1. Stimmt jeder Sollwert mit dem Ergebnis in der Lösung der Notiz überein? Rechne nach.
2. Ist die Aufgabe mit den Angaben in der Frage allein lösbar, und fragt sie nach jedem Feld?
3. Passt die Toleranz: Rundung akzeptiert, aber kein falsches Ergebnis? Passt die Einheit?
4. Steht die Aufgabe so in der Notiz (nicht neu erfunden), und passt die Quelle?

So sind Felder und Quellen gemeint, das ist kein Grund zum Verwerfen:
- Bei der Einheit "%" ist der Wert immer der Prozentwert und die Toleranz in Prozentpunkten \
(Wert 20, Toleranz 0.005 heißt 20 % ± 0,005 Prozentpunkte). Die App nimmt auch den Anteil (0,2) an.
- Nicht jede Teilaufgabe braucht ein Feld. Teile mit Textantwort (Entscheidung, Begründung) \
beantwortet die Lösung.
- Aufgaben mit "KI-Aufgabe" im Titel oder dahinter sind in der Notiz selbst erstellte Übungen. Ihre Quelle belegt \
das Verfahren oder die Formel, nicht die Zahlen der Aufgabe.

Urteil "ok" nur, wenn alle vier Punkte erfüllt sind, sonst "verwerfen". Begründe jedes Urteil in einem Satz.

Rechenaufgaben:
{aufgaben}

Text der zitierten Seiten:
{folien}"""

SCHEMA_AUFGABEN = {
    "type": "object",
    "properties": {
        "aufgaben": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "aufgabe": {"type": "integer"},
                    "teile": {"type": "array", "items": {"type": "integer"}},
                    "zusatz": {"type": "string"},
                    "eingaben": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string"},
                                "wert": {"type": "number"},
                                "toleranz": {"type": "number"},
                                "einheit": {"type": "string"},
                            },
                            "required": ["label", "wert", "toleranz", "einheit"],
                            "additionalProperties": False,
                        },
                    },
                    "quelle_datei": {"type": "string"},
                    "quelle_seite": {"type": "integer"},
                },
                "required": ["aufgabe", "teile", "zusatz", "eingaben", "quelle_datei", "quelle_seite"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["aufgaben"],
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

ABSCHNITT = re.compile(r"^## (.+?)\s*$", re.MULTILINE)
# Kopf einer Aufgabe: Überschrift ### bis ##### oder eine Zeile, die ganz fett ist
KOPF = re.compile(r"^(?:#{3,5} (?P<h>.+?)|\*\*(?P<b>[^*\n]{3,120})\*\*)\s*$", re.MULTILINE)
LOESUNG = re.compile(r"^> ?\[!question\][^\n]*$", re.MULTILINE)


@dataclass
class Teil:
    text: str
    loesung: str


@dataclass
class Aufgabe:
    nr: int
    titel: str
    teile: list[Teil]
    # Steht "KI-Ergänzung" oder "KI-Aufgabe" nur im Vorspann darüber, nicht im Titel
    ki: bool = False

    @property
    def kopf(self) -> str:
        """Erste Zeile der Frage. Macht KI-Aufgaben auch dann kenntlich, wenn nur der Vorspann es sagt."""
        return f"**{self.titel}** (KI-Aufgabe)" if self.ki and "KI" not in self.titel else f"**{self.titel}**"


KI = re.compile(r"KI-(?:Ergänzung|Aufgabe)")
# Ein Vorspann, der auch Aufgaben aus dem Material ankündigt ("Aufgaben 1 bis 3 stammen aus den Folien"),
# kennzeichnet nicht pauschal. "Aufgaben sind KI-Ergänzung, nicht aus den Folien" und "die Verfahren
# stammen aus den Folien" zählen nicht als solcher Hinweis.
GEMISCHT = re.compile(r"Aufgaben?\b[^.]{0,40}?(?<!nicht )(?:stammen aus|aus den Folien)")


def ki_hinweis(text: str) -> bool:
    return bool(KI.search(text)) and not GEMISCHT.search(text)


@dataclass
class Rechenaufgabe:
    modul: str
    woche: int
    notiz: str
    frage: str
    loesung: str
    eingaben: list[dict]
    quelle_datei: str
    quelle_seite: int
    # Wörtlicher Aufgabentext der gewählten Teile, ohne Titel und Zusatz. Erkennt beim Nachziehen
    # mit --neu Aufgaben, die schon angelegt sind, auch wenn Claude den Zusatz anders formuliert.
    kern: str = ""
    hash: str = field(init=False)

    def __post_init__(self):
        normiert = " ".join(self.frage.split())
        self.hash = hashlib.sha256(f"{self.modul}|rechenaufgabe|{normiert}".encode()).hexdigest()

    def als_zeile(self) -> dict:
        return {
            "module": self.modul,
            "week": self.woche,
            "type": "rechenaufgabe",
            "question": self.frage,
            "answer": self.loesung,
            "eingaben": self.eingaben,
            "source_file": self.quelle_datei,
            "source_page": self.quelle_seite,
            "origin": "generator",
            "origin_ref": self.notiz,
            "content_hash": self.hash,
            "status": "entwurf",
        }


def aktiv(cfg: dict, modul: str) -> bool:
    """Rechenaufgaben für dieses Modul? Standard ja, aus mit "rechenaufgaben: false"."""
    return (cfg.get("module", {}).get(modul) or {}).get("rechenaufgaben", True) is not False


def abschnitte(text: str, namen: tuple[str, ...] = ("Formeln und Verfahren", "Übungsaufgaben")) -> str:
    """Nur die Abschnitte, die Claude braucht. Spart Eingabe-Token gegenüber der ganzen Notiz."""
    teile = ABSCHNITT.split(text)
    # teile = [vorspann, titel1, inhalt1, titel2, inhalt2, ...]
    return "\n\n".join(f"## {teile[i]}\n{teile[i + 1].strip()}" for i in range(1, len(teile) - 1, 2)
                       if teile[i] in namen)


def teile_von(block: str) -> list[Teil]:
    """Teile eines Aufgabenblocks: Text bis zum Lösungs-Callout plus dessen Inhalt ohne "> "."""
    teile, rest = [], block
    while (m := LOESUNG.search(rest)):
        text = rest[:m.start()]
        zeilen, ende = [], m.end() + 1
        for zeile in rest[m.end() + 1:].split("\n"):
            if not zeile.startswith(">"):
                break
            zeilen.append(re.sub(r"^> ?", "", zeile))
            ende += len(zeile) + 1
        teile.append(Teil(text.strip(), "\n".join(zeilen).strip()))
        rest = rest[ende:]
    return teile


def zerlege(abschnitt: str) -> tuple[list[Aufgabe], str]:
    """Zerlegt den Abschnitt Übungsaufgaben in nummerierte Aufgaben mit Lösungen.

    Gibt die Aufgaben und den Abschnitt mit Markierungen [Aufgabe N] und [Teil N.k] für Claude zurück.
    Blöcke ohne Lösung (Vorspann, Hinweise auf andere Wochen) bleiben als Kontext im Text.
    """
    koepfe = list(KOPF.finditer(abschnitt))
    stuecke = [abschnitt[:koepfe[0].start()] if koepfe else abschnitt]
    # Ein Vorspann oder Zwischenblock ohne Lösung gilt für die Aufgaben darunter, bis zum nächsten
    ki = ki_hinweis(stuecke[0])
    aufgaben: list[Aufgabe] = []
    for i, k in enumerate(koepfe):
        block = abschnitt[k.end():koepfe[i + 1].start() if i + 1 < len(koepfe) else len(abschnitt)]
        titel = (k.group("h") or k.group("b")).strip()
        teile = teile_von(block)
        if not teile:
            stuecke.append(abschnitt[k.start():k.end()] + block)
            ki = ki_hinweis(titel + block)
            continue
        nr = len(aufgaben) + 1
        aufgaben.append(Aufgabe(nr, titel, teile, ki))
        markiert = [f"[Aufgabe {nr}] {aufgaben[-1].kopf.strip('*').replace('** (', ' (')}"]
        for j, t in enumerate(teile, start=1):
            markiert.append(f"[Teil {nr}.{j}]\n{t.text}\nLösung:\n{t.loesung}")
        stuecke.append("\n\n".join(markiert) + "\n\n")
    return aufgaben, "".join(stuecke).strip()


def kern(a: dict, aufgaben: list[Aufgabe]) -> str:
    """Wörtlicher Text der gewählten Teile, siehe Rechenaufgabe.kern."""
    teile = aufgaben[a["aufgabe"] - 1].teile
    return "\n\n".join(teile[k - 1].text for k in sorted(set(a["teile"])) if teile[k - 1].text)


def baue(a: dict, aufgaben: list[Aufgabe]) -> tuple[str, str]:
    """Frage und Lösung aus den gewählten Teilen, wörtlich aus der Notiz."""
    aufgabe = aufgaben[a["aufgabe"] - 1]
    teile = [aufgabe.teile[k - 1] for k in sorted(set(a["teile"]))]
    frage = "\n\n".join(x for x in [aufgabe.kopf, a["zusatz"].strip(), *(t.text for t in teile)] if x)
    return frage, "\n\n".join(t.loesung for t in teile if t.loesung)


def strukturfehler(a: dict, aufgaben: list[Aufgabe]) -> str | None:
    """Was das JSON-Format nicht erzwingen kann, prüfen wir hier."""
    if not 1 <= a["aufgabe"] <= len(aufgaben):
        return f"Aufgabe {a['aufgabe']} gibt es nicht"
    anzahl = len(aufgaben[a["aufgabe"] - 1].teile)
    if not a["teile"] or any(not 1 <= k <= anzahl for k in a["teile"]):
        return f"ungültige Teile {a['teile']} bei Aufgabe {a['aufgabe']}"
    frage, loesung = baue(a, aufgaben)
    if not loesung:
        return "Lösung leer"
    felder = a["eingaben"]
    if not 1 <= len(felder) <= MAX_FELDER:
        return f"nicht 1 bis {MAX_FELDER} Eingabefelder"
    for e in felder:
        if not e["label"].strip():
            return "Feld ohne Beschriftung"
        if not math.isfinite(e["wert"]) or not math.isfinite(e["toleranz"]) or e["toleranz"] < 0:
            return "ungültiger Sollwert oder Toleranz"
    if len({e["label"].strip() for e in felder}) != len(felder):
        return "doppelte Beschriftung"
    if a["quelle_seite"] < 1 or not a["quelle_datei"].lower().endswith(".pdf"):
        return "Quelle fehlt"
    return None


def max_toleranz(wert: float) -> float:
    """Höchstens 2 % des Werts oder 0,01. Großzügiger als im Auftrag an Claude (1 %), damit Rundung
    aus Zwischenwerten durchgeht, aber eng genug, dass ein falsches Ergebnis nicht als richtig zählt."""
    return max(abs(wert) * 0.02, 0.01)


def felder(a: dict) -> list[dict]:
    """Eingabefelder bereinigt, so wie sie in items.eingaben landen. Zu große Toleranzen werden begrenzt."""
    return [{"label": e["label"].strip(), "wert": e["wert"], "toleranz": min(e["toleranz"], max_toleranz(e["wert"])),
             "einheit": e["einheit"].strip()} for e in a["eingaben"]]


def zahl(x: float) -> str:
    return f"{x:,.6g}".replace(",", " ").replace(".", ",")


def erzeuge(client, notiz, kosten: Kosten) -> tuple[list[Rechenaufgabe], list[tuple[str, str]]]:
    """Aufgaben auswählen und prüfen. Gibt behaltene und (Frage, Grund) für verworfene zurück."""
    aufgaben, markiert = zerlege(abschnitte(notiz.text, ("Übungsaufgaben",)).removeprefix("## Übungsaufgaben").strip())
    if not aufgaben:
        return [], []
    text = "\n\n".join(x for x in [abschnitte(notiz.text, ("Formeln und Verfahren",)),
                                     f"## Übungsaufgaben\n{markiert}"] if x)
    roh = frage_claude(client, text, AUFGABE_UEBERNEHMEN.format(max=MAX_FELDER),
                       SCHEMA_AUFGABEN, "high", kosten, system=SYSTEM, max_tokens=MAX_AUSGABE)["aufgaben"]
    verworfen, kandidaten = [], []
    for a in roh:
        grund = strukturfehler(a, aufgaben)
        if grund:
            verworfen.append((f"Aufgabe {a['aufgabe']}, Teile {a['teile']}", grund))
        else:
            frage, loesung = baue(a, aufgaben)
            kandidaten.append({**a, "frage": frage, "loesung": loesung, "kern": kern(a, aufgaben)})
    if not kandidaten:
        return [], verworfen

    nummeriert = "\n\n".join(
        f"Nr. {i}: {a['frage']}\n"
        + "\n".join(f"  Feld {e['label']}: {e['wert']} {e['einheit']} (Toleranz {e['toleranz']})"
                    for e in a["eingaben"])
        + f"\n  Quelle: {a['quelle_datei']} S. {a['quelle_seite']}"
        for i, a in enumerate(kandidaten, start=1)
    )
    seiten = sorted({(a["quelle_datei"], a["quelle_seite"]) for a in kandidaten})
    folien = "\n\n".join(
        f"### {d} S. {s}\n{folienseite(d, s) or '(Text nicht gefunden)'}" for d, s in seiten
    )
    urteile = frage_claude(client, text, AUFGABE_PRUEFEN.format(aufgaben=nummeriert, folien=folien),
                           SCHEMA_URTEILE, "medium", kosten, system=SYSTEM)["urteile"]
    ok = {u["nr"] for u in urteile if u["urteil"] == "ok"}
    gruende = {u["nr"]: u["grund"] for u in urteile}

    behalten = []
    for i, a in enumerate(kandidaten, start=1):
        if i in ok:
            behalten.append(Rechenaufgabe(notiz.modul, notiz.woche, notiz.notiz, a["frage"], a["loesung"],
                                          felder(a), Path(a["quelle_datei"]).name, a["quelle_seite"],
                                          a["kern"]))
        else:
            verworfen.append((a["frage"], f"Prüfung: {gruende.get(i, 'kein Urteil')}"))
    return behalten, verworfen


class Generator(Supabase):
    def bearbeitete_notizen(self) -> set[str]:
        r = self._check(self.s.get(f"{self.url}/rest/v1/items", params={
            "select": "origin_ref", "origin": "eq.generator", "type": "eq.rechenaufgabe",
            "limit": 10000}, timeout=30))
        return {row["origin_ref"] for row in r.json()}

    def vorhandene_fragen(self, notiz: str) -> list[str]:
        """Fragen der Rechenaufgaben, die zu dieser Notiz schon angelegt sind (jeder Status)."""
        r = self._check(self.s.get(f"{self.url}/rest/v1/items", params={
            "select": "question", "origin": "eq.generator", "type": "eq.rechenaufgabe",
            "origin_ref": f"eq.{notiz}", "limit": 1000}, timeout=30))
        return [row["question"] for row in r.json()]

    def als_entwuerfe(self, aufgaben: list[Rechenaufgabe]) -> int:
        """Legt Entwürfe samt Lernstand an. Schon vorhandene Aufgaben (gleicher Hash) werden übersprungen."""
        if not aufgaben:
            return 0
        r = self._check(self.s.post(
            f"{self.url}/rest/v1/items", params={"on_conflict": "user_id,content_hash", "select": "id"},
            json=[a.als_zeile() for a in aufgaben],
            headers={"Prefer": "return=representation,resolution=ignore-duplicates"}, timeout=60))
        neu = r.json()
        if neu:
            self._check(self.s.post(f"{self.url}/rest/v1/card_states",
                                    json=[{"item_id": row["id"]} for row in neu], timeout=60))
        return len(neu)


def zeige(a: Rechenaufgabe) -> None:
    print(f"\n  [Rechenaufgabe] {a.frage[:300]}")
    for e in a.eingaben:
        print(f"    {e['label']}: {zahl(e['wert'])} {e['einheit']} (± {zahl(e['toleranz'])})")
    print(f"    Quelle: {a.quelle_datei} S. {a.quelle_seite}")


def main() -> int:
    p = argparse.ArgumentParser(description="Rechenaufgaben aus den Übungsaufgaben der Wochennotizen")
    p.add_argument("--modul", help="nur dieses Modul (Kürzel, z. B. IuF)")
    p.add_argument("--notiz", help='nur Notizen, deren Name so beginnt, z. B. "IuF W04"')
    p.add_argument("--schreiben", action="store_true", help="Aufgaben als Entwürfe in Supabase anlegen")
    p.add_argument("--neu", action="store_true", help="auch Notizen bearbeiten, zu denen es schon Rechenaufgaben gibt")
    args = p.parse_args()

    cfg = yaml.safe_load((PROJECT_DIR / "config.yaml").read_text(encoding="utf-8"))
    vault = Path(cfg["vault"]).expanduser()
    notizen = [n for n in (parse_note(pf, vault) for pf in find_notes(vault, args.modul, args.notiz)) if n]
    # Ohne Übungsaufgaben oder bei abgeschaltetem Modul gibt es nichts zu tun, also auch keine API-Kosten
    notizen = [n for n in notizen if aktiv(cfg, n.modul) and "## Übungsaufgaben" in abschnitte(n.text)]
    if not notizen:
        print("Keine passenden Wochennotizen mit Übungsaufgaben gefunden.")
        return 1

    if not args.schreiben and not (args.modul or args.notiz):
        for n in notizen:
            print(f"{n.modul} W{n.woche:02d} {n.titel}")
        print(f"\n{len(notizen)} Notizen mit Übungsaufgaben, geschätzt etwa "
              f"{len(notizen) * DOLLAR_JE_NOTIZ:.2f} Dollar.")
        print('Probelauf mit API für eine Notiz: --notiz "IuF W04". Anlegen als Entwürfe: --schreiben')
        return 0

    from dotenv import load_dotenv
    import anthropic

    load_dotenv(PROJECT_DIR / ".env")
    try:
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
                print(f"{len(uebersprungen)} Notizen haben schon Rechenaufgaben und werden übersprungen (--neu erzwingt).")

    kosten = Kosten()
    behalten_gesamt = verworfen_gesamt = angelegt = 0
    fehlgeschlagen: list[str] = []
    for n in notizen:
        print(f"\n{n.modul} W{n.woche:02d} {n.titel}")
        try:
            behalten, verworfen = erzeuge(client, n, kosten)
        except (Abgelehnt, Verbindung) as e:
            print(f"  übersprungen: {e}")
            fehlgeschlagen.append(f"{n.modul} W{n.woche:02d} ({e})")
            continue
        except anthropic.AuthenticationError:
            sys.exit("Der API-Schlüssel wird nicht angenommen. Prüfe ANTHROPIC_API_KEY in .env.")
        except anthropic.APIStatusError as e:
            print(f"  übersprungen: API-Fehler {e.status_code}: {e.message}")
            fehlgeschlagen.append(f"{n.modul} W{n.woche:02d} (API-Fehler {e.status_code})")
            continue
        for a in behalten:
            zeige(a)
        for frage, grund in verworfen:
            print(f"\n  Verworfen ({grund}): {frage[:140]}")
        behalten_gesamt += len(behalten)
        verworfen_gesamt += len(verworfen)
        if db and args.neu:
            vorhanden = db.vorhandene_fragen(n.notiz)
            neu = [a for a in behalten if not any(a.kern and a.kern in q for q in vorhanden)]
            if len(neu) < len(behalten):
                print(f"\n  {len(behalten) - len(neu)} schon vorhanden, werden nicht doppelt angelegt")
            behalten = neu
        if db:
            angelegt += db.als_entwuerfe(behalten)
        print(f"\n  Bisherige Kosten: {kosten.dollar:.2f} Dollar")

    print(f"\nRechenaufgaben behalten: {behalten_gesamt}, verworfen: {verworfen_gesamt}")
    print(f"Token: {kosten.input} Eingabe, {kosten.output} Ausgabe. Kosten: {kosten.dollar:.2f} Dollar")
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
