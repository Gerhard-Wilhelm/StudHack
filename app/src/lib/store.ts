import type { ModuleInfo, Note, NoteSummary, ReviewRecord, StudyCard } from './types'

/** Datenquelle der App: Supabase oder Demo. */
export interface Store {
  kind: 'supabase' | 'demo'
  /** Alle freigegebenen Lernobjekte mit Lernstand. */
  loadCards(): Promise<StudyCard[]>
  /** Schreibt eine Bewertung. Wirft nicht, sondern merkt sie sich bei Fehlern. */
  saveReview(r: ReviewRecord): Promise<void>
  /** Anzahl Bewertungen, die noch nicht gespeichert sind. */
  pendingCount(): number
  /** Alle Wochennotizen ohne Text, für Modul- und Wochenlisten. */
  loadNotes(): Promise<NoteSummary[]>
  /** Eine Wochennotiz mit Text. */
  loadNote(id: number): Promise<Note>
  /** Modulübersichten mit vollem Namen. */
  loadModules(): Promise<ModuleInfo[]>
  /** Adressen für Folienbilder, Schlüssel wie in der Notiz (<Kürzel>/<Bild>.jpg). */
  resolveImages(paths: string[]): Promise<Record<string, string>>
}
