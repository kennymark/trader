import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "../lib/auth";

type Props = {
  /** Reset token from the emailed link. Absent means the link was malformed. */
  token?: string;
};

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError("The two passwords do not match");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) {
        throw new Error(
          res.error.message ||
            "That reset link is no longer valid. Request a new one and try again.",
        );
      }
      setDone(true);
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

        {!token ? (
          <>
            <h1 style={{ fontSize: "1.1rem" }}>Reset link incomplete</h1>
            <p>
              This link is missing its token, which usually means an email client trimmed it.
              Request a fresh one from the sign-in page.
            </p>
            <Link
              to="/login"
              search={{ next: undefined }}
              className="btn btn-primary"
              style={{ width: "100%", textDecoration: "none" }}
            >
              Back to sign in
            </Link>
          </>
        ) : done ? (
          <>
            <h1 style={{ fontSize: "1.1rem" }}>Password updated</h1>
            <p>
              Your password has been changed and any other sessions were signed out. Sign in with
              the new one.
            </p>
            <Link
              to="/login"
              search={{ next: undefined }}
              className="btn btn-primary"
              style={{ width: "100%", textDecoration: "none" }}
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            <p>Choose a new password for your account.</p>
            <form onSubmit={submit}>
              <div className="field" style={{ marginBottom: "0.75rem" }}>
                <label>New password</label>
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: "1rem" }}>
                <label>Confirm new password</label>
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Saving…" : "Set new password"}
              </button>
            </form>

            {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}

            <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
              <Link to="/login" search={{ next: undefined }}>
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
