import { useCallback, useEffect } from 'react'
import { NoteBody } from '../components/NoteBody'
import { useKuerzel } from '../lib/kuerzel'
import type { Store } from '../lib/store'
import type { ModuleInfo } from '../lib/types'

export function ModuleInfoView(props: { info: ModuleInfo; store: Store; onBack: () => void }) {
  const kurz = useKuerzel()
  const { store } = props
  const resolveImages = useCallback((paths: string[]) => store.resolveImages(paths), [store])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [props.info])

  return (
    <main className="page week-view">
      <header className="bar">
        <button className="link" onClick={props.onBack}>{kurz(props.info.module)}</button>
      </header>
      <h1 className="title note-title">
        <span className="note-week">Infos zum Modul</span>
        {props.info.name}
      </h1>
      <NoteBody text={props.info.body} resolveImages={resolveImages} />
    </main>
  )
}
