import Knob from '../controls/Knob.jsx'
import Stepper from '../controls/Stepper.jsx'
import Toggle from '../controls/Toggle.jsx'
import ModChip from '../controls/ModChip.jsx'

export default function GlobalPanel() {
  return (
    <div className="global-panel">
      <section className="gpanel">
        <h3>Voicing</h3>
        <div className="knob-row">
          <Stepper id="poly" label="Polyphony" />
          <Stepper id="bend_range" label="Bend Range" />
          <Knob id="porta_time" label="Porta" />
        </div>
        <div className="toggle-row">
          <Toggle id="mono" label="Mono" />
          <Toggle id="legato" label="Legato" />
          <Toggle id="porta_always" label="Porta Always" />
        </div>
      </section>

      <section className="gpanel">
        <h3>Quality</h3>
        <div className="toggle-row">
          <Toggle id="oversample" label="2x Oversample" />
        </div>
        <p className="gp-note">Oversampling reduces aliasing in the distortion stage at higher CPU cost.</p>
      </section>

      <section className="gpanel">
        <h3>Macros</h3>
        <div className="macro-grid">
          {[1, 2, 3, 4].map(i => (
            <div className="macro-cell" key={i}>
              <Knob id={`macro${i}`} label={`Macro ${i}`} size={52} />
              <ModChip source={`macro${i}`} compact />
            </div>
          ))}
        </div>
        <p className="gp-note">Drag a macro chip onto any knob to assign it, then automate with the macro knob.</p>
      </section>
    </div>
  )
}
