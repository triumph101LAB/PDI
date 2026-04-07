import { useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── IBM Plex font injection ───────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap";
document.head.appendChild(fontLink);

// ─── Design tokens ─────────────────────────────────────────────────────────
const TOKENS = {
  light: {
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    text: "#0F172A",
    muted: "#64748B",
    safe: "#16A34A",
    warn: "#D97706",
    crit: "#DC2626",
    brand: "#0369A1",
    safeBg: "#DCFCE7",
    warnBg: "#FEF3C7",
    critBg: "#FEE2E2",
    chartGrid: "#E2E8F0",
    dangerZone: "rgba(220,38,38,0.06)",
  },
  dark: {
    bg: "#080D14",
    surface: "#0D1B2A",
    border: "#1E3A5F",
    text: "#F1F5F9",
    muted: "#475569",
    safe: "#22C55E",
    warn: "#F59E0B",
    crit: "#EF4444",
    brand: "#38BDF8",
    safeBg: "#14532D",
    warnBg: "#451A03",
    critBg: "#450A0A",
    chartGrid: "#1E3A5F",
    dangerZone: "rgba(239,68,68,0.10)",
  },
};

// ─── Silverman-Anderson danger thresholds (neonatal) ───────────────────────
const THRESHOLDS = {
  hr:   { warn: 160, crit: 180, unit: "bpm",  label: "Heart Rate",    min: 80,  max: 220 },
  rr:   { warn: 60,  crit: 70,  unit: "/min", label: "Resp Rate",     min: 20,  max: 90 },
  spo2: { warn: 92,  crit: 88,  unit: "%",    label: "SpO₂",          min: 70,  max: 100, invert: true },
  temp: { warn: 38,  crit: 39,  unit: "°C",   label: "Temperature",   min: 35,  max: 41 },
};

// ─── Linear regression helper ──────────────────────────────────────────────
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.value ?? 0 };
  const sumX = points.reduce((a, p) => a + p.t, 0);
  const sumY = points.reduce((a, p) => a + p.value, 0);
  const sumXY = points.reduce((a, p) => a + p.t * p.value, 0);
  const sumXX = points.reduce((a, p) => a + p.t * p.t, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function projectVital(readings, hoursAhead = 4) {
  const pts = readings.map((r, i) => ({ t: i, value: r }));
  const { slope, intercept } = linearRegression(pts);
  const lastT = pts.length - 1;
  // Project 4 data-points ahead (each point = 2hrs, so 4 pts = 8hrs; use fractional)
  const projectedT = lastT + hoursAhead / 2;
  return {
    slope,
    projected: intercept + slope * projectedT,
    slopePerHour: slope / 2, // readings every 2h
  };
}

function riskLevel(vital, key, projectedValue) {
  const t = THRESHOLDS[key];
  const check = t.invert
    ? (v, thresh) => v < thresh
    : (v, thresh) => v > thresh;
  if (check(projectedValue, t.crit)) return "crit";
  if (check(projectedValue, t.warn)) return "warn";
  return "ok";
}

// Weighted PDI score: SpO2 30%, HR 25%, Temp 25%, RR 20%
function calcPDIScore(vitalData) {
  const weights = { spo2: 30, hr: 25, temp: 25, rr: 20 };
  let total = 0;
  for (const [key, w] of Object.entries(weights)) {
    const readings = vitalData[key];
    if (!readings.length) continue;
    const { projected } = projectVital(readings);
    const t = THRESHOLDS[key];
    let ratio;
    if (t.invert) {
      ratio = Math.max(0, Math.min(1, (t.crit - projected) / (t.crit - 70)));
    } else {
      ratio = Math.max(0, Math.min(1, (projected - t.warn) / (t.crit - t.warn + 10)));
    }
    total += ratio * w;
  }
  return Math.round(total);
}

// ─── Seed data (matches your doc's HR scenario) ───────────────────────────
const SEED = {
  hr:   [125, 135, 145, 155],
  rr:   [46,  48,  50,  52],
  spo2: [96,  94,  93,  91],
  temp: [37.2, 37.5, 38.0, 38.4],
};
const SEED_TIMES = ["08:00", "10:00", "12:00", "14:00"];

// ─── Components ────────────────────────────────────────────────────────────

function StatusStrip({ level, t }) {
  const color = level === "crit" ? t.crit : level === "warn" ? t.warn : t.safe;
  const label = level === "crit" ? "HIGH RISK" : level === "warn" ? "MONITORING" : "STABLE";
  return (
    <div style={{
      height: 8,
      background: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 0.4s",
    }} />
  );
}

function VitalCard({ vitalKey, readings, t, aiWeight }) {
  const cfg = THRESHOLDS[vitalKey];
  const latest = readings[readings.length - 1];
  const { projected, slopePerHour } = projectVital(readings);
  const level = riskLevel(null, vitalKey, projected);
  const statusColor = level === "crit" ? t.crit : level === "warn" ? t.warn : t.safe;
  const slopeTxt = slopePerHour > 0 ? `+${slopePerHour.toFixed(1)}` : slopePerHour.toFixed(1);

  return (
    <div style={{
      background: t.surface,
      border: `1px solid ${level === "crit" ? t.crit : t.border}`,
      borderRadius: 8,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ fontSize: 10, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'IBM Plex Sans'" }}>
        {cfg.label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 28, fontWeight: 500, color: statusColor, lineHeight: 1 }}>
          {typeof latest === "number" ? latest.toFixed(vitalKey === "temp" ? 1 : 0) : "—"}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: t.muted }}>{cfg.unit}</span>
      </div>
      <div style={{ fontSize: 11, color: statusColor, fontFamily: "'IBM Plex Sans'", fontWeight: 500 }}>
        {level === "crit" ? "▲ critical" : level === "warn" ? "▲ elevated" : "● normal"}
      </div>
      <div style={{ marginTop: 4, paddingTop: 6, borderTop: `1px solid ${t.border}`, fontSize: 10, color: t.muted, fontFamily: "'IBM Plex Mono'" }}>
        slope {slopeTxt}{cfg.unit}/hr · proj {projected.toFixed(vitalKey === "temp" ? 1 : 0)}{cfg.unit}
        {aiWeight > 0 && <span style={{ color: t.warn }}> · AI +{(aiWeight * 10).toFixed(0)}pts</span>}
      </div>
    </div>
  );
}

