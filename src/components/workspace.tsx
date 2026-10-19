"use client";
import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  History,
  ChartNoAxesCombined,
  Sparkles,
  Settings,
  ArrowUpRight,
  ShieldCheck,
  BookOpen,
  Menu,
  X,
  Waves,
  Wallet,
  Layers3,
} from "lucide-react";
import type { State } from "@/lib/types";
import type { CSSProperties } from "react";
import { useAppearance, useAppearanceVariables } from "./appearance-provider";
const empty: State = {
  subjects: [],
  exams: [],
  tests: [],
  attempts: [],
  predictions: [],
  grades: [],
  answers: [],
};
type Connection = "loading" | "ready" | "error";
type Workspace = {
  entitlement: { plan: string; family: boolean; predictions: boolean } | null;
  state: State;
  connection: Connection;
  aiReady: boolean;
  email: string | null;
  authMethod: "access" | "password";
  owner: boolean;
  error: string;
  refresh: () => Promise<void>;
};
const Context = createContext<Workspace | null>(null);
const MotionContext = createContext(false);
export function useMotion() {
  return useContext(MotionContext);
}
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function motionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider missing");
  return value;
}
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<State>(empty);
  const [connection, setConnection] = useState<Connection>("loading");
  const [aiReady, setAiReady] = useState(false);
  const [owner,setOwner]=useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"access" | "password">("access");
  const [error, setError] = useState("");
  const [entitlement, setEntitlement] = useState<Workspace["entitlement"]>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (
        response.status === 401 &&
        process.env.NEXT_PUBLIC_STUDYPREDICT_CLOUD === "1"
      ) {
        setState(empty);
        setEmail(null);
        if (window.location.pathname !== "/login") router.replace("/login");
      }
      if (!response.ok)
        throw new Error(data.error || "Unable to load your workspace.");
      setAiReady(data.aiReady);
      setOwner(data.owner===true);
      setEntitlement(data.entitlement ?? null);
      setEmail(data.user?.email ?? null);
      setAuthMethod(data.authMethod === "password" ? "password" : "access");
      setError("");
      setState(data.state);
      setConnection("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
      setConnection("error");
    }
  }, [router]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  return (
    <Context.Provider
      value={{ state, connection, aiReady, email, error, refresh, entitlement, authMethod, owner }}
    >
      {children}
    </Context.Provider>
  );
}
const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/create", label: "Create practice test", icon: Plus },
  { href: "/flashcards", label: "Flashcard Studio", icon: Layers3 },
  { href: "/history", label: "Tests & history", icon: History },
  {
    href: "/analytics",
    label: "Prediction analytics",
    icon: ChartNoAxesCombined,
  },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/pricing", label: "Plans & credits", icon: Wallet },
];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { connection, aiReady, entitlement, owner } = useWorkspace();
  const { appearance } = useAppearance();
  const themeVariables = useAppearanceVariables();
  const [open, setOpen] = useState(false);
  const [motion, setMotion] = useState(true);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    () => true,
  );
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setMotion(localStorage.getItem("study-motion") !== "off");
      } catch {
        /* Preferences are optional. */
      }
    });
  }, []);
  function toggleMotion() {
    const next = !motion;
    setMotion(next);
    try {
      localStorage.setItem("study-motion", next ? "on" : "off");
    } catch {
      /* Preferences are optional. */
    }
  }
  const animate =
    motion && !reducedMotion && !pathname.startsWith("/attempts/");
  // Animate sections only as they enter the viewport. Reduced-motion users
  // keep everything visible and receive no hover or scroll movement.
  useEffect(() => {
    if (!animate || typeof IntersectionObserver === "undefined") return;
    const nodes = document.querySelectorAll<HTMLElement>(
      ".main-area main .panel, .main-area main .stat-card, .main-area main .advanced-card, .main-area main .hero-card",
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -12px 0px" },
    );
    nodes.forEach((element) => {
      element.classList.add("reveal-ready");
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
      nodes.forEach((element) => element.classList.remove("reveal-ready", "in-view"));
    };
  }, [pathname, animate, appearance.dashboard]);
  const cloud = process.env.NEXT_PUBLIC_STUDYPREDICT_CLOUD === "1";
  if (pathname === "/login" && cloud)
    return <main className="login-wrap">{children}</main>;
  return (
    <MotionContext.Provider value={animate}>
      <div className="app-shell" data-motion={animate ? "on" : "off"} data-dashboard={appearance.dashboard} data-palette={appearance.preset} style={themeVariables as CSSProperties}>
        <div className="ambient-field" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <button
          className="mobile-menu icon-button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          {open ? <X /> : <Menu />}
        </button>
        {open && (
          <button
            className="nav-overlay"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
        )}
        <aside className={`sidebar ${open ? "open" : ""}`}>
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-icon">
              <Sparkles size={22} />
            </span>
            <span>
              StudyPredict<span className="brand-ai">AI</span>
            </span>
          </Link>
          <div className="workspace-label">{appearance.dashboard === "advanced" ? "INTELLIGENCE WORKSPACE" : "EXPLORE YOUR POTENTIAL"}</div>
          <nav aria-label="Main navigation">
            {[...navigation, ...(owner ? [{href:"/research",label:"Prediction research",icon:ChartNoAxesCombined}] : [])].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`nav-link ${pathname === href ? "active" : ""}`}
                aria-current={pathname === href ? "page" : undefined}
              >
                <Icon size={19} />
                {appearance.dashboard === "advanced" && href === "/" ? "Command center" : label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-tip">
            <span className="tiny-label">
              <Sparkles size={14} /> A LITTLE PRACTICE, EVERY DAY
            </span>
            <h3>Know where you stand.</h3>
            <p>
              Turn your study notes into practice. Turn your results into a
              clearer next step.
            </p>
            <Link href="/create" onClick={() => setOpen(false)}>
              Start practicing <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="sidebar-bottom">
            <ShieldCheck size={18} />
            <div>
              <strong>Personal workspace</strong>
              <span>
                {cloud ? "Private to your account" : "Stored on this PC"}
              </span>
            </div>
          </div>
        </aside>
        <div className="main-area">
          <header className="topbar">
            <span>
              <BookOpen size={16} /> Your learning, connected.
            </span>
            <div className="topbar-right">
              <button
                className="motion-toggle"
                onClick={toggleMotion}
                aria-pressed={motion}
                aria-label="Ambient animations"
                title={
                  reducedMotion
                    ? "System reduced-motion preference is active"
                    : "Toggle ambient animations"
                }
              >
                <Waves size={15} />
                <span>Motion {animate ? "on" : "off"}</span>
              </button>
              <span
                className={`status-dot ${connection === "ready" && aiReady ? "green" : ""}`}
              />
              {connection === "ready"
                ? cloud
                  ? "Private workspace"
                  : "Local workspace"
                : "Your personal study companion"}
              <span className="avatar">S</span>
            </div>
          </header>
          <main key={pathname}>
            {pathname !== "/settings" && <ConnectionNotice />}
            {pathname === "/" && entitlement && !entitlement.predictions && <div className="notice"><span>Your practice results are saved. Unlock grade predictions and full analytics with a paid plan.</span><Link href="/pricing" className="text-link">Explore plans →</Link></div>}
            {children}
          </main>
          <footer>
            Study with intention. Predict with evidence.
            <span>StudyPredict AI</span>
          </footer>
        </div>
      </div>
    </MotionContext.Provider>
  );
}
export function ConnectionNotice() {
  const { connection, aiReady, error, refresh } = useWorkspace();
  if (connection === "loading")
    return (
      <div className="notice" role="status">
        Loading your workspace…
      </div>
    );
  if (connection === "error")
    return (
      <div className="notice error" role="alert">
        <span>{error}</span>
        <button
          className="button small secondary"
          onClick={() => void refresh()}
        >
          Retry
        </button>
      </div>
    );
  if (!aiReady)
    return (
      <div className="notice">
        <span>
          {process.env.NEXT_PUBLIC_STUDYPREDICT_CLOUD === "1"
            ? "The owner needs to connect Claude before you can generate tests and grade written answers."
            : "Add your Anthropic API key to generate tests and grade written answers."}
        </span>
        <Link href="/settings" className="text-link">
          Open Settings →
        </Link>
      </div>
    );
  return null;
}
