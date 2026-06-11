import { getParam } from '../../engine/params.js'
import { useParam } from '../../state/StoreContext.jsx'

// Dropdown bound to an enum parameter (uses def.values).
export default function Dropdown({ id, label }) {
  const def = getParam(id)
  const [value, set] = useParam(id)
  const idx = Math.round(value * (def.values.length - 1))
  return (
    <label className="dropdown">
      {label && <span className="dropdown-label">{label}</span>}
      <select
        value={idx}
        onChange={(e) => set(def.values.length > 1 ? Number(e.target.value) / (def.values.length - 1) : 0)}
      >
        {def.values.map((v, i) => <option key={i} value={i}>{v}</option>)}
      </select>
    </label>
  )
}

// Generic dropdown for arbitrary string lists (wavetable/noise selection).
export function ListDropdown({ label, options, value, onChange }) {
  return (
    <label className="dropdown">
      {label && <span className="dropdown-label">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
