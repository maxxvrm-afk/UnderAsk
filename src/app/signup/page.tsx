"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/account.module.css";
import {
  getValidOwnTheWallSession,
  signUpWithOwnTheWall,
} from "@/lib/ownTheWallAuth";

function destination() {
  if (typeof window === "undefined") return "/onboarding";
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/onboarding";
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [successEmail, setSuccessEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    getValidOwnTheWallSession()
      .then((session) => {
        if (!mounted) return;
        if (session) router.replace(destination());
        else setChecking(false);
      })
      .catch(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter your email address.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const next = destination();
      const redirectTo = `${window.location.origin}/login?verified=1&next=${encodeURIComponent(next)}`;
      const result = await signUpWithOwnTheWall(cleanEmail, password, redirectTo);

      if (result.session) {
        router.replace(next);
        return;
      }

      setSuccessEmail(cleanEmail);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
      setLoading(false);
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(destination())}`;

  return (
    <main className={`shell ${styles.loginShell}`}>
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/pricing">Pricing</a>
          <a href={loginHref}>Sign in</a>
        </div>
      </nav>

      <section className={styles.loginLayout}>
        <div className={styles.loginIntro}>
          <div className="eyebrow">CREATE YOUR UNDERASK ACCOUNT</div>
          <h1>Find the deal before everyone else.</h1>
          <p className="lede small">
            Create your account, tell UnderAsk what you resell, set sensible search defaults,
            then choose your plan and start the 7-day trial.
          </p>
        </div>

        <div className={styles.loginCard}>
          <span className="source">UNDERASK ACCOUNT</span>
          <h2>{checking ? "Checking session..." : successEmail ? "Check your inbox" : "Create account"}</h2>

          {!checking && successEmail ? (
            <div className={styles.signupSuccess}>
              <div className={styles.successBox}>
                We sent a confirmation email to <strong>{successEmail}</strong>.
              </div>
              <p>
                Confirm your email address, then sign in. UnderAsk will take you straight
                into the short deal-preference setup before you choose a plan.
              </p>
              <a className="buttonPrimary" href={loginHref}>Go to sign in</a>
            </div>
          ) : !checking ? (
            <>
              <form onSubmit={submit} className={styles.loginForm}>
                <label>
                  <span>EMAIL</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={loading}
                  />
                </label>

                <label>
                  <span>PASSWORD</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    disabled={loading}
                  />
                </label>

                <label>
                  <span>CONFIRM PASSWORD</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    disabled={loading}
                  />
                </label>

                {error && <p className={`error ${styles.loginError}`}>{error}</p>}

                <button className="buttonPrimary" type="submit" disabled={loading}>
                  {loading ? "Creating account..." : "Create account"}
                </button>
              </form>

              <div className={styles.authSwitch}>
                <span>Already have an account?</span>
                <a href={loginHref}>Sign in</a>
              </div>
            </>
          ) : null}

          <p className={styles.loginFootnote}>
            Creating an account does not start a paid subscription. The 7-day trial only
            starts after you choose a plan and complete Stripe Checkout.
          </p>
        </div>
      </section>
    </main>
  );
}
