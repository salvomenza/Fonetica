import { useState, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const SYMS = {
  vocali: ["i", "e", "ɛ", "a", "ɔ", "o", "u", "ː"],
  consonanti: ["ʃ", "ʒ", "tʃ", "dʒ", "ts", "dz", "ɲ", "ʎ", "ŋ", "r", "j", "w", "h"],
  diacritici: ["ˈ", "ˌ", ".", "[", "]"],
};

async function apiFetch(path, body) {
  const resp = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Errore server");
  return data;
}

const MSG_UNAVAILABLE = "Il servizio di generazione automatica è momentaneamente non disponibile. Puoi inserire la tua frase manualmente.";
const MSG_VERIFY_UNAVAILABLE = "Il servizio di verifica è momentaneamente non disponibile.";

const s = {
  wrap: { maxWidth: 740, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "Georgia, serif", background: "#fafafa", minHeight: "100vh" },
  h1: { fontSize: 26, fontWeight: 700, marginBottom: 4, letterSpacing: -0.5, color: "#1a1a1a" },
  sub: { fontSize: 13, color: "#888", fontFamily: "system-ui", marginBottom: 28 },
  card: { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  lbl: { fontSize: 10, fontFamily: "system-ui", color: "#aaa", textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 10 },
  fraseText: { fontSize: 24, fontWeight: 700, fontStyle: "italic", lineHeight: 1.4, color: "#1a1a1a" },
  note: { fontSize: 12, fontFamily: "system-ui", color: "#999", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f0f0" },
  textarea: { width: "100%", fontFamily: "'Courier New', monospace", fontSize: 17, padding: "12px 14px", borderRadius: 8, border: "1px solid #ddd", background: "#fafafa", color: "#1a1a1a", resize: "vertical", minHeight: 72, lineHeight: 1.5, outline: "none", boxSizing: "border-box", marginBottom: 12 },
  solIpa: { fontFamily: "'Courier New', monospace", fontSize: 14, background: "#f5f5f5", padding: "10px 14px", borderRadius: 8, display: "block", wordBreak: "break-all", lineHeight: 1.7, marginBottom: 14 },
  errTag: { display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#fff0ec", color: "#c0391b", marginBottom: 4, fontFamily: "system-ui" },
  unavail: { fontFamily: "system-ui", fontSize: 13, color: "#7a4a00", background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: 8, padding: "10px 14px", marginTop: 8 },
  srcBadge: (src) => ({
    display: "inline-block", fontSize: 10, padding: "1px 6px", borderRadius: 3, marginLeft: 6, fontFamily: "system-ui",
    background: src === "wiktionary" ? "#e8f4e8" : src === "utente" ? "#f0f0f0" : "#e8eef8",
    color: src === "wiktionary" ? "#2d6a0f" : src === "utente" ? "#666" : "#1a3a7a",
  }),
};

function Btn({ children, onClick, primary, disabled, style = {} }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      fontFamily: "system-ui", fontSize: 13, fontWeight: 500,
      padding: "9px 18px", borderRadius: 8,
      border: primary ? "1px solid #1a1a1a" : "1px solid #ddd",
      cursor: disabled ? "not-allowed" : "pointer",
      background: primary ? "#1a1a1a" : "transparent",
      color: primary ? "#fff" : "#333",
      opacity: disabled ? 0.35 : 1,
      ...style
    }}>{children}</button>
  );
}

function Spinner() {
  return <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid #ddd", borderTopColor: "#555", borderRadius: "50%", animation: "spin 0.7s linear infinite", marginRight: 7, verticalAlign: "middle" }} />;
}

function SymBar({ onInsert }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {Object.entries(SYMS).map(([group, syms]) => (
        <div key={group} style={{ marginBottom: 8 }}>
          <span style={s.lbl}>{group}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {syms.map(sym => (
              <button key={sym} onClick={() => onInsert(sym)} style={{
                fontFamily: "'Courier New', monospace", fontSize: 15,
                padding: "4px 9px", borderRadius: 6,
                border: "1px solid #e0e0e0", background: "#f5f5f5",
                cursor: "pointer", color: "#333"
              }}>{sym}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const cbtn = { fontFamily: "'Courier New', monospace", fontSize: 14, padding: "5px 14px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "transparent", color: "#333" };
const cbtnSel = { ...cbtn, background: "#1a1a1a", color: "#fff", borderColor: "#1a1a1a" };

export default function App() {
  const [page, setPage] = useState(0);
  const [frase, setFrase] = useState("");
  const [customFrase, setCustomFrase] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [genUnavail, setGenUnavail] = useState(false);

  const [infoParole, setInfoParole] = useState([]);
  const [needsInput, setNeedsInput] = useState([]);
  const [userChoices, setUserChoices] = useState({});
  const [lookupLoading, setLookupLoading] = useState(false);

  const [ipaValue, setIpaValue] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [fbLoading, setFbLoading] = useState(false);
  const taRef = useRef(null);

  function insertSym(sym) {
    const ta = taRef.current;
    if (!ta) return;
    const st = ta.selectionStart, en = ta.selectionEnd;
    const newVal = ipaValue.slice(0, st) + sym + ipaValue.slice(en);
    setIpaValue(newVal);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = st + sym.length; ta.focus(); }, 0);
  }

  async function generaFrase() {
    setGenLoading(true); setGenMsg(""); setGenUnavail(false);
    try {
      const data = await apiFetch("/api/generate", {});
      setFrase(data.frase);
      await doLookup(data.frase);
    } catch (e) {
      if (e.message === "service_unavailable") {
        setGenUnavail(true);
        setShowCustom(true);
      } else {
        setGenMsg("Errore: " + e.message);
      }
    }
    setGenLoading(false);
  }

  async function usaCustom() {
    if (!customFrase.trim()) return;
    setFrase(customFrase.trim());
    await doLookup(customFrase.trim());
  }

  async function doLookup(f) {
    setLookupLoading(true);
    setPage(1);
    const words = f.match(/[a-zA-ZÀ-ù]+/g) || [];
    const unique = [...new Set(words.map(w => w.toLowerCase()))];
    try {
      const data = await apiFetch("/api/lookup", { words: unique });
      setInfoParole(data.results || []);
      setNeedsInput(data.needs_user_input || []);
      setUserChoices({});
      if ((data.needs_user_input || []).length > 0) {
        setPage(2);
      } else {
        setIpaValue(""); setFeedback(null); setPage(3);
      }
    } catch (e) {
      setGenMsg("Errore lookup: " + e.message);
      setPage(0);
    }
    setLookupLoading(false);
  }

  function setChoice(word, key, val) {
    setUserChoices(prev => ({ ...prev, [word]: { ...(prev[word] || {}), [key]: val } }));
  }

  function allChoicesDone() {
    return needsInput.every(word => {
      const ch = userChoices[word] || {};
      return ch.v !== undefined && ch.sz !== undefined;
    });
  }

  async function verifica() {
    if (!ipaValue.trim()) return;
    setFbLoading(true); setFeedback(null);
    try {
      const data = await apiFetch("/api/verify", {
        frase, trascrizione: ipaValue.trim(),
        info_parole: infoParole, user_choices: userChoices,
      });
      setFeedback({ data, soloSol: false });
    } catch (e) {
      if (e.message === "service_unavailable") {
        setFeedback({ unavail: true });
      } else {
        setFeedback({ error: e.message });
      }
    }
    setFbLoading(false);
  }

  async function mostraSol() {
    setFbLoading(true); setFeedback(null);
    try {
      const data = await apiFetch("/api/solution", {
        frase, info_parole: infoParole, user_choices: userChoices,
      });
      setFeedback({ data, soloSol: true });
    } catch (e) {
      if (e.message === "service_unavailable") {
        setFeedback({ unavail: true });
      } else {
        setFeedback({ error: e.message });
      }
    }
    setFbLoading(false);
  }

  function reset() {
    setPage(0); setFrase(""); setCustomFrase(""); setShowCustom(false);
    setGenMsg(""); setGenUnavail(false); setInfoParole([]); setNeedsInput([]);
    setUserChoices({}); setIpaValue(""); setFeedback(null);
  }

  function buildNoteItems() {
    const items = [];
    infoParole.forEach(info => {
      const pp = [];
      if (info.has_epsilon) pp.push("e→ɛ");
      if (info.has_open_o) pp.push("o→ɔ");
      if (info.has_voiced_s) pp.push("s→z");
      if (info.has_voiced_z) pp.push("z→dz");
      if (info.has_voiceless_z) pp.push("z→ts");
      if (pp.length) items.push({ word: info.word, src: info.source, pp });
    });
    Object.entries(userChoices).forEach(([w, ch]) => {
      const pp = [];
      if (ch.v && ch.v !== "n/a") pp.push(`vocale→${ch.v}`);
      if (ch.sz && ch.sz !== "n/a") pp.push(`sz→${ch.sz}`);
      if (pp.length) items.push({ word: w, src: "utente", pp });
    });
    return items;
  }

  const verdMap = {
    corretto: ["Corretto ✓", "#2d6a0f"],
    parzialmente_corretto: ["Parzialmente corretto", "#7a4a00"],
    errato: ["Errato", "#8b1a1a"],
  };

  return (
    <div style={s.wrap}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} button:active{opacity:0.7}`}</style>

      <h1 style={s.h1}>Laboratorio di fonetica italiana</h1>
      <p style={s.sub}>Trascrizione IPA · Convenzioni del corso · Studenti di linguistica</p>

      {/* PAGE 0: scelta frase */}
      {page === 0 && (
        <div style={s.card}>
          <span style={s.lbl}>Scegli la frase</span>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <Btn primary onClick={generaFrase} disabled={genLoading}>
              {genLoading ? <><Spinner />Generazione...</> : "Generami una frase bizzarra"}
            </Btn>
            <Btn onClick={() => setShowCustom(v => !v)}>Inserisco la mia frase</Btn>
          </div>
          {genUnavail && <div style={s.unavail}>{MSG_UNAVAILABLE}</div>}
          {showCustom && (
            <div style={{ marginBottom: 10, marginTop: 10 }}>
              <input value={customFrase} onChange={e => setCustomFrase(e.target.value)}
                placeholder="Scrivi qui la tua frase..."
                style={{ width: "100%", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 18, padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", background: "#fafafa", color: "#1a1a1a", boxSizing: "border-box", outline: "none", marginBottom: 8 }} />
              <Btn primary onClick={usaCustom} disabled={!customFrase.trim()}>Usa questa frase →</Btn>
            </div>
          )}
          {genMsg && <div style={{ fontFamily: "system-ui", fontSize: 13, color: "#c0391b", marginTop: 8 }}>{genMsg}</div>}
        </div>
      )}

      {/* PAGE 1: lookup */}
      {page === 1 && (
        <div style={s.card}>
          <div style={{ fontFamily: "system-ui", fontSize: 14, color: "#888" }}>
            <Spinner />Ricerca nel dizionario in corso...
          </div>
        </div>
      )}

      {/* PAGE 2: input utente */}
      {page === 2 && (
        <>
          <div style={s.card}>
            <span style={s.lbl}>Frase</span>
            <div style={s.fraseText}>{frase}</div>
          </div>
          <div style={s.card}>
            <span style={s.lbl}>Informazioni mancanti dal dizionario</span>
            <p style={{ fontFamily: "system-ui", fontSize: 13, color: "#888", marginBottom: 14 }}>
              Per le seguenti parole non è stato possibile trovare informazioni. Specifica tu:
            </p>
            {needsInput.map(word => {
              const ch = userChoices[word] || {};
              return (
                <div key={word} style={{ padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ fontStyle: "italic", fontFamily: "Georgia, serif", fontSize: 17, marginBottom: 8 }}>{word}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#999", fontFamily: "system-ui", minWidth: 110 }}>vocale tonica e/o</span>
                      {[["e","e chiusa"],["ɛ","ɛ aperta"],["o","o chiusa"],["ɔ","ɔ aperta"],["n/a","n/a"]].map(([val,lab]) => (
                        <button key={val} onClick={() => setChoice(word, "v", val)} style={ch.v === val ? cbtnSel : cbtn}>{lab}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#999", fontFamily: "system-ui", minWidth: 110 }}>s/z intervocalica</span>
                      {[["s","s sorda"],["z","z sonora"],["ts","ts sorda"],["dz","dz sonora"],["n/a","n/a"]].map(([val,lab]) => (
                        <button key={val} onClick={() => setChoice(word, "sz", val)} style={ch.sz === val ? cbtnSel : cbtn}>{lab}</button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 16 }}>
              <Btn primary disabled={!allChoicesDone()} onClick={() => { setIpaValue(""); setFeedback(null); setPage(3); }}>
                Prosegui →
              </Btn>
            </div>
          </div>
          <Btn onClick={reset}>← Ricomincia</Btn>
        </>
      )}

      {/* PAGE 3: trascrizione */}
      {page === 3 && (
        <>
          <div style={s.card}>
            <span style={s.lbl}>Frase da trascrivere</span>
            <div style={s.fraseText}>{frase}</div>
            {buildNoteItems().length > 0 && (
              <div style={s.note}>
                {buildNoteItems().map(({word, src, pp}) => (
                  <span key={word} style={{ marginRight: 12 }}>
                    <em>{word}</em>
                    <span style={s.srcBadge(src)}>{src}</span>
                    {": " + pp.join(", ")}
                  </span>
                ))}
              </div>
            )}
          </div>

          <SymBar onInsert={insertSym} />

          <textarea
            ref={taRef}
            value={ipaValue}
            onChange={e => setIpaValue(e.target.value)}
            placeholder="Scrivi qui la tua trascrizione IPA..."
            spellCheck={false}
            style={s.textarea}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <Btn primary onClick={verifica} disabled={fbLoading || !ipaValue.trim()}>Verifica trascrizione</Btn>
            <Btn onClick={mostraSol} disabled={fbLoading}>Mostra soluzione</Btn>
            <Btn onClick={reset}>← Ricomincia</Btn>
          </div>

          {fbLoading && (
            <div style={{ ...s.card, color: "#888", fontFamily: "system-ui", fontSize: 14 }}>
              <Spinner />Analisi in corso...
            </div>
          )}

          {feedback?.unavail && (
            <div style={s.unavail}>{MSG_VERIFY_UNAVAILABLE}</div>
          )}

          {feedback?.error && (
            <div style={{ ...s.card, color: "#c0391b", fontFamily: "system-ui", fontSize: 13 }}>
              Errore: {feedback.error}
            </div>
          )}

          {feedback?.data && (() => {
            const r = feedback.data;
            const soloSol = feedback.soloSol;
            const v = r.esito || "errato";
            const [vLabel, vColor] = verdMap[v] || ["Errato", "#8b1a1a"];
            return (
              <div style={s.card}>
                {!soloSol && (
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f0f0f0", fontFamily: "system-ui", color: vColor }}>{vLabel}</div>
                )}
                <span style={s.lbl}>Trascrizione corretta</span>
                <code style={s.solIpa}>{r.trascrizione_corretta}</code>

                {r.context?.length > 0 && (
                  <div style={{ fontSize: 12, color: "#bbb", fontFamily: "system-ui", marginBottom: 14 }}>
                    {r.context.join(" · ")}
                  </div>
                )}

                {!soloSol && r.errori?.length > 0 && (
                  <>
                    <span style={s.lbl}>Errori ({r.errori.length})</span>
                    {r.errori.map((e, i) => (
                      <div key={i} style={{ padding: "10px 0", borderBottom: i < r.errori.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                        <span style={s.errTag}>{e.tipo}</span><br />
                        <span style={{ fontSize: 13, color: "#888", fontFamily: "system-ui" }}>
                          studente: <code style={{ color: "#1a1a1a", fontFamily: "'Courier New', monospace" }}>{e.studente}</code>
                          {" → "}atteso: <code style={{ color: "#1a1a1a", fontFamily: "'Courier New', monospace" }}>{e.atteso}</code>
                        </span><br />
                        <span style={{ fontSize: 13, color: "#666", fontFamily: "system-ui" }}>{e.spiegazione}</span>
                      </div>
                    ))}
                  </>
                )}
                {!soloSol && r.errori?.length === 0 && (
                  <div style={{ fontFamily: "system-ui", fontSize: 13, color: "#2d6a0f", marginBottom: 12 }}>Nessun errore rilevato.</div>
                )}
                {!soloSol && r.commento_generale && (
                  <div style={{ fontFamily: "system-ui", fontSize: 13, color: "#888", marginBottom: 12, fontStyle: "italic" }}>{r.commento_generale}</div>
                )}
                {r.fenomeni?.length > 0 && (
                  <>
                    <span style={{ ...s.lbl, marginTop: 8 }}>Fenomeni fonologici nella frase</span>
                    {r.fenomeni.map((f, i) => (
                      <div key={i} style={{ padding: "8px 0", borderBottom: i < r.fenomeni.length - 1 ? "1px solid #f5f5f5" : "none", fontFamily: "system-ui", fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: "#333", marginRight: 6 }}>{f.nome}.</span>
                        <span style={{ color: "#666" }}>{f.descrizione}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
