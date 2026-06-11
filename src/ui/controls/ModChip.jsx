import { MOD_SOURCE_LABELS } from '../../engine/params.js'
import { useModDrag } from '../../state/StoreContext.jsx'

// A draggable modulation-source chip. Drag onto any knob to create a route.
export default function ModChip({ source, compact }) {
  const { ref, setActive } = useModDrag()
  return (
    <div
      className={`modchip ${compact ? 'modchip-sm' : ''}`}
      draggable
      onDragStart={(e) => {
        ref.current.source = source
        setActive(source)
        e.dataTransfer.effectAllowed = 'link'
        e.dataTransfer.setData('text/plain', source)
      }}
      onDragEnd={() => { ref.current.source = null; setActive(null) }}
      title={`Drag ${MOD_SOURCE_LABELS[source]} onto a knob`}
    >
      {MOD_SOURCE_LABELS[source]}
    </div>
  )
}
