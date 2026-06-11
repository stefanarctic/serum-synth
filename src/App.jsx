import { useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import { SynthEngine, initMidi } from './engine/SynthEngine.js'
import { PatchStore } from './state/store.js'
import { StoreContext, DragProvider } from './state/StoreContext.jsx'
import { FACTORY_PRESETS } from './content/presets.js'
import Header from './ui/Header.jsx'
import Keyboard from './ui/Keyboard.jsx'
import OscPanel from './ui/panels/OscPanel.jsx'
import FxPanel from './ui/panels/FxPanel.jsx'
import MatrixPanel from './ui/panels/MatrixPanel.jsx'
import GlobalPanel from './ui/panels/GlobalPanel.jsx'

const TABS = ['OSC', 'FX', 'MATRIX', 'GLOBAL']

export default function App() {
  const engine = useMemo(() => new SynthEngine(), [])
  const store = useMemo(() => new PatchStore(engine), [engine])
  const [tab, setTab] = useState('OSC')
  const [started, setStarted] = useState(false)
  const [octave, setOctave] = useState(4)
  const initRef = useRef(false)

  // load initial patch once (queued until engine starts)
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    store.load(FACTORY_PRESETS[1]) // Super Saw Lead as a lively default
  }, [store])

  const start = async () => {
    await engine.start()
    setStarted(true)
    await initMidi({
      noteOn: (n, v) => engine.noteOn(n, v),
      noteOff: (n) => engine.noteOff(n),
      pitchBend: (v) => engine.pitchBend(v),
      modWheel: (v) => engine.modWheel(v),
      aftertouch: (v) => engine.aftertouch(v),
    })
  }

  // start audio on first user interaction anywhere
  useEffect(() => {
    if (started) return
    const handler = () => { start() }
    window.addEventListener('pointerdown', handler, { once: true })
    window.addEventListener('keydown', handler, { once: true })
    return () => {
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('keydown', handler)
    }
  }, [started])

  return (
    <StoreContext.Provider value={store}>
      <DragProvider>
        <div className="app">
          <Header engine={engine} started={started} onStart={start} />
          <nav className="tabs">
            {TABS.map(t => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </nav>
          <main className="content">
            {tab === 'OSC' && <OscPanel />}
            {tab === 'FX' && <FxPanel />}
            {tab === 'MATRIX' && <MatrixPanel />}
            {tab === 'GLOBAL' && <GlobalPanel />}
          </main>
          <Keyboard engine={engine} octave={octave} setOctave={setOctave} />
          {!started && (
            <div className="start-overlay" onClick={start}>
              <div className="start-card">
                <h1>WAVECRAFT</h1>
                <p>A wavetable synthesizer in your browser.</p>
                <button className="btn btn-start">Click to Power On</button>
                <p className="start-hint">Play with your mouse, computer keyboard (Z/X row), or a MIDI controller.</p>
              </div>
            </div>
          )}
        </div>
      </DragProvider>
    </StoreContext.Provider>
  )
}
