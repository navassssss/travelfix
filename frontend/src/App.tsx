import { useCallback, useEffect, useState } from "react";
import { api, getToken, signOut, type Profile } from "./api";
import { storage, } from "./storage";
import * as Pages from "./pages";

export interface Route {
  path: string;
  params: Record<string, string>;
}

export function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { path: "/", params: {} };
  if (parts[0] === "solve") return { path: "/solve", params: {} };
  if (parts[0] === "case" && parts[1]) return { path: "/case", params: { id: parts[1] } };
  if (parts[0] === "local-solutions" && parts[1]) return { path: "/solution", params: { id: parts[1] } };
  if (parts[0] === "local-solutions") return { path: "/local-solutions", params: {} };
  if (parts[0] === "auth") return { path: "/auth", params: {} };
  if (parts[0] === "dashboard") return { path: "/dashboard", params: {} };
  if (parts[0] === "my-travel") return { path: "/my-travel", params: {} };
  if (parts[0] === "my-contributions") return { path: "/my-contributions", params: {} };
  if (parts[0] === "settings") return { path: "/settings", params: {} };
  if (parts[0] === "admin") {
    if (parts[1] === "contributions") return { path: "/admin/contributions", params: {} };
    if (parts[1] === "resources") return { path: "/admin/resources", params: {} };
    if (parts[1] === "reports") return { path: "/admin/reports", params: {} };
    return { path: "/admin", params: {} };
  }
  return { path: "/", params: {} };
}

// Prefill passed from Home to Solve without touching the URL.
export const solvePrefill: { problem: string; location: string } = { problem: "", location: "" };

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [footerNote, setFooterNote] = useState<string | null>(null);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!getToken()) {
      setProfile(null);
      return;
    }
    try {
      const { profile: p } = await api.get<{ profile: Profile }>("/api/auth/me");
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile, route.path]);

  const ctx = { navigate, profile, refreshProfile };

  let page: React.ReactNode;
  switch (route.path) {
    case "/solve": page = <Pages.SolvePage {...ctx} />; break;
    case "/case": page = <Pages.CasePage {...ctx} id={Number(route.params.id)} />; break;
    case "/local-solutions": page = <Pages.SolutionsPage {...ctx} />; break;
    case "/solution": page = <Pages.SolutionPage {...ctx} id={Number(route.params.id)} />; break;
    case "/auth": page = <Pages.AuthPage {...ctx} />; break;
    case "/dashboard": page = <Pages.DashboardPage {...ctx} />; break;
    case "/my-travel": page = <Pages.MyTravelPage {...ctx} />; break;
    case "/my-contributions": page = <Pages.MyContributionsPage {...ctx} />; break;
    case "/settings": page = <Pages.SettingsPage {...ctx} />; break;
    case "/admin": page = <Pages.AdminOverviewPage {...ctx} />; break;
    case "/admin/contributions": page = <Pages.AdminContributionsPage {...ctx} />; break;
    case "/admin/resources": page = <Pages.AdminResourcesPage {...ctx} />; break;
    case "/admin/reports": page = <Pages.AdminReportsPage {...ctx} />; break;
    default: page = <Pages.HomePage {...ctx} />;
  }

  const nav = (path: string, label: string) => (
    <button key={path} className={route.path === path ? "active" : ""} onClick={() => navigate(path)}>{label}</button>
  );

  return (
    <>
      <header className="site">
        <div className="bar">
          <a className="logo" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>Travel<span>Fix</span></a>
          <nav className="main">
            {nav("/", "Home")}
            {nav("/local-solutions", "Local Solutions")}
            {nav("/my-contributions", "Contribute")}
            {profile?.role === "admin" && nav("/admin", "Admin")}
          </nav>
          <div className="header-actions">
            <button className="btn ghost" onClick={() => navigate("/solve")}>Get help now</button>
            {profile ? (
              <button className="btn" onClick={() => navigate("/dashboard")}>{profile.name.split(" ")[0]}</button>
            ) : (
              <button className="btn" onClick={() => navigate("/auth")}>Sign In</button>
            )}
          </div>
        </div>
      </header>

      <main className="container">{page}</main>

      <footer className="site">
        <div className="cols">
          <div>
            <strong>TravelFix</strong>
            <p>When something goes wrong during travel, TravelFix helps you know what to do next.</p>
          </div>
          <div>
            <button onClick={() => setFooterNote("TravelFix is a location-aware travel problem-solving platform. Guests get help without an account; registered users keep their cases and can contribute local knowledge; admins verify what is published.")}>About</button><br />
            <button onClick={() => setFooterNote("Contact: use the in-app report option on any solution or resource, or write to the TravelFix team through your account settings.")}>Contact</button><br />
            <button onClick={() => setFooterNote("Privacy: your cases are private to you (and to admins for moderation). Only approved, published contributions are public. We never share your cases.")}>Privacy</button><br />
            <button onClick={() => setFooterNote("Terms: TravelFix gives general guidance and community experience. It is not a substitute for official emergency services, medical advice or legal advice. Always follow local officials.")}>Terms</button>
          </div>
        </div>
        {footerNote && <div className="container"><div className="notice">{footerNote} <button className="btn small secondary" onClick={() => setFooterNote(null)}>Close</button></div></div>}
        <div className="cols"><span>© {new Date().getFullYear()} TravelFix</span></div>
      </footer>
    </>
  );
}

export function useSignOut(navigate: (p: string) => void) {
  return () => {
    signOut();
    navigate("/");
    window.location.reload();
  };
}
export { storage };
