import Link from "next/link";
import { Button } from "@/components/ui/button";


export default function ForbiddenPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
      <div style={{ width: "min(560px, 92vw)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-xl)", background: "var(--card)", padding: "28px 24px", boxShadow: "0 20px 45px color-mix(in oklch, var(--ink) 10%, transparent)" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Access Control</div>
        <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15 }}>403 — Access denied</h1>
        <p style={{ margin: "12px 0 20px", color: "var(--text-2)", fontSize: 14 }}>
          Your account is authenticated, but it does not have the required permission for this page.
          If this seems incorrect, contact your system administrator.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard" >Go to Dashboard</Link></Button>
          <Button asChild size="sm"><Link href="/login" >Sign in as another user</Link></Button>
        </div>
      </div>
    </div>
  );
}
