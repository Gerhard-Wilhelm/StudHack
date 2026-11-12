// Eigene Kürzel der Module für die Anzeige. Intern bleibt überall das Original-Kürzel der Schlüssel.
import { createContext, useContext } from 'react'

export const KuerzelContext = createContext<Record<string, string>>({})

/** Anzeige-Kürzel eines Moduls: das eigene, sonst das Original. */
export function useKuerzel(): (module: string) => string {
  const eigene = useContext(KuerzelContext)
  return (module) => eigene[module] ?? module
}
