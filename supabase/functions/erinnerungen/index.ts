// Edge Function erinnerungen: verschickt Mitteilungen per Web-Push.
//
// Zwei Aufrufe:
//   Zeitplan (pg_cron, alle 5 Minuten) mit Kopfzeile x-cron-secret: prüft die Regeln
//     aus regeln.ts für jeden Nutzer mit Gerät und schickt, was fällig ist.
//   App mit Anmeldung und {"test": true}: schickt eine Testmitteilung an die eigenen Geräte.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET.
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
// Hochladen ohne JWT-Prüfung, weil der Zeitplan kein Nutzer-Token hat:
//   npx supabase functions deploy erinnerungen --no-verify-jwt --project-ref <PROJEKT>

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import webpush from 'npm:web-push@3.6.7'
import { faelligeMitteilungen, naechsteWoche, ortszeit, type Block, type Lage, type Mitteilung, type Prefs } from './regeln.ts'

interface Geraet {
  id: number
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  prefs: Prefs
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function env(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Secret ${name} fehlt`)
  return v
}

/** Holt alle Zeilen, auch über die Grenze von 1000 pro Abfrage hinaus. */
async function alle<T>(abfrage: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let von = 0; ; von += 1000) {
    const { data, error } = await abfrage(von, von + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

async function lage(sb: SupabaseClient, userId: string, jetzt: Date): Promise<Lage> {
  const { tag, wochentag } = ortszeit(jetzt)
  const woche = naechsteWoche(tag, wochentag)

  const [blocks, naechste, module, faellige, entwuerfe] = await Promise.all([
    sb.from('study_blocks').select('id, module, day, start_time, duration_min, done').eq('user_id', userId).eq('day', tag),
    sb.from('study_blocks').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('day', woche.von).lte('day', woche.bis),
    sb.from('modules').select('module, exam_date').eq('user_id', userId),
    alle<{ items: { module: string } }>((von, bis) =>
      sb.from('card_states').select('items!inner(module)').eq('user_id', userId).neq('state', 0)
        .lte('due', jetzt.toISOString()).eq('items.status', 'freigegeben').range(von, bis) as never),
    sb.from('items').select('id').eq('user_id', userId).eq('status', 'entwurf').order('id', { ascending: false }),
  ])
  for (const r of [blocks, naechste, module, entwuerfe]) if (r.error) throw r.error

  // Module nach ihrer Klausur zählen nicht mehr mit (wie in der App)
  const geschrieben = new Set((module.data ?? []).filter((m) => m.exam_date && m.exam_date < tag).map((m) => m.module))
  const faellig: Record<string, number> = {}
  for (const f of faellige) {
    const m = f.items.module
    if (!geschrieben.has(m)) faellig[m] = (faellig[m] ?? 0) + 1
  }

  return {
    blocks: (blocks.data ?? []) as Block[],
    naechsteWocheGeplant: (naechste.count ?? 0) > 0,
    faellig,
    entwuerfe: { anzahl: entwuerfe.data?.length ?? 0, neuesteId: entwuerfe.data?.[0]?.id ?? null },
  }
}

/** Schickt eine Mitteilung an ein Gerät. Gibt false zurück, wenn das Gerät nicht mehr existiert. */
async function senden(sb: SupabaseClient, g: Geraet, m: Pick<Mitteilung, 'title' | 'body' | 'url'> & { tag: string }): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } },
      JSON.stringify(m),
      { TTL: 3600 },
    )
    return true
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await sb.from('push_subscriptions').delete().eq('id', g.id)
      return false
    }
    throw e
  }
}

async function zeitplan(sb: SupabaseClient, jetzt: Date) {
  const { data: geraete, error } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, prefs')
  if (error) throw error
  const proNutzer = new Map<string, Geraet[]>()
  for (const g of (geraete ?? []) as Geraet[]) proNutzer.set(g.user_id, [...(proNutzer.get(g.user_id) ?? []), g])

  const bericht: Record<string, string[]> = {}
  for (const [userId, liste] of proNutzer) {
    const seit = new Date(jetzt.getTime() - 3 * 86_400_000).toISOString()
    const { data: sent, error: e } = await sb.from('push_sent').select('kind, ref').eq('user_id', userId).gte('sent_at', seit)
    if (e) throw e
    const gesendet = new Set((sent ?? []).map((s) => `${s.kind}|${s.ref}`))
    // Erst ohne Schalter prüfen, dann je Gerät nach dessen Schaltern
    const kandidaten = faelligeMitteilungen(jetzt, await lage(sb, userId, jetzt), gesendet)
    bericht[userId] = []
    for (const m of kandidaten) {
      const empfaenger = liste.filter((g) => g.prefs?.[m.art] !== false)
      if (!empfaenger.length) continue
      for (const g of empfaenger) await senden(sb, g, { title: m.title, body: m.body, url: m.url, tag: `${m.art}-${m.ref}` })
      const { error: e2 } = await sb.from('push_sent').upsert({ user_id: userId, kind: m.art, ref: m.ref }, { ignoreDuplicates: true })
      if (e2) throw e2
      bericht[userId].push(`${m.art} ${m.ref}`)
    }
  }
  return bericht
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
    const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

    if (req.headers.get('x-cron-secret') === env('CRON_SECRET')) {
      return antwort({ gesendet: await zeitplan(sb, new Date()) })
    }

    // Testmitteilung aus der App: nur mit gültiger Anmeldung, nur an die eigenen Geräte
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: nutzer } = token ? await sb.auth.getUser(token) : { data: { user: null } }
    if (!nutzer.user) return antwort({ fehler: 'nicht angemeldet' }, 401)
    const { data: geraete, error } = await sb.from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, prefs').eq('user_id', nutzer.user.id)
    if (error) throw error
    let ok = 0
    for (const g of (geraete ?? []) as Geraet[]) {
      if (await senden(sb, g, { title: 'Testmitteilung', body: 'Mitteilungen funktionieren.', url: './', tag: 'test' })) ok++
    }
    return antwort({ geraete: ok })
  } catch (e) {
    console.error(e)
    // Ablehnung des Push-Dienstes (z. B. Apple) mit Code und Grund weitergeben
    const push = e as { statusCode?: number; body?: string }
    const fehler = push.statusCode
      ? `Push-Dienst lehnt ab (${push.statusCode}): ${push.body ?? ''}`.trim()
      : e instanceof Error ? e.message : String(e)
    return antwort({ fehler }, 500)
  }
})
