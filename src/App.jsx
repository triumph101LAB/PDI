import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";

// ── Font + global styles ──────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel  = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap";
document.head.appendChild(fontLink);

const globalStyle = document.createElement("style");
globalStyle.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; padding: 0; }
  input, button, textarea, select { font-family: inherit; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }

  /* Responsive breakpoints via CSS custom properties */
  :root { --sidebar-w: 160px; }

  /* Mobile nav drawer */
  .mobile-nav-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.5); z-index: 200;
  }
  .mobile-nav-drawer {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: 240px; z-index: 201;
    transform: translateX(-100%);
    transition: transform .25s ease;
  }
  .mobile-nav-drawer.open { transform: translateX(0); }
  .mobile-nav-overlay.open { display: block; }

  @media (max-width: 768px) {
    .desktop-sidebar { display: none !important; }
    .mobile-menu-btn { display: flex !important; }
    .header-nurse-name { display: none !important; }
    .header-pdi-score { display: none !important; }
    .header-backend-status { display: none !important; }
    .desktop-footer { display: none !important; }
    .mobile-bottom-bar { display: flex !important; }
  }
  @media (min-width: 769px) {
    .mobile-menu-btn { display: none !important; }
    .mobile-bottom-bar { display: none !important; }
    .mobile-nav-overlay { display: none !important; }
    .mobile-nav-drawer { display: none !important; }
  }
`;
document.head.appendChild(globalStyle);

// ── API client ────────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:5000",
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
});
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("pdi_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ── Responsive hook ───────────────────────────────────────────────────────────
function useBreakpoint() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return { isMobile: w < 769, isTablet: w >= 769 && w < 1024, isDesktop: w >= 1024, width: w };
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  light: {
    bg:"#F0F4F8", surface:"#FFFFFF", surface2:"#F8FAFC", border:"#DDE3EC", border2:"#C8D3E0",
    text:"#0F172A", muted:"#64748B", faint:"#94A3B8",
    safe:"#16A34A", warn:"#D97706", crit:"#DC2626", brand:"#0369A1",
    safeBg:"#F0FDF4", warnBg:"#FFFBEB", critBg:"#FEF2F2",
    safeBorder:"#BBF7D0", warnBorder:"#FDE68A", critBorder:"#FECACA",
    chartGrid:"#EEF2F8", dangerZone:"rgba(220,38,38,0.05)",
  },
  dark: {
    bg:"#080D14", surface:"#0D1B2A", surface2:"#0A1520", border:"#1E3A5F", border2:"#253F5F",
    text:"#F1F5F9", muted:"#64748B", faint:"#334155",
    safe:"#22C55E", warn:"#F59E0B", crit:"#EF4444", brand:"#38BDF8",
    safeBg:"#052E16", warnBg:"#1C1100", critBg:"#1A0505",
    safeBorder:"#166534", warnBorder:"#78350F", critBorder:"#7F1D1D",
    chartGrid:"#0F2035", dangerZone:"rgba(239,68,68,0.08)",
  },
};

// ── Thresholds ────────────────────────────────────────────────────────────────
const THRESHOLDS = {
  hr:   { warn:100,  crit:100,  lowWarn:60,   lowCrit:60,   unit:"bpm",  label:"Heart Rate",   min:20,  max:200, normal:"60–100"    },
  rr:   { warn:18,   crit:18,   lowWarn:12,   lowCrit:12,   unit:"/min", label:"Resp Rate",    min:0,   max:60,  normal:"12–18"     },
  spo2: { warn:101,  crit:101,  lowWarn:95,   lowCrit:95,   unit:"%",    label:"SpO₂",         min:60,  max:100, invert:true, normal:"95–100" },
  temp: { warn:37.3, crit:37.3, lowWarn:36.5, lowCrit:36.5, unit:"°C",  label:"Temperature",  min:33,  max:42,  normal:"36.5–37.3" },
  sbp:  { warn:120,  crit:120,  lowWarn:90,   lowCrit:90,   unit:"mmHg", label:"Systolic BP",  min:50,  max:220, invert:true, normal:"90–120" },
  dbp:  { warn:80,   crit:80,   lowWarn:60,   lowCrit:60,   unit:"mmHg", label:"Diastolic BP", min:30,  max:160, invert:true, normal:"60–80"  },
};

const NAV_ITEMS = [
  { section:"Patient",    items:["Overview","History"]   },
  { section:"Monitoring", items:["Trends","Alerts"]      },
  { section:"Ward",       items:["Census","Handover"]    },
];

// ── Shared components ─────────────────────────────────────────────────────────
function RiskBadge({ level, t }) {
  const cfg = {
    crit: { bg:t.critBg, color:t.crit, border:t.critBorder, label:"CRITICAL" },
    warn: { bg:t.warnBg, color:t.warn, border:t.warnBorder, label:"WARNING"  },
    ok:   { bg:t.safeBg, color:t.safe, border:t.safeBorder, label:"STABLE"   },
  }[level] ?? { bg:t.safeBg, color:t.safe, border:t.safeBorder, label:"STABLE" };
  return (
    <span style={{ background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`,
      borderRadius:4, padding:"2px 8px", fontSize:10,
      fontFamily:"'IBM Plex Mono'", fontWeight:600, letterSpacing:.5, whiteSpace:"nowrap" }}>
      {cfg.label}
    </span>
  );
}

function StatusDot({ status, t }) {
  const color = status==="live" ? t.safe : status==="error" ? t.warn : t.muted;
  return <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:color, marginRight:5, verticalAlign:"middle", flexShrink:0 }}/>;
}

