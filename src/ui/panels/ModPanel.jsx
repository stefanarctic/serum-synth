import { useState } from 'react'
import Knob from '../controls/Knob.jsx'
import Dropdown from '../controls/Dropdown.jsx'
import ModChip from '../controls/ModChip.jsx'
import EnvEditor from '../viz/EnvEditor.jsx'
import LfoEditor, { LFO_PRESETS } from '../viz/LfoEditor.jsx'
import { useStore, useParam } from '../../state/StoreContext.jsx'

function EnvTab({ index }) {
  return (
    <div className="mod-body">
      <div className="mod-chip-line">
        <ModChip source={`env${index}`} />
        <span className="mod-hint">drag to a knob to assign</span>
      </div>
      <div className="mod-editor-row">
        <EnvEditor index={index} />
        <div className="mod-knobs">
          <div className="knob-row">
            <Knob id={`env${index}_att`} label="Attack" />
            <Knob id={`env${index}_hold`} label="Hold" />
            <Knob id={`env${index}_dec`} label="Decay" />
          </div>
          <div className="knob-row">
            <Knob id={`env${index}_sus`} label="Sustain" />
            <Knob id={`env${index}_rel`} label="Release" />
          </div>
          <div className="knob-row">
            <Knob id={`env${index}_attcrv`} label="A Crv" size={36} />
            <Knob id={`env${index}_deccrv`} label="D Crv" size={36} />
            <Knob id={`env${index}_relcrv`} label="R Crv" size={36} />
          </div>
        </div>
      </div>
      {index === 1 && <div className="mod-note">ENV 1 is hard-wired to amplitude.</div>}
    </div>
  )
}

function LfoTab({ index }) {
  const store = useStore()
  const [sync] = useParam(`lfo${index}_sync`)
  const applyPreset = (name) => store.setLfoShape(index - 1, LFO_PRESETS[name]())
  return (
    <div className="mod-body">
      <div className="mod-chip-line">
        <ModChip source={`lfo${index}`} />
        <div className="lfo-presets">
          {Object.keys(LFO_PRESETS).map(n => (
            <button key={n} className="mini-btn" onClick={() => applyPreset(n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="mod-editor-row">
        <LfoEditor index={index - 1} />
        <div className="mod-knobs">
          <div className="knob-row">
            {sync >= 0.5 ? <Dropdown id={`lfo${index}_div`} label="Rate" /> : <Knob id={`lfo${index}_rate`} label="Rate" />}
            <Dropdown id={`lfo${index}_mode`} label="Mode" />
          </div>
          <div className="knob-row">
            <Knob id={`lfo${index}_delay`} label="Delay" />
            <Knob id={`lfo${index}_rise`} label="Rise" />
            <Knob id={`lfo${index}_smooth`} label="Smooth" />
          </div>
          <div className="toggle-row">
            <SyncToggle index={index} />
          </div>
        </div>
      </div>
    </div>
  )
}

function SyncToggle({ index }) {
  const [v, set] = useParam(`lfo${index}_sync`)
  const on = v >= 0.5
  return <button className={`toggle toggle-sm ${on ? 'toggle-on' : ''}`} onClick={() => set(on ? 0 : 1)}>BPM Sync</button>
}

export default function ModPanel() {
  const [tab, setTab] = useState('env1')
  const isEnv = tab.startsWith('env')
  const num = Number(tab.replace(/\D/g, ''))
  return (
    <div className="mod-panel">
      <div className="mod-tabs">
        <div className="mod-tab-group">
          {[1, 2, 3, 4].map(i => (
            <button key={`e${i}`} className={`mod-tab ${tab === `env${i}` ? 'active' : ''}`} onClick={() => setTab(`env${i}`)}>ENV {i}</button>
          ))}
        </div>
        <div className="mod-tab-group">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <button key={`l${i}`} className={`mod-tab ${tab === `lfo${i}` ? 'active' : ''}`} onClick={() => setTab(`lfo${i}`)}>LFO {i}</button>
          ))}
        </div>
      </div>
      {isEnv ? <EnvTab index={num} /> : <LfoTab index={num} />}
      <div className="mod-sources">
        <span className="mod-src-label">Sources:</span>
        {['velocity', 'note', 'modwheel', 'aftertouch', 'random', 'macro1', 'macro2', 'macro3', 'macro4'].map(s => (
          <ModChip key={s} source={s} compact />
        ))}
      </div>
    </div>
  )
}
