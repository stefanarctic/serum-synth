import { getWavetableLibrary } from '../../content/wavetables.js'
import { getNoiseLibrary } from '../../content/noise.js'
import Knob from '../controls/Knob.jsx'
import Stepper from '../controls/Stepper.jsx'
import Dropdown, { ListDropdown } from '../controls/Dropdown.jsx'
import { PowerToggle } from '../controls/Toggle.jsx'
import WavetableView from '../viz/WavetableView.jsx'
import FilterResponse from '../viz/FilterResponse.jsx'
import ModPanel from './ModPanel.jsx'
import { useStore, useStruct, useParam } from '../../state/StoreContext.jsx'

function WtOsc({ slot }) {
  const o = slot
  const store = useStore()
  useStruct()
  const tableName = slot === 'a' ? store.wavetableA : store.wavetableB
  const tables = getWavetableLibrary().map(t => t.name)
  return (
    <div className="osc-col">
      <div className="panel-head">
        <PowerToggle id={`osc${o}_on`} />
        <span className="panel-title">OSC {o.toUpperCase()}</span>
      </div>
      <WavetableView tableName={tableName} posId={`osc${o}_wtpos`} />
      <ListDropdown
        options={tables}
        value={tableName}
        onChange={(v) => store.setWavetable(o, v)}
      />
      <div className="knob-row">
        <Knob id={`osc${o}_wtpos`} label="WT Pos" />
        <Dropdown id={`osc${o}_warpmode`} label="Warp" />
        <Knob id={`osc${o}_warp`} label="Amt" />
      </div>
      <div className="step-row">
        <Stepper id={`osc${o}_oct`} label="Oct" />
        <Stepper id={`osc${o}_semi`} label="Semi" />
        <Stepper id={`osc${o}_unison`} label="Uni" />
      </div>
      <div className="knob-row">
        <Knob id={`osc${o}_fine`} label="Fine" />
        <Knob id={`osc${o}_detune`} label="Detune" />
        <Knob id={`osc${o}_blend`} label="Blend" />
        <Knob id={`osc${o}_width`} label="Width" />
      </div>
      <div className="knob-row">
        <Knob id={`osc${o}_phase`} label="Phase" />
        <Knob id={`osc${o}_rand`} label="Rand" />
        <Knob id={`osc${o}_pan`} label="Pan" />
        <Knob id={`osc${o}_level`} label="Level" />
      </div>
    </div>
  )
}

function SubOsc() {
  return (
    <div className="osc-col osc-narrow">
      <div className="panel-head">
        <PowerToggle id="sub_on" />
        <span className="panel-title">SUB</span>
      </div>
      <Dropdown id="sub_shape" label="Shape" />
      <Stepper id="sub_oct" label="Oct" />
      <div className="knob-row">
        <Knob id="sub_pan" label="Pan" />
        <Knob id="sub_level" label="Level" />
      </div>
    </div>
  )
}

function NoiseOsc() {
  const store = useStore()
  useStruct()
  const noises = getNoiseLibrary().map(n => n.name)
  return (
    <div className="osc-col osc-narrow">
      <div className="panel-head">
        <PowerToggle id="noise_on" />
        <span className="panel-title">NOISE</span>
      </div>
      <ListDropdown options={noises} value={store.noise} onChange={(v) => store.setNoise(v)} />
      <div className="knob-row">
        <Knob id="noise_pitch" label="Pitch" />
        <Knob id="noise_rand" label="Rand" />
      </div>
      <div className="toggle-row">
        <SmallToggle id="noise_keytrack" label="Key" />
        <SmallToggle id="noise_oneshot" label="1-Shot" />
      </div>
      <div className="knob-row">
        <Knob id="noise_pan" label="Pan" />
        <Knob id="noise_level" label="Level" />
      </div>
    </div>
  )
}

function SmallToggle({ id, label }) {
  const [v, set] = useParam(id)
  const on = v >= 0.5
  return (
    <button className={`toggle toggle-sm ${on ? 'toggle-on' : ''}`} onClick={() => set(on ? 0 : 1)}>{label}</button>
  )
}

function FilterPanel() {
  return (
    <div className="osc-col filter-col">
      <div className="panel-head">
        <PowerToggle id="flt_on" />
        <span className="panel-title">FILTER</span>
      </div>
      <FilterResponse prefix="flt" />
      <Dropdown id="flt_type" label="Type" />
      <div className="knob-row">
        <Knob id="flt_cutoff" label="Cutoff" />
        <Knob id="flt_res" label="Res" />
        <Knob id="flt_drive" label="Drive" />
      </div>
      <div className="knob-row">
        <Knob id="flt_fat" label="Fat" />
        <Knob id="flt_keytrk" label="Key Trk" />
        <Knob id="flt_mix" label="Mix" />
      </div>
      <div className="toggle-row route-row">
        <span className="route-label">Route:</span>
        <SmallToggle id="flt_a" label="A" />
        <SmallToggle id="flt_b" label="B" />
        <SmallToggle id="flt_sub" label="Sub" />
        <SmallToggle id="flt_noise" label="Noise" />
      </div>
    </div>
  )
}

export default function OscPanel() {
  return (
    <div className="osc-panel">
      <div className="osc-row">
        <SubOsc />
        <WtOsc slot="a" />
        <WtOsc slot="b" />
        <NoiseOsc />
        <FilterPanel />
      </div>
      <ModPanel />
    </div>
  )
}
