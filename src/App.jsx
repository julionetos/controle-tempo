import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import {
  collection, doc, setDoc, getDoc, getDocs,
  addDoc, deleteDoc, query, where, orderBy,
  onSnapshot, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { auth, db } from './firebase.js'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

// ── Constantes ────────────────────────────────────────────────────────────────
const CATS = [
  { id:'reuniao',         name:'Reunião',         color:'#378ADD' },
  { id:'desenvolvimento', name:'Desenvolvimento',  color:'#1D9E75' },
  { id:'emails',          name:'E-mails',          color:'#D85A30' },
  { id:'planejamento',    name:'Planejamento',      color:'#BA7517' },
  { id:'revisao',         name:'Revisão',           color:'#D4537E' },
  { id:'suporte',         name:'Suporte',           color:'#534AB7' },
  { id:'outros',          name:'Outros',            color:'#888780' },
]
const MESES    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_ABR = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const DIAS_EXT = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDur = s => {
  if (!s || s <= 0) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m.toString().padStart(2,'0')}m` : `${m}m`
}
const fmtClk = s =>
  [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
    .map(v => v.toString().padStart(2,'0')).join(':')

const getC    = id => CATS.find(c => c.id === id) || CATS[CATS.length-1]
const sameDay = (a, b) =>
  a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
const sameMon = (a, b) =>
  a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth()

// ── Exportar Excel ────────────────────────────────────────────────────────────
function exportExcel(entries, userMap, uid = null) {
  const src = uid ? entries.filter(e => e.userId === uid) : entries
  if (!src.length) { alert('Nenhum registro para exportar.'); return }
  const wb = XLSX.utils.book_new()
  const raw = src.map(e => {
    const dt = new Date(e.timestamp)
    return {
      Colaborador:   userMap[e.userId] || e.userId,
      Data:          dt.toLocaleDateString('pt-BR'),
      Hora:          dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
      Dia_Semana:    DIAS_EXT[dt.getDay()],
      Mes:           MESES[dt.getMonth()],
      Mes_Num:       dt.getMonth() + 1,
      Ano:           dt.getFullYear(),
      Categoria:     getC(e.categoryId).name,
      Duracao_min:   Math.round(e.duration / 60),
      Duracao_horas: Math.round(e.duration / 3600 * 100) / 100,
      Descricao:     e.note || '',
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(raw), 'Registros')

  const catRes = CATS.map(c => {
    const tot = src.filter(e => e.categoryId===c.id).reduce((s,e) => s+e.duration, 0)
    return tot > 0 ? { Categoria:c.name, Total_min:Math.round(tot/60), Total_horas:Math.round(tot/3600*100)/100, Qtd:src.filter(e=>e.categoryId===c.id).length } : null
  }).filter(Boolean)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRes), 'Por_Categoria')

  const dayMap = {}
  src.forEach(e => {
    const dt = new Date(e.timestamp), k = dt.toLocaleDateString('pt-BR')
    if (!dayMap[k]) dayMap[k] = { Data:k, Dia_Semana:DIAS_EXT[dt.getDay()], Mes:MESES[dt.getMonth()], Ano:dt.getFullYear(), Total_min:0, Qtd:0, _ts:dt.getTime() }
    dayMap[k].Total_min += Math.round(e.duration/60); dayMap[k].Qtd++
  })
  const dayRows = Object.values(dayMap).sort((a,b)=>a._ts-b._ts).map(({_ts,...r})=>({...r, Total_horas:Math.round(r.Total_min/60*100)/100}))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dayRows), 'Por_Dia')

  const d     = new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')
  const label = uid ? (userMap[uid]||uid).replace(/\s/g,'-') : 'equipe'
  XLSX.writeFile(wb, `controle-tempo-${label}-${d}.xlsx`)
}

// ── Estilos base ──────────────────────────────────────────────────────────────
const S = {
  page:    { maxWidth:720, margin:'0 auto', padding:'1.25rem 1rem', fontFamily:'inherit' },
  card:    { background:'#fff', border:'1px solid #e8eaed', borderRadius:12, padding:'1.25rem', marginBottom:'1.25rem' },
  metBox:  { background:'#f7f8fa', border:'1px solid #e8eaed', borderRadius:10, padding:'0.85rem 1rem' },
  btn:     (bg,fg='#fff') => ({ padding:'9px 18px', fontSize:14, fontWeight:500, background:bg, color:fg, border:'none', borderRadius:8, cursor:'pointer' }),
  btnSm:   (bg,fg='#fff') => ({ padding:'5px 11px', fontSize:12, fontWeight:500, background:bg, color:fg, border:'none', borderRadius:6, cursor:'pointer' }),
  btnOut:  { padding:'9px 18px', fontSize:14, background:'transparent', border:'1px solid #dde1e7', borderRadius:8, cursor:'pointer', color:'#555' },
  tabBtn:  a => ({ padding:'8px 22px', fontSize:14, fontWeight:a?600:400, background:'transparent', border:'none', borderBottom:a?'2px solid #1a1a2e':'2px solid transparent', color:a?'#1a1a2e':'#888', cursor:'pointer', marginBottom:-1 }),
  tabSm:   a => ({ padding:'7px 16px', fontSize:13, fontWeight:a?600:400, background:'transparent', border:'none', borderBottom:a?'2px solid #1a1a2e':'2px solid transparent', color:a?'#1a1a2e':'#888', cursor:'pointer', marginBottom:-1 }),
  pill:    (a,color) => ({ padding:'5px 13px', fontSize:13, borderRadius:20, border:a?`2px solid ${color}`:'1px solid #dde1e7', background:a?color+'18':'transparent', color:a?color:'#666', cursor:'pointer', fontWeight:a?500:400 }),
  inp:     { width:'100%', boxSizing:'border-box', marginBottom:'0.85rem' },
}

// ── PieBreakdown ──────────────────────────────────────────────────────────────
function PieBreakdown({ data, total }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'155px 1fr',gap:20,alignItems:'center'}}>
      <div style={{height:155}}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={65} dataKey="value" paddingAngle={2} strokeWidth={0}>
              {data.map((d,i) => <Cell key={i} fill={d.color}/>)}
            </Pie>
            <Tooltip formatter={v => [fmtDur(v),'']} labelFormatter={() => ''}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:9}}>
        {data.map(d => (
          <div key={d.name} style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:9,height:9,borderRadius:2,background:d.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:13,color:'#1a1a2e'}}>{d.name}</span>
                <span style={{fontSize:13,fontWeight:500,color:'#1a1a2e'}}>{fmtDur(d.value)}</span>
              </div>
              <div style={{marginTop:3,height:3,borderRadius:2,background:'#e8eaed',overflow:'hidden'}}>
                <div style={{width:`${Math.round(d.value/total*100)}%`,height:'100%',background:d.color}}/>
              </div>
              <span style={{fontSize:11,color:'#888'}}>{Math.round(d.value/total*100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user,    setUser]    = useState(undefined) // undefined = carregando
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fbUser => {
      if (fbUser) {
        const snap = await getDoc(doc(db, 'users', fbUser.uid))
        setProfile(snap.exists() ? snap.data() : null)
        setUser(fbUser)
      } else {
        setUser(null)
        setProfile(null)
      }
    })
    return unsub
  }, [])

  if (user === undefined) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:14,color:'#888'}}>
      Carregando…
    </div>
  )
  if (!user) return <AuthScreen onAuth={(u,p) => { setUser(u); setProfile(p) }}/>
  if (profile?.role === 'admin') return <AdminPanel user={user} profile={profile} onLogout={() => signOut(auth)}/>
  return <UserPanel user={user} profile={profile} onLogout={() => signOut(auth)}/>
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function AuthScreen({ onAuth }) {
  const [tab,  setTab]  = useState('login')
  const [name, setName] = useState('')
  const [email,setEmail]= useState('')
  const [pw,   setPw]   = useState('')
  const [pw2,  setPw2]  = useState('')
  const [err,  setErr]  = useState('')
  const [load, setLoad] = useState(false)

  const doLogin = async () => {
    setErr(''); setLoad(true)
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pw)
      const snap = await getDoc(doc(db,'users',cred.user.uid))
      onAuth(cred.user, snap.exists() ? snap.data() : null)
    } catch (e) {
      setErr(e.code === 'auth/invalid-credential' ? 'E-mail ou senha incorretos.' : 'Erro ao entrar. Tente novamente.')
    }
    setLoad(false)
  }

  const doRegister = async () => {
    setErr('')
    if (!name.trim()) { setErr('Informe seu nome.'); return }
    if (!email.includes('@')) { setErr('E-mail inválido.'); return }
    if (pw.length < 6) { setErr('Senha mínima: 6 caracteres.'); return }
    if (pw !== pw2) { setErr('As senhas não coincidem.'); return }
    setLoad(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw)
      await updateProfile(cred.user, { displayName: name.trim() })
      const profile = { name:name.trim(), email:email.trim(), role:'user', createdAt: new Date().toISOString() }
      await setDoc(doc(db,'users',cred.user.uid), profile)
      onAuth(cred.user, profile)
    } catch (e) {
      setErr(e.code === 'auth/email-already-in-use' ? 'E-mail já cadastrado.' : 'Erro ao criar conta.')
    }
    setLoad(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{width:'100%',maxWidth:380}}>
        <div style={{textAlign:'center',marginBottom:'2rem'}}>
          <div style={{fontSize:40,marginBottom:10}}>⏱</div>
          <h1 style={{fontSize:22,fontWeight:600,marginBottom:6}}>Controle de Tempo</h1>
          <p style={{fontSize:14,color:'#666'}}>Gerencie o tempo da sua equipe</p>
        </div>
        <div style={{...S.card,padding:'1.75rem'}}>
          <div style={{display:'flex',borderBottom:'1px solid #e8eaed',marginBottom:'1.5rem'}}>
            {[['login','Entrar'],['register','Criar conta']].map(([k,l]) => (
              <button key={k} onClick={() => { setTab(k); setErr('') }} style={{flex:1,padding:'8px',fontSize:14,fontWeight:tab===k?600:400,background:'transparent',border:'none',borderBottom:tab===k?'2px solid #378ADD':'2px solid transparent',color:tab===k?'#378ADD':'#888',cursor:'pointer',marginBottom:-1}}>{l}</button>
            ))}
          </div>
          {tab === 'login' ? (
            <>
              <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>E-mail</label>
              <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()} placeholder="seu@email.com" style={S.inp}/>
              <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Senha</label>
              <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()} placeholder="••••••" style={S.inp}/>
              {err && <p style={{fontSize:12,color:'#E24B4A',marginBottom:8}}>{err}</p>}
              <button onClick={doLogin} disabled={load} style={{...S.btn('#378ADD'),width:'100%',marginTop:4}}>{load?'Entrando…':'Entrar'}</button>
            </>
          ) : (
            <>
              <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Nome completo</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Seu nome" style={S.inp}/>
              <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>E-mail</label>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" style={S.inp}/>
              <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Senha</label>
              <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="mínimo 6 caracteres" style={S.inp}/>
              <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Confirmar senha</label>
              <input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doRegister()} placeholder="••••••" style={S.inp}/>
              {err && <p style={{fontSize:12,color:'#E24B4A',marginBottom:8}}>{err}</p>}
              <button onClick={doRegister} disabled={load} style={{...S.btn('#1D9E75'),width:'100%',marginTop:4}}>{load?'Criando…':'Criar conta'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function UserPanel({ user, profile, onLogout }) {
  const [entries,   setEntries]   = useState([])
  const [activeCat, setActiveCat] = useState(CATS[0].id)
  const [timer,     setTimer]     = useState('stopped')
  const [elapsed,   setElapsed]   = useState(0)
  const [note,      setNote]      = useState('')
  const [iTab,      setITab]      = useState('timer')
  const [mTab,      setMTab]      = useState('hoje')
  const [mCat,      setMCat]      = useState(CATS[0].id)
  const [mH,        setMH]        = useState(0)
  const [mM,        setMM]        = useState(30)
  const [mNote,     setMNote]     = useState('')
  const [saved,     setSaved]     = useState(false)
  const [month,     setMonth]     = useState(new Date())
  const [selDay,    setSelDay]    = useState(null)
  const ref = useRef(null)

  // Carregar entradas do Firestore em tempo real
  useEffect(() => {
    const q = query(collection(db,'entries'), where('userId','==',user.uid), orderBy('timestamp','desc'))
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id:d.id, ...d.data(), timestamp: d.data().timestamp?.toDate?.()?.toISOString() || d.data().timestamp })))
    })
    return unsub
  }, [user.uid])

  useEffect(() => {
    if (timer==='running') ref.current = setInterval(() => setElapsed(p=>p+1), 1000)
    else clearInterval(ref.current)
    return () => clearInterval(ref.current)
  }, [timer])

  const saveEntry = async (entry) => {
    await addDoc(collection(db,'entries'), { ...entry, userId:user.uid, timestamp: new Date() })
    flash()
  }
  const startT = () => { if (timer==='stopped') setElapsed(0); setTimer('running') }
  const pauseT = () => setTimer('paused')
  const stopT  = async () => {
    if (elapsed > 0) await saveEntry({ categoryId:activeCat, duration:elapsed, note })
    setTimer('stopped'); setElapsed(0); setNote('')
  }
  const addM = async () => {
    const s = mH*3600 + mM*60; if (!s) return
    await saveEntry({ categoryId:mCat, duration:s, note:mNote })
    setMNote(''); setMH(0); setMM(30)
  }
  const delEntry = async id => { await deleteDoc(doc(db,'entries',id)) }
  const flash = () => { setSaved(true); setTimeout(()=>setSaved(false), 1500) }

  const today  = new Date()
  const todayE = entries.filter(e => sameDay(new Date(e.timestamp), today))
  const totT   = todayE.reduce((s,e) => s+e.duration, 0)
  const monE   = entries.filter(e => sameMon(new Date(e.timestamp), month))
  const totM   = monE.reduce((s,e) => s+e.duration, 0)

  const mkChart = src => CATS.map(c => ({ name:c.name, color:c.color, value:src.filter(e=>e.categoryId===c.id).reduce((s,e)=>s+e.duration,0) })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value)
  const tChart  = mkChart(todayE)
  const mChart  = mkChart(monE)

  const dIM  = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate()
  const fDow = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
  const bars = Array.from({length:dIM}, (_,i) => {
    const d = new Date(month.getFullYear(), month.getMonth(), i+1)
    const t = entries.filter(e => sameDay(new Date(e.timestamp), d)).reduce((s,e)=>s+e.duration,0)
    return { day:i+1, horas:Math.round(t/3600*10)/10 }
  })
  const dayDet = selDay ? entries.filter(e => sameDay(new Date(e.timestamp), selDay)) : null
  const cc     = getC(activeCat)
  const prevM  = () => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))
  const nextM  = () => { const n=new Date(month.getFullYear(),month.getMonth()+1,1); if(n<=today) setMonth(n) }
  const canN   = new Date(month.getFullYear(), month.getMonth()+1, 1) <= today
  const uMap   = { [user.uid]: profile?.name || user.email }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:600,margin:0}}>Olá, {profile?.name || user.email} 👋</h2>
          <p style={{fontSize:13,color:'#888',margin:'4px 0 0'}}>{today.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {saved && <span style={{fontSize:12,color:'#1D9E75',background:'#e8f5e9',padding:'4px 10px',borderRadius:20}}>Salvo ✓</span>}
          <button onClick={() => exportExcel(entries, uMap, user.uid)} style={S.btn('#1D6E3E')}>↓ Excel</button>
          <button onClick={onLogout} style={S.btnOut}>Sair</button>
        </div>
      </div>

      {/* Main tabs */}
      <div style={{display:'flex',borderBottom:'1px solid #e8eaed',marginBottom:'1.5rem'}}>
        <button onClick={() => setMTab('hoje')}   style={S.tabBtn(mTab==='hoje')}>Hoje</button>
        <button onClick={() => setMTab('mensal')} style={S.tabBtn(mTab==='mensal')}>Mensal</button>
      </div>

      {/* ── HOJE ─────────────────────────────────────────────── */}
      {mTab==='hoje' && (<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:'1.5rem'}}>
          {[{l:'Total hoje',v:fmtDur(totT)},{l:'Registros',v:todayE.length||'—'},{l:'Mais tempo',v:tChart[0]?.name||'—'}].map(({l,v}) => (
            <div key={l} style={S.metBox}><p style={{fontSize:12,color:'#888',margin:'0 0 4px'}}>{l}</p><p style={{fontSize:18,fontWeight:600,margin:0,lineHeight:1.2}}>{v}</p></div>
          ))}
        </div>

        <div style={{display:'flex',borderBottom:'1px solid #e8eaed',marginBottom:'1.25rem'}}>
          <button onClick={() => setITab('timer')}  style={S.tabSm(iTab==='timer')}>Cronômetro</button>
          <button onClick={() => setITab('manual')} style={S.tabSm(iTab==='manual')}>Entrada manual</button>
        </div>

        {iTab==='timer' && (
          <div style={S.card}>
            <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:'1.25rem'}}>
              {CATS.map(c => <button key={c.id} onClick={() => timer==='stopped' && setActiveCat(c.id)} style={S.pill(activeCat===c.id,c.color)}>{c.name}</button>)}
            </div>
            <div style={{textAlign:'center',padding:'1.5rem 0 1.25rem'}}>
              <div style={{fontSize:54,fontWeight:600,letterSpacing:'-2px',fontVariantNumeric:'tabular-nums',color:timer==='running'?cc.color:'#1a1a2e',transition:'color 0.4s'}}>{fmtClk(elapsed)}</div>
              {timer==='running' && <div style={{fontSize:12,color:cc.color,marginTop:6,fontWeight:500}}>● {cc.name}</div>}
              {timer==='paused'  && <div style={{fontSize:12,color:'#888',marginTop:6}}>pausado</div>}
            </div>
            <input placeholder="Descrição (opcional)" value={note} onChange={e=>setNote(e.target.value)} style={{...S.inp,marginBottom:'1rem'}}/>
            <div style={{display:'flex',gap:8}}>
              {timer==='stopped' && <button onClick={startT} style={{...S.btn(cc.color),flex:1}}>Iniciar</button>}
              {timer==='running' && <><button onClick={pauseT} style={{...S.btnOut,flex:1}}>Pausar</button><button onClick={stopT} style={{...S.btn('#E24B4A'),flex:1}}>Salvar e parar</button></>}
              {timer==='paused'  && <><button onClick={startT} style={{...S.btn(cc.color),flex:1}}>Retomar</button><button onClick={stopT} style={{...S.btn('#E24B4A'),flex:1}}>Salvar e parar</button></>}
            </div>
          </div>
        )}

        {iTab==='manual' && (
          <div style={S.card}>
            <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:'1.25rem'}}>
              {CATS.map(c => <button key={c.id} onClick={() => setMCat(c.id)} style={S.pill(mCat===c.id,c.color)}>{c.name}</button>)}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:'1rem'}}>
              <div><label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Horas</label><input type="number" min="0" max="12" value={mH} onChange={e=>setMH(Math.max(0,+e.target.value))} style={{width:'100%'}}/></div>
              <div><label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Minutos</label><input type="number" min="0" max="59" value={mM} onChange={e=>setMM(Math.max(0,Math.min(59,+e.target.value)))} style={{width:'100%'}}/></div>
            </div>
            <input placeholder="Descrição (opcional)" value={mNote} onChange={e=>setMNote(e.target.value)} style={{...S.inp,marginBottom:'1rem'}}/>
            <button onClick={addM} style={{...S.btn(getC(mCat).color),width:'100%'}}>Adicionar atividade</button>
          </div>
        )}

        {tChart.length > 0 && <div style={S.card}><p style={{fontSize:13,fontWeight:600,margin:'0 0 1rem',color:'#555'}}>Distribuição de hoje</p><PieBreakdown data={tChart} total={totT}/></div>}

        {todayE.length > 0 ? (
          <div>
            <p style={{fontSize:13,fontWeight:600,margin:'0 0 0.75rem',color:'#555'}}>Registros de hoje</p>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {[...todayE].reverse().map(e => {
                const c = getC(e.categoryId)
                return (
                  <div key={e.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#fff',border:'1px solid #e8eaed',borderRadius:10,borderLeft:`3px solid ${c.color}`}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:13,fontWeight:500,color:c.color}}>{c.name}</span><span style={{fontSize:11,color:'#888'}}>{new Date(e.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></div>
                      {e.note && <div style={{fontSize:12,color:'#888',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.note}</div>}
                    </div>
                    <span style={{fontSize:14,fontWeight:600,flexShrink:0}}>{fmtDur(e.duration)}</span>
                    <button onClick={() => delEntry(e.id)} style={{background:'transparent',border:'none',color:'#ccc',cursor:'pointer',fontSize:18,lineHeight:1,padding:'0 2px'}}>×</button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : <div style={{textAlign:'center',padding:'2.5rem',color:'#888',fontSize:14}}>Nenhuma atividade hoje ainda.</div>}
      </>)}

      {/* ── MENSAL ───────────────────────────────────────────── */}
      {mTab==='mensal' && (<>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem'}}>
          <button onClick={prevM} style={{...S.btnOut,padding:'5px 15px',fontSize:18}}>‹</button>
          <span style={{fontSize:15,fontWeight:600}}>{MESES[month.getMonth()]} {month.getFullYear()}</span>
          <button onClick={nextM} disabled={!canN} style={{...S.btnOut,padding:'5px 15px',fontSize:18,opacity:canN?1:0.3}}>›</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:'1.25rem'}}>
          {[{l:'Total',v:fmtDur(totM)},{l:'Dias com registro',v:monE.length>0?new Set(monE.map(e=>new Date(e.timestamp).toDateString())).size:'—'},{l:'Categoria líder',v:mChart[0]?.name||'—'}].map(({l,v}) => (
            <div key={l} style={S.metBox}><p style={{fontSize:12,color:'#888',margin:'0 0 4px'}}>{l}</p><p style={{fontSize:16,fontWeight:600,margin:0,lineHeight:1.2}}>{v}</p></div>
          ))}
        </div>
        {monE.length === 0 ? <div style={{textAlign:'center',padding:'3rem',color:'#888',fontSize:14}}>Sem registros em {MESES[month.getMonth()]}.</div> : (<>
          {/* Calendário */}
          <div style={S.card}>
            <p style={{fontSize:13,fontWeight:600,margin:'0 0 1rem',color:'#555'}}>Calendário — clique para ver o dia</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:6}}>{DIAS_ABR.map(d=><div key={d} style={{textAlign:'center',fontSize:11,color:'#aaa',padding:'2px 0'}}>{d}</div>)}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
              {Array.from({length:fDow}).map((_,i)=><div key={'x'+i}/>)}
              {Array.from({length:dIM},(_,i)=>{
                const d  = new Date(month.getFullYear(),month.getMonth(),i+1)
                const de = entries.filter(e => sameDay(new Date(e.timestamp),d))
                const dt = de.reduce((s,e)=>s+e.duration,0)
                const isT = sameDay(d,today), isSel = selDay && sameDay(d,selDay)
                const int = Math.min(1, dt/28800)
                return (
                  <div key={i} onClick={() => de.length>0 && setSelDay(isSel?null:d)} style={{textAlign:'center',padding:'6px 2px',borderRadius:8,cursor:de.length>0?'pointer':'default',background:isSel?'#1D9E75':dt>0?`rgba(29,158,117,${0.12+int*0.7})`:'transparent',border:isT?'1.5px solid #1D9E75':'1px solid transparent'}}>
                    <div style={{fontSize:12,fontWeight:isT?600:400,color:isSel?'#fff':'#1a1a2e'}}>{i+1}</div>
                    {dt>0 && <div style={{fontSize:10,color:isSel?'rgba(255,255,255,0.85)':'#888',marginTop:1}}>{Math.floor(dt/3600)}h{Math.floor((dt%3600)/60)>0?Math.floor((dt%3600)/60)+'m':''}</div>}
                  </div>
                )
              })}
            </div>
          </div>
          {/* Detalhe do dia */}
          {selDay && dayDet && (
            <div style={{...S.card,borderTop:'2px solid #1D9E75'}}>
              <p style={{fontSize:13,fontWeight:600,margin:'0 0 0.75rem',color:'#555'}}>{selDay.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · {fmtDur(dayDet.reduce((s,e)=>s+e.duration,0))}</p>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {[...dayDet].reverse().map(e => { const c=getC(e.categoryId); return (
                  <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'#f7f8fa',borderRadius:8,borderLeft:`3px solid ${c.color}`}}>
                    <div style={{flex:1,minWidth:0}}><div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:12,fontWeight:500,color:c.color}}>{c.name}</span><span style={{fontSize:11,color:'#aaa'}}>{new Date(e.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></div>{e.note&&<div style={{fontSize:11,color:'#888',marginTop:2}}>{e.note}</div>}</div>
                    <span style={{fontSize:13,fontWeight:600}}>{fmtDur(e.duration)}</span>
                    <button onClick={()=>delEntry(e.id)} style={{background:'transparent',border:'none',color:'#ccc',cursor:'pointer',fontSize:16,lineHeight:1,padding:'0 2px'}}>×</button>
                  </div>
                )})}
              </div>
            </div>
          )}
          {/* Barras diárias */}
          <div style={S.card}><p style={{fontSize:13,fontWeight:600,margin:'0 0 1rem',color:'#555'}}>Horas por dia</p><div style={{height:150}}><ResponsiveContainer width="100%" height="100%"><BarChart data={bars} barSize={7} margin={{top:4,right:4,left:-24,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false}/><XAxis dataKey="day" tick={{fontSize:10,fill:'#aaa'}} tickLine={false} axisLine={false} interval={Math.ceil(dIM/10)-1}/><YAxis tick={{fontSize:10,fill:'#aaa'}} tickLine={false} axisLine={false}/><Tooltip formatter={v=>[`${v}h`,'Horas']} labelFormatter={l=>`Dia ${l}`}/><Bar dataKey="horas" fill="#1D9E75" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></div>
          <div style={S.card}><p style={{fontSize:13,fontWeight:600,margin:'0 0 1rem',color:'#555'}}>Distribuição mensal</p><PieBreakdown data={mChart} total={totM}/></div>
        </>)}
      </>)}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function AdminPanel({ user, profile, onLogout }) {
  const [aTab,    setATab]    = useState('dashboard')
  const [users,   setUsers]   = useState([])
  const [allE,    setAllE]    = useState([])
  const [loading, setLoading] = useState(true)
  const [selU,    setSelU]    = useState(null)
  const [month,   setMonth]   = useState(new Date())
  const [delConf, setDelConf] = useState(null)
  const [pwTgt,   setPwTgt]   = useState(null)
  const [newPw,   setNewPw]   = useState('')
  const [msg,     setMsg]     = useState('')
  const today = new Date()

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      const uSnap = await getDocs(collection(db,'users'))
      const us    = uSnap.docs.map(d => ({ uid:d.id, ...d.data() })).filter(u => u.role !== 'admin')
      setUsers(us)
      const eSnap = await getDocs(query(collection(db,'entries'), orderBy('timestamp','desc')))
      setAllE(eSnap.docs.map(d => ({ id:d.id, ...d.data(), timestamp: d.data().timestamp?.toDate?.()?.toISOString() || d.data().timestamp })))
      setLoading(false)
    }
    loadAll()
  }, [])

  const monE   = allE.filter(e => sameMon(new Date(e.timestamp), month))
  const todayE = allE.filter(e => sameDay(new Date(e.timestamp), today))
  const uMap   = Object.fromEntries(users.map(u => [u.uid, u.name || u.email]))

  const uStats = users.map(u => {
    const ue    = monE.filter(e => e.userId===u.uid)
    const total = ue.reduce((s,e) => s+e.duration, 0)
    const days  = new Set(ue.map(e => new Date(e.timestamp).toDateString())).size
    const top   = CATS.map(c => ({ name:c.name, color:c.color, v:ue.filter(e=>e.categoryId===c.id).reduce((s,e)=>s+e.duration,0) })).sort((a,b)=>b.v-a.v)[0]
    return { ...u, total, days, topCat:top?.v>0?top:null }
  }).sort((a,b) => b.total-a.total)

  const teamChart = CATS.map(c => ({ name:c.name, color:c.color, value:monE.filter(e=>e.categoryId===c.id).reduce((s,e)=>s+e.duration,0) })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value)
  const totTeam   = teamChart.reduce((s,d) => s+d.value, 0)
  const uBars     = uStats.filter(u=>u.total>0).map(u => ({ name:(u.name||u.email).split(' ')[0], horas:Math.round(u.total/3600*10)/10 }))

  const selE     = selU ? allE.filter(e=>e.userId===selU.uid) : []
  const selMonE  = selE.filter(e=>sameMon(new Date(e.timestamp),month))
  const selChart = CATS.map(c=>({name:c.name,color:c.color,value:selMonE.filter(e=>e.categoryId===c.id).reduce((s,e)=>s+e.duration,0)})).filter(d=>d.value>0).sort((a,b)=>b.value-a.value)
  const selTot   = selMonE.reduce((s,e)=>s+e.duration,0)

  const prevM = () => setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))
  const nextM = () => { const n=new Date(month.getFullYear(),month.getMonth()+1,1); if(n<=today) setMonth(n) }
  const canN  = new Date(month.getFullYear(),month.getMonth()+1,1)<=today

  const deleteUser = async uid => {
    // Remove entradas
    const eSnap = await getDocs(query(collection(db,'entries'),where('userId','==',uid)))
    await Promise.all(eSnap.docs.map(d => deleteDoc(d.ref)))
    await deleteDoc(doc(db,'users',uid))
    setUsers(u => u.filter(u=>u.uid!==uid))
    setAllE(e => e.filter(e=>e.userId!==uid))
    setDelConf(null); if(selU?.uid===uid) setSelU(null)
  }

  const showMsg = m => { setMsg(m); setTimeout(()=>setMsg(''),2500) }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <span style={{fontSize:11,fontWeight:700,background:'#6C3483',color:'#fff',padding:'2px 9px',borderRadius:10,letterSpacing:'.5px'}}>ADMIN</span>
            <h2 style={{fontSize:19,fontWeight:600,margin:0}}>Painel Administrativo</h2>
          </div>
          <p style={{fontSize:13,color:'#888',margin:0}}>{today.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={() => exportExcel(allE, uMap)} style={S.btn('#1D6E3E')}>↓ Excel equipe</button>
          <button onClick={onLogout} style={S.btnOut}>Sair</button>
        </div>
      </div>

      {msg && <div style={{background:'#e8f5e9',border:'1px solid #a5d6a7',borderRadius:8,padding:'10px 14px',marginBottom:'1rem',fontSize:13,color:'#2E7D32'}}>{msg}</div>}

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid #e8eaed',marginBottom:'1.5rem'}}>
        <button onClick={() => setATab('dashboard')}  style={S.tabBtn(aTab==='dashboard')}>Dashboard</button>
        <button onClick={() => setATab('usuarios')}   style={S.tabBtn(aTab==='usuarios')}>Usuários</button>
        {selU && <button onClick={() => setATab('individual')} style={S.tabBtn(aTab==='individual')}>👤 {(selU.name||selU.email).split(' ')[0]}</button>}
      </div>

      {/* Navegação de mês */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem'}}>
        <button onClick={prevM} style={{...S.btnOut,padding:'5px 14px',fontSize:18}}>‹</button>
        <span style={{fontSize:15,fontWeight:600}}>{MESES[month.getMonth()]} {month.getFullYear()}</span>
        <button onClick={nextM} disabled={!canN} style={{...S.btnOut,padding:'5px 14px',fontSize:18,opacity:canN?1:0.3}}>›</button>
      </div>

      {loading && <div style={{textAlign:'center',padding:'2rem',color:'#888',fontSize:13}}>Carregando dados da equipe…</div>}

      {/* ── DASHBOARD ── */}
      {!loading && aTab==='dashboard' && (<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:'1.25rem'}}>
          {[{l:'Colaboradores',v:users.length},{l:'Total da equipe',v:fmtDur(totTeam)},{l:'Registros no mês',v:monE.length||'—'},{l:'Ativos hoje',v:new Set(todayE.map(e=>e.userId)).size||'—'}].map(({l,v}) => (
            <div key={l} style={S.metBox}><p style={{fontSize:11,color:'#888',margin:'0 0 4px'}}>{l}</p><p style={{fontSize:17,fontWeight:600,margin:0,lineHeight:1.2}}>{v}</p></div>
          ))}
        </div>
        {monE.length===0 ? <div style={{textAlign:'center',padding:'2.5rem',color:'#888',fontSize:13}}>Sem registros no time em {MESES[month.getMonth()]}.</div> : (<>
          {uBars.length>0 && <div style={S.card}>
            <p style={{fontSize:13,fontWeight:600,margin:'0 0 1rem',color:'#555'}}>Horas por colaborador — {MESES[month.getMonth()]}</p>
            <div style={{height:160}}><ResponsiveContainer width="100%" height="100%"><BarChart data={uBars} margin={{top:4,right:4,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false}/><XAxis dataKey="name" tick={{fontSize:11,fill:'#aaa'}} tickLine={false} axisLine={false}/><YAxis tick={{fontSize:10,fill:'#aaa'}} tickLine={false} axisLine={false}/><Tooltip formatter={v=>[`${v}h`,'Horas']}/><Bar dataKey="horas" radius={[4,4,0,0]}>{uBars.map((_,i)=><Cell key={i} fill={['#378ADD','#1D9E75','#D85A30','#BA7517','#D4537E','#534AB7'][i%6]}/>)}</Bar></BarChart></ResponsiveContainer></div>
          </div>}
          {teamChart.length>0 && <div style={S.card}><p style={{fontSize:13,fontWeight:600,margin:'0 0 1rem',color:'#555'}}>Distribuição por categoria</p><PieBreakdown data={teamChart} total={totTeam}/></div>}
          <p style={{fontSize:13,fontWeight:600,margin:'0 0 0.75rem',color:'#555'}}>Ranking — {MESES[month.getMonth()]}</p>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:'1rem'}}>
            {uStats.filter(u=>u.total>0).map(u => (
              <div key={u.uid} onClick={() => { setSelU(u); setATab('individual') }} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',background:'#fff',border:'1px solid #e8eaed',borderRadius:12,cursor:'pointer'}}>
                <div style={{width:38,height:38,borderRadius:19,background:'#6C3483',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:16,fontWeight:600,flexShrink:0}}>{(u.name||u.email).charAt(0).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:500}}>{u.name||u.email}</div>
                  <div style={{fontSize:12,color:'#888'}}>{u.days} dia{u.days!==1?'s':''} com registro{u.topCat?` · mais: ${u.topCat.name}`:''}</div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:16,fontWeight:600}}>{fmtDur(u.total)}</div>
                  <div style={{fontSize:11,color:'#aaa'}}>ver detalhes →</div>
                </div>
              </div>
            ))}
            {uStats.filter(u=>u.total===0).length>0 && <p style={{fontSize:12,color:'#aaa',textAlign:'center',margin:'4px 0'}}>{uStats.filter(u=>u.total===0).map(u=>u.name||u.email).join(', ')} — sem registros este mês</p>}
          </div>
        </>)}
      </>)}

      {/* ── USUÁRIOS ── */}
      {!loading && aTab==='usuarios' && (
        <div style={S.card}>
          <p style={{fontSize:13,fontWeight:600,margin:'0 0 1rem',color:'#555'}}>Colaboradores ({users.length})</p>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {users.length===0 && <p style={{fontSize:13,color:'#888',textAlign:'center',padding:'1rem 0'}}>Nenhum colaborador ainda. Peça para criarem conta no app.</p>}
            {users.map(u => {
              const tot  = allE.filter(e=>e.userId===u.uid).reduce((s,e)=>s+e.duration,0)
              const last = allE.filter(e=>e.userId===u.uid).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))[0]
              return (
                <div key={u.uid} style={{padding:'12px 14px',background:'#f7f8fa',borderRadius:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <div style={{width:36,height:36,borderRadius:18,background:'#1D9E75',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:15,fontWeight:600,flexShrink:0}}>{(u.name||u.email).charAt(0).toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500}}>{u.name||u.email}</div>
                      <div style={{fontSize:12,color:'#888'}}>Total: {fmtDur(tot)} · Último: {last?new Date(last.timestamp).toLocaleDateString('pt-BR'):'—'}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      <button onClick={() => { setSelU(u); setATab('individual') }} style={S.btnSm('#378ADD')}>Ver</button>
                      <button onClick={() => setDelConf(u.uid)} style={{...S.btnSm('transparent','#E24B4A'),border:'1px solid #E24B4A'}}>Remover</button>
                    </div>
                  </div>
                  {delConf===u.uid && (
                    <div style={{marginTop:10,padding:'10px',background:'#fff3f3',border:'1px solid #E24B4A',borderRadius:8,display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:12,color:'#E24B4A',flex:1}}>Remover <strong>{u.name||u.email}</strong> e todos os registros?</span>
                      <button onClick={() => deleteUser(u.uid)} style={S.btnSm('#E24B4A')}>Confirmar</button>
                      <button onClick={() => setDelConf(null)} style={{...S.btnSm('transparent','#555'),border:'1px solid #dde1e7'}}>Cancelar</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── INDIVIDUAL ── */}
      {!loading && aTab==='individual' && selU && (<>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:'1.25rem'}}>
          <div style={{width:44,height:44,borderRadius:22,background:'#6C3483',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:19,fontWeight:600}}>{(selU.name||selU.email).charAt(0).toUpperCase()}</div>
          <div>
            <div style={{fontSize:16,fontWeight:600}}>{selU.name||selU.email}</div>
            <div style={{fontSize:12,color:'#888'}}>{selU.email}</div>
          </div>
          <button onClick={() => exportExcel(allE, uMap, selU.uid)} style={{...S.btn('#1D6E3E'),marginLeft:'auto'}}>↓ Excel individual</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:'1.25rem'}}>
          {[{l:`Total ${MESES[month.getMonth()]}`,v:fmtDur(selTot)},{l:'Registros no mês',v:selMonE.length||'—'},{l:'Categoria líder',v:selChart[0]?.name||'—'}].map(({l,v}) => (
            <div key={l} style={S.metBox}><p style={{fontSize:11,color:'#888',margin:'0 0 4px'}}>{l}</p><p style={{fontSize:16,fontWeight:600,margin:0,lineHeight:1.2}}>{v}</p></div>
          ))}
        </div>
        {selMonE.length===0 ? <div style={{textAlign:'center',padding:'2rem',color:'#888',fontSize:13}}>Sem registros em {MESES[month.getMonth()]}.</div> : (<>
          {selChart.length>0 && <div style={S.card}><p style={{fontSize:13,fontWeight:600,margin:'0 0 1rem',color:'#555'}}>Distribuição — {MESES[month.getMonth()]}</p><PieBreakdown data={selChart} total={selTot}/></div>}
          <div style={S.card}>
            <p style={{fontSize:13,fontWeight:600,margin:'0 0 0.75rem',color:'#555'}}>Registros — {MESES[month.getMonth()]}</p>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:340,overflowY:'auto'}}>
              {[...selMonE].reverse().map(e => { const c=getC(e.categoryId); return (
                <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'#f7f8fa',borderRadius:8,borderLeft:`3px solid ${c.color}`,flexShrink:0}}>
                  <div style={{flex:1,minWidth:0}}><div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:12,fontWeight:500,color:c.color}}>{c.name}</span><span style={{fontSize:11,color:'#aaa'}}>{new Date(e.timestamp).toLocaleDateString('pt-BR')} {new Date(e.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></div>{e.note&&<div style={{fontSize:11,color:'#888',marginTop:2}}>{e.note}</div>}</div>
                  <span style={{fontSize:13,fontWeight:600,flexShrink:0}}>{fmtDur(e.duration)}</span>
                </div>
              )})}
            </div>
          </div>
        </>)}
      </>)}
    </div>
  )
}
