/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'

export const StoreContext = createContext(null)
export const useStore = () => useContext(StoreContext)

// Subscribe to a single parameter (returns normalized value + setter).
export function useParam(id) {
  const store = useStore()
  const value = useSyncExternalStore(
    (cb) => store.subscribeParam(id, cb),
    () => store.params[id],
  )
  const set = (v, silent) => store.setParam(id, v, silent)
  return [value, set]
}

// Re-render when structural state (matrix, lfo shapes, fx order, tables) changes.
export function useStruct() {
  const store = useStore()
  return useSyncExternalStore(
    (cb) => store.subscribeStruct(cb),
    () => store.version,
  )
}

// Drag-and-drop modulation: a global "drag source" ref shared via context.
const DragCtx = createContext(null)
export function DragProvider({ children }) {
  const ref = useRef({ source: null })
  const [active, setActive] = useState(null)
  return (
    <DragCtx.Provider value={{ ref, active, setActive }}>{children}</DragCtx.Provider>
  )
}
export const useModDrag = () => useContext(DragCtx)

// Meter values from the engine, polled via rAF-free callback.
export function useMeters(engine) {
  const [meters, setMeters] = useState({ l: 0, r: 0, voices: 0 })
  useEffect(() => {
    let raf
    let latest = { l: 0, r: 0, voices: 0 }
    engine.setMeterHandler((m) => { latest = m })
    const tick = () => { setMeters(latest); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine])
  return meters
}
