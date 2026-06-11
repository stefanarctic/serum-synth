import { FX_LABELS } from '../../engine/params.js'
import Knob from '../controls/Knob.jsx'
import Dropdown from '../controls/Dropdown.jsx'
import { PowerToggle } from '../controls/Toggle.jsx'
import { useParam } from '../../state/StoreContext.jsx'
import { useStore, useStruct } from '../../state/StoreContext.jsx'

function SmallToggle({ id, label }) {
  const [v, set] = useParam(id)
  const on = v >= 0.5
  return <button className={`toggle toggle-sm ${on ? 'toggle-on' : ''}`} onClick={() => set(on ? 0 : 1)}>{label}</button>
}

const FX_CONTENT = {
  hyper: () => (
    <div className="knob-row">
      <Knob id="hyp_rate" label="Rate" />
      <Knob id="hyp_detune" label="Detune" />
      <Knob id="hyp_unison" label="Unison" />
      <Knob id="hyp_mix" label="Hyper" />
      <Knob id="dim_size" label="Dim Sz" />
      <Knob id="dim_mix" label="Dim" />
    </div>
  ),
  dist: () => (
    <div className="knob-row">
      <Dropdown id="dist_mode" label="Mode" />
      <Knob id="dist_drive" label="Drive" />
      <Dropdown id="dist_filter" label="Filter" />
      <Knob id="dist_cutoff" label="Cutoff" />
      <Knob id="dist_res" label="Res" />
      <Knob id="dist_mix" label="Mix" />
    </div>
  ),
  flanger: () => (
    <div className="knob-row">
      <Knob id="flg_rate" label="Rate" />
      <Knob id="flg_depth" label="Depth" />
      <Knob id="flg_feedback" label="Fdbk" />
      <Knob id="flg_phase" label="Phase" />
      <Knob id="flg_mix" label="Mix" />
    </div>
  ),
  phaser: () => (
    <div className="knob-row">
      <Knob id="phs_rate" label="Rate" />
      <Knob id="phs_depth" label="Depth" />
      <Knob id="phs_freq" label="Freq" />
      <Knob id="phs_feedback" label="Fdbk" />
      <Knob id="phs_phase" label="Phase" />
      <Knob id="phs_mix" label="Mix" />
    </div>
  ),
  chorus: () => (
    <div className="knob-row">
      <Knob id="cho_rate" label="Rate" />
      <Knob id="cho_depth" label="Depth" />
      <Knob id="cho_delay" label="Delay" />
      <Knob id="cho_feedback" label="Fdbk" />
      <Knob id="cho_lpf" label="LPF" />
      <Knob id="cho_mix" label="Mix" />
    </div>
  ),
  delay: () => (
    <div className="knob-row">
      <DelayTime />
      <Dropdown id="dly_mode" label="Mode" />
      <Knob id="dly_feedback" label="Fdbk" />
      <Knob id="dly_hp" label="Low Cut" />
      <Knob id="dly_lp" label="Hi Cut" />
      <Knob id="dly_mix" label="Mix" />
      <SmallToggle id="dly_sync" label="Sync" />
    </div>
  ),
  comp: () => (
    <div className="knob-row">
      <Knob id="cmp_thresh" label="Thresh" />
      <Knob id="cmp_ratio" label="Ratio" />
      <Knob id="cmp_att" label="Attack" />
      <Knob id="cmp_rel" label="Release" />
      <Knob id="cmp_gain" label="Gain" />
      <Knob id="cmp_mix" label="Mix" />
      <SmallToggle id="cmp_multiband" label="Multiband" />
    </div>
  ),
  reverb: () => (
    <div className="knob-row">
      <Dropdown id="rev_mode" label="Mode" />
      <Knob id="rev_size" label="Size" />
      <Knob id="rev_predelay" label="Pre" />
      <Knob id="rev_decay" label="Decay" />
      <Knob id="rev_damp" label="Damp" />
      <Knob id="rev_width" label="Width" />
      <Knob id="rev_mix" label="Mix" />
    </div>
  ),
  eq: () => (
    <div className="knob-row">
      <Dropdown id="eq_t1" label="Lo Type" />
      <Knob id="eq_f1" label="Lo Freq" />
      <Knob id="eq_q1" label="Lo Q" />
      <Knob id="eq_g1" label="Lo Gain" />
      <Dropdown id="eq_t2" label="Hi Type" />
      <Knob id="eq_f2" label="Hi Freq" />
      <Knob id="eq_q2" label="Hi Q" />
      <Knob id="eq_g2" label="Hi Gain" />
    </div>
  ),
  ffx: () => (
    <div className="knob-row">
      <Dropdown id="ffx_type" label="Type" />
      <Knob id="ffx_cutoff" label="Cutoff" />
      <Knob id="ffx_res" label="Res" />
      <Knob id="ffx_drive" label="Drive" />
      <Knob id="ffx_mix" label="Mix" />
    </div>
  ),
}

const FX_POWER = {
  hyper: 'hyp_on', dist: 'dist_on', flanger: 'flg_on', phaser: 'phs_on',
  chorus: 'cho_on', delay: 'dly_on', comp: 'cmp_on', reverb: 'rev_on',
  eq: 'eq_on', ffx: 'ffx_on',
}

function DelayTime() {
  const [sync] = useParam('dly_sync')
  return sync >= 0.5 ? <Dropdown id="dly_div" label="Time" /> : <Knob id="dly_time" label="Time" />
}

function FxModule({ id, index }) {
  const store = useStore()
  const move = (dir) => {
    const order = [...store.fxOrder]
    const ni = index + dir
    if (ni < 0 || ni >= order.length) return
    ;[order[index], order[ni]] = [order[ni], order[index]]
    store.setFxOrder(order)
  }
  const onDragStart = (e) => { e.dataTransfer.setData('fx', id); e.dataTransfer.effectAllowed = 'move' }
  const onDrop = (e) => {
    const from = e.dataTransfer.getData('fx')
    if (!from || from === id) return
    const order = store.fxOrder.filter(x => x !== from)
    const at = order.indexOf(id)
    order.splice(at, 0, from)
    store.setFxOrder(order)
  }
  return (
    <div className="fx-module" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="fx-head" draggable onDragStart={onDragStart}>
        <PowerToggle id={FX_POWER[id]} />
        <span className="fx-title">{FX_LABELS[id]}</span>
        <span className="fx-index">{index + 1}</span>
        <div className="fx-move">
          <button onClick={() => move(-1)} title="Move up">^</button>
          <button onClick={() => move(1)} title="Move down">v</button>
        </div>
      </div>
      <div className="fx-content">{FX_CONTENT[id]()}</div>
    </div>
  )
}

export default function FxPanel() {
  const store = useStore()
  useStruct()
  return (
    <div className="fx-panel">
      <div className="fx-hint">Drag a module header to reorder the signal chain, or use the arrows.</div>
      {store.fxOrder.map((id, i) => <FxModule key={id} id={id} index={i} />)}
    </div>
  )
}
