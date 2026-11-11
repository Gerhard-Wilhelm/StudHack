import { describe, expect, it } from 'vitest'
import { fehlerText, folienPfade, istOffline, mapAblage, vorladenFaellig } from './offline'
import type { Note } from './types'

const notiz = (id: number, body = ''): Note => ({ id, module: 'IuF', week: 1, title: 'T', body, source_file: null })

describe('Offline-Modus', () => {
  it('merkt sich Notizen und liefert sie zurück', async () => {
    const a = mapAblage()
    await a.schreiben([notiz(1, 'eins'), notiz(2)])
    await a.schreiben([notiz(1, 'neu')])
    expect((await a.lesen(1))?.body).toBe('neu')
    expect(await a.lesen(3)).toBeUndefined()
    expect((await a.alle()).map((n) => n.id).sort()).toEqual([1, 2])
  })

  it('lädt höchstens einmal am Tag vor', () => {
    expect(vorladenFaellig(null, '2026-11-11')).toBe(true)
    expect(vorladenFaellig('2026-11-10', '2026-11-11')).toBe(true)
    expect(vorladenFaellig('2026-11-11', '2026-11-11')).toBe(false)
  })

  it('findet Folienbilder in Notizen ohne Doppelte', () => {
    const texte = ['Text ![Folie 4](folien/IuF/BA02-S04.jpg) und ![x](folien/IuF/BA02-S05.jpg)',
      '![Folie 4](folien/IuF/BA02-S04.jpg) ![extern](https://example.com/a.png)']
    expect(folienPfade(texte)).toEqual(['IuF/BA02-S04.jpg', 'IuF/BA02-S05.jpg'])
  })

  it('erkennt fehlendes Netz und sagt es verständlich', () => {
    expect(istOffline(new Error('irgendwas'), false)).toBe(true)
    expect(istOffline(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(istOffline(new TypeError('Load failed'), true)).toBe(true)
    expect(istOffline({ message: 'TypeError: NetworkError when attempting to fetch resource.' }, true)).toBe(true)
    expect(istOffline(new Error('permission denied for table x'), true)).toBe(false)
    expect(fehlerText(new TypeError('Load failed'), true)).toBe('Keine Verbindung. Das geht nur mit Netz.')
    expect(fehlerText({ message: 'permission denied' }, true)).toBe('permission denied')
  })
})
