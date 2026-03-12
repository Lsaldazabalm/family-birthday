import { useState, useEffect, useRef } from "react";
import {
  subscribeMembers, subscribePayments, subscribeWishes, subscribeConfig,
  addMember, updateMember, deleteMember, deletePaymentsByMember,
  addPayment, confirmPayment,
  addWish, reactToWish,
  updateGroupProfile, addPendingApproval, dismissPendingApproval,
  hashPin,
} from "./db";

// Make hashPin available to all components in this file
const _hashPin = hashPin;

// ── WhatsApp helper ────────────────────────────────────────────────────────
const openWhatsApp = (phone, msg) => {
  const clean = phone.replace(/\D/g,"");
  const num   = clean.startsWith("51") ? clean : `51${clean}`;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
};
const PAYMENT_AMOUNT = 10;
const ADMIN_MASTER_KEY = "admin2024"; // clave maestra para registrarse como admin

const todayObj = () => {
  const d = new Date();
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
};

const parseDob = (dob) => {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  return { day: d, month: m, year: y };
};

const displayDob = (dob) => {
  const p = parseDob(dob);
  if (!p) return "";
  return `${String(p.day).padStart(2,"0")}/${String(p.month).padStart(2,"0")}/${p.year}`;
};

const isBirthdayToday = (dob) => {
  const t = todayObj(); const b = parseDob(dob);
  return b && b.day === t.day && b.month === t.month;
};

const daysUntilBirthday = (dob) => {
  const b = parseDob(dob); if (!b) return 999;
  const now = new Date();
  const next = new Date(now.getFullYear(), b.month - 1, b.day);
  if (next <= now) next.setFullYear(now.getFullYear() + 1);
  return Math.ceil((next - now) / 86400000);
};

const getInitials = (name) => name.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();

const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const AVATAR_COLORS = ["#FF6B6B","#4ECDC4","#F7B731","#A8E6CF","#FF8B94","#B8B8FF","#FFDAC1","#E2F0CB","#C7CEEA","#F9C784","#6C5CE7","#00B894"];

const PAY_METHODS = [
  { id:"yape",     label:"Yape",     icon:"💜", color:"#7B2D8B" },
  { id:"plin",     label:"Plin",     icon:"💚", color:"#00A86B" },
  { id:"efectivo", label:"Efectivo", icon:"💵", color:"#F39C12" },
];

// localStorage eliminado — Firebase maneja la persistencia

function hasPaid(payments, payerId, birthdayMemberId, month, year) {
  return payments.some(p => p.payerId===payerId && p.birthdayMemberId===birthdayMemberId && p.forMonth===month && p.forYear===year);
}

// ── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ member, size=44 }) {
  // Dicebear: avatar SVG único generado por nombre — sin Storage, sin costo
  const seed   = encodeURIComponent(member.name || "user");
  const imgUrl = `https://api.dicebear.com/8.x/thumbs/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&radius=50`;
  return (
    <img
      src={imgUrl}
      alt={member.name}
      width={size}
      height={size}
      style={{ borderRadius:"50%", flexShrink:0, border:"2.5px solid rgba(255,255,255,0.22)", boxShadow:"0 2px 10px rgba(0,0,0,0.28)", background:"#1e0845", display:"block" }}
    />
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, []);
  const bg = type==="success" ? "#22c55e" : type==="warn" ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ position:"fixed", top:58, left:"50%", transform:"translateX(-50%)",
      background:bg, color:"#fff", padding:"13px 24px", borderRadius:18,
      fontWeight:700, fontSize:14, zIndex:9999, maxWidth:330, textAlign:"center",
      boxShadow:"0 6px 24px rgba(0,0,0,0.3)", animation:"toastIn .3s ease" }}>
      {msg}
    </div>
  );
}

