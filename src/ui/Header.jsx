import { useRef, useState } from 'react'
import Knob from './controls/Knob.jsx'
import { FACTORY_PRESETS } from '../content/presets.js'
import { useStore, useMeters } from '../state/StoreContext.jsx'

const LS_KEY = 'serum-synth-user-presets'

function loadUserPresets() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || [] } catch { return [] }
}
function saveUserPresets(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export default function Header({ engine, started, onStart }) {
  const store = useStore()
  const meters = useMeters(engine)
  const [userPresets, setUserPresets] = useState(loadUserPresets)
  const [selected, setSelected] = useState('factory:0')
  const [, force] = useState(0)
  const fileRef = useRef(null)

  const applyPreset = (data, key) => {
    store.load(data)
    setSelected(key)
    force(x => x + 1)
  }

  const onSelect = (e) => {
    const key = e.target.value
    const [kind, idx] = key.split(':')
    if (kind === 'factory') applyPreset(FACTORY_PRESETS[Number(idx)], key)
    else applyPreset(userPresets[Number(idx)].data, key)
  }

  const savePreset = () => {
    const name = prompt('Preset name:', store.presetName === 'Init' ? 'My Preset' : store.presetName)
    if (!name) return
    store.setPresetName(name)
    const data = store.serialize()
    const list = [...userPresets, { name, data }]
    setUserPresets(list)
    saveUserPresets(list)
    setSelected(`user:${list.length - 1}`)
  }

  const deletePreset = () => {
    const [kind, idx] = selected.split(':')
    if (kind !== 'user') return
    const list = userPresets.filter((_, i) => i !== Number(idx))
    setUserPresets(list)
    saveUserPresets(list)
    setSelected('factory:0')
  }

  const exportPreset = () => {
    const data = store.serialize()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(data.name || 'preset').replace(/\s+/g, '_')}.synth.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importPreset = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        store.load(data)
        force(x => x + 1)
      } catch { alert('Invalid preset file.') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const initPatch = () => applyPreset(FACTORY_PRESETS[0], 'factory:0')

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark">~</span>
        <span className="brand-name">WAVECRAFT</span>
        <span className="brand-sub">wavetable synth</span>
      </div>

      <div className="preset-bar">
        <button className="btn" onClick={initPatch} title="Init patch">Init</button>
        <select className="preset-select" value={selected} onChange={onSelect}>
          <optgroup label="Factory">
            {FACTORY_PRESETS.map((p, i) => <option key={i} value={`factory:${i}`}>{p.name}</option>)}
          </optgroup>
          {userPresets.length > 0 && (
            <optgroup label="User">
              {userPresets.map((p, i) => <option key={i} value={`user:${i}`}>{p.name}</option>)}
            </optgroup>
          )}
        </select>
        <button className="btn" onClick={savePreset}>Save</button>
        <button className="btn" onClick={deletePreset} disabled={!selected.startsWith('user')}>Del</button>
        <button className="btn" onClick={exportPreset}>Export</button>
        <button className="btn" onClick={() => fileRef.current.click()}>Import</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={importPreset} />
      </div>

      <div className="header-right">
        {!started && <button className="btn btn-start" onClick={onStart}>Power On</button>}
        <BpmControl store={store} />
        <Meters meters={meters} />
        <Knob id="master_vol" label="Master" size={46} />
        <button className="btn" onClick={() => engine.panic()} title="All notes off">Panic</button>
      </div>
    </header>
  )
}

function BpmControl({ store }) {
  const [bpm, setBpm] = useState(() => Math.round(20 + store.params['bpm'] * 280))
  const change = (val) => {
    const v = Math.max(20, Math.min(300, val))
    setBpm(v)
    store.setParam('bpm', (v - 20) / 280)
  }
  return (
    <div className="bpm">
      <span>BPM</span>
      <input type="number" min={20} max={300} value={bpm} onChange={(e) => change(Number(e.target.value))} />
    </div>
  )
}

function Meters({ meters }) {
  const db = (v) => v <= 0 ? 0 : Math.max(0, Math.min(1, (20 * Math.log10(v) + 48) / 48))
  return (
    <div className="meters">
      <div className="meter"><div className="meter-fill" style={{ width: `${db(meters.l) * 100}%` }} /></div>
      <div className="meter"><div className="meter-fill" style={{ width: `${db(meters.r) * 100}%` }} /></div>
      <span className="voice-count">{meters.voices} v</span>
    </div>
  )
}
