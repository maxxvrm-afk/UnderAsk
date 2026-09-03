"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/account.module.css";
import {
  getValidOwnTheWallSession,
  signInWithOwnTheWall,
} from "@/lib/ownTheWallAuth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    getValidOwnTheWallSession()
      .then((session) => {
        if (!mounted) return;
        if (session) router.replace("/search");
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
      router.replace("/search");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setLoading(false);
    }
  }

  return (
    <main className={`shell ${styles.loginShell}`}>
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/pricing">Pricing</a>
          <a href="https://ownthewall.co" target="_blank" rel="noreferrer">OWN THE WALL</a>
        </div>
      </nav>

      <section className={styles.loginLayout}>
        <div className={styles.loginIntro}>
          <div className="eyebrow">ONE ACCOUNT · TWO PRODUCTS</div>
          <h1>Use your OWN THE WALL account.</h1>
          <p className="lede small">
            UnderAsk now uses the same account identity as OWN THE WALL. Your
            UnderAsk plan and marketplace access are loaded from that account.
          </p>
        </div>

        <div className={styles.loginCard}>
          <span className="source">OWN THE WALL ACCOUNT</span>
          <h2>{checking ? "Checking session..." : "Sign in"}</h2>

          {!checking && (
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
          )}

          <p className={styles.loginFootnote}>
            This is the same login used by OWN THE WALL. UnderAsk never receives
            your password; authentication is handled by the shared account service.
          </p>
        </div>
      </section>
    </main>
  );
}