// ── Payment Method Selector ────────────────────────────────────────────────
function MethodSelector({ value, onChange }) {
  return (
    <div>
      <p style={{ color:"rgba(255,255,255,0.5)", fontSize:12, fontWeight:700, margin:"0 0 8px", letterSpacing:.8 }}>
        MÉTODO DE PAGO <span style={{ color:"#f87171" }}>*</span>
      </p>
      <div style={{ display:"flex", gap:8 }}>
        {PAY_METHODS.map(m => (
          <button key={m.id} onClick={() => onChange(m.id)}
            style={{ flex:1, padding:"12px 6px",
              border:`2px solid ${value===m.id ? m.color : "rgba(255,255,255,0.1)"}`,
              borderRadius:14, background:value===m.id ? `${m.color}22` : "rgba(255,255,255,0.04)",
              cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all .18s" }}>
            <span style={{ fontSize:22 }}>{m.icon}</span>
            <span style={{ color:value===m.id ? "#fff" : "rgba(255,255,255,0.45)", fontSize:12, fontWeight:700 }}>{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Voucher Upload ─────────────────────────────────────────────────────────
function VoucherUpload({ value, onChange, method }) {
  const ref = useRef();
  if (method==="efectivo") return (
    <div style={{ marginTop:14, padding:"12px 14px", background:"rgba(243,156,18,0.1)", borderRadius:12, border:"1px solid rgba(243,156,18,0.25)" }}>
      <p style={{ color:"#fbbf24", fontSize:13, fontWeight:600, margin:0 }}>💵 Pago en efectivo — sin comprobante</p>
    </div>
  );
  return (
    <div style={{ marginTop:14 }}>
      <p style={{ color:"rgba(255,255,255,0.5)", fontSize:12, fontWeight:700, margin:"0 0 8px", letterSpacing:.8 }}>
        COMPROBANTE {method==="yape"?"YAPE":"PLIN"} <span style={{ color:"rgba(255,255,255,0.3)", fontWeight:400 }}>(opcional)</span>
      </p>
      <div onClick={() => ref.current.click()}
        style={{ width:"100%", height:value?"auto":88, borderRadius:14,
          border:"2px dashed rgba(255,255,255,0.14)", background:"rgba(255,255,255,0.04)",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          cursor:"pointer", overflow:"hidden" }}>
        {value
          ? <img src={value} alt="voucher" style={{ width:"100%", borderRadius:12, display:"block" }} />
          : <><span style={{ fontSize:26, marginBottom:4 }}>📸</span>
             <span style={{ color:"rgba(255,255,255,0.3)", fontSize:12 }}>Adjuntar captura</span></>}
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = ev => onChange(ev.target.result);
        r.readAsDataURL(f);
      }} />
    </div>
  );
}

// ── PIN Pad ────────────────────────────────────────────────────────────────
function PinPad({ value, onChange, onSubmit, error, label, submitLabel }) {
  const digits = [1,2,3,4,5,6,7,8,9,null,0,"⌫"];
  const handleKey = (k) => {
    if (k === "⌫") { onChange(value.slice(0,-1)); return; }
    if (k === null) return;
    if (value.length < 4) { const next = value + k; onChange(next); if (next.length===4 && onSubmit) setTimeout(()=>onSubmit(next),120); }
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
      <p style={{ color:"rgba(255,255,255,0.5)", fontSize:13, fontWeight:600, margin:"0 0 16px", textAlign:"center" }}>{label}</p>
      {/* dots */}
      <div style={{ display:"flex", gap:16, marginBottom:20 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width:18, height:18, borderRadius:"50%",
            background: i < value.length ? "#a855f7" : "rgba(255,255,255,0.15)",
            border: "2px solid " + (i < value.length ? "#a855f7" : "rgba(255,255,255,0.2)"),
            transition:"all .15s",
            boxShadow: i < value.length ? "0 0 10px rgba(168,85,247,0.6)" : "none" }} />
        ))}
      </div>
      {error && <p style={{ color:"#f87171", fontSize:12, fontWeight:600, margin:"0 0 12px", textAlign:"center" }}>{error}</p>}
      {/* keypad */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, width:220 }}>
        {digits.map((k,i) => (
          <button key={i} onClick={() => k!==null && handleKey(k)}
            style={{ height:60, borderRadius:16,
              background: k==="⌫" ? "rgba(248,113,113,0.12)" : k===null ? "transparent" : "rgba(255,255,255,0.07)",
              border: k===null ? "none" : k==="⌫" ? "1.5px solid rgba(248,113,113,0.25)" : "1.5px solid rgba(255,255,255,0.1)",
              color: k==="⌫" ? "#f87171" : "#fff",
              fontSize: k==="⌫" ? 20 : 22, fontWeight:700, cursor:k===null?"default":"pointer",
              transition:"all .12s" }}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════ SCREENS ═══════════════════════════════════════════


// ── Countdown component ───────────────────────────────────────────────────
function BirthdayCountdown({ member }) {
  const days = daysUntilBirthday(member.dob);
  const isToday = days === 0;
  const size = 110;
  const r = 44; const circ = 2 * Math.PI * r;
  const pct = isToday ? 1 : Math.max(0, 1 - (days / 365));
  const dash = circ * pct;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"18px 0 10px"}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={isToday?"#fbbf24":"#a855f7"} strokeWidth={8}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          {isToday
            ? <span style={{fontSize:28}}>🎂</span>
            : <><span style={{color:"#fff",fontWeight:900,fontSize:22,lineHeight:1}}>{days}</span>
               <span style={{color:"rgba(255,255,255,0.4)",fontSize:10}}>días</span></>}
        </div>
      </div>
      <p style={{color:isToday?"#fbbf24":"rgba(255,255,255,0.5)",fontSize:12,fontWeight:700,margin:"6px 0 0"}}>
        {isToday ? "¡HOY ES TU CUMPLEAÑOS! 🎉" : "Para tu próximo cumpleaños"}
      </p>
    </div>
  );
}

// ── Group Profile Screen ───────────────────────────────────────────────────
function GroupProfileScreen({ groupProfile, onSave, onBack, isAdmin }) {
  const [name,  setName]  = useState(groupProfile.name  || "Mi Grupo Familiar");
  const [desc,  setDesc]  = useState(groupProfile.desc  || "");
  const [photo, setPhoto] = useState(groupProfile.photo || "");

  return (
    <div style={{minHeight:"100vh",background:"#0a0118",paddingBottom:100}}>
      <div style={{background:"linear-gradient(145deg,#1e0845,#3b0f8c)",padding:"50px 20px 30px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:12,padding:"9px 15px",color:"#fff",cursor:"pointer",fontSize:18}}>←</button>
          <h2 style={{color:"#fff",margin:0,fontWeight:800,fontSize:20}}>Perfil del Grupo</h2>
        </div>
        {/* Group avatar — emoji, sin subida de archivos */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
          <div style={{width:100,height:100,borderRadius:"50%",background:"linear-gradient(135deg,#a855f7,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",border:"3px solid rgba(255,255,255,0.2)",flexShrink:0}}>
            <span style={{fontSize:46}}>👨‍👩‍👧‍👦</span>
          </div>
        </div>
      </div>

      <div style={{padding:"22px 20px 0"}}>
        <div style={{marginBottom:16}}>
          <label style={{color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:700,display:"block",marginBottom:6,letterSpacing:.8}}>NOMBRE DEL GRUPO</label>
          <input value={name} onChange={e=>setName(e.target.value)} disabled={!isAdmin}
            style={{width:"100%",padding:"13px 16px",background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.1)",borderRadius:14,color:"#fff",fontSize:15,boxSizing:"border-box",opacity:isAdmin?1:.6}}/>
        </div>
        <div style={{marginBottom:24}}>
          <label style={{color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:700,display:"block",marginBottom:6,letterSpacing:.8}}>DESCRIPCIÓN</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} disabled={!isAdmin} rows={3}
            style={{width:"100%",padding:"13px 16px",background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.1)",borderRadius:14,color:"#fff",fontSize:14,resize:"none",outline:"none",boxSizing:"border-box",fontFamily:"inherit",opacity:isAdmin?1:.6}}
            placeholder="Ej: La junta de cumpleaños de la familia García 🎂"/>
        </div>
        {isAdmin && (
          <button onClick={()=>onSave({name,desc,photo:""})}
            style={{width:"100%",padding:"15px",background:"linear-gradient(135deg,#a855f7,#6366f1)",border:"none",borderRadius:16,color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer"}}>
            Guardar cambios
          </button>
        )}
      </div>
    </div>
  );
}

// ── PDF Export helper (text-based) ────────────────────────────────────────
function exportPDF(members, payments, month, year, groupProfile) {
  const MONTH_NAMES_PDF = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const bdaysInMonth = members.filter(m=>{ const b=parseDob(m.dob); return b&&b.month===month; });
  const lines = [];
  lines.push(`JUNTA DE CUMPLEAÑOS — ${groupProfile?.name||"Grupo"}`);
  lines.push(`Informe: ${MONTH_NAMES_PDF[month-1]} ${year}`);
  lines.push(`Generado: ${new Date().toLocaleDateString("es-PE")}`);
  lines.push("─".repeat(50));

  let grandTotal = 0;
  bdaysInMonth.forEach(bday => {
    const paidList = payments.filter(p=>p.birthdayMemberId===bday.id&&p.forMonth===month&&p.forYear===year);
    const total = paidList.reduce((s,p)=>s+p.amount,0);
    grandTotal += total;
    lines.push(`\n🎂 ${bday.name} (${displayDob(bday.dob)})`);
    lines.push(`   Recaudado: S/ ${total}`);
    paidList.forEach(p=>{
      const payer = members.find(m=>m.id===p.payerId);
      const method = p.method==="yape"?"Yape":p.method==="plin"?"Plin":"Efectivo";
      lines.push(`   ✓ ${payer?.name||"?"} — S/ ${p.amount} (${method})${p.type==="coverage"?" [COBERTURA]":""}`);
    });
    const pending = members.filter(m=>m.participates!==false&&!paidList.some(p=>p.payerId===m.id));
    if (pending.length>0) lines.push(`   ✗ Pendientes: ${pending.map(m=>m.name.split(" ")[0]).join(", ")}`);
  });

  lines.push("\n" + "─".repeat(50));
  lines.push(`TOTAL RECAUDADO: S/ ${grandTotal}`);
  lines.push(`PARTICIPANTES: ${members.filter(m=>m.participates!==false).length}`);

  const blob = new Blob([lines.join("\n")], {type:"text/plain;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `Junta_${MONTH_NAMES_PDF[month-1]}_${year}.txt`;
  a.click(); URL.revokeObjectURL(url);
}



// ── EditProfileScreen (admin & future users) ─────────────────────────────
function EditProfileScreen({ member, onSave, onBack }) {
  const [name,    setName]    = useState(member.name);
  const [phone,   setPhone]   = useState(member.phone);
  const [section, setSection] = useState("info"); // info | pin

  if (section === "pin") return (
    <ChangePinScreen
      member={member}
      onSave={newPin => { onSave({ ...member, name, phone, pin: newPin }); }}
      onBack={() => setSection("info")}
    />
  );

  return (
    <div style={{minHeight:"100vh",background:"#0a0118",paddingBottom:100}}>
      <div style={{background:"linear-gradient(145deg,#431407,#7c2d12)",padding:"50px 20px 28px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:12,padding:"9px 15px",color:"#fff",cursor:"pointer",fontSize:18}}>←</button>
          <h2 style={{color:"#fff",margin:0,fontWeight:800,fontSize:20}}>Editar mi perfil</h2>
        </div>
        {/* Avatar Dicebear — generado automáticamente por nombre */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <Avatar member={member} size={90} />
          <p style={{color:"rgba(255,255,255,0.4)",fontSize:12,margin:0}}>Avatar generado por tu nombre</p>
        </div>
      </div>

      <div style={{padding:"22px 20px 0"}}>
        <div style={{marginBottom:14}}>
          <label style={{color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:700,display:"block",marginBottom:6,letterSpacing:.8}}>NOMBRE</label>
          <input value={name} onChange={e=>setName(e.target.value)}
            style={{width:"100%",padding:"13px 16px",background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.1)",borderRadius:14,color:"#fff",fontSize:15,boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:700,display:"block",marginBottom:6,letterSpacing:.8}}>CELULAR</label>
          <input value={phone} onChange={e=>setPhone(e.target.value)} type="tel"
            style={{width:"100%",padding:"13px 16px",background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.1)",borderRadius:14,color:"#fff",fontSize:15,boxSizing:"border-box"}}/>
        </div>

        <button onClick={()=>onSave({...member,name,phone})}
          disabled={!name.trim()||!phone.trim()}
          style={{width:"100%",padding:"15px",background:name.trim()&&phone.trim()?"linear-gradient(135deg,#fbbf24,#f59e0b)":"#1e1e2e",border:"none",borderRadius:16,color:name.trim()&&phone.trim()?"#431407":"rgba(255,255,255,0.2)",fontWeight:800,fontSize:16,cursor:name.trim()&&phone.trim()?"pointer":"not-allowed",marginBottom:12}}>
          Guardar cambios
        </button>

        <button onClick={()=>setSection("pin")}
          style={{width:"100%",padding:"15px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,color:"rgba(255,255,255,0.6)",fontWeight:700,fontSize:15,cursor:"pointer"}}>
          🔑 Cambiar PIN
        </button>
      </div>
    </div>
  );
}

// ── Change PIN Screen ─────────────────────────────────────────────────────
function ChangePinScreen({ member, onSave, onBack, skipCurrent }) {
  // skipCurrent=true when user forgot PIN → go straight to new PIN
  const [step,   setStep]   = useState(skipCurrent ? "new" : "current");
  const [cur,    setCur]    = useState("");
  const [newPin, setNewPin] = useState("");
  const [conf,   setConf]   = useState("");
  const [err,    setErr]    = useState("");

  const handleCurrent = (v) => {
    if (_hashPin(v) === member.pinHash) { setStep("new"); setNewPin(""); setErr(""); }
    else { setErr("PIN incorrecto. Inténtalo de nuevo."); setCur(""); }
  };
  const handleNew     = (v) => { setNewPin(v); setStep("confirm"); setConf(""); setErr(""); };
  const handleConfirm = (v) => {
    if (v === newPin) { onSave(newPin); }
    else { setErr("Los PINs no coinciden."); setConf(""); setTimeout(()=>{ setStep("new"); setNewPin(""); setErr(""); },1200); }
  };

  const steps = {
    current:{ icon:"🔑", title:"PIN actual",  sub:"Ingresa tu PIN actual para continuar", val:cur,    set:setCur,    onSubmit:handleCurrent },
    new:    { icon:"🔐", title:"Nuevo PIN",    sub:"Elige un nuevo PIN de 4 dígitos",      val:newPin, set:setNewPin, onSubmit:handleNew },
    confirm:{ icon:"🔒", title:"Confirmar PIN",sub:"Repite el nuevo PIN para confirmar",   val:conf,   set:setConf,   onSubmit:handleConfirm },
  };
  const s = steps[step];
  const stepKeys = skipCurrent ? ["new","confirm"] : ["current","new","confirm"];

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0f0228,#1e0a45)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px"}}>
      <button onClick={onBack}
        style={{position:"absolute",top:52,left:20,background:"rgba(255,255,255,0.08)",border:"none",borderRadius:12,padding:"9px 15px",color:"#fff",cursor:"pointer",fontSize:18}}>←</button>

      {/* Progress dots */}
      <div style={{display:"flex",gap:8,marginBottom:28}}>
        {stepKeys.map((st)=>(
          <div key={st} style={{width:step===st?24:8,height:8,borderRadius:4,background:step===st?"#a855f7":stepKeys.indexOf(step)>stepKeys.indexOf(st)?"rgba(168,85,247,0.5)":"rgba(255,255,255,0.15)",transition:"all .3s"}}/>
        ))}
      </div>

      <Avatar member={member} size={64}/>
      <p style={{color:"#fff",fontWeight:800,fontSize:18,margin:"12px 0 4px"}}>{member.name.split(" ")[0]}</p>
      <div style={{fontSize:36,margin:"8px 0 4px"}}>{s.icon}</div>
      <h2 style={{color:"#fff",fontWeight:800,fontSize:20,margin:"0 0 6px"}}>{s.title}</h2>
      <p style={{color:"rgba(255,255,255,0.35)",fontSize:13,margin:"0 0 28px",textAlign:"center"}}>{s.sub}</p>

      <PinPad value={s.val} onChange={v=>{s.set(v);setErr("");}} onSubmit={s.onSubmit} error={err} label=""/>

      <button onClick={()=>s.onSubmit(s.val)} disabled={s.val.length<4}
        style={{marginTop:24,width:220,padding:"14px",background:s.val.length===4?"linear-gradient(135deg,#a855f7,#6366f1)":"#2a2a3a",border:"none",borderRadius:16,color:"#fff",fontWeight:800,fontSize:16,cursor:s.val.length===4?"pointer":"not-allowed",boxShadow:s.val.length===4?"0 4px 20px rgba(168,85,247,0.4)":"none"}}>
        {step==="confirm" ? "Guardar nuevo PIN ✓" : "Continuar →"}
      </button>
    </div>
  );
}

function LoginScreen({ members, groupProfile, onLogin, onGoRegister, onChangePin }) {
  const [step,  setStep] = useState("home");   // home | phone | pin | changePin
  const [phone, setPhone] = useState("");
  const [sel,   setSel]   = useState(null);
  const [pin,   setPin]   = useState("");
  const [err,   setErr]   = useState("");

  const selectedMember = members.find(m => m.id === sel);

  const handlePhoneSubmit = () => {
    const clean = phone.replace(/\D/g,"");
    const found = members.find(m => m.phone.replace(/\D/g,"") === clean);
    if (!found) { setErr("No encontramos ese número. Verifica o regístrate."); return; }
    setSel(found.id); setPin(""); setErr(""); setStep("pin");
  };

  const handlePinSubmit = (entered) => {
    const m = members.find(m => m.id === sel);
    if (!m) return;
    if (_hashPin(entered || pin) === m.pinHash) { onLogin(sel); }
    else { setErr("PIN incorrecto. Inténtalo de nuevo."); setPin(""); }
  };

  // ── Change PIN flow ───────────────────────────────────────
  if (step === "changePin" && selectedMember) return (
    <ChangePinScreen
      member={selectedMember}
      skipCurrent={true}
      onSave={(newPin) => { onChangePin(sel, newPin); setStep("pin"); setPin(""); setErr(""); }}
      onBack={() => { setStep("pin"); setPin(""); setErr(""); }}
    />
  );

  // ── PIN step ──────────────────────────────────────────────
  if (step === "pin" && selectedMember) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0f0228,#1e0a45,#0f0228)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px" }}>
      <button onClick={() => { setStep("phone"); setPin(""); setErr(""); }}
        style={{ position:"absolute", top:52, left:20, background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
      <Avatar member={selectedMember} size={80} />
      <p style={{ color:"#fff", fontWeight:800, fontSize:20, margin:"14px 0 4px" }}>{selectedMember.name.split(" ")[0]}</p>
      <p style={{ color:"rgba(255,255,255,0.35)", fontSize:12, margin:"0 0 32px" }}>Ingresa tu PIN de 4 dígitos</p>
      <PinPad value={pin} onChange={v=>{setPin(v);setErr("");}} onSubmit={handlePinSubmit} error={err} label="" />
      <button onClick={() => handlePinSubmit(pin)} disabled={pin.length<4}
        style={{ marginTop:24, width:220, padding:"14px", background:pin.length===4?"linear-gradient(135deg,#a855f7,#6366f1)":"#2a2a3a", border:"none", borderRadius:16, color:"#fff", fontWeight:800, fontSize:16, cursor:pin.length===4?"pointer":"not-allowed", boxShadow:pin.length===4?"0 4px 20px rgba(168,85,247,0.4)":"none" }}>
        Ingresar →
      </button>
      <button onClick={() => setStep("changePin")}
        style={{ marginTop:16, background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontSize:13, cursor:"pointer", textDecoration:"underline" }}>
        ¿Olvidaste tu PIN?
      </button>
    </div>
  );

  // ── Phone step ────────────────────────────────────────────
  if (step === "phone") return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0f0228,#1e0a45,#0f0228)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px" }}>
      <button onClick={() => { setStep("home"); setPhone(""); setErr(""); }}
        style={{ position:"absolute", top:52, left:20, background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
      <div style={{ fontSize:48, marginBottom:12 }}>📱</div>
      <h2 style={{ color:"#fff", fontWeight:800, fontSize:22, margin:"0 0 8px" }}>¿Cuál es tu número?</h2>
      <p style={{ color:"rgba(255,255,255,0.38)", fontSize:13, margin:"0 0 32px", textAlign:"center" }}>
        Ingresa el celular con el que te registraste
      </p>
      <div style={{ width:"100%", maxWidth:340 }}>
        <input
          type="tel"
          value={phone}
          onChange={e => { setPhone(e.target.value); setErr(""); }}
          onKeyDown={e => e.key==="Enter" && handlePhoneSubmit()}
          placeholder="Ej: 987 654 321"
          autoFocus
          style={{ width:"100%", padding:"16px 18px", background:"rgba(255,255,255,0.08)", border:`1.5px solid ${err?"#f87171":"rgba(255,255,255,0.15)"}`, borderRadius:16, color:"#fff", fontSize:18, textAlign:"center", letterSpacing:2, boxSizing:"border-box", fontFamily:"inherit" }}
        />
        {err && <p style={{ color:"#f87171", fontSize:13, textAlign:"center", margin:"10px 0 0" }}>{err}</p>}
        <button onClick={handlePhoneSubmit} disabled={phone.length<6}
          style={{ marginTop:16, width:"100%", padding:"15px", background:phone.length>=6?"linear-gradient(135deg,#a855f7,#6366f1)":"#2a2a3a", border:"none", borderRadius:16, color:"#fff", fontWeight:800, fontSize:16, cursor:phone.length>=6?"pointer":"not-allowed", boxShadow:phone.length>=6?"0 4px 20px rgba(168,85,247,0.4)":"none" }}>
          Continuar →
        </button>
      </div>
    </div>
  );

  // ── Home step (pantalla inicial) ──────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0f0228,#1e0a45,#0f0228)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px" }}>
      <div style={{ fontSize:64, marginBottom:8, filter:"drop-shadow(0 4px 20px rgba(192,132,252,.5))" }}>🎂</div>
      <h1 style={{ color:"#fff", fontSize:28, fontWeight:900, margin:"0 0 8px", letterSpacing:-1, textAlign:"center" }}>
        {groupProfile?.name || "FamilyBirthday"}
      </h1>
      <p style={{ color:"rgba(255,255,255,0.38)", fontSize:13, margin:"0 0 48px", textAlign:"center" }}>
        La junta de cumpleaños de tu familia 🎉
      </p>

      <div style={{ width:"100%", maxWidth:340, display:"flex", flexDirection:"column", gap:12 }}>
        <button onClick={() => { setPhone(""); setErr(""); setStep("phone"); }}
          style={{ width:"100%", padding:"17px", background:"linear-gradient(135deg,#a855f7,#6366f1)", border:"none", borderRadius:18, color:"#fff", fontWeight:800, fontSize:17, cursor:"pointer", boxShadow:"0 6px 24px rgba(168,85,247,0.45)", letterSpacing:0.3 }}>
          Ingresar
        </button>
        <button onClick={onGoRegister}
          style={{ width:"100%", padding:"15px", background:"rgba(255,255,255,0.06)", border:"1.5px solid rgba(255,255,255,0.13)", borderRadius:18, color:"rgba(255,255,255,0.65)", fontWeight:700, fontSize:15, cursor:"pointer" }}>
          Registrarse
        </button>
      </div>
    </div>
  );
}

function RegisterScreen({ onSave, onBack, editing }) {
  const [step,    setStep]    = useState("info");   // info | pin | confirm
  const [form,    setForm]    = useState(editing || { name:"", phone:"", dob:"", pin:"" });
  const [pin1,    setPin1]    = useState("");
  const [pin2,    setPin2]    = useState("");
  const [pinErr,  setPinErr]  = useState("");

  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));
  const validInfo = form.name.trim() && form.phone.trim() && form.dob &&
    (!form.isAdmin || form.adminKey === ADMIN_MASTER_KEY);

  const goToPin = () => { if (validInfo) { setPin1(""); setPin2(""); setPinErr(""); setStep("pin"); } };

  const handlePin1Done = (v) => { setPin1(v); setStep("confirm"); setPin2(""); setPinErr(""); };

  const handlePin2Done = (v) => {
    if (v === pin1) { onSave({ ...form, pin: v }); }
    else { setPinErr("Los PINs no coinciden. Vuelve a intentarlo."); setPin2(""); setTimeout(()=>{ setStep("pin"); setPin1(""); setPinErr(""); },1200); }
  };

  // ── Step: PIN confirm ──
  if (step === "confirm") return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0f0228,#1e0a45)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px" }}>
      <button onClick={() => { setStep("pin"); setPin1(""); setPin2(""); setPinErr(""); }}
        style={{ position:"absolute", top:52, left:20, background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
      <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
      <h2 style={{ color:"#fff", fontWeight:800, fontSize:20, margin:"0 0 6px" }}>Confirma tu PIN</h2>
      <PinPad value={pin2} onChange={v=>{setPin2(v);setPinErr("");}} onSubmit={handlePin2Done} error={pinErr} label="Repite los 4 dígitos para confirmar" />
    </div>
  );

  // ── Step: PIN creation ──
  if (step === "pin") return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0f0228,#1e0a45)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px" }}>
      <button onClick={() => setStep("info")}
        style={{ position:"absolute", top:52, left:20, background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
      <div style={{ fontSize:40, marginBottom:12 }}>🔐</div>
      <h2 style={{ color:"#fff", fontWeight:800, fontSize:20, margin:"0 0 6px" }}>Crea tu PIN</h2>
      <p style={{ color:"rgba(255,255,255,0.35)", fontSize:13, margin:"0 0 28px", textAlign:"center" }}>
        Este PIN protege tu perfil.<br />Solo tú lo sabrás.
      </p>
      <PinPad value={pin1} onChange={setPin1} onSubmit={handlePin1Done} label="Elige 4 dígitos secretos" />
    </div>
  );

  // ── Step: Info ──
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0f0228,#1e0a45)", paddingBottom:100 }}>
      <div style={{ padding:"52px 22px 20px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
        <h2 style={{ color:"#fff", margin:0, fontWeight:800, fontSize:20 }}>{editing?"Editar perfil":"Nuevo integrante"}</h2>
      </div>
      <div style={{ padding:"0 22px" }}>
        {/* Progress */}
        {!editing && (
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:24 }}>
            {["Datos","PIN","Listo"].map((s,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, flex:i<2?1:0 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:i===0?"#a855f7":"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff", flexShrink:0 }}>
                  {i===0?"1":i===1?"2":"✓"}
                </div>
                <span style={{ color:i===0?"#fff":"rgba(255,255,255,0.3)", fontSize:12, fontWeight:i===0?700:400 }}>{s}</span>
                {i<2 && <div style={{ flex:1, height:2, background:"rgba(255,255,255,0.1)", borderRadius:2 }} />}
              </div>
            ))}
          </div>
        )}

        {/* Avatar preview — Dicebear generado por nombre */}
        {form.name.trim() && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:24 }}>
            <Avatar member={{ name: form.name }} size={90} />
            <p style={{ color:"rgba(255,255,255,0.3)", fontSize:12, marginTop:8 }}>Tu avatar — generado por tu nombre</p>
          </div>
        )}

        {[
          { label:"NOMBRES Y APELLIDOS", key:"name",  type:"text", placeholder:"Ej: María García López" },
          { label:"NÚMERO DE CELULAR",   key:"phone", type:"tel",  placeholder:"Ej: 987 654 321" },
        ].map(({ label,key,type,placeholder }) => (
          <div key={key} style={{ marginBottom:14 }}>
            <label style={{ color:"rgba(255,255,255,0.45)", fontSize:12, fontWeight:700, display:"block", marginBottom:6, letterSpacing:.8 }}>{label}</label>
            <input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={placeholder}
              style={{ width:"100%", padding:"14px 16px", background:"rgba(255,255,255,0.07)", border:"1.5px solid rgba(255,255,255,0.11)", borderRadius:14, color:"#fff", fontSize:15, boxSizing:"border-box" }} />
          </div>
        ))}

        <div style={{ marginBottom:14 }}>
          <label style={{ color:"rgba(255,255,255,0.45)", fontSize:12, fontWeight:700, display:"block", marginBottom:6, letterSpacing:.8 }}>FECHA DE NACIMIENTO</label>
          <input type="date" value={form.dob} onChange={e=>set("dob",e.target.value)}
            style={{ width:"100%", padding:"14px 16px", background:"rgba(255,255,255,0.07)", border:"1.5px solid rgba(255,255,255,0.11)", borderRadius:14, color:"#fff", fontSize:15, boxSizing:"border-box", colorScheme:"dark" }} />
        </div>

        {/* Admin role toggle */}
        {!editing && (
          <div style={{ marginBottom:20 }}>
            <div onClick={() => set("isAdmin", !form.isAdmin)}
              style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 16px", background: form.isAdmin?"rgba(251,191,36,0.1)":"rgba(255,255,255,0.04)", border:`1.5px solid ${form.isAdmin?"rgba(251,191,36,0.35)":"rgba(255,255,255,0.09)"}`, borderRadius:14, cursor:"pointer", transition:"all .2s" }}>
              <div>
                <p style={{ color:"#fff", fontWeight:700, margin:0, fontSize:14 }}>👑 Soy el administrador</p>
                <p style={{ color:"rgba(255,255,255,0.35)", margin:"2px 0 0", fontSize:11 }}>Tendrás panel exclusivo de gestión</p>
              </div>
              <div style={{ width:48, height:26, borderRadius:13, background:form.isAdmin?"#fbbf24":"rgba(255,255,255,0.12)", position:"relative", transition:"all .2s", flexShrink:0 }}>
                <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left:form.isAdmin?25:3, transition:"left .2s" }} />
              </div>
            </div>
            {form.isAdmin && (
              <div style={{ marginTop:10 }}>
                <label style={{ color:"rgba(255,255,255,0.45)", fontSize:12, fontWeight:700, display:"block", marginBottom:6, letterSpacing:.8 }}>CLAVE MAESTRA DE ADMIN</label>
                <input type="password" value={form.adminKey||""} onChange={e=>set("adminKey",e.target.value)} placeholder="Ingresa la clave maestra"
                  style={{ width:"100%", padding:"13px 16px", background:"rgba(251,191,36,0.07)", border:`1.5px solid ${form.adminKey===ADMIN_MASTER_KEY?"rgba(251,191,36,0.6)":"rgba(255,255,255,0.15)"}`, borderRadius:14, color:"#fff", fontSize:15, boxSizing:"border-box" }} />
                {form.adminKey && form.adminKey!==ADMIN_MASTER_KEY && (
                  <p style={{ color:"#f87171", fontSize:11, margin:"5px 0 0" }}>⚠️ Clave incorrecta</p>
                )}
                {form.adminKey===ADMIN_MASTER_KEY && (
                  <p style={{ color:"#4ade80", fontSize:11, margin:"5px 0 0" }}>✓ Clave correcta — rol de admin activado</p>
                )}
              </div>
            )}
          </div>
        )}

        {editing ? (
          // When editing, allow changing PIN optionally
          <div>
            <button onClick={() => validInfo && onSave(form)} disabled={!validInfo}
              style={{ width:"100%", padding:16, background:validInfo?"linear-gradient(135deg,#a855f7,#6366f1)":"#2a2a3a", border:"none", borderRadius:16, color:"#fff", fontWeight:800, fontSize:16, cursor:validInfo?"pointer":"not-allowed", marginBottom:10 }}>
              Guardar datos
            </button>
            <button onClick={() => validInfo && setStep("pin")} disabled={!validInfo}
              style={{ width:"100%", padding:14, background:"rgba(168,85,247,0.15)", border:"1.5px solid rgba(168,85,247,0.3)", borderRadius:16, color:"#c084fc", fontWeight:700, fontSize:14, cursor:validInfo?"pointer":"not-allowed" }}>
              🔐 Cambiar PIN
            </button>
          </div>
        ) : (
          <>
            {/* Participates in junta? */}
            <div style={{ marginBottom:16 }}>
              <p style={{ color:"rgba(255,255,255,0.45)", fontSize:12, fontWeight:700, margin:"0 0 10px", letterSpacing:.8 }}>¿DESEAS PARTICIPAR EN LA JUNTA POR CUMPLEAÑOS?</p>
              <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, margin:"0 0 12px" }}>Si participas, se generarán cobros de S/ 10 por cada cumpleaños del grupo. Si no, solo verás alertas y podrás enviar saludos.</p>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>set("participates",true)}
                  style={{ flex:1, padding:"13px", background:form.participates===true?"linear-gradient(135deg,#4ade80,#22c55e)":"rgba(255,255,255,0.06)", border:`2px solid ${form.participates===true?"#4ade80":"rgba(255,255,255,0.1)"}`, borderRadius:14, color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer", transition:"all .2s" }}>
                  ✅ Sí, participar
                </button>
                <button onClick={()=>set("participates",false)}
                  style={{ flex:1, padding:"13px", background:form.participates===false?"rgba(248,113,113,0.2)":"rgba(255,255,255,0.06)", border:`2px solid ${form.participates===false?"#f87171":"rgba(255,255,255,0.1)"}`, borderRadius:14, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", transition:"all .2s" }}>
                  👁️ Solo ver
                </button>
              </div>
            </div>
            <button onClick={goToPin} disabled={!validInfo || form.participates===undefined}
              style={{ width:"100%", padding:16, background:(validInfo&&form.participates!==undefined)?"linear-gradient(135deg,#a855f7,#6366f1)":"#2a2a3a", border:"none", borderRadius:16, color:"#fff", fontWeight:800, fontSize:16, cursor:(validInfo&&form.participates!==undefined)?"pointer":"not-allowed", boxShadow:(validInfo&&form.participates!==undefined)?"0 4px 20px rgba(168,85,247,0.35)":"none" }}>
              Siguiente: Crear PIN 🔐
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Wish Modal (free text) ────────────────────────────────────────────────
function WishModal({ sender, birthdayMember, onSend, onClose }) {
  const [msg, setMsg] = useState("");
  const maxChars = 280;

  const handleSend = () => {
    if (!msg.trim()) return;
    onSend(msg.trim());
    const waMsg = `🎂 *${sender.name.split(" ")[0]} te dice, ${birthdayMember.name.split(" ")[0]}:*\n\n${msg.trim()}`;
    openWhatsApp(birthdayMember.phone, waMsg);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:2000,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:"linear-gradient(175deg,#1e0845,#0a0118)",borderRadius:"24px 24px 0 0",padding:"24px 22px 36px",border:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div>
            <h3 style={{color:"#fff",fontWeight:800,fontSize:18,margin:0}}>🎉 Enviar Saludo</h3>
            <p style={{color:"rgba(255,255,255,0.4)",fontSize:12,margin:"3px 0 0"}}>Para {birthdayMember.name.split(" ")[0]} 🎂</p>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,padding:"7px 12px",color:"#fff",cursor:"pointer",fontSize:16}}>✕</button>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(168,85,247,0.1)",borderRadius:14,marginBottom:18,border:"1px solid rgba(168,85,247,0.2)"}}>
          <Avatar member={birthdayMember} size={44}/>
          <div>
            <p style={{color:"#fff",fontWeight:700,fontSize:14,margin:0}}>{birthdayMember.name}</p>
            <p style={{color:"rgba(255,255,255,0.4)",fontSize:12,margin:"2px 0 0"}}>🎂 {displayDob(birthdayMember.dob)}</p>
          </div>
        </div>

        <label style={{color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:700,display:"block",marginBottom:8,letterSpacing:.8}}>TU MENSAJE DE CUMPLEAÑOS</label>
        <textarea value={msg} onChange={e=>setMsg(e.target.value.slice(0,maxChars))}
          placeholder={`Escribe tu saludo para ${birthdayMember.name.split(" ")[0]}...`}
          rows={4} style={{width:"100%",padding:"13px 15px",background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:14,color:"#fff",fontSize:14,resize:"none",outline:"none",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.6}}/>
        <p style={{color:"rgba(255,255,255,0.25)",fontSize:11,textAlign:"right",margin:"4px 0 16px"}}>{msg.length}/{maxChars}</p>

        <p style={{color:"rgba(255,255,255,0.35)",fontSize:12,textAlign:"center",margin:"0 0 14px"}}>
          Se publicará en el muro 👀 y se enviará por WhatsApp 💚
        </p>
        <button onClick={handleSend} disabled={!msg.trim()}
          style={{width:"100%",padding:"15px",background:msg.trim()?"linear-gradient(135deg,#22c55e,#16a34a)":"#2a2a3a",border:"none",borderRadius:16,color:"#fff",fontWeight:800,fontSize:16,cursor:msg.trim()?"pointer":"not-allowed",boxShadow:msg.trim()?"0 4px 20px rgba(34,197,94,0.35)":"none"}}>
          💚 Enviar Saludo
        </button>
      </div>
    </div>
  );
}

// ── Wish Wall Screen ───────────────────────────────────────────────────────
function WishWallScreen({ currentUser, members, wishes, onBack, onAddWish, onReact }) {
  const [showModal,    setShowModal]    = useState(null);
  const [filterMember, setFilterMember] = useState(null);

  const birthdaysToday = members.filter(m => isBirthdayToday(m.dob));
  const birthdaysSoon  = members.filter(m => { const d=daysUntilBirthday(m.dob); return d>0&&d<=30; }).sort((a,b)=>daysUntilBirthday(a.dob)-daysUntilBirthday(b.dob));
  const allTargets     = [...new Map([...birthdaysToday,...birthdaysSoon].map(m=>[m.id,m])).values()];
  const displayTarget  = filterMember || birthdaysToday[0] || allTargets[0];
  const wallWishes     = displayTarget ? wishes.filter(w=>w.birthdayMemberId===displayTarget.id) : [];
  const alreadySent    = displayTarget ? wishes.some(w=>w.birthdayMemberId===displayTarget.id&&w.senderId===currentUser.id) : false;
  const getSender      = id => members.find(m=>m.id===id);

  return (
    <div style={{minHeight:"100vh",background:"#0a0118",paddingBottom:100}}>
      {showModal && (
        <WishModal sender={currentUser} birthdayMember={showModal}
          onSend={msg=>{onAddWish({birthdayMemberId:showModal.id,senderId:currentUser.id,message:msg,date:new Date().toISOString()});setShowModal(null);}}
          onClose={()=>setShowModal(null)}/>
      )}
      <div style={{background:"linear-gradient(145deg,#1e0845,#3b0f8c)",padding:"50px 20px 22px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:12,padding:"9px 15px",color:"#fff",cursor:"pointer",fontSize:18}}>←</button>
          <h2 style={{color:"#fff",margin:0,fontWeight:800,fontSize:20}}>🎂 Muro de Saludos</h2>
        </div>
        {allTargets.length>0 && (
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
            {allTargets.map(m=>{
              const isToday=isBirthdayToday(m.dob);
              const isSel=displayTarget?.id===m.id;
              return (
                <div key={m.id} onClick={()=>setFilterMember(m)}
                  style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"8px 12px",borderRadius:16,background:isSel?"rgba(192,132,252,0.2)":"rgba(255,255,255,0.06)",border:`1.5px solid ${isSel?"#c084fc":"transparent"}`,cursor:"pointer"}}>
                  <Avatar member={m} size={36}/>
                  <span style={{color:"#fff",fontSize:10,fontWeight:700}}>{m.name.split(" ")[0]}</span>
                  {isToday&&<span style={{fontSize:10}}>🎂 HOY</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{padding:"20px 18px 0"}}>
        {!displayTarget ? (
          <p style={{color:"rgba(255,255,255,0.25)",textAlign:"center",marginTop:60,fontSize:15}}>No hay cumpleaños próximos este mes</p>
        ) : (
          <>
            <div style={{background:"linear-gradient(135deg,rgba(168,85,247,0.2),rgba(99,102,241,0.15))",border:"1px solid rgba(168,85,247,0.3)",borderRadius:20,padding:"18px",marginBottom:18,display:"flex",alignItems:"center",gap:14}}>
              <Avatar member={displayTarget} size={60}/>
              <div style={{flex:1}}>
                <p style={{color:"#fff",fontWeight:800,fontSize:17,margin:0}}>{displayTarget.name}</p>
                <p style={{color:"rgba(255,255,255,0.5)",fontSize:13,margin:"3px 0 4px"}}>
                  {isBirthdayToday(displayTarget.dob)?"🎉 ¡HOY es su cumpleaños!":`🎂 en ${daysUntilBirthday(displayTarget.dob)} días`}
                </p>
                <p style={{color:"#c084fc",fontSize:12,margin:0}}>{wallWishes.length} saludo{wallWishes.length!==1?"s":""} recibido{wallWishes.length!==1?"s":""}</p>
              </div>
            </div>
            {!alreadySent ? (
              <button onClick={()=>setShowModal(displayTarget)}
                style={{width:"100%",padding:"15px",background:"linear-gradient(135deg,#a855f7,#6366f1)",border:"none",borderRadius:16,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:20,boxShadow:"0 4px 20px rgba(168,85,247,0.4)"}}>
                🎉 Enviar Saludo a {displayTarget.name.split(" ")[0]}
              </button>
            ) : (
              <div style={{padding:"13px 16px",background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.25)",borderRadius:14,marginBottom:18,textAlign:"center"}}>
                <p style={{color:"#4ade80",fontWeight:700,fontSize:14,margin:0}}>✓ Ya enviaste tu saludo 🎉</p>
              </div>
            )}
            <p style={{color:"rgba(255,255,255,0.32)",fontSize:11,fontWeight:700,margin:"0 0 12px",letterSpacing:1}}>SALUDOS DEL GRUPO ({wallWishes.length})</p>
            {wallWishes.length===0
              ? <div style={{padding:"32px",background:"rgba(255,255,255,0.03)",borderRadius:16,textAlign:"center"}}>
                  <p style={{fontSize:32,margin:"0 0 8px"}}>🎈</p>
                  <p style={{color:"rgba(255,255,255,0.25)",fontSize:14,margin:0}}>Sé el primero en enviar un saludo</p>
                </div>
              : wallWishes.map((w,i)=>{
                const sender=getSender(w.senderId);
                const isMe=w.senderId===currentUser.id;
                return (
                  <div key={i} style={{background:isMe?"rgba(168,85,247,0.1)":"rgba(255,255,255,0.04)",border:`1px solid ${isMe?"rgba(168,85,247,0.25)":"rgba(255,255,255,0.07)"}`,borderRadius:16,padding:"14px 16px",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      {sender&&<Avatar member={sender} size={34}/>}
                      <div style={{flex:1}}>
                        <p style={{color:"#fff",fontWeight:700,fontSize:13,margin:0}}>{sender?.name.split(" ")[0]||"?"} {isMe&&<span style={{background:"#a855f7",fontSize:9,padding:"1px 6px",borderRadius:10,fontWeight:700}}>Tú</span>}</p>
                        <p style={{color:"rgba(255,255,255,0.3)",fontSize:11,margin:"1px 0 0"}}>{new Date(w.date).toLocaleDateString("es-PE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p>
                      </div>
                      <span style={{fontSize:18}}>✨</span>
                    </div>
                    <p style={{color:"rgba(255,255,255,0.85)",fontSize:14,lineHeight:1.6,margin:0,fontStyle:"italic"}}>"{w.message}"</p>
                    {/* Reactions */}
                    <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                      {["🎉","❤️","😂","🙌"].map(emoji=>{
                        const count=(w.reactions||{})[emoji]||0;
                        const reacted=(w.reactedBy||{})[emoji]?.includes(currentUser.id);
                        return (
                          <button key={emoji} onClick={()=>onReact(w.id,emoji,currentUser.id)}
                            style={{padding:"4px 10px",background:reacted?"rgba(168,85,247,0.25)":"rgba(255,255,255,0.06)",border:`1px solid ${reacted?"rgba(168,85,247,0.5)":"rgba(255,255,255,0.1)"}`,borderRadius:20,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:14}}>{emoji}</span>
                            {count>0&&<span style={{color:"rgba(255,255,255,0.7)",fontSize:11,fontWeight:700}}>{count}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}

function HomeScreen({ currentUser, members, payments, wishes, onNavigate, onLogout }) {
  const t = todayObj();
  const birthdaysToday = members.filter(m => m.id!==currentUser.id && isBirthdayToday(m.dob));
  const birthdaysSoon  = members.filter(m => { const d=daysUntilBirthday(m.dob); return d>0&&d<=7; }).sort((a,b)=>daysUntilBirthday(a.dob)-daysUntilBirthday(b.dob));

  // Pending for me: only members who participate (birthday this month, not paid)
  const pendingForMe = currentUser.participates===false ? [] : members.filter(m => {
    const b = parseDob(m.dob); if (!b) return false;
    if (b.month!==t.month) return false;
    return !hasPaid(payments, currentUser.id, m.id, t.month, t.year);
  }).filter(m=>m.participates!==false);

  const totalOwed = pendingForMe.length * PAYMENT_AMOUNT;
  const myBdayToday = isBirthdayToday(currentUser.dob);

  return (
    <div style={{ minHeight:"100vh", background:"#0a0118" }}>
      <div style={{ background:"linear-gradient(145deg,#1e0845,#3b0f8c)", padding:"50px 20px 22px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <Avatar member={currentUser} size={52} />
            <div>
              <p style={{ color:"rgba(255,255,255,0.4)", fontSize:11, margin:0, letterSpacing:.5 }}>BIENVENIDO/A</p>
              <p style={{ color:"#fff", fontWeight:800, fontSize:18, margin:0 }}>{currentUser.name.split(" ")[0]} 👋</p>
            </div>
          </div>
          <button onClick={onLogout} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:10, padding:"7px 13px", color:"rgba(255,255,255,0.55)", cursor:"pointer", fontSize:12, fontWeight:600 }}>Salir</button>
        </div>
        <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:20, padding:"16px 20px", border:"1px solid rgba(255,255,255,0.07)" }}>
          <p style={{ color:"rgba(255,255,255,0.38)", fontSize:11, margin:"0 0 4px", letterSpacing:1 }}>PENDIENTE ESTE MES</p>
          <p style={{ color:totalOwed>0?"#f87171":"#4ade80", fontSize:36, fontWeight:900, margin:"0 0 2px", lineHeight:1 }}>S/ {totalOwed.toFixed(2)}</p>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:12, margin:0 }}>{pendingForMe.length===0 ? "¡Estás al día! 🎉" : `${pendingForMe.length} pago${pendingForMe.length>1?"s":""} pendiente${pendingForMe.length>1?"s":""}`}</p>
        </div>
      </div>

      <div style={{ padding:"18px 18px 100px" }}>
        {/* Countdown to own birthday */}
        <BirthdayCountdown member={currentUser} />

        {myBdayToday && (
          <div style={{ background:"linear-gradient(135deg,#f59e0b,#ef4444)", borderRadius:20, padding:"16px 18px", marginBottom:14, display:"flex", alignItems:"center", gap:14 }}>
            <span style={{ fontSize:36 }}>🎉</span>
            <div>
              <p style={{ color:"#fff", fontWeight:800, fontSize:16, margin:0 }}>¡Hoy es tu cumpleaños!</p>
              <p style={{ color:"rgba(255,255,255,0.85)", fontSize:12, margin:"3px 0 0" }}>Puedes registrar tu propio pago si deseas participar.</p>
            </div>
          </div>
        )}

        {birthdaysToday.length>0 && (
          <div style={{ background:"rgba(168,85,247,0.1)", border:"1px solid rgba(168,85,247,0.28)", borderRadius:18, padding:"14px 16px", marginBottom:14 }}>
            <p style={{ color:"#c084fc", fontWeight:700, fontSize:12, margin:"0 0 12px", letterSpacing:.8 }}>🎂 CUMPLEAÑOS HOY — ¡Manda tus saludos!</p>
            {birthdaysToday.map(m => {
              const alreadyWished = wishes && wishes.some(w=>w.birthdayMemberId===m.id&&w.senderId===currentUser.id);
              return (
                <div key={m.id} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <Avatar member={m} size={38} />
                    <div style={{ flex:1 }}>
                      <p style={{ color:"#fff", fontWeight:700, fontSize:14, margin:0 }}>{m.name}</p>
                      {alreadyWished && <p style={{ color:"#4ade80", fontSize:11, margin:"2px 0 0" }}>✓ Ya enviaste tu saludo</p>}
                    </div>
                    <span style={{ fontSize:20 }}>🎈</span>
                  </div>
                  {!alreadyWished && (
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>onNavigate("wishes")}
                        style={{ flex:1, padding:"9px 10px", background:"linear-gradient(135deg,#a855f7,#6366f1)", border:"none", borderRadius:11, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                        🎉 Enviar Saludo
                      </button>
                      <button onClick={()=>openWhatsApp(m.phone, `🎂 ¡Feliz cumpleaños ${m.name.split(" ")[0]}! 🎉 Que tengas un día increíble. Con cariño de ${currentUser.name.split(" ")[0]} 🎈`)}
                        style={{ flex:1, padding:"9px 10px", background:"rgba(37,211,102,0.2)", border:"1px solid rgba(37,211,102,0.4)", borderRadius:11, color:"#4ade80", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                        💚 WhatsApp directo
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pendingForMe.length>0 && (
          <div style={{ background:"rgba(251,146,60,0.09)", border:"1px solid rgba(251,146,60,0.26)", borderRadius:18, padding:"14px 16px", marginBottom:14 }}>
            <p style={{ color:"#fb923c", fontWeight:700, fontSize:12, margin:"0 0 10px", letterSpacing:.8 }}>⚠️ TUS PAGOS PENDIENTES — solo tú ves esto</p>
            {pendingForMe.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                <Avatar member={m} size={32} />
                <span style={{ color:"rgba(255,255,255,0.82)", fontSize:13, fontWeight:600, flex:1 }}>
                  {m.id===currentUser.id ? "Tu propio cumpleaños 🎂" : `Cumpleaños de ${m.name.split(" ")[0]}`}
                </span>
                <span style={{ color:"#fb923c", fontWeight:800, fontSize:15 }}>S/ 10</span>
              </div>
            ))}
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button onClick={() => onNavigate("payment")}
                style={{ flex:1, padding:"11px", background:"#fb923c", border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                💳 Pagar ahora
              </button>
              <button onClick={() => {
                // Find admin/recaudador
                const admin = members.find(m=>m.isAdmin);
                if (!admin) return;
                const names = pendingForMe.map(m=>m.name.split(" ")[0]).join(", ");
                const msg = `Hola ${admin.name.split(" ")[0]} 👋, soy ${currentUser.name.split(" ")[0]}. Te aviso que tengo pagos pendientes por los cumpleaños de: ${names}. En breve regularizo. 🙏`;
                openWhatsApp(admin.phone, msg);
              }}
                style={{ flex:1, padding:"11px", background:"rgba(37,211,102,0.15)", border:"1px solid rgba(37,211,102,0.3)", borderRadius:12, color:"#4ade80", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                💚 Avisar al recaudador
              </button>
            </div>
          </div>
        )}

        {birthdaysSoon.length>0 && (
          <div style={{ marginBottom:16 }}>
            <p style={{ color:"rgba(255,255,255,0.32)", fontSize:11, fontWeight:700, margin:"0 0 10px", letterSpacing:1 }}>PRÓXIMOS CUMPLEAÑOS</p>
            {birthdaysSoon.map(m => {
              const d=daysUntilBirthday(m.dob);
              return (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background:"rgba(255,255,255,0.04)", borderRadius:14, marginBottom:8 }}>
                  <Avatar member={m} size={40} />
                  <div style={{ flex:1 }}>
                    <p style={{ color:"#fff", fontWeight:600, fontSize:14, margin:0 }}>{m.name}</p>
                    <p style={{ color:"rgba(255,255,255,0.32)", fontSize:12, margin:"2px 0 0" }}>en {d} día{d>1?"s":""} · {displayDob(m.dob)}</p>
                  </div>
                  <span style={{ fontSize:20 }}>🎂</span>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ color:"rgba(255,255,255,0.32)", fontSize:11, fontWeight:700, margin:"0 0 10px", letterSpacing:1 }}>ACCIONES RÁPIDAS</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[
            { icon:"💳", label:"Registrar Pago", screen:"payment",    accent:"#818cf8" },
            { icon:"📋", label:"Mis Pagos",       screen:"myPayments", accent:"#4ade80" },
            { icon:"🎂", label:"Muro Saludos",    screen:"wishes",     accent:"#f472b6" },
            { icon:"📊", label:"Resumen",          screen:"summary",    accent:"#fb923c" },
            { icon:"👨‍👩‍👧‍👦", label:"Perfil Grupo",   screen:"groupProfile", accent:"#c084fc" },
            { icon:"👥", label:"Familia",          screen:"members",    accent:"#38bdf8" },
          ].map(a => (
            <button key={a.screen} onClick={() => onNavigate(a.screen)}
              style={{ padding:"18px 14px", background:"rgba(255,255,255,0.04)", border:`1.5px solid ${a.accent}28`, borderRadius:18, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"flex-start", gap:7 }}>
              <span style={{ fontSize:28 }}>{a.icon}</span>
              <span style={{ color:"#fff", fontWeight:700, fontSize:13 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaymentScreen({ currentUser, members, payments, onAddPayment, onBack }) {
  const t = todayObj();
  const [selected, setSelected] = useState(new Set()); // Set of member ids
  const [method,   setMethod]   = useState("");
  const [voucher,  setVoucher]  = useState("");
  const [toast,    setToast]    = useState(null);

  // Only members who participate in junta (including self if they participate)
  const payableList = members.filter(m=>m.participates!==false).map(m => {
    const b = parseDob(m.dob); if (!b) return null;
    const paid = hasPaid(payments, currentUser.id, m.id, b.month, t.year);
    return { ...m, bMonth: b.month, bYear: t.year, paid };
  }).filter(Boolean);

  const toggle = (id) => {
    const m = payableList.find(m => m.id === id);
    if (!m || m.paid) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedItems  = payableList.filter(m => selected.has(m.id));
  const totalAmount    = selectedItems.length * PAYMENT_AMOUNT;
  const canPay         = selected.size > 0 && method;

  const handlePay = () => {
    if (!canPay) return;
    selectedItems.forEach(m => {
      onAddPayment({ payerId:currentUser.id, birthdayMemberId:m.id, amount:PAYMENT_AMOUNT, date:new Date().toISOString(), type:"birthday", method, voucher, forMonth:m.bMonth, forYear:m.bYear });
    });
    const names = selectedItems.map(m => m.name.split(" ")[0]).join(", ");
    setToast({ msg:`✅ S/ ${totalAmount} registrado — ${names}`, type:"success" });
    setSelected(new Set()); setMethod(""); setVoucher("");
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0a0118", paddingBottom:120 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header with live total */}
      <div style={{ background:"linear-gradient(145deg,#1e0845,#3b0f8c)", padding:"50px 20px 22px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
          <h2 style={{ color:"#fff", margin:0, fontWeight:800, fontSize:20 }}>Registrar Pago</h2>
        </div>

        {/* Live amount card */}
        <div style={{ background:"rgba(0,0,0,0.35)", borderRadius:18, padding:"16px 20px", border:`1px solid ${selected.size>0?"rgba(129,140,248,0.4)":"rgba(255,255,255,0.07)"}`, transition:"border .2s" }}>
          <p style={{ color:"rgba(255,255,255,0.4)", fontSize:11, margin:"0 0 4px", letterSpacing:1 }}>TOTAL A PAGAR</p>
          <p style={{ color: selected.size>0 ? "#818cf8" : "rgba(255,255,255,0.25)", fontSize:42, fontWeight:900, margin:"0 0 4px", lineHeight:1, transition:"color .2s" }}>
            S/ {totalAmount.toFixed(2)}
          </p>
          <p style={{ color:"rgba(255,255,255,0.35)", fontSize:12, margin:0 }}>
            {selected.size===0 ? "Selecciona uno o más cumpleañeros" : `${selected.size} cumpleañero${selected.size>1?"s":""} seleccionado${selected.size>1?"s":""} · S/ 10 c/u`}
          </p>
        </div>
      </div>

      <div style={{ padding:"18px 18px 0" }}>
        <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, margin:"0 0 12px", letterSpacing:1 }}>
          SELECCIONA LOS CUMPLEAÑEROS
        </p>

        {payableList.map(m => {
          const isSel  = selected.has(m.id);
          const isMe   = m.id === currentUser.id;
          return (
            <div key={m.id} onClick={() => toggle(m.id)}
              style={{
                display:"flex", alignItems:"center", gap:12, padding:"13px 14px",
                background: m.paid ? "rgba(255,255,255,0.03)" : isSel ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.05)",
                border: `1.5px solid ${m.paid ? "transparent" : isSel ? "#818cf8" : "rgba(255,255,255,0.08)"}`,
                borderRadius:16, marginBottom:9,
                cursor: m.paid ? "default" : "pointer",
                opacity: m.paid ? 0.5 : 1,
                transition:"all .15s",
              }}>
              {/* Checkbox */}
              <div style={{ width:24, height:24, borderRadius:8, flexShrink:0,
                background: m.paid ? "rgba(74,222,128,0.2)" : isSel ? "#818cf8" : "rgba(255,255,255,0.08)",
                border: `2px solid ${m.paid ? "#4ade80" : isSel ? "#818cf8" : "rgba(255,255,255,0.2)"}`,
                display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>
                {(isSel || m.paid) && <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>✓</span>}
              </div>

              <Avatar member={m} size={42} />

              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ color:"#fff", fontWeight:700, fontSize:14, margin:0, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  {m.name}
                  {isMe && <span style={{ background:"#a855f7", fontSize:10, padding:"2px 7px", borderRadius:20, fontWeight:700, flexShrink:0 }}>Mi cumple</span>}
                </p>
                <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, margin:"3px 0 0" }}>
                  🎂 {displayDob(m.dob)} · {MONTH_NAMES[m.bMonth-1]}
                </p>
              </div>

              <div style={{ textAlign:"right", flexShrink:0 }}>
                {m.paid
                  ? <span style={{ color:"#4ade80", fontSize:12, fontWeight:700 }}>✓ Pagado</span>
                  : <span style={{ color: isSel ? "#818cf8" : "rgba(255,255,255,0.3)", fontWeight:800, fontSize:15 }}>S/ 10</span>}
              </div>
            </div>
          );
        })}

        {/* Method + voucher — only show when at least one selected */}
        {selected.size > 0 && (
          <div style={{ marginTop:6, padding:"18px", background:"rgba(129,140,248,0.07)", borderRadius:18, border:"1px solid rgba(129,140,248,0.15)" }}>
            <MethodSelector value={method} onChange={setMethod} />
            {method && <VoucherUpload value={voucher} onChange={setVoucher} method={method} />}
          </div>
        )}
      </div>

      {/* Sticky bottom pay button */}
      <div style={{ position:"sticky", bottom:60, left:0, width:"100%", padding:"12px 18px", background:"rgba(10,1,24,0.95)", borderTop:"1px solid rgba(255,255,255,0.06)", backdropFilter:"blur(16px)", zIndex:10 }}>
        <button onClick={handlePay} disabled={!canPay}
          style={{ width:"100%", padding:"16px", background:canPay?"linear-gradient(135deg,#818cf8,#a855f7)":"#1e1e2e", border:"none", borderRadius:16, color:canPay?"#fff":"rgba(255,255,255,0.2)", fontWeight:800, fontSize:16, cursor:canPay?"pointer":"not-allowed", boxShadow:canPay?"0 4px 24px rgba(129,140,248,0.45)":"none", transition:"all .2s" }}>
          {selected.size===0
            ? "Selecciona un cumpleañero"
            : !method
              ? "⚠️ Elige método de pago"
              : `💳 Pagar S/ ${totalAmount} (${selected.size} cumpleañero${selected.size>1?"s":""})`}
        </button>
      </div>
    </div>
  );
}

function MyPaymentsScreen({ currentUser, members, payments, onBack }) {
  const myPays = payments.filter(p=>p.payerId===currentUser.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const total  = myPays.reduce((s,p)=>s+p.amount,0);
  const getMember = id => members.find(m=>m.id===id);
  const getMethod = id => PAY_METHODS.find(m=>m.id===id)||{};
  const [expandVoucher, setExpandVoucher] = useState(null);

  return (
    <div style={{ minHeight:"100vh", background:"#0a0118", paddingBottom:100 }}>
      <div style={{ background:"linear-gradient(145deg,#1e0845,#3b0f8c)", padding:"50px 20px 22px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
          <h2 style={{ color:"#fff", margin:0, fontWeight:800, fontSize:20 }}>Mis Pagos</h2>
        </div>
        <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:16, padding:"14px 18px" }}>
          <p style={{ color:"rgba(255,255,255,0.38)", fontSize:11, margin:"0 0 4px", letterSpacing:1 }}>TOTAL APORTADO</p>
          <p style={{ color:"#4ade80", fontSize:30, fontWeight:900, margin:0 }}>S/ {total.toFixed(2)}</p>
        </div>
      </div>
      <div style={{ padding:"18px" }}>
        {myPays.length===0
          ? <p style={{ color:"rgba(255,255,255,0.22)", textAlign:"center", marginTop:60, fontSize:15 }}>No has registrado pagos aún</p>
          : myPays.map((p,i) => {
            const bm=getMember(p.birthdayMemberId);
            const mi=getMethod(p.method);
            const expanded=expandVoucher===i;
            return (
              <div key={i} style={{ background:"rgba(255,255,255,0.04)", borderRadius:16, marginBottom:10, overflow:"hidden", border:"1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 14px" }}>
                  {bm && <Avatar member={bm} size={40} />}
                  <div style={{ flex:1 }}>
                    <p style={{ color:"#fff", fontWeight:600, fontSize:14, margin:0 }}>
                      🎂 {bm?.name.split(" ")[0] || "?"}{p.birthdayMemberId===currentUser.id&&" (mi cumpleaños)"}
                    </p>
                    <p style={{ color:"rgba(255,255,255,0.28)", fontSize:11, margin:"3px 0 0" }}>
                      {new Date(p.date).toLocaleDateString("es-PE")} · {MONTH_SHORT[p.forMonth-1]} {p.forYear}{p.advance&&" · ⚡ Adelantado"}
                    </p>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <p style={{ color:"#4ade80", fontWeight:800, fontSize:17, margin:0 }}>S/ {p.amount}</p>
                    <p style={{ color:"rgba(255,255,255,0.45)", margin:"2px 0 0", fontSize:12 }}>{mi.icon} {mi.label}</p>
                  </div>
                </div>
                {p.voucher && (
                  <>
                    <div onClick={() => setExpandVoucher(expanded?null:i)}
                      style={{ borderTop:"1px solid rgba(255,255,255,0.05)", padding:"8px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:14 }}>📸</span>
                      <span style={{ color:"rgba(255,255,255,0.4)", fontSize:12 }}>{expanded?"Ocultar comprobante":"Ver comprobante"}</span>
                    </div>
                    {expanded && <img src={p.voucher} alt="comprobante" style={{ width:"100%", display:"block" }} />}
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function MembersScreen({ members, currentUser, onBack, onEdit, onAddNew }) {
  return (
    <div style={{ minHeight:"100vh", background:"#0a0118", paddingBottom:100 }}>
      <div style={{ background:"linear-gradient(145deg,#1e0845,#3b0f8c)", padding:"50px 20px 22px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
            <h2 style={{ color:"#fff", margin:0, fontWeight:800, fontSize:20 }}>Familia ({members.length})</h2>
          </div>
          <button onClick={onAddNew} style={{ background:"linear-gradient(135deg,#a855f7,#6366f1)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>+ Agregar</button>
        </div>
      </div>
      <div style={{ padding:"18px" }}>
        {members.map(m => {
          const bday=isBirthdayToday(m.dob); const days=daysUntilBirthday(m.dob);
          return (
            <div key={m.id} style={{ display:"flex", alignItems:"center", gap:13, padding:"14px", background:bday?"rgba(168,85,247,0.1)":"rgba(255,255,255,0.04)", border:bday?"1px solid rgba(168,85,247,0.28)":"1px solid transparent", borderRadius:16, marginBottom:10 }}>
              <Avatar member={m} size={50} />
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <p style={{ color:"#fff", fontWeight:700, fontSize:15, margin:0 }}>{m.name}</p>
                  {bday && <span style={{ fontSize:16 }}>🎂</span>}
                  {m.id===currentUser.id && <span style={{ background:"#a855f7", fontSize:10, padding:"2px 6px", borderRadius:6, color:"#fff", fontWeight:700 }}>Tú</span>}
                </div>
                <p style={{ color:"rgba(255,255,255,0.32)", fontSize:12, margin:"3px 0 0" }}>
                  📱 {m.phone} · 🎂 {displayDob(m.dob)}{!bday&&` · en ${days}d`}
                </p>
              </div>
              {m.id===currentUser.id && (
                <button onClick={() => onEdit(m)} style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10, padding:"8px 12px", color:"#fff", cursor:"pointer", fontSize:14 }}>✏️</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryScreen({ members, payments, currentUser, onBack }) {
  const t = todayObj();
  const [selMonth, setSelMonth] = useState(t.month);
  const [selYear,  setSelYear]  = useState(t.year);

  const birthdaysInMonth = members.filter(m => { const b=parseDob(m.dob); return b&&b.month===selMonth; });
  const totalCollected = payments.filter(p => p.forMonth===selMonth&&p.forYear===selYear).reduce((s,p)=>s+p.amount,0);
  // Max expected: all members pay for each birthday in the month (including birthday person's own)
  const expectedTotal = birthdaysInMonth.length * members.length * PAYMENT_AMOUNT;

  return (
    <div style={{ minHeight:"100vh", background:"#0a0118", paddingBottom:100 }}>
      <div style={{ background:"linear-gradient(145deg,#1e0845,#3b0f8c)", padding:"50px 20px 22px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:12, padding:"9px 15px", color:"#fff", cursor:"pointer", fontSize:18 }}>←</button>
          <h2 style={{ color:"#fff", margin:0, fontWeight:800, fontSize:20 }}>Resumen General</h2>
        </div>
        <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4 }}>
          {MONTH_SHORT.map((mn,i) => (
            <button key={i} onClick={() => setSelMonth(i+1)}
              style={{ flexShrink:0, padding:"8px 14px", background:selMonth===i+1?"linear-gradient(135deg,#a855f7,#6366f1)":"rgba(255,255,255,0.07)", border:"none", borderRadius:20, color:"#fff", fontWeight:600, fontSize:12, cursor:"pointer" }}>
              {mn}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"18px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
          <div style={{ background:"rgba(74,222,128,0.07)", borderRadius:16, padding:"16px", border:"1px solid rgba(74,222,128,0.16)" }}>
            <p style={{ color:"rgba(255,255,255,0.38)", fontSize:11, margin:"0 0 4px", letterSpacing:1 }}>RECAUDADO</p>
            <p style={{ color:"#4ade80", fontSize:24, fontWeight:900, margin:0 }}>S/ {totalCollected}</p>
          </div>
          <div style={{ background:"rgba(251,146,60,0.07)", borderRadius:16, padding:"16px", border:"1px solid rgba(251,146,60,0.16)" }}>
            <p style={{ color:"rgba(255,255,255,0.38)", fontSize:11, margin:"0 0 4px", letterSpacing:1 }}>ESPERADO MÁX.</p>
            <p style={{ color:"#fb923c", fontSize:24, fontWeight:900, margin:0 }}>S/ {expectedTotal}</p>
          </div>
        </div>

        <p style={{ color:"rgba(255,255,255,0.32)", fontSize:11, fontWeight:700, margin:"0 0 12px", letterSpacing:1 }}>
          CUMPLEAÑOS EN {MONTH_NAMES[selMonth-1].toUpperCase()} {selYear}
        </p>

        {birthdaysInMonth.length===0
          ? <p style={{ color:"rgba(255,255,255,0.2)", textAlign:"center", marginTop:40 }}>Ningún cumpleaños este mes</p>
          : birthdaysInMonth.map(birthday => {
            const paidList = payments.filter(p => p.birthdayMemberId===birthday.id&&p.forMonth===selMonth&&p.forYear===selYear);
            const collected = paidList.reduce((s,p)=>s+p.amount,0);
            const pendingCount = members.filter(m => !paidList.some(p=>p.payerId===m.id)).length;
            return (
              <div key={birthday.id} style={{ background:"rgba(255,255,255,0.03)", borderRadius:18, padding:"16px", marginBottom:14, border:"1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                  <Avatar member={birthday} size={46} />
                  <div style={{ flex:1 }}>
                    <p style={{ color:"#fff", fontWeight:700, fontSize:15, margin:0 }}>{birthday.name}</p>
                    <p style={{ color:"rgba(255,255,255,0.32)", fontSize:12, margin:"2px 0 0" }}>🎂 {displayDob(birthday.dob)}</p>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <p style={{ color:"#4ade80", fontWeight:900, fontSize:18, margin:0 }}>S/ {collected}</p>
                    <p style={{ color:"rgba(255,255,255,0.28)", fontSize:11, margin:"2px 0 0" }}>{pendingCount} pendiente{pendingCount!==1?"s":""}</p>
                  </div>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {members.map(m => {
                    const paid=paidList.some(p=>p.payerId===m.id);
                    const pm=paidList.find(p=>p.payerId===m.id);
                    const mi=pm ? PAY_METHODS.find(x=>x.id===pm.method) : null;
                    return (
                      <div key={m.id} style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 10px", background:paid?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.07)", borderRadius:20, border:`1px solid ${paid?"rgba(74,222,128,0.22)":"rgba(248,113,113,0.15)"}` }}>
                        <span style={{ fontSize:10 }}>{paid?"✓":"✗"}</span>
                        <span style={{ color:paid?"#4ade80":"#f87171", fontSize:11, fontWeight:600 }}>{m.name.split(" ")[0]}</span>
                        {paid&&mi&&<span style={{ fontSize:11 }}>{mi.icon}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── Coverage Section (sub-component to avoid hooks-in-IIFE error) ─────────
// ── Delivery Voucher + Send component ─────────────────────────────────────
function DeliveryVoucherSend({ member, total, bdayAnswered, canSend }) {
  const [voucher, setVoucher] = useState("");
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setVoucher(ev.target.result);
    reader.readAsDataURL(file);
  };

  const readyToSend = canSend && !!voucher;

  const handleSend = () => {
    if (!readyToSend) return;
    const bdayName = member.name.split(" ")[0];
    const msg = `🎂 ¡Feliz cumpleaños ${bdayName}! 🎉\n\nTe informo que hemos recaudado la junta de tu cumpleaños 🎁\n\n💰 *Total enviado: S/ ${total}*${bdayAnswered ? `\n(incluye tu aporte de S/ 10)` : ""}\n\n📎 Te adjunto el voucher de la transferencia.\n\nCon cariño de todo el grupo 💜`;
    openWhatsApp(member.phone, msg);
  };

  return (
    <div style={{marginTop:12}}>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>

      {/* Voucher upload — required */}
      <label style={{color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:700,display:"block",marginBottom:6,letterSpacing:.8}}>
        VOUCHER DE TRANSFERENCIA <span style={{color:"#f87171"}}>*</span>
      </label>
      <div onClick={()=>fileRef.current.click()}
        style={{padding:"13px 14px",background:voucher?"rgba(34,197,94,0.08)":"rgba(255,255,255,0.05)",border:`1.5px dashed ${voucher?"rgba(34,197,94,0.5)":"rgba(255,165,0,0.4)"}`,borderRadius:12,cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
        {voucher
          ? <><img src={voucher} alt="voucher" style={{width:52,height:52,borderRadius:8,objectFit:"cover",flexShrink:0}}/><div><p style={{color:"#4ade80",fontWeight:700,fontSize:13,margin:0}}>✓ Voucher adjunto</p><p style={{color:"rgba(255,255,255,0.35)",fontSize:11,margin:"2px 0 0"}}>Toca para cambiar</p></div></>
          : <><span style={{fontSize:24,flexShrink:0}}>📎</span><div><p style={{color:"rgba(255,200,100,0.9)",fontWeight:700,fontSize:13,margin:0}}>Adjuntar voucher (obligatorio)</p><p style={{color:"rgba(255,255,255,0.3)",fontSize:11,margin:"2px 0 0"}}>Foto o captura de la transferencia</p></div></>
        }
      </div>

      {!voucher && (
        <p style={{color:"rgba(255,165,0,0.7)",fontSize:11,margin:"0 0 10px",textAlign:"center"}}>
          ⚠️ Debes adjuntar el voucher antes de notificar
        </p>
      )}

      {/* Send button — only active when voucher is attached */}
      <button onClick={handleSend} disabled={!readyToSend}
        style={{width:"100%",padding:"14px",background:readyToSend?"linear-gradient(135deg,#22c55e,#16a34a)":"#1e1e2e",border:"none",borderRadius:12,color:readyToSend?"#fff":"rgba(255,255,255,0.2)",fontWeight:800,fontSize:14,cursor:readyToSend?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        💚 Notificar a {member.name.split(" ")[0]} — S/ {total}
      </button>
    </div>
  );
}

// ── Coverage Section ───────────────────────────────────────────────────────
function CoverageSection({ currentUser, members, payments, onAddPayment, onToast, t }) {
  const [covMember, setCovMember] = useState(null);
  const [selBday,   setSelBday]   = useState(null);
  const [covNote,   setCovNote]   = useState("");

  // Cumpleañeros participantes este mes
  const bdaysThisMonth = members.filter(m => {
    const b = parseDob(m.dob);
    return b && b.month === t.month && m.participates !== false;
  });

  // Active birthday context: auto-select if only one, else use selBday
  const activeBday = bdaysThisMonth.length === 1 ? bdaysThisMonth[0] : selBday;

  // For each birthday this month, who has NOT paid and is NOT covered?
  const getPendingForBday = (bday) => {
    const b = parseDob(bday.dob); if (!b) return [];
    return members.filter(payer => {
      if (payer.isAdmin || payer.participates === false) return false;
      // The birthday person themselves: skip (handled separately via bdayPaid toggle)
      if (payer.id === bday.id) return false;
      const paid    = payments.some(p =>
        p.payerId === payer.id &&
        p.birthdayMemberId === bday.id &&
        p.forMonth === b.month &&
        p.forYear  === t.year &&
        p.type !== "coverage"
      );
      const covered = payments.some(p =>
        p.type === "coverage" &&
        p.coveredMemberId === payer.id &&
        p.birthdayMemberId === bday.id &&
        p.forMonth === b.month &&
        p.forYear  === t.year
      );
      return !paid && !covered;
    });
  };

  const pendingList = activeBday ? getPendingForBday(activeBday) : [];
  const coverages   = payments.filter(p => p.type === "coverage" && p.payerId === currentUser.id);

  const handleRegister = () => {
    if (!covMember || !activeBday) return;
    const b = parseDob(activeBday.dob); if (!b) return;
    onAddPayment({
      payerId:          currentUser.id,
      birthdayMemberId: activeBday.id,
      coveredMemberId:  covMember.id,
      amount:           PAYMENT_AMOUNT,
      date:             new Date().toISOString(),
      type:             "coverage",
      method:           "efectivo",
      forMonth:         b.month,
      forYear:          t.year,
      note:             covNote,
      confirmed:        true,
    });
    onToast({ msg: `🛡️ Cubriste el pago de ${covMember.name.split(" ")[0]}`, type: "success" });
    setCovMember(null); setCovNote("");
  };

  return (
    <>
      <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:700,margin:"0 0 10px",letterSpacing:1}}>
        INTEGRANTES SIN ABONAR
      </p>

      {/* Birthday selector (only if multiple bdays this month) */}
      {bdaysThisMonth.length > 1 && (
        <div style={{marginBottom:14}}>
          <label style={{color:"rgba(255,255,255,0.4)",fontSize:11,fontWeight:700,display:"block",marginBottom:8,letterSpacing:.8}}>
            ¿POR EL CUMPLEAÑOS DE QUIÉN?
          </label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {bdaysThisMonth.map(m => (
              <button key={m.id} onClick={()=>{setSelBday(m);setCovMember(null);}}
                style={{padding:"8px 14px",background:activeBday?.id===m.id?"#fb923c":"rgba(255,255,255,0.07)",border:`1.5px solid ${activeBday?.id===m.id?"#fb923c":"rgba(255,255,255,0.1)"}`,borderRadius:10,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                🎂 {m.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {bdaysThisMonth.length === 0 ? (
        <div style={{padding:"14px",background:"rgba(255,255,255,0.04)",borderRadius:12,textAlign:"center",marginBottom:16}}>
          <p style={{color:"rgba(255,255,255,0.3)",fontSize:13,margin:0}}>No hay cumpleaños este mes</p>
        </div>
      ) : !activeBday ? (
        <p style={{color:"rgba(255,255,255,0.3)",fontSize:12,marginBottom:14}}>Selecciona el cumpleañero para ver quién falta</p>
      ) : pendingList.length === 0 ? (
        <div style={{padding:"14px",background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.15)",borderRadius:12,textAlign:"center",marginBottom:16}}>
          <p style={{color:"#4ade80",fontSize:13,fontWeight:700,margin:0}}>✓ Todos abonaron para {activeBday.name.split(" ")[0]}</p>
        </div>
      ) : (
        <>
          <div className="scroll-inner" style={{maxHeight:280,marginBottom:12}}>
            {pendingList.map(m => {
              const isSel = covMember?.id === m.id;
              return (
                <div key={m.id} onClick={()=>setCovMember(isSel ? null : m)}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",
                    background:isSel?"rgba(251,191,36,0.15)":"rgba(255,255,255,0.04)",
                    border:`1.5px solid ${isSel?"#fbbf24":"rgba(255,255,255,0.07)"}`,
                    borderRadius:13,marginBottom:7,cursor:"pointer",transition:"all .15s"}}>
                  <div style={{width:22,height:22,borderRadius:7,flexShrink:0,
                    background:isSel?"#fbbf24":"rgba(255,255,255,0.08)",
                    border:`2px solid ${isSel?"#fbbf24":"rgba(255,255,255,0.2)"}`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {isSel && <span style={{color:"#431407",fontSize:12,fontWeight:900}}>✓</span>}
                  </div>
                  <Avatar member={m} size={36}/>
                  <div style={{flex:1}}>
                    <p style={{color:"#fff",fontWeight:600,fontSize:13,margin:0}}>{m.name}</p>
                    <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,margin:"1px 0 0"}}>📱 {m.phone}</p>
                  </div>
                  <span style={{color:"#f87171",fontWeight:800,fontSize:14}}>S/ {PAYMENT_AMOUNT}</span>
                </div>
              );
            })}
          </div>

          {covMember && (
            <div style={{marginBottom:12}}>
              <label style={{color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:700,display:"block",marginBottom:6,letterSpacing:.8}}>
                NOTA (opcional)
              </label>
              <input value={covNote} onChange={e=>setCovNote(e.target.value)}
                placeholder="Ej: me dijo que paga la próxima semana"
                style={{width:"100%",padding:"12px 14px",background:"rgba(255,255,255,0.07)",
                  border:"1.5px solid rgba(255,255,255,0.1)",borderRadius:12,color:"#fff",fontSize:13,boxSizing:"border-box"}}/>
            </div>
          )}

          <button onClick={handleRegister} disabled={!covMember}
            style={{width:"100%",padding:"14px",
              background:covMember?"linear-gradient(135deg,#fbbf24,#f59e0b)":"#1e1e2e",
              border:"none",borderRadius:14,
              color:covMember?"#431407":"rgba(255,255,255,0.2)",
              fontWeight:800,fontSize:14,cursor:covMember?"pointer":"not-allowed",marginBottom:8}}>
            🛡️ {covMember ? `Cubrir a ${covMember.name.split(" ")[0]} — S/ ${PAYMENT_AMOUNT}` : "Selecciona a quién cubrir"}
          </button>
        </>
      )}

      {/* Coverage history */}
      {coverages.length > 0 && (
        <>
          <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:700,margin:"16px 0 10px",letterSpacing:1}}>
            ⚖️ HISTORIAL DE COBERTURAS
          </p>
          {coverages.map((cov, i) => {
            const covered  = members.find(m => m.id === cov.coveredMemberId);
            const bdayMbr  = members.find(m => m.id === cov.birthdayMemberId);
            const neteado  = payments.some(p =>
              p.payerId === cov.coveredMemberId &&
              p.birthdayMemberId === cov.birthdayMemberId &&
              p.forMonth === cov.forMonth &&
              p.forYear  === cov.forYear &&
              p.type !== "coverage"
            );
            return (
              <div key={i} style={{padding:"12px 14px",
                background:neteado?"rgba(74,222,128,0.06)":"rgba(251,191,36,0.06)",
                border:`1px solid ${neteado?"rgba(74,222,128,0.2)":"rgba(251,191,36,0.2)"}`,
                borderRadius:13,marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {covered && <Avatar member={covered} size={32}/>}
                  <div style={{flex:1}}>
                    <p style={{color:"#fff",fontWeight:600,fontSize:13,margin:0}}>
                      {covered?.name.split(" ")[0]} → 🎂 {bdayMbr?.name.split(" ")[0]}
                    </p>
                    <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,margin:"2px 0 0"}}>
                      {MONTH_NAMES[(cov.forMonth||1)-1]} {cov.forYear}{cov.note ? ` · ${cov.note}` : ""}
                    </p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{color:"#fbbf24",fontWeight:800,fontSize:15,margin:0}}>S/ {cov.amount}</p>
                    <p style={{color:neteado?"#4ade80":"#fb923c",fontSize:11,margin:"3px 0 0",fontWeight:700}}>
                      {neteado ? "✓ Neteado" : "⏳ Pendiente"}
                    </p>
                  </div>
                </div>
                {!neteado && covered && (
                  <div style={{marginTop:8,padding:"7px 10px",background:"rgba(251,191,36,0.07)",borderRadius:8}}>
                    <p style={{color:"rgba(255,255,255,0.4)",fontSize:11,margin:0}}>⏳ Pendiente de regularización por {covered.name.split(" ")[0]}</p>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}



// ── RemindersTab component ────────────────────────────────────────────────
function RemindersTab({ currentUser, members, payments, t }) {
  const [sent, setSent] = useState({});

  const bdaysThisMonth = members.filter(m=>{ const b=parseDob(m.dob); return b&&b.month===t.month&&m.participates!==false; });
  const nextMonth      = t.month===12 ? 1 : t.month+1;
  const nextYear       = t.month===12 ? t.year+1 : t.year;
  const bdaysNextMonth = members.filter(m=>{ const b=parseDob(m.dob); return b&&b.month===nextMonth&&m.participates!==false; });

  // Build pending list: for each bday this month, who hasn't paid
  const pendingThisMonth = [];
  bdaysThisMonth.forEach(bday => {
    const b = parseDob(bday.dob); if(!b) return;
    members.filter(m=>m.participates!==false&&!m.isAdmin&&m.id!==bday.id).forEach(payer => {
      const paid    = payments.some(p=>p.payerId===payer.id&&p.birthdayMemberId===bday.id&&p.forMonth===b.month&&p.forYear===t.year&&p.type!=="coverage");
      const covered = payments.some(p=>p.type==="coverage"&&p.coveredMemberId===payer.id&&p.birthdayMemberId===bday.id&&p.forMonth===b.month&&p.forYear===t.year);
      if (!paid&&!covered) {
        const key = `${payer.id}-${bday.id}`;
        if (!pendingThisMonth.find(x=>x.key===key))
          pendingThisMonth.push({ key, payer, bday, month:b.month, year:t.year });
      }
    });
  });

  // Group by payer
  const byPayer = {};
  pendingThisMonth.forEach(({payer,bday})=>{
    if (!byPayer[payer.id]) byPayer[payer.id] = { payer, bdays:[] };
    byPayer[payer.id].bdays.push(bday);
  });
  const payerList = Object.values(byPayer);

  const sendReminder = (payer, bdays) => {
    const names  = bdays.map(b=>b.name.split(" ")[0]).join(", ");
    const total  = bdays.length * PAYMENT_AMOUNT;
    const msg    = `Hola ${payer.name.split(" ")[0]} 👋\n\nTe recuerdo que tienes pagos pendientes en la junta de cumpleaños:\n\n${bdays.map(b=>`🎂 ${b.name.split(" ")[0]} — S/ 10`).join("\n")}\n\n💰 *Total pendiente: S/ ${total}*\n\nPor favor regulariza tu pago. ¡Gracias! 🙏\n— ${currentUser.name.split(" ")[0]} (Admin)`;
    openWhatsApp(payer.phone, msg);
    setSent(s=>({...s,[payer.id]:true}));
  };

  const sendAll = () => {
    payerList.forEach(({payer,bdays})=>sendReminder(payer,bdays));
  };

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:700,margin:0,letterSpacing:1}}>PENDIENTES ESTE MES</p>
          <p style={{color:"rgba(255,255,255,0.25)",fontSize:11,margin:"3px 0 0"}}>{payerList.length} integrante{payerList.length!==1?"s":""} deben</p>
        </div>
        {payerList.length>0 && (
          <button onClick={sendAll}
            style={{padding:"9px 14px",background:"linear-gradient(135deg,#22c55e,#16a34a)",border:"none",borderRadius:12,color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer",flexShrink:0}}>
            💚 Recordar a todos
          </button>
        )}
      </div>

      {payerList.length===0
        ? <div style={{padding:"24px",background:"rgba(74,222,128,0.06)",borderRadius:14,textAlign:"center",marginBottom:16}}>
            <p style={{color:"#4ade80",fontSize:14,fontWeight:700,margin:0}}>✓ Todos pagaron este mes 🎉</p>
          </div>
        : payerList.map(({payer,bdays})=>(
          <div key={payer.id} style={{background:sent[payer.id]?"rgba(34,197,94,0.08)":"rgba(255,255,255,0.04)",border:`1px solid ${sent[payer.id]?"rgba(34,197,94,0.25)":"rgba(255,255,255,0.07)"}`,borderRadius:14,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Avatar member={payer} size={38}/>
              <div style={{flex:1}}>
                <p style={{color:"#fff",fontWeight:700,fontSize:13,margin:0}}>{payer.name}</p>
                <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,margin:"2px 0 0"}}>
                  Debe por: {bdays.map(b=>b.name.split(" ")[0]).join(", ")} · <span style={{color:"#f87171",fontWeight:700}}>S/ {bdays.length*PAYMENT_AMOUNT}</span>
                </p>
              </div>
              <button onClick={()=>sendReminder(payer,bdays)}
                style={{padding:"7px 12px",background:sent[payer.id]?"rgba(34,197,94,0.2)":"rgba(37,211,102,0.15)",border:`1px solid ${sent[payer.id]?"rgba(34,197,94,0.4)":"rgba(37,211,102,0.3)"}`,borderRadius:10,color:sent[payer.id]?"#4ade80":"#4ade80",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0}}>
                {sent[payer.id]?"✓ Enviado":"💚 Recordar"}
              </button>
            </div>
          </div>
        ))
      }

      {/* Next month preview */}
      {bdaysNextMonth.length>0 && (
        <div style={{marginTop:20}}>
          <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:700,margin:"0 0 10px",letterSpacing:1}}>
            PRÓXIMO MES — {MONTH_NAMES[nextMonth-1]}
          </p>
          {bdaysNextMonth.map(m=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",background:"rgba(255,255,255,0.03)",borderRadius:12,marginBottom:7}}>
              <Avatar member={m} size={34}/>
              <div style={{flex:1}}>
                <p style={{color:"#fff",fontWeight:600,fontSize:13,margin:0}}>{m.name}</p>
                <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,margin:"1px 0 0"}}>🎂 {displayDob(m.dob)}</p>
              </div>
              <button onClick={()=>{
                const msg=`Hola ${m.name.split(" ")[0]} 👋 🎂\n\nEl próximo mes es tu cumpleaños!\n\nRecuerda que este mes debes abonar S/ 10 a la junta para recibir tu regalo del grupo.\n\n¡Con cariño! 💜 — ${currentUser.name.split(" ")[0]}`;
                openWhatsApp(m.phone,msg);
              }}
                style={{padding:"7px 12px",background:"rgba(168,85,247,0.15)",border:"1px solid rgba(168,85,247,0.3)",borderRadius:10,color:"#c084fc",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0}}>
                💜 Avisar
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ═══════════════════════ ADMIN PANEL ══════════════════════════════════════

function AdminPanel({ currentUser, members, payments, wishes, groupProfile, pendingApprovals, onDismissApproval, onAddPayment, onConfirmPayment, onDeleteMember, onNavigate, onLogout, onAddWish }) {
  const t = todayObj();
  const [tab,         setTab]         = useState("dashboard"); // dashboard | report | members | register | coverage
  const [reportMonth, setReportMonth] = useState(t.month);
  const [reportYear,  setReportYear]  = useState(t.year);
  const [expandedId,  setExpandedId]  = useState(null);
  const [toast,       setToast]       = useState(null);
  const [bdayPaid,    setBdayPaid]    = useState({}); // {memberId: true/false} birthday member paid?

  // ── Stats ──────────────────────────────────────────────────────────────
  const totalCollectedAllTime = payments.reduce((s,p)=>s+p.amount,0);
  const totalCollectedMonth   = payments.filter(p=>p.forMonth===t.month&&p.forYear===t.year).reduce((s,p)=>s+p.amount,0);
  const pendingCount = (() => {
    let n=0;
    members.forEach(bday => {
      const b=parseDob(bday.dob); if(!b) return;
      members.forEach(payer => {
        if(!hasPaid(payments,payer.id,bday.id,b.month,t.year)) n++;
      });
    });
    return n;
  })();
  const confirmedCount = payments.filter(p=>p.confirmed).length;
  const unconfirmedSum = payments.filter(p=>!p.confirmed).reduce((s,p)=>s+p.amount,0);

  // ── Report data ────────────────────────────────────────────────────────
  const birthdaysInMonth = members.filter(m=>{ const b=parseDob(m.dob); return b&&b.month===reportMonth; });

  const reportRows = birthdaysInMonth.map(bday => {
    const paidPayments = payments.filter(p=>p.birthdayMemberId===bday.id&&p.forMonth===reportMonth&&p.forYear===reportYear);
    const paidBy       = paidPayments.map(p=>({ ...p, payer: members.find(m=>m.id===p.payerId) }));
    const pendingPayers= members.filter(m=>!paidPayments.some(p=>p.payerId===m.id));
    const total        = paidPayments.reduce((s,p)=>s+p.amount,0);
    const expected     = members.length * PAYMENT_AMOUNT;
    return { bday, paidBy, pendingPayers, total, expected };
  });

  const reportTotal    = reportRows.reduce((s,r)=>s+r.total,0);
  const reportExpected = reportRows.reduce((s,r)=>s+r.expected,0);

  const S = (n) => `S/ ${n.toFixed(2)}`;

  const handleConfirm = (paymentId) => {
    onConfirmPayment(paymentId);
    setToast({ msg:"✅ Pago confirmado como recibido", type:"success" });
  };

  // ── Register payment on behalf ─────────────────────────────────────────
  const [regPayer,   setRegPayer]   = useState(null);
  const [regBday,    setRegBday]    = useState(null);
  const [regMethod,  setRegMethod]  = useState("");
  const [regVoucher, setRegVoucher] = useState("");

  const handleRegisterForOther = () => {
    if (!regPayer||!regBday||!regMethod) return;
    const b=parseDob(regBday.dob); if(!b) return;
    onAddPayment({ payerId:regPayer.id, birthdayMemberId:regBday.id, amount:PAYMENT_AMOUNT, date:new Date().toISOString(), type:"admin", method:regMethod, voucher:regVoucher, forMonth:b.month, forYear:t.year, confirmedByAdmin:true, confirmed:true });
    setToast({ msg:`✅ Pago registrado: ${regPayer.name.split(" ")[0]} → ${regBday.name.split(" ")[0]}`, type:"success" });
    setRegPayer(null); setRegBday(null); setRegMethod(""); setRegVoucher("");
  };

  const inputStyle = { width:"100%", padding:"13px 15px", background:"rgba(255,255,255,0.07)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:13, color:"#fff", fontSize:14, boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"100vh", background:"#0a0118", paddingBottom:100 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)} />}

      {/* Admin Header */}
      <div style={{ background:"linear-gradient(145deg,#431407,#7c2d12,#431407)", padding:"50px 20px 0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div onClick={()=>onNavigate("adminEditProfile")}
              style={{position:"relative",cursor:"pointer",flexShrink:0}}>
              <Avatar member={currentUser} size={50} />
              <div style={{position:"absolute",bottom:0,right:0,width:18,height:18,borderRadius:"50%",background:"#fbbf24",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,border:"2px solid #431407"}}>✏️</div>
            </div>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <p style={{ color:"#fbbf24", fontWeight:900, fontSize:17, margin:0 }}>{currentUser.name.split(" ")[0]}</p>
                <span style={{ background:"#fbbf24", color:"#431407", fontSize:10, padding:"2px 8px", borderRadius:20, fontWeight:800 }}>👑 ADMIN</span>
              </div>
              <p style={{ color:"rgba(255,255,255,0.45)", fontSize:11, margin:"2px 0 0" }}>Panel de administración · <span style={{color:"rgba(251,191,36,0.6)"}}>toca foto para editar</span></p>
            </div>
          </div>
          <button onClick={onLogout} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:10, padding:"7px 13px", color:"rgba(255,255,255,0.55)", cursor:"pointer", fontSize:12, fontWeight:600 }}>Salir</button>
        </div>

        {/* Tab bar */}
        <div className="scroll-x" style={{ display:"flex", gap:0, overflowX:"auto", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          {[
            { id:"dashboard",  icon:"📊", label:"Inicio" },
            { id:"report",     icon:"📋", label:"Informe" },
            { id:"reminders",  icon:"📲", label:"Avisos" },
            { id:"register",   icon:"✍️",  label:"Registrar" },
            { id:"coverage",   icon:"🛡️",  label:"Cubrir" },
            { id:"members",    icon:"👥",  label:"Grupo" },
          ].map(tb => (
            <button key={tb.id} onClick={()=>setTab(tb.id)}
              style={{ flexShrink:0, padding:"10px 12px", border:"none", background:"transparent",
                color:tab===tb.id?"#fbbf24":"rgba(255,255,255,0.38)",
                fontWeight:tab===tb.id?800:500, fontSize:11, cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                borderBottom: tab===tb.id?"2.5px solid #fbbf24":"2.5px solid transparent" }}>
              <span style={{fontSize:16}}>{tb.icon}</span>
              <span>{tb.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"20px 18px 120px" }}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard" && (
          <>
            {/* Group profile button */}
            <button onClick={()=>onNavigate("adminGroupProfile")}
              style={{width:"100%",padding:"13px 16px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              {groupProfile?.photo
                ? <img src={groupProfile.photo} style={{width:40,height:40,borderRadius:"50%",objectFit:"cover",flexShrink:0}} alt="grupo"/>
                : <span style={{fontSize:28}}>👨‍👩‍👧‍👦</span>}
              <div style={{textAlign:"left"}}>
                <p style={{margin:0,fontWeight:800}}>{groupProfile?.name||"Mi Grupo"}</p>
                <p style={{margin:"2px 0 0",color:"rgba(255,255,255,0.4)",fontSize:11}}>{groupProfile?.desc||"Toca para editar el perfil"}</p>
              </div>
              <span style={{marginLeft:"auto",color:"rgba(255,255,255,0.3)"}}>›</span>
            </button>

            {/* New member alerts */}
            {pendingApprovals.length>0 && (
              <div style={{background:"rgba(168,85,247,0.1)",border:"1px solid rgba(168,85,247,0.25)",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
                <p style={{color:"#c084fc",fontWeight:800,fontSize:13,margin:"0 0 8px"}}>🔔 Nuevos integrantes ({pendingApprovals.length})</p>
                {pendingApprovals.map((a,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:i<pendingApprovals.length-1?6:0}}>
                    <div>
                      <p style={{color:"#fff",fontWeight:700,fontSize:13,margin:0}}>{a.name}</p>
                      <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,margin:"1px 0 0"}}>📱 {a.phone} · {a.participates!==false?"Participa":"Solo ve"}</p>
                    </div>
                    <button onClick={()=>onDismissApproval(i)}
                      style={{background:"rgba(74,222,128,0.15)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:8,padding:"5px 10px",color:"#4ade80",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                      ✓ Visto
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* KPI cards */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
              {[
                { label:"RECAUDADO TOTAL",   value:S(totalCollectedAllTime), color:"#4ade80", bg:"rgba(74,222,128,0.08)",  border:"rgba(74,222,128,0.2)" },
                { label:"ESTE MES",          value:S(totalCollectedMonth),   color:"#818cf8", bg:"rgba(129,140,248,0.08)", border:"rgba(129,140,248,0.2)" },
                { label:"SIN CONFIRMAR",     value:S(unconfirmedSum),        color:"#fbbf24", bg:"rgba(251,191,36,0.08)",  border:"rgba(251,191,36,0.2)" },
                { label:"PAGOS PENDIENTES",  value:pendingCount,             color:"#f87171", bg:"rgba(248,113,113,0.08)", border:"rgba(248,113,113,0.2)" },
              ].map(c => (
                <div key={c.label} style={{ background:c.bg, borderRadius:16, padding:"14px 16px", border:`1px solid ${c.border}` }}>
                  <p style={{ color:"rgba(255,255,255,0.4)", fontSize:10, margin:"0 0 4px", letterSpacing:.8, fontWeight:700 }}>{c.label}</p>
                  <p style={{ color:c.color, fontSize:22, fontWeight:900, margin:0 }}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* Unconfirmed payments */}
            <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, margin:"0 0 10px", letterSpacing:1 }}>⏳ PAGOS PENDIENTES DE CONFIRMAR</p>
            {payments.filter(p=>!p.confirmed).length === 0
              ? <div style={{ padding:"20px", background:"rgba(255,255,255,0.03)", borderRadius:14, textAlign:"center" }}>
                  <p style={{ color:"rgba(255,255,255,0.25)", fontSize:13, margin:0 }}>Todos los pagos están confirmados ✓</p>
                </div>
              : payments.filter(p=>!p.confirmed).map(p => {
                const payer = members.find(m=>m.id===p.payerId);
                const bday  = members.find(m=>m.id===p.birthdayMemberId);
                const mi    = PAY_METHODS.find(x=>x.id===p.method)||{};
                return (
                  <div key={p.id} style={{ background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:14, padding:"12px 14px", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      {payer && <Avatar member={payer} size={36} />}
                      <div style={{ flex:1 }}>
                        <p style={{ color:"#fff", fontWeight:700, fontSize:13, margin:0 }}>
                          {payer?.name.split(" ")[0]} → 🎂 {bday?.name.split(" ")[0]}
                        </p>
                        <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, margin:"2px 0 0" }}>
                          {new Date(p.date).toLocaleDateString("es-PE")} · {mi.icon} {mi.label}
                        </p>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <p style={{ color:"#fbbf24", fontWeight:800, fontSize:16, margin:0 }}>S/ {p.amount}</p>
                        <button onClick={()=>handleConfirm(p.id)}
                          style={{ marginTop:4, padding:"4px 10px", background:"rgba(74,222,128,0.2)", border:"1px solid rgba(74,222,128,0.4)", borderRadius:8, color:"#4ade80", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          ✓ Confirmar
                        </button>
                        <button onClick={()=>{
                          const msg=`Hola ${payer?.name.split(" ")[0]} 👋, te recuerdo que tienes un pago pendiente de S/ ${p.amount} por el cumpleaños de ${bday?.name.split(" ")[0]}. Por favor regulariza tu pago. Gracias 🙏`;
                          openWhatsApp(payer?.phone||"", msg);
                        }}
                          style={{ marginTop:4, display:"block", padding:"4px 10px", background:"rgba(37,211,102,0.15)", border:"1px solid rgba(37,211,102,0.3)", borderRadius:8, color:"#4ade80", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          💚 Recordar
                        </button>
                      </div>
                    </div>
                    {p.voucher && <img src={p.voucher} alt="comprobante" style={{ width:"100%", borderRadius:10, marginTop:8, maxHeight:120, objectFit:"cover" }} />}
                  </div>
                );
              })}

            {/* Birthday today alert for admin */}
            {members.filter(m=>isBirthdayToday(m.dob)).length>0 && (
              <div style={{background:"rgba(168,85,247,0.1)",border:"1px solid rgba(168,85,247,0.3)",borderRadius:16,padding:"14px 16px",marginBottom:16}}>
                <p style={{color:"#c084fc",fontWeight:700,fontSize:12,margin:"0 0 10px",letterSpacing:.8}}>🎂 CUMPLEAÑOS HOY</p>
                {members.filter(m=>isBirthdayToday(m.dob)).map(m=>{
                  const alreadyWished=wishes&&wishes.some(w=>w.birthdayMemberId===m.id&&w.senderId===currentUser.id);
                  return (
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <Avatar member={m} size={38}/>
                      <div style={{flex:1}}>
                        <p style={{color:"#fff",fontWeight:700,fontSize:14,margin:0}}>{m.name}</p>
                        {alreadyWished&&<p style={{color:"#4ade80",fontSize:11,margin:"2px 0 0"}}>✓ Ya enviaste tu saludo</p>}
                      </div>
                      {!alreadyWished&&(
                        <button onClick={()=>onNavigate("adminWishes")}
                          style={{padding:"8px 13px",background:"linear-gradient(135deg,#a855f7,#6366f1)",border:"none",borderRadius:10,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0}}>
                          🎉 Saludar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Next birthdays */}
            <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, margin:"18px 0 10px", letterSpacing:1 }}>🎂 PRÓXIMOS CUMPLEAÑOS</p>
            {members
              .map(m=>({ ...m, days:daysUntilBirthday(m.dob) }))
              .sort((a,b)=>a.days-b.days)
              .slice(0,5)
              .map(m => (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"rgba(255,255,255,0.04)", borderRadius:13, marginBottom:7 }}>
                  <Avatar member={m} size={38} />
                  <div style={{ flex:1 }}>
                    <p style={{ color:"#fff", fontWeight:600, fontSize:13, margin:0 }}>{m.name}</p>
                    <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, margin:"2px 0 0" }}>{displayDob(m.dob)}</p>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <p style={{ color: m.days===0?"#fbbf24":"rgba(255,255,255,0.5)", fontWeight:700, fontSize:12, margin:0 }}>{m.days===0?"¡HOY! 🎉":`en ${m.days}d`}</p>
                    {/* collected for this birthday */}
                    {(() => {
                      const b=parseDob(m.dob); if(!b) return null;
                      const collected=payments.filter(p=>p.birthdayMemberId===m.id&&p.forMonth===b.month&&p.forYear===t.year).reduce((s,p)=>s+p.amount,0);
                      return <p style={{ color:"#4ade80", fontWeight:800, fontSize:13, margin:"2px 0 0" }}>{S(collected)}</p>;
                    })()}
                  </div>
                </div>
              ))}
          </>
        )}

        {/* ── INFORME ── */}
        {tab==="report" && (
          <>
            {/* Month selector */}
            <div className="scroll-x" style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4, marginBottom:12 }}>
              {MONTH_SHORT.map((mn,i) => (
                <button key={i} onClick={()=>setReportMonth(i+1)}
                  style={{ flexShrink:0, padding:"8px 13px", background:reportMonth===i+1?"linear-gradient(135deg,#fb923c,#f59e0b)":"rgba(255,255,255,0.06)", border:"none", borderRadius:20, color:"#fff", fontWeight:600, fontSize:12, cursor:"pointer" }}>
                  {mn}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              {[t.year,t.year-1].map(y => (
                <button key={y} onClick={()=>setReportYear(y)}
                  style={{ flex:1, padding:"9px", background:reportYear===y?"#fb923c":"rgba(255,255,255,0.05)", border:"none", borderRadius:11, color:"#fff", fontWeight:600, cursor:"pointer" }}>
                  {y}
                </button>
              ))}
            </div>

            {/* Summary totals */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
              <div style={{ background:"rgba(74,222,128,0.08)", borderRadius:14, padding:"14px", border:"1px solid rgba(74,222,128,0.18)" }}>
                <p style={{ color:"rgba(255,255,255,0.4)", fontSize:10, margin:"0 0 4px", letterSpacing:.8, fontWeight:700 }}>RECAUDADO</p>
                <p style={{ color:"#4ade80", fontSize:22, fontWeight:900, margin:0 }}>{S(reportTotal)}</p>
              </div>
              <div style={{ background:"rgba(251,146,60,0.08)", borderRadius:14, padding:"14px", border:"1px solid rgba(251,146,60,0.18)" }}>
                <p style={{ color:"rgba(255,255,255,0.4)", fontSize:10, margin:"0 0 4px", letterSpacing:.8, fontWeight:700 }}>ESPERADO</p>
                <p style={{ color:"#fb923c", fontSize:22, fontWeight:900, margin:0 }}>{S(reportExpected)}</p>
              </div>
            </div>

            {reportRows.length===0
              ? <div style={{ padding:"30px", background:"rgba(255,255,255,0.03)", borderRadius:16, textAlign:"center" }}>
                  <p style={{ color:"rgba(255,255,255,0.25)", fontSize:14, margin:0 }}>No hay cumpleaños en {MONTH_NAMES[reportMonth-1]}</p>
                </div>
              : reportRows.map(({ bday, paidBy, pendingPayers, total, expected }) => {
                const isExpanded = expandedId===bday.id;
                const pct = expected>0 ? Math.round((total/expected)*100) : 0;
                return (
                  <div key={bday.id} style={{ background:"rgba(255,255,255,0.03)", borderRadius:18, marginBottom:14, overflow:"hidden", border:"1px solid rgba(255,255,255,0.06)" }}>
                    {/* Header row */}
                    <div onClick={()=>setExpandedId(isExpanded?null:bday.id)}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", cursor:"pointer" }}>
                      <Avatar member={bday} size={46} />
                      <div style={{ flex:1 }}>
                        <p style={{ color:"#fff", fontWeight:700, fontSize:15, margin:0 }}>{bday.name}</p>
                        <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, margin:"3px 0 0" }}>🎂 {displayDob(bday.dob)}</p>
                        {/* Progress bar */}
                        <div style={{ marginTop:6, height:5, background:"rgba(255,255,255,0.1)", borderRadius:3, overflow:"hidden", width:"100%" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:"linear-gradient(90deg,#4ade80,#22c55e)", borderRadius:3, transition:"width .5s" }} />
                        </div>
                        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:10, margin:"3px 0 0" }}>{pct}% recaudado · {paidBy.length}/{members.length} pagaron</p>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <p style={{ color:"#4ade80", fontWeight:900, fontSize:18, margin:0 }}>{S(total)}</p>
                        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, margin:"2px 0 0" }}>de {S(expected)}</p>
                        <span style={{ color:"rgba(255,255,255,0.3)", fontSize:18 }}>{isExpanded?"▲":"▼"}</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", padding:"14px 16px" }}>
                        {/* Paid */}
                        {paidBy.length>0 && (
                          <>
                            <p style={{ color:"#4ade80", fontSize:11, fontWeight:700, margin:"0 0 8px", letterSpacing:.8 }}>✓ PAGARON ({paidBy.length})</p>
                            {paidBy.map((p,i) => {
                              const mi=PAY_METHODS.find(x=>x.id===p.method)||{};
                              return (
                                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"rgba(74,222,128,0.07)", borderRadius:10, marginBottom:6 }}>
                                  {p.payer && <Avatar member={p.payer} size={30} />}
                                  <div style={{ flex:1 }}>
                                    <p style={{ color:"#fff", fontSize:13, fontWeight:600, margin:0 }}>{p.payer?.name.split(" ")[0]||"?"}</p>
                                    <p style={{ color:"rgba(255,255,255,0.35)", fontSize:10, margin:"1px 0 0" }}>
                                      {new Date(p.date).toLocaleDateString("es-PE")} · {mi.icon} {mi.label}
                                    </p>
                                  </div>
                                  <div style={{ textAlign:"right" }}>
                                    <p style={{ color:"#4ade80", fontWeight:800, fontSize:14, margin:0 }}>S/ {p.amount}</p>
                                    {p.confirmed
                                      ? <p style={{ color:"rgba(74,222,128,0.6)", fontSize:10, margin:"1px 0 0" }}>✓ Recibido</p>
                                      : <button onClick={()=>handleConfirm(p.id)}
                                          style={{ marginTop:2, padding:"2px 8px", background:"rgba(251,191,36,0.2)", border:"1px solid rgba(251,191,36,0.4)", borderRadius:6, color:"#fbbf24", fontSize:10, fontWeight:700, cursor:"pointer" }}>
                                          Confirmar
                                        </button>}
                                  </div>
                                  {p.voucher && <img src={p.voucher} alt="" style={{ width:36, height:36, borderRadius:8, objectFit:"cover", cursor:"pointer" }} onClick={()=>window.open(p.voucher)} />}
                                </div>
                              );
                            })}
                          </>
                        )}
                        {/* Pending */}
                        {pendingPayers.length>0 && (
                          <>
                            <p style={{ color:"#f87171", fontSize:11, fontWeight:700, margin:"12px 0 8px", letterSpacing:.8 }}>✗ PENDIENTES ({pendingPayers.length})</p>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                              {pendingPayers.map(m => (
                                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:20 }}>
                                  <Avatar member={m} size={20} />
                                  <span style={{ color:"#f87171", fontSize:12, fontWeight:600 }}>{m.name.split(" ")[0]}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            {reportRows.length>0 && (
              <button onClick={()=>exportPDF(members,payments,reportMonth,reportYear,groupProfile)}
                style={{width:"100%",marginTop:16,padding:"14px",background:"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",borderRadius:14,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                📄 Exportar informe — {MONTH_NAMES[reportMonth-1]} {reportYear}
              </button>
            )}
          </>
        )}

        {/* ── RECORDATORIOS WHATSAPP ── */}
        {tab==="reminders" && (
          <RemindersTab currentUser={currentUser} members={members} payments={payments} t={t} />
        )}

        {/* ── REGISTRAR POR OTRO ── */}
        {tab==="register" && (
          <>
            <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, margin:"0 0 14px", letterSpacing:1 }}>REGISTRAR PAGO EN NOMBRE DE UN MIEMBRO</p>

            <div style={{ marginBottom:14 }}>
              <label style={{ color:"rgba(255,255,255,0.45)", fontSize:12, fontWeight:700, display:"block", marginBottom:8, letterSpacing:.8 }}>¿QUIÉN PAGA?</label>
              <div className="scroll-inner" style={{ maxHeight:200, overflowY:"auto", WebkitOverflowScrolling:"touch", display:"flex", flexDirection:"column", gap:6 }}>
                {members.map(m => (
                  <div key={m.id} onClick={()=>setRegPayer(m)}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", background:regPayer?.id===m.id?"rgba(129,140,248,0.18)":"rgba(255,255,255,0.04)", border:`1.5px solid ${regPayer?.id===m.id?"#818cf8":"transparent"}`, borderRadius:12, cursor:"pointer" }}>
                    <Avatar member={m} size={34} />
                    <span style={{ color:"#fff", fontWeight:600, fontSize:13 }}>{m.name}</span>
                    {regPayer?.id===m.id && <span style={{ marginLeft:"auto", color:"#818cf8", fontWeight:800 }}>✓</span>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ color:"rgba(255,255,255,0.45)", fontSize:12, fontWeight:700, display:"block", marginBottom:8, letterSpacing:.8 }}>¿POR EL CUMPLEAÑOS DE QUIÉN?</label>
              <div className="scroll-inner" style={{ maxHeight:200, overflowY:"auto", WebkitOverflowScrolling:"touch", display:"flex", flexDirection:"column", gap:6 }}>
                {members.map(m => {
                  const b=parseDob(m.dob); if(!b) return null;
                  const alreadyPaid=regPayer&&hasPaid(payments,regPayer.id,m.id,b.month,t.year);
                  return (
                    <div key={m.id} onClick={()=>!alreadyPaid&&setRegBday(m)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", background:regBday?.id===m.id?"rgba(251,146,60,0.18)":"rgba(255,255,255,0.04)", border:`1.5px solid ${regBday?.id===m.id?"#fb923c":"transparent"}`, borderRadius:12, cursor:alreadyPaid?"not-allowed":"pointer", opacity:alreadyPaid?.5:1 }}>
                      <Avatar member={m} size={34} />
                      <div style={{ flex:1 }}>
                        <span style={{ color:"#fff", fontWeight:600, fontSize:13 }}>{m.name}</span>
                        <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, margin:"1px 0 0" }}>🎂 {MONTH_NAMES[b.month-1]}</p>
                      </div>
                      {alreadyPaid ? <span style={{ color:"#4ade80", fontSize:11, fontWeight:700 }}>✓ Ya pagó</span>
                        : regBday?.id===m.id && <span style={{ color:"#fb923c", fontWeight:800 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {regPayer && regBday && (
              <div style={{ padding:"16px", background:"rgba(129,140,248,0.07)", borderRadius:16, border:"1px solid rgba(129,140,248,0.15)", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:"rgba(0,0,0,0.25)", borderRadius:10, marginBottom:14 }}>
                  <span style={{ color:"rgba(255,255,255,0.5)", fontSize:13 }}>Monto fijo</span>
                  <span style={{ color:"#fff", fontWeight:900, fontSize:22 }}>S/ 10.00</span>
                </div>
                <MethodSelector value={regMethod} onChange={setRegMethod} />
                {regMethod && <VoucherUpload value={regVoucher} onChange={setRegVoucher} method={regMethod} />}
              </div>
            )}

            <button onClick={handleRegisterForOther} disabled={!regPayer||!regBday||!regMethod}
              style={{ width:"100%", padding:"15px", background:(regPayer&&regBday&&regMethod)?"linear-gradient(135deg,#fb923c,#f59e0b)":"#1e1e2e", border:"none", borderRadius:16, color:(regPayer&&regBday&&regMethod)?"#fff":"rgba(255,255,255,0.2)", fontWeight:800, fontSize:15, cursor:(regPayer&&regBday&&regMethod)?"pointer":"not-allowed" }}>
              {!regPayer?"Selecciona quién paga":!regBday?"Selecciona el cumpleañero":!regMethod?"⚠️ Elige método":"✍️ Registrar Pago S/ 10"}
            </button>
          </>
        )}

        {/* ── COBERTURA DEL RECAUDADOR ── */}
        {tab==="coverage" && (
          <>
            <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:700,margin:"0 0 6px",letterSpacing:1}}>🛡️ COBERTURA Y ENTREGA</p>
            <p style={{color:"rgba(255,255,255,0.3)",fontSize:12,margin:"0 0 16px",lineHeight:1.5}}>Cubre pagos pendientes de integrantes y gestiona la entrega al cumpleañero.</p>

            {/* Send collected amount to birthday person */}
            {(() => {
              const bdaysThisMonth = members.filter(m => { const b=parseDob(m.dob); return b&&b.month===t.month; });
              if (bdaysThisMonth.length===0) return null;
              return (
                <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:16,padding:"14px 16px",marginBottom:16}}>
                  <p style={{color:"#4ade80",fontWeight:700,fontSize:13,margin:"0 0 12px"}}>💰 Enviar junta al cumpleañero</p>
                  {bdaysThisMonth.map(m => {
                    const b = parseDob(m.dob);
                    const collected = payments
                      .filter(p => p.birthdayMemberId===m.id && p.forMonth===t.month && p.forYear===t.year && p.confirmed)
                      .reduce((s,p)=>s+p.amount, 0);
                    const participantCount = members.filter(x=>x.participates!==false).length;
                    const expected = participantCount * PAYMENT_AMOUNT;
                    const pct = expected>0 ? Math.round((collected/expected)*100) : 0;
                    const bdayAnswered = bdayPaid[m.id];

                    return (
                      <div key={m.id} style={{marginBottom:12}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                          <Avatar member={m} size={42}/>
                          <div style={{flex:1}}>
                            <p style={{color:"#fff",fontWeight:700,fontSize:14,margin:0}}>{m.name}</p>
                            <p style={{color:"rgba(255,255,255,0.4)",fontSize:11,margin:"2px 0 0"}}>🎂 {displayDob(m.dob)} · {m.participates!==false?"Participa en junta":"Solo saludos"}</p>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div style={{height:6,background:"rgba(255,255,255,0.08)",borderRadius:3,marginBottom:6,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:"linear-gradient(90deg,#4ade80,#22c55e)",borderRadius:3}}/>
                        </div>
                        <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,margin:"0 0 10px"}}>{pct}% recaudado · S/ {collected} de S/ {expected}</p>

                        {/* Birthday person contributed? */}
                        {m.participates!==false && (
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                            <p style={{color:"rgba(255,255,255,0.5)",fontSize:12,margin:0,flex:1}}>¿El cumpleañero aportó?</p>
                            <button onClick={()=>setBdayPaid(p=>({...p,[m.id]:true}))}
                              style={{padding:"6px 12px",background:bdayAnswered===true?"#4ade80":"rgba(74,222,128,0.1)",border:`1.5px solid ${bdayAnswered===true?"#4ade80":"rgba(74,222,128,0.3)"}`,borderRadius:8,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                              ✓ Sí
                            </button>
                            <button onClick={()=>setBdayPaid(p=>({...p,[m.id]:false}))}
                              style={{padding:"6px 12px",background:bdayAnswered===false?"#f87171":"rgba(248,113,113,0.1)",border:`1.5px solid ${bdayAnswered===false?"#f87171":"rgba(248,113,113,0.3)"}`,borderRadius:8,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                              ✗ No
                            </button>
                          </div>
                        )}

                        {/* Total to deliver */}
                        {(() => {
                          const bdayExtra = (m.participates!==false && bdayAnswered===true) ? PAYMENT_AMOUNT : 0;
                          const total = collected + bdayExtra;
                          const canSend = total > 0;
                          return (
                            <div style={{background:"rgba(0,0,0,0.3)",borderRadius:12,padding:"12px 14px"}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                <span style={{color:"rgba(255,255,255,0.45)",fontSize:12}}>Recaudado del grupo</span>
                                <span style={{color:"#4ade80",fontWeight:700}}>S/ {collected}</span>
                              </div>
                              {m.participates!==false && bdayAnswered!==undefined && (
                                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                  <span style={{color:"rgba(255,255,255,0.45)",fontSize:12}}>Aporte del cumpleañero</span>
                                  <span style={{color:bdayAnswered?"#4ade80":"#f87171",fontWeight:700}}>{bdayAnswered?`+ S/ ${PAYMENT_AMOUNT}`:"No aportó"}</span>
                                </div>
                              )}
                              <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",marginTop:8,paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <span style={{color:"#fff",fontWeight:700,fontSize:13}}>💵 Total a entregar</span>
                                <span style={{color:"#fbbf24",fontWeight:900,fontSize:20}}>S/ {total}</span>
                              </div>
                              <DeliveryVoucherSend
                                member={m}
                                total={total}
                                bdayAnswered={bdayAnswered}
                                canSend={canSend}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Coverage section */}
            <CoverageSection
              currentUser={currentUser}
              members={members}
              payments={payments}
              onAddPayment={onAddPayment}
              onToast={setToast}
              t={t}
            />
          </>
        )}

        {/* ── MIEMBROS ADMIN ── */}
        {tab==="members" && (
          <>
            <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, margin:"0 0 12px", letterSpacing:1 }}>INTEGRANTES DEL GRUPO ({members.length})</p>
            {members.map(m => {
              const totalPaid=payments.filter(p=>p.payerId===m.id).reduce((s,p)=>s+p.amount,0);
              const bday=isBirthdayToday(m.dob);
              const daysLeft=daysUntilBirthday(m.dob);
              return (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 14px", background:bday?"rgba(251,191,36,0.07)":"rgba(255,255,255,0.04)", border:bday?"1px solid rgba(251,191,36,0.2)":"1px solid rgba(255,255,255,0.05)", borderRadius:16, marginBottom:9 }}>
                  <Avatar member={m} size={46} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <p style={{ color:"#fff", fontWeight:700, fontSize:14, margin:0 }}>{m.name}</p>
                      {m.isAdmin && <span style={{ background:"#fbbf24", color:"#431407", fontSize:9, padding:"1px 6px", borderRadius:10, fontWeight:800 }}>👑</span>}
                      {bday && <span style={{ fontSize:14 }}>🎂</span>}
                    </div>
                    <p style={{ color:"rgba(255,255,255,0.35)", fontSize:11, margin:"2px 0 0" }}>📱 {m.phone} · {displayDob(m.dob)}</p>
                    <p style={{ color:"rgba(255,255,255,0.2)", fontSize:10, margin:"1px 0 0" }}>{bday?"🎉 ¡Hoy es su cumpleaños!":daysLeft===1?"🎂 Mañana es su cumpleaños":`🎂 Cumple en ${daysLeft} días`}</p>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <p style={{ color:"#4ade80", fontWeight:800, fontSize:14, margin:0 }}>S/ {totalPaid}</p>
                    <p style={{ color:"rgba(255,255,255,0.3)", fontSize:10, margin:"1px 0 0" }}>aportado</p>
                  </div>
                </div>
              );
            })}
          </>
        )}

      </div>
    </div>
  );
}

function BottomNav({ screen, onNavigate }) {
  const items = [
    { icon:"🏠", label:"Inicio",    screen:"home" },
    { icon:"💳", label:"Pagar",     screen:"payment" },
    { icon:"📋", label:"Mis Pagos", screen:"myPayments" },
    { icon:"👨‍👩‍👧", label:"Familia",   screen:"members" },
    { icon:"📊", label:"Resumen",   screen:"summary" },
  ];
  return (
    <div style={{ position:"sticky", bottom:0, left:0, width:"100%", background:"rgba(10,1,24,0.97)", borderTop:"1px solid rgba(255,255,255,0.07)", display:"flex", zIndex:100, backdropFilter:"blur(20px)" }}>
      {items.map(item => {
        const active=screen===item.screen;
        return (
          <button key={item.screen} onClick={() => onNavigate(item.screen)}
            style={{ flex:1, padding:"10px 4px 12px", border:"none", background:"transparent", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <span style={{ fontSize:22, filter:active?"drop-shadow(0 0 6px rgba(168,85,247,0.8))":"none" }}>{item.icon}</span>
            <span style={{ color:active?"#c084fc":"rgba(255,255,255,0.27)", fontSize:10, fontWeight:active?700:400 }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  // ── Firebase real-time state ───────────────────────────────
  const [members,          setMembers]          = useState([]);
  const [payments,         setPayments]         = useState([]);
  const [wishes,           setWishes]           = useState([]);
  const [groupProfile,     setGroupProfile]     = useState({ name:"Mi Grupo Familiar", desc:"", photo:"" });
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [firebaseError,    setFirebaseError]    = useState("");

  const [currentUser,   setCurrentUser]   = useState(null);
  const [screen,        setScreen]        = useState("login");
  const [editingMember, setEditingMember] = useState(null);

  // ── Subscribe to Firestore in real time ───────────────────
  useEffect(() => {
    // Timeout: si en 10s no conecta, muestra el error
    const timeout = setTimeout(() => {
      setFirebaseError("No se pudo conectar con Firebase. Verifica tu conexión a internet y que las credenciales en firebase.js sean correctas.");
    }, 10000);

    const unsubs = [
      subscribeMembers(data => { setMembers(data); setLoading(false); clearTimeout(timeout); }),
      subscribePayments(data => setPayments(data)),
      subscribeWishes(data   => setWishes(data)),
      subscribeConfig(data   => {
        if (data.groupProfile)     setGroupProfile(data.groupProfile);
        if (data.pendingApprovals) setPendingApprovals(data.pendingApprovals);
      }),
    ];
    return () => { unsubs.forEach(u => u()); clearTimeout(timeout); };
  }, []);

  // Keep currentUser in sync when members update from Firestore
  useEffect(() => {
    if (currentUser) {
      const updated = members.find(m => m.id === currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  }, [members]);

  // ── Auth ──────────────────────────────────────────────────
  const handleLogin = (id) => {
    const m = members.find(m => m.id === id);
    if (!m) return;
    setCurrentUser(m);
    setScreen(m.isAdmin ? "admin" : "home");
  };

  const handleLogout = () => { setCurrentUser(null); setScreen("login"); };

  // ── Members ───────────────────────────────────────────────
  const handleSaveMember = async (form) => {
    if (editingMember) {
      await updateMember(editingMember.id, form);
      setEditingMember(null);
    } else {
      await addMember(form);
      if (!form.isAdmin) {
        await addPendingApproval({ name:form.name, phone:form.phone, dob:form.dob, participates:form.participates });
      }
    }
    setScreen(currentUser ? (currentUser.isAdmin ? "admin" : "members") : "login");
  };

  const handleChangePin = async (memberId, newPin) => {
    await updateMember(memberId, { pinHash: hashPin(newPin) });
  };

  const handleDeleteMember = async (id) => {
    await deleteMember(id);
    await deletePaymentsByMember(id);
  };

  // ── Payments ──────────────────────────────────────────────
  const handleAddPayment = async (p) => {
    let data = { ...p };
    // Upload voucher to Storage if it's a base64 image
    if (data.voucher && data.voucher.startsWith("data:")) {
      const tempId = `${data.payerId}_${Date.now()}`;
      data.voucher = await uploadVoucher(tempId, data.voucher);
    }
    await addPayment(data);
  };
  const handleConfirmPayment = async (id) => await confirmPayment(id);

  // ── Wishes ────────────────────────────────────────────────
  const handleAddWish = async (w)                    => await addWish(w);
  const handleReact   = async (wishId, emoji, userId) => await reactToWish(wishId, emoji, userId);

  // ── Group profile ─────────────────────────────────────────
  const handleSaveGroupProfile = async (p) => {
    await updateGroupProfile(p);
  };

  // ── Pending approvals ─────────────────────────────────────
  const handleDismissApproval = async (i) => await dismissPendingApproval(i);

  const navigate = s => setScreen(s);
  const goHome   = () => setScreen(currentUser?.isAdmin ? "admin" : "home");

  const common = { currentUser, members, payments, wishes, groupProfile, onBack:goHome, onNavigate:navigate };

  // ── Loading screen ────────────────────────────────────────
  if (loading) return (
    <div id="app-root" style={{ maxWidth:430, margin:"0 auto", minHeight:"100dvh", background:"linear-gradient(160deg,#0f0228,#1e0a45)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px", fontFamily:"'Nunito','Segoe UI',sans-serif" }}>
      {!firebaseError ? (
        <>
          <div style={{ fontSize:56, marginBottom:16, animation:"spin 1.5s linear infinite" }}>🎂</div>
          <p style={{ color:"rgba(255,255,255,0.6)", fontSize:15, fontWeight:700 }}>Conectando con Firebase...</p>
        </>
      ) : (
        <>
          <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
          <p style={{ color:"#f87171", fontSize:15, fontWeight:800, textAlign:"center", marginBottom:8 }}>Error de conexión</p>
          <p style={{ color:"rgba(255,255,255,0.5)", fontSize:13, textAlign:"center", lineHeight:1.6, marginBottom:20 }}>{firebaseError}</p>
          <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:12, padding:"12px 16px", width:"100%" }}>
            <p style={{ color:"rgba(255,255,255,0.4)", fontSize:11, fontWeight:700, margin:"0 0 6px", letterSpacing:1 }}>POSIBLES CAUSAS</p>
            <p style={{ color:"rgba(255,255,255,0.5)", fontSize:12, margin:"3px 0" }}>• Credenciales incorrectas en firebase.js</p>
            <p style={{ color:"rgba(255,255,255,0.5)", fontSize:12, margin:"3px 0" }}>• Firestore no activado en Firebase Console</p>
            <p style={{ color:"rgba(255,255,255,0.5)", fontSize:12, margin:"3px 0" }}>• Reglas de Firestore no publicadas</p>
            <p style={{ color:"rgba(255,255,255,0.5)", fontSize:12, margin:"3px 0" }}>• Sin conexión a internet</p>
          </div>
          <button onClick={()=>window.location.reload()} style={{ marginTop:20, background:"#a855f7", border:"none", borderRadius:12, padding:"12px 28px", color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer" }}>
            Reintentar
          </button>
        </>
      )}
    </div>
  );

  return (
    <div id="app-root" style={{ maxWidth:430, margin:"0 auto", minHeight:"100dvh", fontFamily:"'Nunito','Segoe UI',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');

        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

        /* Lock the browser viewport — app handles all scrolling */
        html, body {
          height: 100%;
          overflow: hidden;
        }

        /* Single root scroll container */
        #app-root {
          height: 100dvh;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }

        /* Thin purple scrollbar — vertical */
        #app-root::-webkit-scrollbar { width: 3px; }
        #app-root::-webkit-scrollbar-track { background: transparent; }
        #app-root::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.4); border-radius: 3px; }

        /* Horizontal scroll rows — no visible scrollbar */
        .scroll-x {
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .scroll-x::-webkit-scrollbar { display: none; }

        /* Inner vertical scroll areas (lists inside panels) */
        .scroll-inner {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .scroll-inner::-webkit-scrollbar { display: none; }

        input, textarea { outline: none; }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2); }

        @keyframes toastIn {
          from { opacity:0; transform:translateX(-50%) translateY(-12px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
      `}</style>

      {screen==="login"    && <LoginScreen members={members} groupProfile={groupProfile} onLogin={handleLogin} onGoRegister={()=>{ setEditingMember(null); setScreen("register"); }} onChangePin={handleChangePin} />}
      {screen==="register" && <RegisterScreen onSave={handleSaveMember} onBack={()=>setScreen(currentUser?(currentUser.isAdmin?"admin":"members"):"login")} editing={editingMember} />}

      {screen==="admin"    && currentUser?.isAdmin && <AdminPanel {...common} pendingApprovals={pendingApprovals} onDismissApproval={handleDismissApproval} onAddPayment={handleAddPayment} onConfirmPayment={handleConfirmPayment} onDeleteMember={handleDeleteMember} onLogout={handleLogout} onAddWish={handleAddWish} />}
      {screen==="adminGroupProfile" && currentUser?.isAdmin && <GroupProfileScreen groupProfile={groupProfile} onSave={handleSaveGroupProfile} onBack={()=>setScreen("admin")} isAdmin={true} />}
      {screen==="adminEditProfile" && currentUser?.isAdmin && <EditProfileScreen member={currentUser} onSave={m=>{ handleSaveMember(m); setScreen("admin"); }} onBack={()=>setScreen("admin")} />}
      {screen==="adminWishes" && currentUser?.isAdmin && <WishWallScreen {...common} onAddWish={handleAddWish} onReact={handleReact} />}

      {screen==="home"       && currentUser && !currentUser.isAdmin && <><HomeScreen       {...common} onLogout={handleLogout} /><BottomNav screen={screen} onNavigate={navigate} /></>}
      {screen==="payment"    && currentUser && !currentUser.isAdmin && <><PaymentScreen    {...common} onAddPayment={handleAddPayment} /><BottomNav screen={screen} onNavigate={navigate} /></>}
      {screen==="myPayments" && currentUser && !currentUser.isAdmin && <><MyPaymentsScreen {...common} /><BottomNav screen={screen} onNavigate={navigate} /></>}
      {screen==="members"    && currentUser && !currentUser.isAdmin && <><MembersScreen    {...common} onEdit={m=>{ setEditingMember(m); setScreen("register"); }} onAddNew={()=>{ setEditingMember(null); setScreen("register"); }} /><BottomNav screen={screen} onNavigate={navigate} /></>}
      {screen==="summary"    && currentUser && !currentUser.isAdmin && <><SummaryScreen    {...common} /><BottomNav screen={screen} onNavigate={navigate} /></>}
      {screen==="groupProfile" && currentUser && !currentUser.isAdmin && <><GroupProfileScreen groupProfile={groupProfile} onSave={handleSaveGroupProfile} onBack={goHome} isAdmin={false} /><BottomNav screen={screen} onNavigate={navigate} /></>}
      {screen==="wishes"     && currentUser && !currentUser.isAdmin && <><WishWallScreen   {...common} onAddWish={handleAddWish} onReact={handleReact} /><BottomNav screen={screen} onNavigate={navigate} /></>}
    </div>
  );
}
