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
      <p className="muted">TIKTOK / REELS FOR DEGENS</p>
      <h1 className="logo">PUMPTOK</h1>
      <p>Share the entry, the exit, and the story in between. Wins, rugs, and calls — vertical, fast, and on-chain coded.</p>

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
        Enter the feed
      </button>
    </div>
  );
}
