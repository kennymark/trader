import { useState } from "react";
import { authClient } from "../lib/auth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_AUTH !== "false");

  async function signInGoogle() {
    setError(null);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.origin,
    });
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({ email, password, name: name || email });
        if (res.error) throw new Error(res.error.message || "Sign up failed");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "Sign in failed");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <img className="brand-mark" src="/favicon.svg" alt="" />
          Trader
        </div>
        <p>Watch big-cap dips, chart history, and get alerts on email, Telegram, and Twist.</p>

        {googleEnabled && (
          <>
            <button type="button" className="btn btn-primary" onClick={signInGoogle}>
              Continue with Google
            </button>
            <div className="divider">or email</div>
          </>
        )}

        <form onSubmit={submitEmail}>
          {mode === "signup" && (
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="field" style={{ marginBottom: "0.75rem" }}>
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label>Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}

        <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button type="button" className="btn btn-ghost" onClick={() => setMode("signup")}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button type="button" className="btn btn-ghost" onClick={() => setMode("signin")}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
