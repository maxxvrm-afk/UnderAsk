"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/account.module.css";
import {
  getValidOwnTheWallSession,
  signInWithOwnTheWall,
} from "@/lib/ownTheWallAuth";

function destination() {
  if (typeof window === "undefined") return "/search";
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/search";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setVerified(new URLSearchParams(window.location.search).get("verified") === "1");

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
    if (!email.trim() || !password || loading) return;

    setLoading(true);
    setError("");

    try {
      await signInWithOwnTheWall(email.trim(), password);
      router.replace(destination());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setLoading(false);
    }
  }

  const signupHref = `/signup?next=${encodeURIComponent(destination())}`;

  return (
    <main className={`shell ${styles.loginShell}`}>
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/scoreboard">Scoreboard</a>
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className={styles.loginLayout}>
        <div className={styles.loginIntro}>
          <div className="eyebrow">UNDERASK ACCOUNT</div>
          <h1>Sign in and start searching.</h1>
          <p className="lede small">
            Find deals, track every flip in your Portfolio and compare your wins with the UnderAsk community.
          </p>
        </div>

        <div className={styles.loginCard}>
          <span className="source">UNDERASK ACCOUNT</span>
          <h2>{checking ? "Checking session..." : "Sign in"}</h2>

          {!checking && (
            <>
              {verified && (
                <div className={styles.successBox}>
                  Email confirmed. Sign in to continue to your plan.
                </div>
              )}

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
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    disabled={loading}
                  />
                </label>

                {error && <p className={`error ${styles.loginError}`}>{error}</p>}

                <button className="buttonPrimary" type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Continue to UnderAsk"}
                </button>
              </form>

              <div className={styles.authSwitch}>
                <span>New to UnderAsk?</span>
                <a href={signupHref}>Create an account</a>
              </div>
            </>
          )}

          <p className={styles.loginFootnote}>
            Already have an OWN THE WALL account? The same email and password still work here because both products use the same secure identity system.
          </p>
        </div>
      </section>
    </main>
  );
}