function TrendChart({ vitalKey, readings, times, t }) {
  const cfg = THRESHOLDS[vitalKey];
  const { slope, intercept } = linearRegression(readings.map((v, i) => ({ t: i, value: v })));

  // Build chart data: actual readings + 4-hour projection
  const data = readings.map((v, i) => ({
    time: times[i] || `+${i * 2}h`,
    actual: v,
    regression: parseFloat((intercept + slope * i).toFixed(2)),
  }));

  // Add 2 projected points (each = 2h ahead)
  const lastT = readings.length - 1;
  for (let p = 1; p <= 2; p++) {
    const projT = lastT + p;
    data.push({
      time: `+${p * 2}h`,
      projected: parseFloat((intercept + slope * projT).toFixed(2)),
      regression: parseFloat((intercept + slope * projT).toFixed(2)),
    });
  }

  const dangerVal = cfg.invert ? cfg.warn : cfg.warn;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} strokeWidth={0.5} />
        <XAxis dataKey="time" tick={{ fontSize: 10, fontFamily: "'IBM Plex Mono'", fill: t.muted }} tickLine={false} axisLine={false} />
        <YAxis
          domain={[cfg.min, cfg.max]}
          tick={{ fontSize: 10, fontFamily: "'IBM Plex Mono'", fill: t.muted }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, fontSize: 11, fontFamily: "'IBM Plex Mono'" }}
          labelStyle={{ color: t.muted }}
          itemStyle={{ color: t.text }}
        />
        {cfg.invert ? (
          <ReferenceArea y1={cfg.min} y2={cfg.crit} fill={t.dangerZone} />
        ) : (
          <ReferenceArea y1={cfg.crit} y2={cfg.max} fill={t.dangerZone} />
        )}
        <ReferenceLine
          y={dangerVal}
          stroke={t.warn}
          strokeDasharray="4 4"
          strokeWidth={1}
          label={{ value: "warn", position: "right", fontSize: 10, fill: t.warn, fontFamily: "'IBM Plex Mono'" }}
        />
        <ReferenceLine
          y={cfg.crit}
          stroke={t.crit}
          strokeDasharray="4 4"
          strokeWidth={1}
          label={{ value: "crit", position: "right", fontSize: 10, fill: t.crit, fontFamily: "'IBM Plex Mono'" }}
        />
        <Line type="monotone" dataKey="actual" stroke={t.brand} strokeWidth={2} dot={{ r: 3, fill: t.brand }} connectNulls={false} name="Actual" />
        <Line type="monotone" dataKey="projected" stroke={t.crit} strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3, fill: t.crit }} connectNulls={false} name="Projected" />
        <Line type="monotone" dataKey="regression" stroke={t.muted} strokeWidth={1} strokeDasharray="2 4" dot={false} connectNulls name="Trend" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AlertCard({ score, vitalData, aiWeight, t }) {
  const level = score >= 60 ? "crit" : score >= 35 ? "warn" : "ok";
  if (level === "ok") return null;

  const { projected: hrProj, slopePerHour: hrSlope } = projectVital(vitalData.hr);
  const hrsToBreath = hrSlope > 0
    ? Math.max(0, (THRESHOLDS.hr.crit - vitalData.hr[vitalData.hr.length - 1]) / hrSlope)
    : null;

  const bg = level === "crit" ? t.critBg : t.warnBg;
  const border = level === "crit" ? t.crit : t.warn;
  const color = level === "crit" ? t.crit : t.warn;
  const label = level === "crit" ? "PRE-EMPTIVE ALERT: HIGH RISK OF SEPSIS" : "MONITORING: ADVERSE TREND DETECTED";

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderLeft: `4px solid ${border}`,
      borderRadius: 8,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      padding: "12px 16px",
      display: "flex",
      gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color, fontFamily: "'IBM Plex Sans'", marginBottom: 4 }}>
          ⚠ {label}
        </div>
        <div style={{ fontSize: 12, color: t.text, fontFamily: "'IBM Plex Sans'", lineHeight: 1.6 }}>
          <span>Heart Rate trend: +{(projectVital(vitalData.hr).slopePerHour).toFixed(1)} bpm/hr · </span>
          {hrsToBreath !== null && (
            <span>Critical threshold breach in <strong>{hrsToBreath.toFixed(1)}h</strong> · </span>
          )}
          {aiWeight > 0 && <span style={{ color }}> AI risk modifier active ({(aiWeight * 100).toFixed(0)}%) · </span>}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color, fontFamily: "'IBM Plex Mono'", fontWeight: 500 }}>
          ACTION → Draw blood cultures · Notify Neonatologist · Increase monitoring to 30min
        </div>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 22, fontWeight: 500, color, alignSelf: "center" }}>
        {score}
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark] = useState(false);
  const t = dark ? TOKENS.dark : TOKENS.light;

  const [vitalData, setVitalData] = useState({ ...SEED });
  const [times, setTimes] = useState([...SEED_TIMES]);
  const [form, setForm] = useState({ hr: "", rr: "", spo2: "", temp: "" });
  const [note, setNote] = useState("");
  const [aiWeight, setAiWeight] = useState(0);
  const [aiStatus, setAiStatus] = useState("idle"); // idle | loading | done
  const [aiResult, setAiResult] = useState("");
  const [activeVital, setActiveVital] = useState("hr");
  const [activeNav, setActiveNav] = useState("Overview");

  const score = calcPDIScore(vitalData);
  const overallLevel = score >= 60 ? "crit" : score >= 35 ? "warn" : "ok";

  const handleAddVitals = useCallback(() => {
    const hr = parseFloat(form.hr);
    const rr = parseFloat(form.rr);
    const spo2 = parseFloat(form.spo2);
    const temp = parseFloat(form.temp);
    if ([hr, rr, spo2, temp].some(isNaN)) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    setVitalData(prev => ({
      hr: [...prev.hr, hr],
      rr: [...prev.rr, rr],
      spo2: [...prev.spo2, spo2],
      temp: [...prev.temp, temp],
    }));
    setTimes(prev => [...prev, timeStr]);
    setForm({ hr: "", rr: "", spo2: "", temp: "" });
  }, [form]);

  const handleAnalyzeNote = useCallback(async () => {
    if (!note.trim()) return;
    setAiStatus("loading");
    setAiResult("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are a clinical decision support AI for a NICU. Analyze nursing notes for high-risk clinical descriptors associated with neonatal sepsis or deterioration (e.g. mottled skin, lethargy, increased work of breathing, poor feeding, temperature instability, capillary refill >3s, bulging fontanelle, seizure activity).

Return ONLY a JSON object with no preamble or markdown. Format:
{
  "risk_weight": <number 0.0–1.0>,
  "flagged_terms": ["term1", "term2"],
  "reasoning": "<one sentence>"
}

risk_weight 0.0 = no concerning features, 1.0 = multiple high-risk sepsis markers.`,
          messages: [{ role: "user", content: `Nursing note: "${note}"` }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "{}";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setAiWeight(parsed.risk_weight ?? 0);
      setAiResult(parsed);
      setAiStatus("done");
    } catch (e) {
      setAiStatus("error");
      setAiResult({ risk_weight: 0, flagged_terms: [], reasoning: "API error: " + e.message });
    }
  }, [note]);

  const navItems = [
    { section: "Patient", items: ["Overview", "History", "Labs"] },
    { section: "Monitoring", items: ["Vitals", "Trends", "Alerts"] },
    { section: "Clinical", items: ["Notes", "Orders"] },
    { section: "Ward", items: ["Census", "Handover"] },
  ];

  const statusColor = overallLevel === "crit" ? t.crit : overallLevel === "warn" ? t.warn : t.safe;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: t.bg, color: t.text, minHeight: "100vh", display: "flex", flexDirection: "column", transition: "background 0.2s, color 0.2s" }}>

      {/* Status strip */}
      <div style={{ height: 7, background: statusColor, transition: "background 0.4s" }} />

      {/* Header */}
      <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="2" width="16" height="16" rx="3" stroke={t.brand} strokeWidth="1.5" />
            <path d="M5 10h2l1.5-4 2 8 1.5-4H16" stroke={t.brand} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.brand, letterSpacing: "0.03em" }}>NeoSentinel PDI</span>
        </div>
        <div style={{ width: 1, height: 28, background: t.border }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Adaeze O. — MRN 004821</div>
          <div style={{ fontSize: 11, color: t.muted, fontFamily: "'IBM Plex Mono'" }}>GA 28+3 · DOL 14 · NICU Bay 3</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>PDI Risk Score</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 24, fontWeight: 500, color: statusColor }}>{score}</span>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: t.muted }}>/100</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, marginLeft: 4 }}>
                {overallLevel === "crit" ? "HIGH" : overallLevel === "warn" ? "MON" : "STABLE"}
              </span>
            </div>
          </div>
          <button
            onClick={() => setDark(d => !d)}
            style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "'IBM Plex Sans'", fontSize: 12, fontWeight: 500 }}
          >
            {dark ? "Light" : "Dark"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1 }}>

        {/* Sidebar */}
        <div style={{ width: 160, background: t.surface, borderRight: `1px solid ${t.border}`, padding: "12px 0", flexShrink: 0 }}>
          {navItems.map(({ section, items }) => (
            <div key={section} style={{ marginBottom: 16, padding: "0 8px" }}>
              <div style={{ fontSize: 10, color: t.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px", marginBottom: 4 }}>
                {section}
              </div>
              {items.map(item => (
                <div
                  key={item}
                  onClick={() => setActiveNav(item)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
                    borderRadius: 5, cursor: "pointer",
                    color: activeNav === item ? t.brand : t.muted,
                    background: activeNav === item ? t.bg : "transparent",
                    fontSize: 12, fontWeight: 500,
                    transition: "background 0.1s, color 0.1s",
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Alert */}
          <AlertCard score={score} vitalData={vitalData} aiWeight={aiWeight} t={t} />

          {/* Vital cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {Object.keys(THRESHOLDS).map(key => (
              <div key={key} onClick={() => setActiveVital(key)} style={{ cursor: "pointer" }}>
                <VitalCard vitalKey={key} readings={vitalData[key]} t={t} aiWeight={key === "hr" ? aiWeight : 0} />
              </div>
            ))}
          </div>

          {/* Trend chart + Score */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>

            {/* Chart panel */}
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: t.muted }}>
                  {THRESHOLDS[activeVital].label} — trend + 4h projection
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {Object.keys(THRESHOLDS).map(k => (
                    <button
                      key={k}
                      onClick={() => setActiveVital(k)}
                      style={{
                        fontFamily: "'IBM Plex Mono'", fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
                        border: `1px solid ${activeVital === k ? t.brand : t.border}`,
                        background: activeVital === k ? t.brand : "transparent",
                        color: activeVital === k ? "#fff" : t.muted,
                      }}
                    >
                      {k.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <TrendChart vitalKey={activeVital} readings={vitalData[activeVital]} times={times} t={t} />
              <div style={{ marginTop: 8, fontSize: 10, color: t.muted, fontFamily: "'IBM Plex Mono'" }}>
                dashed red = projected · dashed gray = regression line · shaded zone = danger
              </div>
            </div>

            {/* Score breakdown */}
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: t.muted, marginBottom: 10 }}>
                PDI Score
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 8 }}>
                <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 48, fontWeight: 500, color: statusColor, lineHeight: 1 }}>{score}</span>
                <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 16, color: t.muted, marginBottom: 6 }}>/100</span>
              </div>
              <div style={{ height: 6, background: t.border, borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", width: `${score}%`, background: statusColor, borderRadius: 3, transition: "width 0.5s" }} />
              </div>
              {[
                { label: "SpO₂ variability", w: 30 },
                { label: "HR trend",         w: 25 },
                { label: "Temperature",      w: 25 },
                { label: "Resp stability",   w: 20 },
              ].map(({ label, w }) => {
                const key = label.toLowerCase().includes("spo") ? "spo2"
                  : label.toLowerCase().includes("hr") ? "hr"
                  : label.toLowerCase().includes("temp") ? "temp" : "rr";
                const { projected } = projectVital(vitalData[key]);
                const thresh = THRESHOLDS[key];
                let ratio;
                if (thresh.invert) {
                  ratio = Math.max(0, Math.min(1, (thresh.crit - projected) / (thresh.crit - 70)));
                } else {
                  ratio = Math.max(0, Math.min(1, (projected - thresh.warn) / (thresh.crit - thresh.warn + 10)));
                }
                const barColor = ratio > 0.6 ? t.crit : ratio > 0.3 ? t.warn : t.safe;
                const pts = Math.round(ratio * w);
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11 }}>
                    <span style={{ flex: 1, color: t.muted }}>{label}</span>
                    <div style={{ flex: 2, height: 4, background: t.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${ratio * 100}%`, background: barColor, borderRadius: 2, transition: "width 0.5s" }} />
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, color: t.muted, minWidth: 28, textAlign: "right" }}>
                      {pts}/{w}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vitals entry + AI notes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            {/* Entry form */}
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: t.muted, marginBottom: 10 }}>
                Log vital signs
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                {Object.entries(THRESHOLDS).map(([key, cfg]) => (
                  <div key={key}>
                    <label style={{ fontSize: 10, color: t.muted, display: "block", marginBottom: 3 }}>{cfg.label} ({cfg.unit})</label>
                    <input
                      type="number"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={vitalData[key][vitalData[key].length - 1]?.toString()}
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: 5,
                        border: `1px solid ${t.border}`, background: t.bg,
                        color: t.text, fontFamily: "'IBM Plex Mono'", fontSize: 13,
                        outline: "none",
                      }}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={handleAddVitals}
                style={{
                  width: "100%", padding: "8px", borderRadius: 6,
                  border: `1px solid ${t.brand}`, background: t.brand,
                  color: "#fff", fontSize: 12, fontWeight: 600,
                  fontFamily: "'IBM Plex Sans'", cursor: "pointer",
                }}
              >
                Record vitals
              </button>
              <div style={{ marginTop: 8, fontSize: 10, color: t.muted, fontFamily: "'IBM Plex Mono'" }}>
                {times.length} readings logged · last at {times[times.length - 1]}
              </div>
            </div>

            {/* AI notes */}
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: t.muted, marginBottom: 10 }}>
                AI nursing note analysis
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder='e.g. "Slightly mottled skin on abdomen. Increased work of breathing."'
                rows={4}
                style={{
                  width: "100%", padding: "8px", borderRadius: 6,
                  border: `1px solid ${t.border}`, background: t.bg,
                  color: t.text, fontFamily: "'IBM Plex Sans'", fontSize: 12,
                  resize: "none", outline: "none", lineHeight: 1.5,
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={handleAnalyzeNote}
                disabled={aiStatus === "loading"}
                style={{
                  width: "100%", padding: "8px", borderRadius: 6, marginTop: 8,
                  border: `1px solid ${t.brand}`,
                  background: aiStatus === "loading" ? t.bg : t.brand,
                  color: aiStatus === "loading" ? t.muted : "#fff",
                  fontSize: 12, fontWeight: 600,
                  fontFamily: "'IBM Plex Sans'", cursor: aiStatus === "loading" ? "default" : "pointer",
                }}
              >
                {aiStatus === "loading" ? "Analysing…" : "Analyse with Claude"}
              </button>
              {aiStatus === "done" && aiResult && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: aiWeight > 0.5 ? t.critBg : t.warnBg, borderRadius: 6, fontSize: 11, lineHeight: 1.6 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono'", fontWeight: 500, color: aiWeight > 0.5 ? t.crit : t.warn, marginBottom: 4 }}>
                    Risk weight: {(aiWeight * 100).toFixed(0)}%
                  </div>
                  {aiResult.flagged_terms?.length > 0 && (
                    <div style={{ color: t.text, marginBottom: 2 }}>
                      Flagged: {aiResult.flagged_terms.join(", ")}
                    </div>
                  )}
                  <div style={{ color: t.muted }}>{aiResult.reasoning}</div>
                </div>
              )}
              {aiStatus === "error" && (
                <div style={{ marginTop: 8, fontSize: 11, color: t.crit }}>{aiResult?.reasoning}</div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div style={{ background: t.surface, borderTop: `1px solid ${t.border}`, padding: "6px 20px", display: "flex", alignItems: "center", gap: 16, fontFamily: "'IBM Plex Mono'", fontSize: 10, color: t.muted }}>
        <span>
          <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: t.safe, marginRight: 4, verticalAlign: "middle" }} />
          Live · {new Date().toLocaleTimeString()}
        </span>
        <span style={{ marginLeft: "auto" }}>Shift: Night → Day 09:00</span>
        <span>NeoSentinel v1.0 · Hackathon build</span>
      </div>

    </div>
  );
}