import { getParam, mapParam, unmapParam } from '../../engine/params.js'
import { useParam } from '../../state/StoreContext.jsx'

// Integer up/down stepper for params like octave / semi / unison.
export default function Stepper({ id, label }) {
  const def = getParam(id)
  const [value, set] = useParam(id)
  const cur = Math.round(mapParam(def, value))
  const step = (d) => {
    const nv = Math.max(def.min, Math.min(def.max, cur + d))
    set(unmapParam(def, nv))
  }
  return (
    <div className="stepper">
      <span className="stepper-label">{label ?? def.name}</span>
      <div className="stepper-body">
        <button onClick={() => step(-1)}>-</button>
        <span className="stepper-val">{cur > 0 && (def.min < 0) ? `+${cur}` : cur}</span>
        <button onClick={() => step(1)}>+</button>
      </div>
    </div>
  )
}
