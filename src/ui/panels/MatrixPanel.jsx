import { PARAMS, MOD_SOURCES, MOD_SOURCE_LABELS } from '../../engine/params.js'
import { useStore, useStruct } from '../../state/StoreContext.jsx'

const TARGETS = PARAMS.filter(p => p.mod)

function targetLabel(id) {
  const def = PARAMS.find(p => p.id === id)
  if (!def) return id
  // prefix the group for clarity
  const grp = id.split('_')[0].toUpperCase()
  return `${grp} ${def.name}`
}

export default function MatrixPanel() {
  const store = useStore()
  useStruct()
  const rows = store.matrix

  return (
    <div className="matrix-panel">
      <div className="matrix-toolbar">
        <button className="btn" onClick={() => store.addMatrixSlot({})}>+ Add Route</button>
        <span className="matrix-count">{rows.length} route{rows.length === 1 ? '' : 's'}</span>
        <span className="matrix-hint">Tip: drag a source chip from the OSC tab directly onto any knob.</span>
      </div>
      <div className="matrix-table">
        <div className="matrix-header">
          <span>Source</span>
          <span>Amount</span>
          <span>Target</span>
          <span>Aux</span>
          <span>Aux Amt</span>
          <span>Bip</span>
          <span></span>
        </div>
        {rows.length === 0 && <div className="matrix-empty">No modulation routes yet.</div>}
        {rows.map((m) => (
          <div className="matrix-row" key={m.id}>
            <select value={m.source} onChange={(e) => store.updateMatrixSlot(m.id, { source: e.target.value })}>
              <option value="">--</option>
              {MOD_SOURCES.map(s => <option key={s} value={s}>{MOD_SOURCE_LABELS[s]}</option>)}
            </select>
            <div className="matrix-amt">
              <input
                type="range" min={-1} max={1} step={0.001}
                value={m.amount}
                onChange={(e) => store.updateMatrixSlot(m.id, { amount: Number(e.target.value) })}
              />
              <span>{(m.amount * 100).toFixed(0)}</span>
            </div>
            <select value={m.target} onChange={(e) => store.updateMatrixSlot(m.id, { target: e.target.value })}>
              <option value="">--</option>
              {TARGETS.map(t => <option key={t.id} value={t.id}>{targetLabel(t.id)}</option>)}
            </select>
            <select value={m.aux} onChange={(e) => store.updateMatrixSlot(m.id, { aux: e.target.value })}>
              <option value="">none</option>
              {MOD_SOURCES.map(s => <option key={s} value={s}>{MOD_SOURCE_LABELS[s]}</option>)}
            </select>
            <input
              className="matrix-auxamt"
              type="range" min={0} max={1} step={0.01}
              value={m.auxAmt}
              disabled={!m.aux}
              onChange={(e) => store.updateMatrixSlot(m.id, { auxAmt: Number(e.target.value) })}
            />
            <button
              className={`toggle toggle-sm ${m.bipolar ? 'toggle-on' : ''}`}
              onClick={() => store.updateMatrixSlot(m.id, { bipolar: !m.bipolar })}
            >+/-</button>
            <button className="matrix-del" onClick={() => store.removeMatrixSlot(m.id)}>x</button>
          </div>
        ))}
      </div>
    </div>
  )
}
