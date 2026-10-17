"use client";

import { AlertTriangle, ArrowRight, LoaderCircle, LockKeyhole, UserCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import { apiRequest, Field, type SessionUser } from "./shared";

// Kept out of factory-app so the sign-in screen does not have to download the
// whole factory system before anyone has signed in.
const workflow = ["Issue Lot", "Embroidery", "Cutting", "Stitching", "Finishing", "Packing", "Gatepass", "Warehouse", "Customer Dispatch"];

export function Login({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return setError("Enter your username and password.");
    setBusy(true);
    try {
      const { response, data } = await apiRequest<{ error?: string; user?: SessionUser }>("/api/factory", { readOnly: true, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", username: username.trim(), password }) });
      if (!response.ok || !data.user) throw new Error(data.error || "Incorrect username or password.");
      onSignedIn(data.user);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to sign in."); }
    finally { setBusy(false); }
  };
  return <main className="login-page">
    <section className="login-brand">
      <div className="brand-pill"><span className="logo-mark">MS</span><span>MS Boutique</span></div>
      <div className="login-copy"><span className="eyebrow light">FACTORY OPERATIONS, CONNECTED</span><h1>One design.<br />Every department.<br /><em>Complete control.</em></h1><p>Track every production lot from issue to customer dispatch without losing a single piece.</p></div>
      <div className="workflow-ribbon">{workflow.slice(0, 8).map((item, index) => <span key={item}>{item}{index < 7 && <ArrowRight size={14} />}</span>)}</div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-login-brand"><span className="logo-mark">MS</span><b>MS Boutique</b></div>
        <span className="eyebrow">WELCOME BACK</span><h2>Sign in</h2><p className="muted">Factory staff and shop counters sign in with the account the owner set up.</p>
        <Field label="Username"><div className="input-icon"><UserCog size={17} /><input autoComplete="username" placeholder="Your username" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} /></div></Field>
        <Field label="Password"><div className="input-icon"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} /></div></Field>
        {error && <div className="login-error"><AlertTriangle size={16} />{error}</div>}
        <button className="button primary login-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null} Sign in <ArrowRight size={17} /></button>
      </form>
      <p className="login-footer">MS Boutique © 2026 – Factory Management System</p>
    </section>
  </main>;
}
