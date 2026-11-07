// Typen passend zu supabase/migrations/20261106120000_lernobjekte.sql

export type ItemType = 'karteikarte' | 'verstaendnisfrage' | 'single_choice' | 'multiple_choice' | 'rechenaufgabe'

export interface Item {
  id: number
  module: string
  week: number | null
  type: ItemType
  question: string
  answer: string
  /** single_choice: correct ist eine Position, multiple_choice: Liste von Positionen (ab 0) */
  options: { choices: string[]; correct: number | number[] } | null
  source_file: string | null
  source_page: number | null
}

/** FSRS-Felder einer Zeile in card_states (ohne item_id und user_id). */
export interface CardStateFields {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: 0 | 1 | 2 | 3
  last_review: string | null
}

export interface StudyCard {
  item: Item
  state: CardStateFields
}

export type Grade = 1 | 2 | 3 | 4

/** Eine Bewertung, wie sie in card_states und reviews geschrieben wird. */
export interface ReviewRecord {
  itemId: number
  state: CardStateFields
  rating: Grade
  durationMs: number
  reviewedAt: string
}

/** Wochennotiz für den Lesemodus, ohne Text. */
export interface NoteSummary {
  id: number
  module: string
  week: number | null
  title: string
}

export interface Note extends NoteSummary {
  body: string
  source_file: string | null
}

/** Modulübersicht aus dem Vault. */
export interface ModuleInfo {
  module: string
  name: string
  body: string
}