// ── Nav sidebar (shared between desktop sidebar and mobile drawer) ─────────────
function NavList({ activeNav, setActiveNav, selectedPatientId, backendStatus, t, onClose }) {
  return (
    <>
      {NAV_ITEMS.map(({ section, items }) => (
        <div key={section} style={{ marginBottom:16, padding:"0 8px" }}>
          <div style={{ fontSize:10, color:t.muted, textTransform:"uppercase", letterSpacing:".08em", padding:"0 8px", marginBottom:4 }}>{section}</div>
          {items.map(item => {
            const disabled = ["Overview","History","Trends","Alerts","Handover"].includes(item) && !selectedPatientId;
            return (
              <div key={item} onClick={() => { if (!disabled) { setActiveNav(item); onClose?.(); } }}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 8px", borderRadius:5,
                  cursor:disabled?"not-allowed":"pointer",
                  color:activeNav===item?t.brand:disabled?t.faint:t.muted,
                  background:activeNav===item?t.bg:"transparent",
                  fontSize:13, fontWeight:500, transition:"background .1s, color .1s",
                  opacity:disabled?0.4:1 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:"currentColor", flexShrink:0 }}/>
                {item}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ marginTop:"auto", padding:"12px 16px", borderTop:`1px solid ${t.border}` }}>
        <div style={{ fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>
          <StatusDot status={backendStatus} t={t}/>
          {backendStatus==="live"?"Backend live":"Backend offline"}
        </div>
      </div>
    </>
  );
}

// ── LOGIN PAGE ────────────────────────────────────────────────────────────────
function LoginPage({ onLogin, t }) {
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [showPass, setShowPass] = useState(false);
  const { isMobile } = useBreakpoint();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password.trim() || !username.trim()) return;
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/auth/login", { username: username.trim(), password: password.trim() });
      localStorage.setItem("pdi_token", data.token);
      onLogin(data.nurse);
    } catch (err) {
      setError(err.response?.data?.error || "Connection failed — is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  const inp = (extra={}) => ({
    width:"100%", padding:"12px 14px", borderRadius:8, fontSize:15,
    border:`1px solid ${error ? t.crit : t.border}`, background:t.surface2,
    color:t.text, fontFamily:"'IBM Plex Sans'", outline:"none",
    boxSizing:"border-box", WebkitAppearance:"none", ...extra,
  });

  return (
    <div style={{ minHeight:"100vh", background:t.bg, display:"flex", alignItems:"center",
      justifyContent:"center", fontFamily:"'IBM Plex Sans', sans-serif",
      padding: isMobile ? "20px 16px" : "40px 20px" }}>
      <div style={{ width:"100%", maxWidth:440, background:t.surface,
        border:`1px solid ${t.border}`, borderRadius: isMobile ? 12 : 14,
        overflow:"hidden", boxShadow:"0 4px 32px rgba(0,0,0,.1)" }}>

        <div style={{ height:4, background:t.brand }}/>
        <div style={{ padding: isMobile ? "28px 24px 32px" : "36px 40px 40px" }}>

          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
            <div style={{ width:42, height:42, background:t.brand, borderRadius:10, display:"flex",
              alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                <path d="M3 10h3l2-5 3 10 2-5h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:17, fontWeight:600, color:t.brand, letterSpacing:"-.3px" }}>NeoSentinel PDI</div>
              <div style={{ fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'", letterSpacing:1, marginTop:1 }}>ICU CLINICAL DECISION SUPPORT</div>
            </div>
          </div>

          <div style={{ fontSize: isMobile ? 20 : 22, fontWeight:600, color:t.text, marginBottom:6 }}>Nurse Login</div>
          <div style={{ fontSize:13, color:t.muted, marginBottom:28, lineHeight:1.6 }}>
            Access is restricted to registered ICU nursing staff.
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:t.muted, display:"block", marginBottom:6, fontFamily:"'IBM Plex Mono'", letterSpacing:.5 }}>USERNAME</label>
              <input autoFocus value={username} onChange={e => setUsername(e.target.value)}
                placeholder="e.g. amaka" autoCapitalize="none" autoCorrect="off"
                style={inp()}/>
            </div>
            <div style={{ marginBottom: error ? 10 : 24 }}>
              <label style={{ fontSize:11, color:t.muted, display:"block", marginBottom:6, fontFamily:"'IBM Plex Mono'", letterSpacing:.5 }}>PASSWORD</label>
              <div style={{ position:"relative" }}>
                <input type={showPass ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                  style={inp({ paddingRight:56 })}/>
                <button type="button" onClick={() => setShowPass(s => !s)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer", color:t.muted,
                    fontSize:11, fontFamily:"'IBM Plex Mono'", padding:"4px" }}>
                  {showPass ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ fontSize:12, color:t.crit, marginBottom:18, fontFamily:"'IBM Plex Mono'",
                background:t.critBg, padding:"10px 12px", borderRadius:6, border:`1px solid ${t.critBorder}` }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !password.trim() || !username.trim()} style={{
              width:"100%", padding:"14px", borderRadius:8, border:"none",
              background: loading || !password.trim() ? t.border : t.brand,
              color: loading || !password.trim() ? t.muted : "#fff",
              fontSize:15, fontWeight:600, cursor: loading || !password.trim() ? "default" : "pointer",
              fontFamily:"'IBM Plex Sans'", letterSpacing:.2, transition:"background .15s",
              WebkitTapHighlightColor:"transparent",
            }}>
              {loading ? "Verifying…" : "Sign In →"}
            </button>
          </form>

          <div style={{ marginTop:24, paddingTop:20, borderTop:`1px solid ${t.border}`,
            fontSize:11, color:t.muted, fontFamily:"'IBM Plex Mono'", lineHeight:1.6 }}>
            For access issues contact your ICU systems administrator.<br/>
            <span style={{ color:t.faint }}>Not for clinical use without formal validation.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── WARD CENSUS ───────────────────────────────────────────────────────────────
function CensusScreen({ onSelectPatient, t }) {
  const [patients, setPatients] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const { isMobile, isTablet } = useBreakpoint();

  function load() {
    setLoading(true);
    api.get("/patients")
      .then(({ data }) => { setPatients(data); setLoading(false); })
      .catch(() => { setError("Could not load ward data"); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300,
      color:t.muted, fontFamily:"'IBM Plex Mono'", fontSize:12 }}>Loading ward census…</div>
  );
  if (error) return (
    <div style={{ color:t.warn, fontFamily:"'IBM Plex Mono'", fontSize:12, padding:20 }}>{error}</div>
  );

  const bays = [...new Set(patients.map(p => p.ward))];
  const cols = isMobile ? "1fr" : isTablet ? "repeat(2,1fr)" : "repeat(3,1fr)";

  return (
    <div style={{ padding: isMobile ? "16px" : "24px 28px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight:600, color:t.text, marginBottom:2 }}>Ward Census</div>
          <div style={{ fontSize:12, color:t.muted }}>Select a patient to open their dashboard</div>
        </div>
        <button onClick={load} style={{ background:t.surface2, border:`1px solid ${t.border}`,
          borderRadius:6, padding:"8px 14px", cursor:"pointer", fontSize:12,
          fontFamily:"'IBM Plex Mono'", color:t.muted, whiteSpace:"nowrap" }}>↺ Refresh</button>
      </div>

      {bays.map(bay => (
        <div key={bay} style={{ marginBottom:28 }}>
          <div style={{ fontSize:11, fontFamily:"'IBM Plex Mono'", color:t.muted, letterSpacing:1,
            textTransform:"uppercase", marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${t.border}` }}>
            {bay}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:cols, gap: isMobile ? 12 : 14 }}>
            {patients.filter(p => p.ward===bay).map(p => {
              const rc = p.risk_level==="crit" ? t.crit : p.risk_level==="warn" ? t.warn : t.safe;
              const rb = p.risk_level==="crit" ? t.critBg : p.risk_level==="warn" ? t.warnBg : t.safeBg;
              const rbd = p.risk_level==="crit" ? t.critBorder : p.risk_level==="warn" ? t.warnBorder : t.safeBorder;
              return (
                <div key={p.patient_id} onClick={() => onSelectPatient(p.patient_id)}
                  style={{ background:t.surface, borderRadius:10,
                    border:`1px solid ${p.risk_level==="crit" ? t.critBorder : t.border}`,
                    overflow:"hidden", cursor:"pointer",
                    transition:"transform .15s, box-shadow .15s",
                    WebkitTapHighlightColor:"transparent",
                    boxShadow: p.risk_level==="crit" ? `0 0 0 1px ${t.crit}` : "none" }}
                  onMouseEnter={e => { if (window.innerWidth > 768) { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow=`0 6px 16px rgba(0,0,0,.1)`; }}}
                  onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow= p.risk_level==="crit" ? `0 0 0 1px ${t.crit}` : "none"; }}>
                  <div style={{ height:4, background:rc }}/>
                  <div style={{ padding: isMobile ? "12px 14px" : "14px 16px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:t.text, marginBottom:2,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</div>
                        <div style={{ fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>{p.patient_id} · {p.bed} · Age {p.age}</div>
                      </div>
                      <div style={{ marginLeft:8, flexShrink:0 }}><RiskBadge level={p.risk_level} t={t}/></div>
                    </div>
                    <div style={{ fontSize:11, color:t.muted, marginBottom:10, background:t.surface2,
                      padding:"4px 8px", borderRadius:4, fontStyle:"italic",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {p.diagnosis}
                    </div>
                    {p.has_vitals ? (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                        {["hr","rr","spo2","temp","sbp","dbp"].map(k => {
                          const val = p.latest_vitals?.[k];
                          const cfg = THRESHOLDS[k];
                          const bad = val !== undefined && (val >= cfg.warn || (cfg.lowCrit && val <= cfg.lowCrit));
                          return (
                            <div key={k} style={{ background:t.bg, borderRadius:4, padding:"5px 7px" }}>
                              <div style={{ fontSize:9, color:t.faint, fontFamily:"'IBM Plex Mono'" }}>{k.toUpperCase()}</div>
                              <div style={{ fontFamily:"'IBM Plex Mono'", fontSize:13, fontWeight:600,
                                color: bad ? t.crit : t.text, marginTop:1 }}>
                                {val !== undefined ? val.toFixed(k==="temp"?1:0) : "—"}
                                <span style={{ fontSize:9, color:t.muted, fontWeight:400 }}> {cfg.unit}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize:11, color:t.faint, fontFamily:"'IBM Plex Mono'",
                        textAlign:"center", padding:"8px 0" }}>No vitals logged yet</div>
                    )}
                    <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:10, color:t.muted }}>
                        PDI <span style={{ fontFamily:"'IBM Plex Mono'", fontWeight:600, color:rc }}>{p.pdi_score}/100</span>
                      </div>
                      {p.alert && p.alert.level !== "ok" && (
                        <div style={{ fontSize:10, color:rc, fontFamily:"'IBM Plex Mono'",
                          background:rb, padding:"2px 7px", borderRadius:4, border:`1px solid ${rbd}` }}>
                          ⚠ alert
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── VITAL CARD ────────────────────────────────────────────────────────────────
function VitalCard({ vk, readings, va, t, active, onClick }) {
  const cfg   = THRESHOLDS[vk];
  const last  = readings?.[readings.length-1];
  const level = va?.worst_risk ?? "ok";
  const slope = va?.slope_per_hour ?? 0;
  const proj  = va?.projected_value ?? last;
  const color = level==="crit" ? t.crit : level==="warn" ? t.warn : t.safe;
  return (
    <div onClick={onClick} style={{ background:t.surface,
      border:`1px solid ${active?t.brand:level==="crit"?t.critBorder:t.border}`,
      borderRadius:8, padding:"12px 14px", cursor:"pointer", position:"relative",
      overflow:"hidden", boxShadow:active?`0 0 0 3px ${t.brand}22`:"none",
      transition:"all .15s", WebkitTapHighlightColor:"transparent" }}>
      {active && <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:t.brand }}/>}
      <div style={{ fontSize:10, color:t.muted, textTransform:"uppercase", letterSpacing:".07em", marginBottom:4 }}>{cfg.label}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
        <span style={{ fontFamily:"'IBM Plex Mono'", fontSize:24, fontWeight:500, color, lineHeight:1 }}>
          {typeof last==="number" ? last.toFixed(vk==="temp"?1:0) : "—"}
        </span>
        <span style={{ fontFamily:"'IBM Plex Mono'", fontSize:11, color:t.muted }}>{cfg.unit}</span>
      </div>
      <div style={{ fontSize:11, color, fontWeight:500, margin:"3px 0" }}>
        {level==="crit" ? "▲ critical" : level==="warn" ? "▲ elevated" : "● normal"}
      </div>
      <div style={{ paddingTop:6, borderTop:`1px solid ${t.border}`, fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>
        {slope>=0?"+":""}{slope.toFixed(1)}{cfg.unit}/hr
      </div>
    </div>
  );
}

// ── TREND CHART ───────────────────────────────────────────────────────────────
function TrendChart({ vk, readings, times, va, t, height=180 }) {
  const cfg   = THRESHOLDS[vk];
  const slope = va?.slope_per_hour ?? 0;
  const data  = (readings||[]).map((v,i) => ({ time:times[i]||`T${i}`, actual:v,
    regression:parseFloat((readings[0]+slope*2*i).toFixed(2)) }));
  const last  = readings?.[readings.length-1] ?? 0;
  for (let p=1; p<=2; p++) {
    data.push({ time:`+${p*2}h`,
      projected:parseFloat((last+slope*2*p).toFixed(2)),
      regression:parseFloat((last+slope*2*p).toFixed(2)) });
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top:8, right:8, bottom:0, left:-20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} strokeWidth={.5}/>
        <XAxis dataKey="time" tick={{ fontSize:10, fontFamily:"'IBM Plex Mono'", fill:t.muted }} tickLine={false} axisLine={false}/>
        <YAxis domain={[cfg.min,cfg.max]} tick={{ fontSize:10, fontFamily:"'IBM Plex Mono'", fill:t.muted }} tickLine={false} axisLine={false}/>
        <Tooltip contentStyle={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:6, fontSize:11, fontFamily:"'IBM Plex Mono'" }} labelStyle={{ color:t.muted }}/>
        {cfg.invert ? <ReferenceArea y1={cfg.min} y2={cfg.lowCrit} fill={t.dangerZone}/> : <ReferenceArea y1={cfg.crit} y2={cfg.max} fill={t.dangerZone}/>}
        <ReferenceLine y={cfg.warn} stroke={t.warn} strokeDasharray="4 4" strokeWidth={1} label={{ value:"hi", position:"right", fontSize:9, fill:t.warn, fontFamily:"'IBM Plex Mono'" }}/>
        {cfg.lowCrit && <ReferenceLine y={cfg.lowCrit} stroke={t.crit} strokeDasharray="4 4" strokeWidth={1} label={{ value:"lo", position:"right", fontSize:9, fill:t.crit, fontFamily:"'IBM Plex Mono'" }}/>}
        <Line type="monotone" dataKey="actual"     stroke={t.brand} strokeWidth={2}   dot={{ r:3, fill:t.brand }} connectNulls={false} name="Actual"/>
        <Line type="monotone" dataKey="projected"  stroke={t.crit}  strokeWidth={1.5} strokeDasharray="5 3" dot={{ r:3, fill:t.crit }} connectNulls={false} name="Projected"/>
        <Line type="monotone" dataKey="regression" stroke={t.muted} strokeWidth={1}   strokeDasharray="2 4" dot={false} connectNulls name="Trend"/>
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── ALERT CARD ────────────────────────────────────────────────────────────────
function AlertCard({ alert, score, t }) {
  if (!alert || alert.level==="ok") return null;
  const level  = alert.level;
  const color  = level==="crit" ? t.crit : t.warn;
  const bg     = level==="crit" ? t.critBg : t.warnBg;
  const border = level==="crit" ? t.critBorder : t.warnBorder;
  return (
    <div style={{ background:bg, border:`1px solid ${border}`, borderLeft:`4px solid ${color}`,
      borderRadius:8, borderTopLeftRadius:0, borderBottomLeftRadius:0,
      padding:"12px 16px", animation:"fadeIn .3s ease" }}>
      <div style={{ fontSize:12, fontWeight:600, color, marginBottom:6 }}>
        ⚠ {level==="crit" ? "PRE-EMPTIVE ALERT: HIGH RISK OF DETERIORATION" : "MONITORING: ADVERSE TREND DETECTED"}
      </div>
      <div style={{ fontSize:12, color:t.text, lineHeight:1.7, marginBottom:6 }}>
        {alert.triggered_by?.map((tr,i) => (
          <div key={i}><strong>{tr.vital}:</strong> {tr.current} → <strong>{tr.projected}</strong>&nbsp;
            <span style={{ color, fontFamily:"'IBM Plex Mono'" }}>{tr.slope}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize:11, color, fontFamily:"'IBM Plex Mono'", fontWeight:500 }}>
        ACTION → {alert.actions?.slice(0,3).join(" · ")}
      </div>
    </div>
  );
}

// ── SCORE PANEL ───────────────────────────────────────────────────────────────
function ScorePanel({ pdi, t }) {
  if (!pdi) return (
    <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:"12px 14px" }}>
      <div style={{ fontSize:11, color:t.muted }}>Awaiting vitals…</div>
    </div>
  );
  const color = pdi.risk_level==="crit" ? t.crit : pdi.risk_level==="warn" ? t.warn : t.safe;
  return (
    <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:"12px 14px" }}>
      <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:t.muted, marginBottom:10 }}>PDI Score</div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:4, marginBottom:8 }}>
        <span style={{ fontFamily:"'IBM Plex Mono'", fontSize:48, fontWeight:500, color, lineHeight:1 }}>{pdi.score}</span>
        <span style={{ fontFamily:"'IBM Plex Mono'", fontSize:16, color:t.muted, marginBottom:6 }}>/100</span>
      </div>
      <div style={{ height:6, background:t.border, borderRadius:3, overflow:"hidden", marginBottom:12 }}>
        <div style={{ height:"100%", width:`${pdi.score}%`, background:color, borderRadius:3, transition:"width .5s" }}/>
      </div>
      {Object.entries(pdi.breakdown ?? {}).map(([key, b]) => {
        const bc = b.ratio>.6 ? t.crit : b.ratio>.3 ? t.warn : t.safe;
        return (
          <div key={key} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6, fontSize:11 }}>
            <span style={{ flex:1, color:t.muted, fontSize:10 }}>{b.label}</span>
            <div style={{ flex:2, height:4, background:t.border, borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${b.ratio*100}%`, background:bc, borderRadius:2, transition:"width .5s" }}/>
            </div>
            <span style={{ fontFamily:"'IBM Plex Mono'", fontSize:10, color:t.muted, minWidth:36, textAlign:"right" }}>{b.points}/{b.max}</span>
          </div>
        );
      })}
      {pdi.ai_boost>0 && <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${t.border}`, fontSize:10, color:t.warn, fontFamily:"'IBM Plex Mono'" }}>AI boost: +{pdi.ai_boost} pts</div>}
    </div>
  );
}

// ── NOTE PANEL ────────────────────────────────────────────────────────────────
function NotePanel({ noteState, t }) {
  const { generating, generatedNote, handleGenerateNote } = noteState;
  return (
    <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:"12px 14px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, gap:12 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:t.muted }}>AI Nursing Note</div>
          <div style={{ fontSize:10, color:t.faint, marginTop:2 }}>Generated from vitals using UMLS terminology</div>
        </div>
        <button onClick={handleGenerateNote} disabled={generating}
          style={{ padding:"8px 16px", borderRadius:6, border:`1px solid ${t.brand}`,
            background:generating?t.surface2:t.brand, color:generating?t.muted:"#fff",
            fontSize:11, fontFamily:"'IBM Plex Mono'", cursor:generating?"default":"pointer",
            whiteSpace:"nowrap", flexShrink:0, WebkitTapHighlightColor:"transparent" }}>
          {generating ? "Generating…" : "Generate Note"}
        </button>
      </div>
      {generatedNote ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ background:t.surface2, borderRadius:6, padding:"12px 14px", fontSize:12,
            color:t.text, lineHeight:1.7, fontFamily:"'IBM Plex Sans'", whiteSpace:"pre-wrap",
            border:`1px solid ${t.border}` }}>
            {generatedNote.generated_note}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"flex-start" }}>
            <div style={{ flex:"1 1 200px", background:generatedNote.risk_weight>.5?t.critBg:generatedNote.risk_weight>.2?t.warnBg:t.safeBg,
              border:`1px solid ${generatedNote.risk_weight>.5?t.critBorder:generatedNote.risk_weight>.2?t.warnBorder:t.safeBorder}`,
              borderRadius:8, padding:"10px 14px", display:"flex", alignItems:"center", gap:12 }}>
              <div>
                <div style={{ fontSize:9, color:t.muted, fontFamily:"'IBM Plex Mono'", marginBottom:2 }}>RISK WEIGHT</div>
                <div style={{ fontFamily:"'IBM Plex Mono'", fontSize:28, fontWeight:600,
                  color:generatedNote.risk_weight>.5?t.crit:generatedNote.risk_weight>.2?t.warn:t.safe }}>
                  {(generatedNote.risk_weight*100).toFixed(0)}%
                </div>
                <div style={{ fontSize:10, color:t.muted }}>{generatedNote.severity}</div>
              </div>
            </div>
            {generatedNote.recommended_actions?.length > 0 && (
              <div style={{ flex:"2 1 260px" }}>
                <div style={{ fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'", marginBottom:6, textTransform:"uppercase", letterSpacing:.5 }}>Recommended Actions</div>
                {generatedNote.recommended_actions.slice(0,3).map((a,i) => (
                  <div key={i} style={{ fontSize:11, color:t.text, marginBottom:5, display:"flex", gap:6 }}>
                    <span style={{ color:t.brand, fontFamily:"'IBM Plex Mono'" }}>→</span>{a}
                  </div>
                ))}
              </div>
            )}
          </div>
          {generatedNote.flagged_terms?.length > 0 && (
            <div style={{ fontSize:11, fontFamily:"'IBM Plex Mono'", color:generatedNote.risk_weight>.5?t.crit:t.warn }}>
              Flagged: {generatedNote.flagged_terms.join(", ")}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize:12, color:t.faint, textAlign:"center", padding:"20px 0", fontFamily:"'IBM Plex Mono'" }}>
          Log vitals first, then click "Generate Note"
        </div>
      )}
    </div>
  );
}

// ── OVERVIEW SCREEN ───────────────────────────────────────────────────────────
function OverviewScreen({ patient, vitalData, times, assessment, form, setForm, submitting, handleAddVitals, noteState, t }) {
  const [activeVital, setActiveVital] = useState("hr");
  const { isMobile, isTablet } = useBreakpoint();
  const pdi   = assessment?.pdi;
  const alert = assessment?.alert;
  const getVA = k => assessment?.vitals?.find(v => v.vital===k) ?? null;
  const vitalCols = isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(3,1fr)";
  const formCols  = isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(6,1fr)";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <AlertCard alert={alert} score={pdi?.score} t={t}/>

      {/* Vital cards */}
      <div style={{ display:"grid", gridTemplateColumns:vitalCols, gap:10 }}>
        {Object.keys(THRESHOLDS).map(k => (
          <VitalCard key={k} vk={k} readings={vitalData[k]} va={getVA(k)} t={t}
            active={activeVital===k} onClick={() => setActiveVital(k)}/>
        ))}
      </div>

      {/* Chart + score — stacked on mobile, side by side on desktop */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 260px", gap:12 }}>
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:"12px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:8 }}>
            <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:t.muted, minWidth:0 }}>
              {THRESHOLDS[activeVital].label} — 4h projection
            </div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
              {Object.keys(THRESHOLDS).map(k => (
                <button key={k} onClick={() => setActiveVital(k)}
                  style={{ fontFamily:"'IBM Plex Mono'", fontSize:9, padding:"3px 6px", borderRadius:4,
                    cursor:"pointer", border:`1px solid ${activeVital===k?t.brand:t.border}`,
                    background:activeVital===k?t.brand:"transparent",
                    color:activeVital===k?"#fff":t.muted, WebkitTapHighlightColor:"transparent" }}>
                  {k.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <TrendChart vk={activeVital} readings={vitalData[activeVital]} times={times}
            va={getVA(activeVital)} t={t} height={isMobile ? 160 : 180}/>
          <div style={{ marginTop:6, fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>
            dashed red = projected · shaded = danger zone
          </div>
        </div>
        <ScorePanel pdi={pdi} t={t}/>
      </div>

      {/* Log vitals */}
      <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:"12px 14px" }}>
        <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:t.muted, marginBottom:10 }}>
          Log vital signs
        </div>
        <div style={{ display:"grid", gridTemplateColumns:formCols, gap:8, marginBottom:12 }}>
          {Object.entries(THRESHOLDS).map(([k, cfg]) => (
            <div key={k}>
              <label style={{ fontSize:10, color:t.muted, display:"block", marginBottom:3 }}>
                {cfg.label} <span style={{ color:t.faint }}>({cfg.unit})</span>
              </label>
              <input type="number" inputMode="decimal" value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]:e.target.value }))}
                placeholder={vitalData[k]?.[vitalData[k].length-1]?.toString()}
                style={{ width:"100%", padding:"8px 10px", borderRadius:5,
                  border:`1px solid ${t.border}`, background:t.bg, color:t.text,
                  fontFamily:"'IBM Plex Mono'", fontSize:14, outline:"none",
                  WebkitAppearance:"none" }}/>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div style={{ fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>
            {times.length} readings · last at {times[times.length-1] || "—"}
          </div>
          <button onClick={handleAddVitals} disabled={submitting}
            style={{ padding:"10px 24px", borderRadius:6, border:`1px solid ${t.brand}`,
              background:submitting?t.surface2:t.brand, color:submitting?t.muted:"#fff",
              fontSize:13, fontWeight:600, fontFamily:"'IBM Plex Sans'",
              cursor:submitting?"default":"pointer", WebkitTapHighlightColor:"transparent" }}>
            {submitting ? "Syncing…" : "Record vitals"}
          </button>
        </div>
      </div>

      <NotePanel noteState={noteState} t={t}/>
    </div>
  );
}

// ── HISTORY SCREEN ────────────────────────────────────────────────────────────
function HistoryScreen({ vitalData, times, t }) {
  const keys = Object.keys(THRESHOLDS);
  const { isMobile } = useBreakpoint();
  const rows = times.map((time,i) => ({
    time, ...Object.fromEntries(keys.map(k => [k, vitalData[k]?.[i] ?? "—"]))
  })).reverse();

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:t.muted, marginBottom:14 }}>
        Vitals History — All Readings
      </div>
      {isMobile ? (
        /* Mobile: card-per-row layout instead of wide table */
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {rows.length === 0 && (
            <div style={{ padding:20, textAlign:"center", color:t.muted, fontSize:12 }}>No readings logged yet</div>
          )}
          {rows.map((row, i) => (
            <div key={i} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontFamily:"'IBM Plex Mono'", color:t.muted, marginBottom:10, fontWeight:600 }}>{row.time}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                {keys.map(k => {
                  const val = row[k]; const cfg = THRESHOLDS[k];
                  const bad = typeof val==="number" && (val>=cfg.warn || (cfg.lowCrit && val<=cfg.lowCrit));
                  return (
                    <div key={k} style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontSize:11, color:t.muted }}>{cfg.label}</span>
                      <span style={{ fontFamily:"'IBM Plex Mono'", fontSize:11, color:bad?t.crit:t.text, fontWeight:bad?600:400 }}>
                        {typeof val==="number"?val.toFixed(k==="temp"?1:0):val} {cfg.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Desktop: standard table with horizontal scroll */
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:600 }}>
            <thead>
              <tr style={{ background:t.surface2 }}>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10, fontFamily:"'IBM Plex Mono'", color:t.muted, fontWeight:500, borderBottom:`1px solid ${t.border}`, whiteSpace:"nowrap" }}>TIME</th>
                {keys.map(k => (
                  <th key={k} style={{ padding:"8px 12px", textAlign:"right", fontSize:10, fontFamily:"'IBM Plex Mono'", color:t.muted, fontWeight:500, borderBottom:`1px solid ${t.border}`, whiteSpace:"nowrap" }}>
                    {THRESHOLDS[k].label} ({THRESHOLDS[k].unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row,i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${t.border}` }}>
                  <td style={{ padding:"8px 12px", fontFamily:"'IBM Plex Mono'", fontSize:12, color:t.muted, whiteSpace:"nowrap" }}>{row.time}</td>
                  {keys.map(k => {
                    const val = row[k]; const cfg = THRESHOLDS[k];
                    const bad = typeof val==="number" && (val>=cfg.warn || (cfg.lowCrit && val<=cfg.lowCrit));
                    return <td key={k} style={{ padding:"8px 12px", textAlign:"right", fontFamily:"'IBM Plex Mono'", fontSize:12, color:bad?t.crit:t.text, fontWeight:bad?600:400, whiteSpace:"nowrap" }}>
                      {typeof val==="number"?val.toFixed(k==="temp"?1:0):val}
                    </td>;
                  })}
                </tr>
              ))}
              {rows.length===0 && (
                <tr><td colSpan={keys.length+1} style={{ padding:20, textAlign:"center", color:t.muted, fontSize:12 }}>No readings logged yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop:8, fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>Values in red are outside normal range</div>
    </div>
  );
}

// ── ALERTS SCREEN ─────────────────────────────────────────────────────────────
function AlertsScreen({ alert, pdi, notes, t }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:t.muted }}>Active Alerts & Note Log</div>
      <AlertCard alert={alert} score={pdi?.score} t={t}/>
      {(!alert||alert.level==="ok") && (
        <div style={{ background:t.safeBg, border:`1px solid ${t.safeBorder}`, borderRadius:8,
          padding:"12px 16px", fontSize:13, color:t.safe, fontFamily:"'IBM Plex Mono'" }}>
          ✓ No active alerts — patient within monitored parameters
        </div>
      )}
      {notes?.length > 0 && (
        <div>
          <div style={{ fontSize:11, color:t.muted, fontFamily:"'IBM Plex Mono'", marginBottom:10,
            textTransform:"uppercase", letterSpacing:".07em" }}>Generated Note Log</div>
          {[...notes].reverse().map((n,i) => (
            <div key={i} style={{ background:t.surface, border:`1px solid ${t.border}`,
              borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, flexWrap:"wrap", gap:4 }}>
                <span style={{ fontSize:11, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>{n.date} {n.time}</span>
                <span style={{ fontSize:10, fontFamily:"'IBM Plex Mono'", fontWeight:600,
                  color:(n.analysis?.risk_weight??0)>.5?t.crit:t.warn }}>
                  Risk: {((n.analysis?.risk_weight??0)*100).toFixed(0)}%
                </span>
              </div>
              <div style={{ fontSize:12, color:t.text, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{n.text}</div>
              {n.analysis?.flagged_terms?.length>0 && (
                <div style={{ fontSize:11, color:t.crit, fontFamily:"'IBM Plex Mono'", marginTop:6 }}>
                  Flagged: {n.analysis.flagged_terms.join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TRENDS SCREEN ─────────────────────────────────────────────────────────────
function TrendsScreen({ vitalData, times, assessment, t }) {
  const [activeVital, setActiveVital] = useState("hr");
  const { isMobile } = useBreakpoint();
  const getVA = k => assessment?.vitals?.find(v => v.vital===k) ?? null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:t.muted }}>
        All Vital Trends — 4h Projection
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {Object.keys(THRESHOLDS).map(k => (
          <button key={k} onClick={() => setActiveVital(k)}
            style={{ fontFamily:"'IBM Plex Mono'", fontSize:11, padding:"5px 12px", borderRadius:4,
              cursor:"pointer", border:`1px solid ${activeVital===k?t.brand:t.border}`,
              background:activeVital===k?t.brand:"transparent",
              color:activeVital===k?"#fff":t.muted, WebkitTapHighlightColor:"transparent" }}>
            {k.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:14 }}>
        <div style={{ fontSize:12, fontWeight:600, color:t.text, marginBottom:12 }}>
          {THRESHOLDS[activeVital].label}
          <span style={{ fontSize:11, color:t.muted, fontWeight:400, marginLeft:8 }}>
            Normal: {THRESHOLDS[activeVital].normal} {THRESHOLDS[activeVital].unit}
          </span>
        </div>
        <TrendChart vk={activeVital} readings={vitalData[activeVital]} times={times}
          va={getVA(activeVital)} t={t} height={isMobile ? 160 : 180}/>
        <div style={{ marginTop:6, fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>
          dashed red = projected · shaded = danger zone
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(3,1fr)", gap:10 }}>
        {Object.keys(THRESHOLDS).filter(k=>k!==activeVital).map(k => {
          const va = getVA(k);
          const color = va?.worst_risk==="crit"?t.crit:va?.worst_risk==="warn"?t.warn:t.safe;
          return (
            <div key={k} onClick={() => setActiveVital(k)}
              style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8,
                padding:"10px 12px", cursor:"pointer", WebkitTapHighlightColor:"transparent" }}>
              <div style={{ fontSize:10, color:t.muted, marginBottom:3 }}>{THRESHOLDS[k].label}</div>
              <div style={{ fontFamily:"'IBM Plex Mono'", fontSize:18, color, fontWeight:500 }}>
                {vitalData[k]?.slice(-1)[0]?.toFixed(k==="temp"?1:0)??"—"}
                <span style={{ fontSize:11, color:t.muted, marginLeft:3 }}>{THRESHOLDS[k].unit}</span>
              </div>
              <div style={{ fontSize:10, color, marginTop:2 }}>
                {va?.slope_per_hour>=0?"+":""}{va?.slope_per_hour?.toFixed(1)??0}/hr
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── HANDOVER SCREEN ───────────────────────────────────────────────────────────
function HandoverScreen({ patient, vitalData, assessment, notes, t }) {
  const { isMobile } = useBreakpoint();
  const level = assessment?.pdi?.risk_level??"ok";
  const color = level==="crit"?t.crit:level==="warn"?t.warn:t.safe;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:t.muted }}>
        Shift Handover Summary
      </div>
      <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:"16px 18px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
          marginBottom:14, paddingBottom:14, borderBottom:`1px solid ${t.border}`, gap:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:600, color:t.text }}>{patient?.name}</div>
            <div style={{ fontSize:11, color:t.muted, fontFamily:"'IBM Plex Mono'", marginTop:2 }}>
              {patient?.patient_id} · {patient?.ward} · {patient?.bed}
            </div>
            <div style={{ fontSize:11, color:t.muted, marginTop:2 }}>{patient?.diagnosis}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <RiskBadge level={level} t={t}/>
            <div style={{ fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'", marginTop:4 }}>
              PDI: <span style={{ color, fontWeight:600 }}>{assessment?.pdi?.score??"—"}/100</span>
            </div>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(3,1fr)", gap:10, marginBottom:14 }}>
          {Object.keys(THRESHOLDS).map(k => {
            const va = assessment?.vitals?.find(v=>v.vital===k);
            const c = va?.worst_risk==="crit"?t.crit:va?.worst_risk==="warn"?t.warn:t.safe;
            return (
              <div key={k} style={{ background:t.surface2, borderRadius:6, padding:"8px 10px" }}>
                <div style={{ fontSize:10, color:t.muted }}>{THRESHOLDS[k].label}</div>
                <div style={{ fontFamily:"'IBM Plex Mono'", fontSize:14, color:c, fontWeight:600, marginTop:2 }}>
                  {vitalData[k]?.slice(-1)[0]?.toFixed(k==="temp"?1:0)??"—"} {THRESHOLDS[k].unit}
                </div>
              </div>
            );
          })}
        </div>
        {assessment?.alert?.level!=="ok" && assessment?.alert && (
          <div style={{ marginBottom:14 }}>
            <AlertCard alert={assessment.alert} score={assessment.pdi?.score} t={t}/>
          </div>
        )}
        {notes?.length>0 && (
          <div style={{ fontSize:12, color:t.muted, fontStyle:"italic", background:t.surface2,
            padding:"10px 12px", borderRadius:6 }}>
            "{notes[notes.length-1]?.text}"
            <span style={{ fontStyle:"normal", marginLeft:8, fontSize:11, fontFamily:"'IBM Plex Mono'" }}>
              {notes[notes.length-1]?.time}
            </span>
          </div>
        )}
        <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${t.border}`, fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>
          Generated: {new Date().toLocaleString()} · NeoSentinel PDI v3.0
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark]   = useState(false);
  const t = dark ? T.dark : T.light;
  const { isMobile }      = useBreakpoint();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [nurse,     setNurse]     = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patient,   setPatient]   = useState(null);
  const [vitalData, setVitalData] = useState({});
  const [times,     setTimes]     = useState([]);
  const [notes,     setNotes]     = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [backendStatus, setBackendStatus] = useState("offline");
  const [form,       setForm]       = useState({ hr:"", rr:"", spo2:"", temp:"", sbp:"", dbp:"" });
  const [submitting, setSubmitting] = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [generatedNote, setGeneratedNote] = useState(null);
  const [activeNav, setActiveNav] = useState("Census");

  const pdi         = assessment?.pdi;
  const overallLevel = pdi?.risk_level ?? "ok";
  const statusColor  = overallLevel==="crit" ? t.crit : overallLevel==="warn" ? t.warn : t.safe;

  useEffect(() => {
    const token = localStorage.getItem("pdi_token");
    if (!token) { setAuthReady(true); return; }
    api.get("/auth/me")
      .then(({ data }) => { setNurse(data.nurse); setBackendStatus("live"); })
      .catch(() => localStorage.removeItem("pdi_token"))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!selectedPatientId) return;
    api.get(`/patients/${selectedPatientId}`)
      .then(({ data }) => {
        setPatient(data.patient); setVitalData(data.vitals || {});
        setTimes(data.times || []); setNotes(data.notes || []);
        setAssessment(data.assessment); setBackendStatus("live");
        setActiveNav("Overview"); setGeneratedNote(null);
      })
      .catch(() => setBackendStatus("error"));
  }, [selectedPatientId]);

  function handleLogin(nurseData) { setNurse(nurseData); setBackendStatus("live"); setActiveNav("Census"); }
  async function handleLogout() {
    await api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("pdi_token");
    setNurse(null); setPatient(null); setSelectedPatientId(null);
    setAssessment(null); setActiveNav("Census");
  }
  function handleSelectPatient(pid) { setSelectedPatientId(pid); }
  function handleBackToCensus() {
    setSelectedPatientId(null); setPatient(null);
    setAssessment(null); setActiveNav("Census");
  }

  const handleAddVitals = useCallback(async () => {
    if (!selectedPatientId) return;
    const hr=parseFloat(form.hr), rr=parseFloat(form.rr),
          spo2=parseFloat(form.spo2), temp=parseFloat(form.temp),
          sbp=parseFloat(form.sbp), dbp=parseFloat(form.dbp);
    if ([hr,rr,spo2,temp].some(isNaN)) return;
    const now=new Date(), timeStr=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    setVitalData(prev => ({
      hr:[...(prev.hr||[]),hr], rr:[...(prev.rr||[]),rr],
      spo2:[...(prev.spo2||[]),spo2], temp:[...(prev.temp||[]),temp],
      sbp:isNaN(sbp)?prev.sbp||[]:[...(prev.sbp||[]),sbp],
      dbp:isNaN(dbp)?prev.dbp||[]:[...(prev.dbp||[]),dbp],
    }));
    setTimes(prev => [...prev, timeStr]);
    setForm({ hr:"", rr:"", spo2:"", temp:"", sbp:"", dbp:"" });
    setSubmitting(true);
    const payload={time:timeStr,hr,rr,spo2,temp};
    if (!isNaN(sbp)) payload.sbp=sbp;
    if (!isNaN(dbp)) payload.dbp=dbp;
    try {
      const { data } = await api.post(`/patients/${selectedPatientId}/vitals`, payload);
      setAssessment(data.assessment); setBackendStatus("live");
    } catch { setBackendStatus("error"); }
    finally { setSubmitting(false); }
  }, [form, selectedPatientId]);

  const handleGenerateNote = useCallback(async () => {
    if (!selectedPatientId) return;
    setGenerating(true); setGeneratedNote(null);
    try {
      const { data } = await api.post(`/patients/${selectedPatientId}/generate-note`, {});
      setGeneratedNote(data.note);
      if (data.updated_assessment) setAssessment(data.updated_assessment);
      api.get(`/patients/${selectedPatientId}`).then(({ data:d }) => { if (d.notes) setNotes(d.notes); });
      setBackendStatus("live");
    } catch (err) {
      setGeneratedNote({ generated_note:"Note generation failed.", risk_weight:0,
        flagged_terms:[], reasoning:err.message, recommended_actions:[], severity:"low" });
    } finally { setGenerating(false); }
  }, [selectedPatientId]);

  const noteState = { generating, generatedNote, setGeneratedNote, handleGenerateNote };

  if (!authReady) return (
    <div style={{ minHeight:"100vh", background:t.bg, display:"flex", alignItems:"center",
      justifyContent:"center", fontFamily:"'IBM Plex Mono'", color:t.muted, fontSize:12 }}>
      Connecting…
    </div>
  );
  if (!nurse) return <LoginPage onLogin={handleLogin} t={t}/>;

  function renderScreen() {
    if (activeNav==="Census" || !selectedPatientId)
      return <CensusScreen onSelectPatient={handleSelectPatient} t={t}/>;
    switch (activeNav) {
      case "Overview":  return <OverviewScreen patient={patient} vitalData={vitalData} times={times} assessment={assessment} form={form} setForm={setForm} submitting={submitting} handleAddVitals={handleAddVitals} noteState={noteState} t={t}/>;
      case "History":   return <HistoryScreen vitalData={vitalData} times={times} t={t}/>;
      case "Trends":    return <TrendsScreen vitalData={vitalData} times={times} assessment={assessment} t={t}/>;
      case "Alerts":    return <AlertsScreen alert={assessment?.alert} pdi={pdi} notes={notes} t={t}/>;
      case "Handover":  return <HandoverScreen patient={patient} vitalData={vitalData} assessment={assessment} notes={notes} t={t}/>;
      default:          return <CensusScreen onSelectPatient={handleSelectPatient} t={t}/>;
    }
  }

  // ── Mobile nav bottom icon bar ────────────────────────────────────────────
  const BOTTOM_NAV = [
    { icon:"⊞", label:"Census",   nav:"Census"   },
    { icon:"◉", label:"Overview", nav:"Overview", needsPatient:true },
    { icon:"〜", label:"Trends",   nav:"Trends",   needsPatient:true },
    { icon:"⚠", label:"Alerts",   nav:"Alerts",   needsPatient:true },
    { icon:"≡",  label:"More",     nav:"__menu__"  },
  ];

  return (
    <div style={{ fontFamily:"'IBM Plex Sans', sans-serif", background:t.bg, color:t.text,
      minHeight:"100vh", display:"flex", flexDirection:"column",
      transition:"background .2s, color .2s" }}>

      {/* Status strip */}
      <div style={{ height:5, background:selectedPatientId ? statusColor : t.brand, transition:"background .4s", flexShrink:0 }}/>

      {/* ── HEADER ── */}
      <div style={{ background:t.surface, borderBottom:`1px solid ${t.border}`,
        padding: isMobile ? "10px 14px" : "10px 20px",
        display:"flex", alignItems:"center", gap: isMobile ? 10 : 16, flexShrink:0 }}>

        {/* Mobile hamburger */}
        <button className="mobile-menu-btn"
          onClick={() => setMobileNavOpen(true)}
          style={{ background:"none", border:"none", cursor:"pointer", color:t.muted,
            fontSize:20, padding:"2px 4px", display:"none", alignItems:"center",
            WebkitTapHighlightColor:"transparent" }}>
          ☰
        </button>

        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="2" width="16" height="16" rx="3" stroke={t.brand} strokeWidth="1.5"/>
            <path d="M5 10h2l1.5-4 2 8 1.5-4H16" stroke={t.brand} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span style={{ fontSize: isMobile ? 13 : 14, fontWeight:600, color:t.brand }}>NeoSentinel</span>
        </div>

        {/* Divider — desktop only */}
        {!isMobile && <div style={{ width:1, height:28, background:t.border }}/>}

        {/* Nurse identity */}
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <div style={{ width:26, height:26, borderRadius:"50%", background:t.brand,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:10, fontWeight:600, color:"#fff", flexShrink:0 }}>
            {nurse.name.split(" ").map(w=>w[0]).slice(0,2).join("")}
          </div>
          <div className="header-nurse-name">
            <div style={{ fontSize:13, fontWeight:600, color:t.text }}>{nurse.name}</div>
            <div style={{ fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'", textTransform:"uppercase", letterSpacing:.5 }}>{nurse.role}</div>
          </div>
        </div>

        {/* Patient breadcrumb */}
        {selectedPatientId && patient && (
          <>
            {!isMobile && <div style={{ width:1, height:28, background:t.border }}/>}
            <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
              <button onClick={handleBackToCensus}
                style={{ background:"none", border:"none", cursor:"pointer", color:t.muted,
                  fontSize:12, fontFamily:"'IBM Plex Mono'", padding:0, whiteSpace:"nowrap",
                  WebkitTapHighlightColor:"transparent" }}>← Ward</button>
              {!isMobile && (
                <>
                  <span style={{ color:t.border }}>/</span>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:t.text,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      maxWidth: isMobile ? 120 : 200 }}>{patient.name}</div>
                    <div style={{ fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>
                      {patient.patient_id} · {patient.ward}
                    </div>
                  </div>
                </>
              )}
              <RiskBadge level={overallLevel} t={t}/>
            </div>
          </>
        )}

        {/* Right side */}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap: isMobile ? 8 : 12 }}>
          <div className="header-backend-status" style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:t.muted, fontFamily:"'IBM Plex Mono'" }}>
            <StatusDot status={backendStatus} t={t}/>{backendStatus}
          </div>
          {selectedPatientId && !isMobile && (
            <div className="header-pdi-score" style={{ textAlign:"right" }}>
              <div style={{ fontSize:10, color:t.muted, textTransform:"uppercase", letterSpacing:".07em" }}>PDI Score</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
                <span style={{ fontFamily:"'IBM Plex Mono'", fontSize:20, fontWeight:500, color:statusColor }}>{pdi?.score??"—"}</span>
                <span style={{ fontFamily:"'IBM Plex Mono'", fontSize:11, color:t.muted }}>/100</span>
                <span style={{ fontSize:11, fontWeight:600, color:statusColor }}>
                  {overallLevel==="crit"?"HIGH":overallLevel==="warn"?"MON":"STABLE"}
                </span>
              </div>
            </div>
          )}
          <button onClick={() => setDark(d => !d)}
            style={{ background:t.surface2, border:`1px solid ${t.border}`, color:t.text,
              padding: isMobile ? "6px 10px" : "5px 12px", borderRadius:6, cursor:"pointer",
              fontFamily:"'IBM Plex Sans'", fontSize:12, fontWeight:500,
              WebkitTapHighlightColor:"transparent" }}>
            {dark ? "☀" : "◑"}
          </button>
          {!isMobile && (
            <button onClick={handleLogout}
              style={{ background:"transparent", border:`1px solid ${t.border}`, color:t.muted,
                padding:"5px 12px", borderRadius:6, cursor:"pointer",
                fontFamily:"'IBM Plex Mono'", fontSize:11 }}>
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Desktop sidebar */}
        <div className="desktop-sidebar"
          style={{ width:160, background:t.surface, borderRight:`1px solid ${t.border}`,
            padding:"12px 0", flexShrink:0, display:"flex", flexDirection:"column",
            overflowY:"auto" }}>
          <NavList activeNav={activeNav} setActiveNav={setActiveNav}
            selectedPatientId={selectedPatientId} backendStatus={backendStatus} t={t}/>
        </div>

        {/* Mobile nav overlay + drawer */}
        <div className={`mobile-nav-overlay ${mobileNavOpen?"open":""}`}
          onClick={() => setMobileNavOpen(false)}/>
        <div className={`mobile-nav-drawer ${mobileNavOpen?"open":""}`}
          style={{ background:t.surface, borderRight:`1px solid ${t.border}`,
            display:"flex", flexDirection:"column", padding:"12px 0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"0 16px 12px", borderBottom:`1px solid ${t.border}`, marginBottom:8 }}>
            <span style={{ fontSize:13, fontWeight:600, color:t.brand }}>Menu</span>
            <button onClick={() => setMobileNavOpen(false)}
              style={{ background:"none", border:"none", cursor:"pointer", fontSize:20,
                color:t.muted, padding:"2px", WebkitTapHighlightColor:"transparent" }}>✕</button>
          </div>
          <NavList activeNav={activeNav} setActiveNav={setActiveNav}
            selectedPatientId={selectedPatientId} backendStatus={backendStatus} t={t}
            onClose={() => setMobileNavOpen(false)}/>
          <div style={{ padding:"12px 16px", borderTop:`1px solid ${t.border}` }}>
            <button onClick={() => { handleLogout(); setMobileNavOpen(false); }}
              style={{ width:"100%", background:"transparent", border:`1px solid ${t.border}`,
                color:t.muted, padding:"10px", borderRadius:6, cursor:"pointer",
                fontFamily:"'IBM Plex Mono'", fontSize:12 }}>
              Logout
            </button>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex:1, overflow:"auto",
          padding: activeNav==="Census"&&!selectedPatientId ? 0 : isMobile ? "12px" : 16,
          paddingBottom: isMobile ? 70 : (activeNav==="Census"&&!selectedPatientId ? 0 : 16) }}>
          {backendStatus==="error" && (
            <div style={{ background:t.warnBg, border:`1px solid ${t.warnBorder}`,
              borderRadius:6, padding:"8px 12px", fontSize:11, color:t.warn,
              fontFamily:"'IBM Plex Mono'", margin:12, marginBottom:0 }}>
              ⚠ Backend unreachable — {import.meta.env.VITE_API_URL ?? "http://localhost:5000"}
            </div>
          )}
          {renderScreen()}
        </div>
      </div>

      {/* ── DESKTOP FOOTER ── */}
      <div className="desktop-footer"
        style={{ background:t.surface, borderTop:`1px solid ${t.border}`,
          padding:"6px 20px", display:"flex", alignItems:"center", gap:16,
          fontFamily:"'IBM Plex Mono'", fontSize:10, color:t.muted, flexShrink:0 }}>
        <span><StatusDot status={backendStatus} t={t}/>{backendStatus==="live"?"Backend live":"Backend offline"} · {new Date().toLocaleTimeString()}</span>
        <span style={{ marginLeft:"auto" }}>Shift: Night → Day 09:00</span>
        <span>NeoSentinel PDI v3.0</span>
      </div>

      {/* ── MOBILE BOTTOM NAV BAR ── */}
      <div className="mobile-bottom-bar"
        style={{ position:"fixed", bottom:0, left:0, right:0, display:"none",
          background:t.surface, borderTop:`1px solid ${t.border}`,
          padding:"8px 0 max(8px, env(safe-area-inset-bottom))",
          zIndex:100, justifyContent:"space-around", alignItems:"center" }}>
        {BOTTOM_NAV.map(item => {
          const disabled = item.needsPatient && !selectedPatientId;
          const active   = item.nav !== "__menu__" && activeNav === item.nav;
          return (
            <button key={item.nav}
              onClick={() => {
                if (disabled) return;
                if (item.nav === "__menu__") { setMobileNavOpen(true); return; }
                setActiveNav(item.nav);
              }}
              style={{ background:"none", border:"none", cursor:disabled?"not-allowed":"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                color: active ? t.brand : disabled ? t.faint : t.muted,
                opacity: disabled ? 0.4 : 1, padding:"4px 12px",
                WebkitTapHighlightColor:"transparent", minWidth:50 }}>
              <span style={{ fontSize:18, lineHeight:1 }}>{item.icon}</span>
              <span style={{ fontSize:9, fontFamily:"'IBM Plex Mono'", letterSpacing:.3 }}>{item.label}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}