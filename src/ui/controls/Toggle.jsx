import { getParam } from '../../engine/params.js'
import { useParam } from '../../state/StoreContext.jsx'

export default function Toggle({ id, label }) {
  const def = getParam(id)
  const [value, set] = useParam(id)
  const on = value >= 0.5
  return (
    <button
      className={`toggle ${on ? 'toggle-on' : ''}`}
      onClick={() => set(on ? 0 : 1)}
      title={def.name}
    >
      {label ?? def.name}
    </button>
  )
}

// Small power dot used in panel headers.
export function PowerToggle({ id }) {
  const [value, set] = useParam(id)
  const on = value >= 0.5
  return (
    <button
      className={`power ${on ? 'power-on' : ''}`}
      onClick={(e) => { e.stopPropagation(); set(on ? 0 : 1) }}
      title="Enable"
    />
  )
}
