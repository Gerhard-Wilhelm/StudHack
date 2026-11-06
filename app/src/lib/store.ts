import type { ReviewRecord, StudyCard } from './types'

/** Datenquelle der App: Supabase oder Demo. */
export interface Store {
  kind: 'supabase' | 'demo'
  /** Alle freigegebenen Lernobjekte mit Lernstand. */
  loadCards(): Promise<StudyCard[]>
  /** Schreibt eine Bewertung. Wirft nicht, sondern merkt sie sich bei Fehlern. */
  saveReview(r: ReviewRecord): Promise<void>
  /** Anzahl Bewertungen, die noch nicht gespeichert sind. */
  pendingCount(): number
}
