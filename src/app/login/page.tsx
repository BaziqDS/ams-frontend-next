"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";


export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-v2">
      {/* Left — institutional signage */}
      <div className="login-v2-left">
        <div className="login-v2-overlay">
          <div className="login-v2-center">
            <div className="login-v2-seal">
              <Image src="/ned_seal.webp" alt="NED University of Engineering & Technology" width={120} height={120} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div className="login-v2-wordmark">
              <div className="login-v2-univ display">NED University of Engineering &amp; Technology</div>
              <div className="login-v2-rule" />
              <div className="login-v2-sys mono">ASSET MANAGEMENT SYSTEM</div>
            </div>
          </div>
          <div className="login-v2-foot">
            <span>Copyright © NED University of Engineering &amp; Technology, 2026</span>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="login-v2-right">
        <div className="login-v2-form-frame">
          <div className="login-v2-head">
            <h1>Welcome back</h1>
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label">Username or Employee ID</label>
              <div className="input-wrap">
                <span className="input-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
                    <circle cx="17" cy="7" r="2.6"/><path d="M21 19c0-2.7-1.8-5-4.5-5"/>
                  </svg>
                </span>
                <input
                  className="input has-icon"
                  placeholder="e.g. a.siddiqui or NED-2014-0342"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  suppressHydrationWarning
                />
              </div>
            </div>

            <div className="field">
              <div className="field-label-row">
                <label className="field-label">Password</label>
                <a href="#" className="field-link">Forgot?</a>
              </div>
              <div className="input-wrap">
                <span className="input-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </span>
                <input
                  className="input has-icon has-trail"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  suppressHydrationWarning
                />
                <button type="button" className="input-trail" onClick={() => setShowPw(!showPw)} suppressHydrationWarning>
                  {showPw ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <label className="login-remember">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span>Keep me signed in on this device</span>
            </label>

            <Button type="submit" className="btn-login" disabled={loading} suppressHydrationWarning>
              {loading ? "Signing in…" : "Sign In"}
              {!loading && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7"/>
                </svg>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
