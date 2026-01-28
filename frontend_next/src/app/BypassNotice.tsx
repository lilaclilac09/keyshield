"use client";

import { useEffect, useState } from "react";

const BYPASS_STORAGE_KEY = "keyshield:bypass";

export default function BypassNotice() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(BYPASS_STORAGE_KEY);
    setEnabled(stored === "true");
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <div className="bypass-banner">
      Bypass active — using dev access. Disable when testing auth flows.
    </div>
  );
}
