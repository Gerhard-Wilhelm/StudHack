// Mitteilungen per Web-Push: Gerät anmelden, Schalter speichern, Testmitteilung.
// Nur mit Supabase, nicht im Demo-Modus. Verschickt werden sie von der Edge Function erinnerungen.

import { supabase } from './supabase'

export type Art = 'block' | 'morgen' | 'abend' | 'wochenplan' | 'entwuerfe'
export type Prefs = Record<Art, boolean>

export const ARTEN: { art: Art; label: string; hint: string }[] = [
  { art: 'block', label: 'Lernblock beginnt', hint: '10 Minuten vor jedem Block' },
  { art: 'morgen', label: 'Morgenüberblick', hint: '07:30, Blöcke und Wiederholungen des Tages' },
  { art: 'abend', label: 'Wiederholungen offen', hint: '20:30, nur wenn noch etwas fällig ist' },
  { art: 'wochenplan', label: 'Wochenplan fehlt', hint: 'Sonntag 18:00, wenn die nächste Woche leer ist' },
  { art: 'entwuerfe', label: 'Neue Entwürfe', hint: 'wenn neue Auswahlfragen auf Freigabe warten' },
]

export const ALLE_AN: Prefs = { block: true, morgen: true, abend: true, wochenplan: true, entwuerfe: true }

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushStatus =
  | 'kein-supabase'
  | 'kein-schluessel'
  | 'nicht-unterstuetzt'
  | 'nicht-installiert'
  | 'verweigert'
  | 'aus'
  | 'an'

function unterstuetzt(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function installiert(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

/** Service Worker anmelden. Wird beim Start aufgerufen. */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js').catch(() => undefined)
}

async function abo(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function pushStatus(): Promise<PushStatus> {
  if (!supabase) return 'kein-supabase'
  if (!VAPID_KEY) return 'kein-schluessel'
  if (!unterstuetzt()) return isIOS() && !installiert() ? 'nicht-installiert' : 'nicht-unterstuetzt'
  if (Notification.permission === 'denied') return 'verweigert'
  return (await abo()) ? 'an' : 'aus'
}

function schluessel(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const roh = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(roh.length))
  for (let i = 0; i < roh.length; i++) out[i] = roh.charCodeAt(i)
  return out
}

/** Erlaubnis holen, Gerät beim Push-Dienst anmelden und in Supabase speichern. Muss aus einem Tipp kommen. */
export async function pushEinschalten(): Promise<Prefs> {
  if (!supabase || !VAPID_KEY) throw new Error('Mitteilungen sind nicht eingerichtet.')
  const erlaubnis = await Notification.requestPermission()
  if (erlaubnis !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt.')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluessel(VAPID_KEY) }))
  const json = sub.toJSON()
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }, { onConflict: 'endpoint' })
    .select('prefs')
    .single()
  if (error) throw error
  return { ...ALLE_AN, ...(data?.prefs as Partial<Prefs>) }
}

export async function pushAusschalten(): Promise<void> {
  const sub = await abo()
  if (!sub) return
  if (supabase) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    if (error) throw error
  }
  await sub.unsubscribe()
}

export async function ladePrefs(): Promise<Prefs> {
  const sub = await abo()
  if (!supabase || !sub) return ALLE_AN
  const { data, error } = await supabase.from('push_subscriptions').select('prefs').eq('endpoint', sub.endpoint).maybeSingle()
  if (error) throw error
  return { ...ALLE_AN, ...(data?.prefs as Partial<Prefs> | undefined) }
}

export async function speicherePrefs(prefs: Prefs): Promise<void> {
  const sub = await abo()
  if (!supabase || !sub) return
  const { error } = await supabase.from('push_subscriptions').update({ prefs }).eq('endpoint', sub.endpoint)
  if (error) throw error
}

export async function testmitteilung(): Promise<number> {
  if (!supabase) throw new Error('Nur mit Supabase.')
  const { data, error } = await supabase.functions.invoke<{ geraete?: number; fehler?: string }>('erinnerungen', { body: { test: true } })
  if (error) throw error
  if (data?.fehler) throw new Error(data.fehler)
  return data?.geraete ?? 0
}
