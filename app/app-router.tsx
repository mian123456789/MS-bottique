"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import FactoryApp, { Login } from "./factory-app";
import { apiRequest, SessionUser } from "./shared";
import ShopApp from "./shop-app";

// The signed-in account decides what opens: a shop login always lands on its own
// counter, while the owner and factory staff get the factory system — and the
// owner can also open any shop's POS in a new tab at /?shop=<id>.
export default function AppRouter() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [shopParam, setShopParam] = useState(0);

  useEffect(() => {
    const read = () => setShopParam(Number(new URLSearchParams(window.location.search).get("shop") ?? 0) || 0);
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { response, data } = await apiRequest<{ user?: SessionUser; error?: string }>("/api/factory", { readOnly: true, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "session" }) });
        if (!response.ok && response.status !== 401) throw new Error(data.error || "Unable to check your sign-in.");
        if (response.ok && !data.user) throw new Error("The server returned an incomplete sign-in response. Please try again.");
        if (!cancelled && response.ok && data.user) setUser(data.user);
      } catch (error) { if (!cancelled) setConnectionError(error instanceof Error ? error.message : "Could not reach the server."); }
      finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [checkAttempt]);

  const signOut = useCallback(async () => {
    try { await apiRequest("/api/factory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); } catch { /* clearing anyway */ }
    setUser(null);
    if (window.location.search) window.history.replaceState(null, "", "/");
  }, []);

  if (checking) return <div className="loading-view"><LoaderCircle className="spin" size={30} /><h2>Checking your sign-in…</h2><p>One moment.</p></div>;
  if (connectionError) return <div className="loading-view" role="alert"><AlertTriangle size={30} /><h2>Unable to connect</h2><p>{connectionError}</p><button className="button primary" style={{ marginTop: 16 }} onClick={() => { setConnectionError(""); setChecking(true); setCheckAttempt((value) => value + 1); }}>Try again</button></div>;
  if (!user) return <Login onSignedIn={setUser} />;
  if (user.role === "Shop") return <ShopApp shopId={user.shopId} user={user} onSignOut={signOut} />;
  if (shopParam > 0) return <ShopApp shopId={shopParam} user={user} onSignOut={signOut} />;
  return <FactoryApp user={user} onSignOut={signOut} />;
}
