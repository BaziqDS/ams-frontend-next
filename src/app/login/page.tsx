"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";

function CampusPlaceholder() {
  return (
    <div className="campus-ph">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 1000">
        <defs>
          <pattern id="stripes" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#1a2942" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#1e2f4d" strokeWidth="4" />
          </pattern>
          <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e1730" />
            <stop offset="100%" stopColor="#273957" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#gd)" />
        <rect width="100%" height="100%" fill="url(#stripes)" opacity="0.25" />
        <g opacity="0.35" fill="#0b1424">
          <rect x="80" y="520" width="130" height="380" />
          <rect x="230" y="440" width="180" height="460" />
          <rect x="430" y="480" width="90" height="420" />
          <rect x="540" y="380" width="180" height="520" />
          <polygon points="230,440 320,380 410,440" />
          <polygon points="540,380 630,320 720,380" />
        </g>
        <g fill="#4a6194" opacity="0.5">
          {Array.from({ length: 48 }).map((_, i) => (
            <rect key={i} x={90 + (i % 12) * 55} y={560 + Math.floor(i / 12) * 40} width="8" height="12" />
          ))}
        </g>
      </svg>
      <div className="campus-ph-label">
        <span style={{ fontFamily: "var(--font-mono)" }}>NED CAMPUS · REPLACE WITH PHOTO</span>
      </div>
    </div>
  );
}

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
      router.push("/users");
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
        <div className="login-v2-photo">
          <CampusPlaceholder />
        </div>
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
            <span className="mono">© 2026 NED UET</span>
            <span>·</span>
            <span>Secured by NED ICT</span>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="login-v2-right">
        <div className="login-v2-form-frame">
          <div className="login-v2-badge">
            <span className="status-dot active" />
            <span>Official system access</span>
          </div>

          <div className="login-v2-head">
            <h1>Welcome back</h1>
            <p>Sign in to continue. Your access is scoped to your assigned locations and roles.</p>
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
                />
                <button type="button" className="input-trail" onClick={() => setShowPw(!showPw)}>
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

            <button type="submit" className="btn btn-primary btn-login" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
              {!loading && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7"/>
                </svg>
              )}
            </button>

            <div className="login-sso">
              <div className="login-sso-divider"><span>or continue with</span></div>
              <button type="button" className="btn" style={{ width: "100%" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                NED Single Sign-On
              </button>
            </div>
          </form>

          <div className="login-v2-help">
            <div>Need access?</div>
            <a href="#">Contact your Department Head</a>
          </div>
        </div>
      </div>
    </div>
  );
}
