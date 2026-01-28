"use client";

import { useCallback, useEffect, useState } from "react";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

const BYPASS_STORAGE_KEY = "keyshield:bypass";

export default function ClerkHeader() {
  const [bypassEnabled, setBypassEnabled] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(BYPASS_STORAGE_KEY);
    setBypassEnabled(stored === "true");
  }, []);

  const handleBypassToggle = useCallback(() => {
    const nextValue = !bypassEnabled;
    setBypassEnabled(nextValue);

    if (nextValue) {
      window.localStorage.setItem(BYPASS_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(BYPASS_STORAGE_KEY);
    }
  }, [bypassEnabled]);

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">KS</div>
        <div>
          <div className="brand-title">KeyShield</div>
          <div className="brand-subtitle">Mercury Edition</div>
        </div>
      </div>
      <div className="header-actions">
        <SignedOut>
          <SignInButton mode="modal" redirectUrl="/">
            <button className="btn btn-primary">Sign In / Sign Up</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
        <button
          className="btn btn-ghost"
          onClick={handleBypassToggle}
          aria-pressed={bypassEnabled}
          type="button"
        >
          {bypassEnabled ? "Bypass Enabled" : "Bypass Verification (Dev)"}
          <span className="badge badge-turquoise">Dev</span>
        </button>
      </div>
    </header>
  );
}
