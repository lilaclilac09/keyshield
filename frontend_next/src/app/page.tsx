import { SignedIn, SignedOut } from "@clerk/nextjs";
import BypassNotice from "./BypassNotice";

export default function Page() {
  return (
    <main className="page">
      <BypassNotice />
      <section className="hero">
        <h1 className="hero-title">Secure Keys. Zero Friction.</h1>
        <p className="hero-subtitle">
          Store, encrypt, and manage API keys with a premium sign-in flow.
        </p>
      </section>
      <section className="panel">
        <SignedOut>
          <p className="panel-text">Sign in above to access your vault.</p>
        </SignedOut>
        <SignedIn>
          <p className="panel-text">
            You are signed in. Continue to your vault and manage your secrets.
          </p>
        </SignedIn>
      </section>
    </main>
  );
}

