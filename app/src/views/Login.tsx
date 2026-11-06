import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'E-Mail oder Passwort stimmt nicht.'
          : `Anmeldung fehlgeschlagen: ${error.message}`,
      )
    }
  }

  return (
    <main className="page login">
      <h1 className="title">Lernkartei</h1>
      <p className="lead">Melde dich an, um deine Karten abzufragen.</p>

      {supabase ? (
        <form onSubmit={submit} className="form">
          <label>
            E-Mail
            <input type="email" autoComplete="username" inputMode="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Passwort
            <input type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Melde an' : 'Anmelden'}</button>
        </form>
      ) : (
        <p className="note">
          Supabase ist nicht eingerichtet. Lege <code>app/.env.local</code> mit
          VITE_SUPABASE_URL und VITE_SUPABASE_KEY an oder probier die Demo.
        </p>
      )}

      <button className="quiet" onClick={onDemo}>Demo ausprobieren</button>
    </main>
  )
}
