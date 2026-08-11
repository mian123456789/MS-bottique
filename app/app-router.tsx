"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import FactoryApp, { Login } from "./factory-app";
import { apiFetch, SessionUser } from "./shared";
import ShopApp from "./shop-app";

// The signed-in account decides what opens: a shop login always lands on its own
// counter, while the owner and factory staff get the factory system — and the
// owner can also open any shop's POS in a new tab at /?shop=<id>.
export default function AppRouter() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
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
        const response = await apiFetch("/api/factory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "session" }) });
        const data = await response.json() as { user?: SessionUser };
        if (!cancelled && response.ok && data.user) setUser(data.user);
      } catch { /* not signed in yet */ }
      finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const signOut = useCallback(async () => {
    try { await apiFetch("/api/factory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); } catch { /* clearing anyway */ }
    setUser(null);
    if (window.location.search) window.history.replaceState(null, "", "/");
  }, []);

  if (checking) return <div className="loading-view"><LoaderCircle className="spin" size={30} /><h2>Checking your sign-in…</h2><p>One moment.</p></div>;
  if (!user) return <Login onSignedIn={setUser} />;
  if (user.role === "Shop") return <ShopApp shopId={user.shopId} user={user} onSignOut={signOut} />;
  if (shopParam > 0) return <ShopApp shopId={shopParam} user={user} onSignOut={signOut} />;
  return <FactoryApp user={user} onSignOut={signOut} />;
}
