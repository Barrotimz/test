import { useState } from "react";
import { useStore } from "../store";

const HUES = [88, 196, 312, 32, 8, 268];

export function Onboarding() {
  const { dispatch } = useStore();
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [hue, setHue] = useState(88);

  return (
    <div className="gate">
      <p className="muted">NOT TIKTOK. A LIVE TAPE.</p>
      <h1 className="logo">PUMPTOK</h1>
      <p>
        Drop a trade receipt. If the call is still open, the room rides it or fades it while the clock runs. Your
        rank is hit rate, not followers.
      </p>

      <div className="field">
        <label htmlFor="handle">Handle</label>
        <input
          id="handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="moonbag"
        />
      </div>
      <div className="field">
        <label htmlFor="name">Display name</label>
        <input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Moonbag" />
      </div>
      <div className="swatches">
        {HUES.map((value) => (
          <button
            key={value}
            type="button"
            className={`swatch ${hue === value ? "on" : ""}`}
            style={{ background: `hsl(${value} 90% 55%)` }}
            onClick={() => setHue(value)}
            aria-label={`Avatar color ${value}`}
          />
        ))}
      </div>
      <button
        className="publish"
        type="button"
        onClick={() => dispatch({ type: "onboard", handle, name, hue })}
      >
        Step on the tape
      </button>
    </div>
  );
}
