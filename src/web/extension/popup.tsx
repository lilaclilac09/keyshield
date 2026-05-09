/**
 * KeyShield Popup — Plasmo entry point
 *
 * Plasmo treats `popup.tsx` at the package root as the browser-action popup.
 * We simply re-export the full App from `frontend/` so all logic, components,
 * and styles are shared — zero duplication.
 *
 * The popup opens at 800×600px (set via the CSS on the html/body below).
 * Tailwind classes come from the frontend App; Plasmo bundles them together.
 */

import React from "react"
import App from "../App"

// Pull in the Solana wallet adapter styles so they're available in the popup.
import "@solana/wallet-adapter-react-ui/styles.css"

/**
 * Plasmo picks up the default export as the popup component.
 * Wrapping in a full-height container keeps the sidebar layout intact.
 */
const Popup: React.FC = () => {
  return (
    <div style={{ width: 900, height: 640, overflow: "auto" }}>
      <App />
    </div>
  )
}

export default Popup
