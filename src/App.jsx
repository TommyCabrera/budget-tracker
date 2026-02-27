import { useState, useRef, useEffect } from "react";

const DEFAULT_CATEGORIES = ["Housing","Grocery","Utilities","Entertainment/Shopping","Healthcare","Insurance/Savings/Retirement","Debt","Vacation","Investment","Subscription","Other"];
const CAT_COLORS = {
  Housing:"bg-blue-100 text-blue-800", Grocery:"bg-green-100 text-green-800",
  Utilities:"bg-yellow-100 text-yellow-800", "Entertainment/Shopping":"bg-purple-100 text-purple-800",
  Healthcare:"bg-red-100 text-red-800", "Insurance/Savings/Retirement":"bg-teal-100 text-teal-800",
  Debt:"bg-gray-800 text-white", Vacation:"bg-orange-100 text-orange-800",
  Investment:"bg-indigo-100 text-indigo-800", Subscription:"bg-pink-100 text-pink-800",
  Other:"bg-gray-100 text-gray-800"
};
const DEFAULT_INCOME_SOURCES = ["Salary","Business","Other"];
const DEFAULT_PAYMENT_METHODS = ["Salary","Credit Card"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const PIN_KEY = "bt_pin_hash";
const BIO_KEY = "bt_bio_enabled";
const DATA_KEY = "bt_all_months";
const MONTH_KEY = "bt_current_month";
const SETTINGS_KEY = "bt_settings";
const API_KEY_KEY = "bt_api_key";
const GEMINI_MODEL_KEY = "bt_gemini_model";

const today = () => new Date().toISOString().slice(0,10);
const fmt = n => `₱${Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const uid = () => Date.now() + Math.random();
const hashPin = async pin => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
};

const MASTER_BILLS = [];
const makeBills = masters => masters.map(b=>({...b,id:uid(),paid:false,amountPaid:0,datePaid:today(),paidFromActual:b.paidFrom}));

const defaultMonthKey = `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`;
const INIT_MONTHS = { [defaultMonthKey]:{income:[],bills:[],cards:[],expenses:[],masterBills:[]} };
const INIT_SETTINGS = {categories:DEFAULT_CATEGORIES,incomeSources:DEFAULT_INCOME_SOURCES,paymentMethods:DEFAULT_PAYMENT_METHODS};

// ── localStorage helpers ──
const loadJSON = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const saveJSON = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

// ── Shared UI ──
function Badge({cat}){
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${CAT_COLORS[cat]||"bg-gray-100 text-gray-700"}`}>{cat}</span>;
}

function Modal({title,onClose,children}){
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 style={{fontFamily:"'Instrument Serif',serif"}} className="text-xl font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({label,children}){
  return <div><label className="text-xs text-gray-500 mb-1 block font-medium">{label}</label>{children}</div>;
}
function Select({value,onChange,children,disabled}){
  return(
    <div className="relative">
      <select className={selectCls} value={value} onChange={onChange} disabled={disabled}>{children}</select>
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>
  );
}
const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white";
const selectCls = "w-full border border-gray-200 rounded-xl pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white appearance-none";

const IconEdit = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconTrash = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

// ── Swipeable Card ──
function SwipeableCard({onEdit,onDelete,children}){
  const [offsetX,setOffsetX]=useState(0);
  const [swiped,setSwiped]=useState(false);
  const startX=useRef(null);
  const isDragging=useRef(false);
  const cardRef=useRef();
  const ACTION_WIDTH=onEdit?128:72;
  const THRESHOLD=60;

  const getX=e=>e.touches?e.touches[0].clientX:e.clientX;
  const onStart=e=>{startX.current=getX(e);isDragging.current=true;};
  const onMove=e=>{
    if(!isDragging.current||startX.current===null)return;
    const diff=startX.current-getX(e);
    if(diff>0)setOffsetX(Math.min(diff,ACTION_WIDTH));
    else if(swiped)setOffsetX(Math.max(ACTION_WIDTH+diff,0));
  };
  const onEnd=()=>{
    if(!isDragging.current)return;
    isDragging.current=false;
    if(offsetX>THRESHOLD){setOffsetX(ACTION_WIDTH);setSwiped(true);}
    else{setOffsetX(0);setSwiped(false);}
    startX.current=null;
  };

  useEffect(()=>{
    const h=e=>{if(swiped&&cardRef.current&&!cardRef.current.contains(e.target)){setOffsetX(0);setSwiped(false);}};
    document.addEventListener("touchstart",h);
    document.addEventListener("mousedown",h);
    return()=>{document.removeEventListener("touchstart",h);document.removeEventListener("mousedown",h);};
  },[swiped]);

  return(
    <div ref={cardRef} className="relative overflow-hidden rounded-2xl">
      <div className="absolute right-0 top-0 bottom-0 flex" style={{width:ACTION_WIDTH}}>
        {onEdit&&(
          <button onClick={()=>{onEdit();setOffsetX(0);setSwiped(false);}} className="flex-1 bg-orange-400 flex flex-col items-center justify-center gap-1 text-white">
            <IconEdit/><span className="text-xs font-medium">Edit</span>
          </button>
        )}
        <button onClick={()=>{onDelete();setOffsetX(0);setSwiped(false);}} className="flex-1 bg-red-500 flex flex-col items-center justify-center gap-1 text-white">
          <IconTrash/><span className="text-xs font-medium">Delete</span>
        </button>
      </div>
      <div
        style={{transform:`translateX(-${offsetX}px)`,transition:isDragging.current?"none":"transform 0.2s ease"}}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        className="relative z-10 cursor-grab active:cursor-grabbing select-none">
        {children}
      </div>
    </div>
  );
}

// ── Ellipsis Menu ──
function EllipsisMenu({items}){
  const [open,setOpen]=useState(false);
  const ref=useRef();
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);
  return(
    <div className="relative" ref={ref}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} className="w-7 h-7 flex flex-col items-center justify-center gap-0.5 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0">
        {[0,1,2].map(i=><span key={i} className="w-1 h-1 rounded-full bg-gray-400"/>)}
      </button>
      {open&&(
        <div className="absolute right-0 top-8 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 min-w-36 overflow-hidden" onClick={e=>e.stopPropagation()}>
          {items.map((item,i)=>(
            <button key={i} onClick={()=>{item.action();setOpen(false);}} className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors hover:bg-gray-50 flex items-center gap-2 ${item.danger?"text-red-500":"text-gray-700"}`}>
              <span className="text-base">{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PIN UI ──
function PinDots({count,total=4}){
  return(
    <div className="flex gap-3 justify-center my-6">
      {Array.from({length:total}).map((_,i)=>(
        <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i<count?"bg-orange-500 border-orange-500":"border-gray-300"}`}/>
      ))}
    </div>
  );
}

function PinPad({onDigit,onDelete}){
  const keys=["1","2","3","4","5","6","7","8","9","","0","⌫"];
  return(
    <div className="grid grid-cols-3 gap-3 w-64 mx-auto">
      {keys.map((k,i)=>(
        <button key={i} disabled={k===""} onClick={()=>k==="⌫"?onDelete():onDigit(k)}
          className={`h-16 rounded-2xl text-xl font-semibold transition-all ${k===""?"":"bg-white border border-gray-100 text-gray-800 hover:bg-orange-50 hover:border-orange-200 active:scale-95 shadow-sm"}`}>
          {k}
        </button>
      ))}
    </div>
  );
}

function LockScreen({onUnlock}){
  const [mode,setMode]=useState("loading");
  const [pin,setPin]=useState("");
  const [confirmPin,setConfirmPin]=useState("");
  const [tempPin,setTempPin]=useState("");
  const [error,setError]=useState("");
  const [bioAvailable,setBioAvailable]=useState(false);
  const [bioEnabled,setBioEnabled]=useState(false);
  const [shake,setShake]=useState(false);

  useEffect(()=>{
    const stored=localStorage.getItem(PIN_KEY);
    const bio=localStorage.getItem(BIO_KEY)==="true";
    setBioEnabled(bio);
    if(window.PublicKeyCredential){
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(ok=>{
        setBioAvailable(ok);
        if(ok&&bio&&stored)triggerBio();
      });
    }
    setMode(stored?"enter":"setup");
  },[]);

  const triggerBio=async()=>{
    try{
      const challenge=new Uint8Array(32);crypto.getRandomValues(challenge);
      await navigator.credentials.get({publicKey:{challenge,timeout:60000,userVerification:"required",rpId:window.location.hostname||"localhost"}});
      onUnlock();
    }catch(e){}
  };

  useEffect(()=>{if(mode==="enter"&&pin.length===4)verifyPin();},[pin,mode]);
  useEffect(()=>{if(mode==="setup"&&pin.length===4)setTimeout(()=>{setTempPin(pin);setPin("");setMode("confirm");},200);},[pin,mode]);
  useEffect(()=>{if(mode==="confirm"&&confirmPin.length===4)finishSetup();},[confirmPin,mode]);

  const verifyPin=async()=>{
    const stored=localStorage.getItem(PIN_KEY);
    const hashed=await hashPin(pin);
    if(hashed===stored){onUnlock();}
    else{setShake(true);setTimeout(()=>{setShake(false);setPin("");setError("Incorrect PIN. Try again.");},600);}
  };
  const finishSetup=async()=>{
    if(confirmPin!==tempPin){setShake(true);setTimeout(()=>{setShake(false);setConfirmPin("");setError("PINs don't match. Try again.");},600);return;}
    localStorage.setItem(PIN_KEY,await hashPin(confirmPin));
    setError("");onUnlock();
  };
  const doDigit=d=>{
    if(mode==="confirm"){if(confirmPin.length<4)setConfirmPin(p=>p+d);}
    else{if(pin.length<4)setPin(p=>p+d);}
  };
  const doDelete=()=>{if(mode==="confirm")setConfirmPin(p=>p.slice(0,-1));else setPin(p=>p.slice(0,-1));};

  if(mode==="loading")return(<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"/></div>);

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif"}} className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      <div className="w-full max-w-xs flex flex-col items-center">
        <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg mb-6"><span className="text-3xl">💰</span></div>
        <h1 style={{fontFamily:"'Instrument Serif',serif"}} className="text-2xl text-gray-900 mb-1">
          {mode==="setup"?"Create PIN":mode==="confirm"?"Confirm PIN":"Welcome back"}
        </h1>
        <p className="text-sm text-gray-400 text-center mb-2">
          {mode==="setup"?"Set a 4-digit PIN to secure your budget tracker":mode==="confirm"?"Re-enter your PIN to confirm":"Enter your PIN to continue"}
        </p>
        {error&&<p className="text-red-500 text-sm mt-1 mb-1">{error}</p>}
        <div className={shake?"animate-bounce":""}><PinDots count={mode==="confirm"?confirmPin.length:pin.length}/></div>
        <PinPad onDigit={doDigit} onDelete={doDelete}/>
        {mode==="enter"&&bioAvailable&&bioEnabled&&(
          <button onClick={triggerBio} className="mt-6 flex items-center gap-2 text-orange-500 text-sm font-medium hover:text-orange-600 transition-colors">
            <span className="text-2xl">👆</span> Use Biometrics
          </button>
        )}
      </div>
    </div>
  );
}

function BiometricSetup({onDone}){
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const register=async()=>{
    setLoading(true);setError("");
    try{
      const challenge=new Uint8Array(32);crypto.getRandomValues(challenge);
      const userId=new Uint8Array(16);crypto.getRandomValues(userId);
      await navigator.credentials.create({publicKey:{
        challenge,rp:{name:"Budget Tracker",id:window.location.hostname||"localhost"},
        user:{id:userId,name:"user",displayName:"Budget User"},
        pubKeyCredParams:[{alg:-7,type:"public-key"},{alg:-257,type:"public-key"}],
        authenticatorSelection:{userVerification:"required",authenticatorAttachment:"platform"},timeout:60000,
      }});
      localStorage.setItem(BIO_KEY,"true");onDone(true);
    }catch(e){setError("Biometric setup failed or was cancelled.");}
    setLoading(false);
  };
  return(
    <Modal title="Enable Biometrics" onClose={()=>onDone(false)}>
      <div className="space-y-4 text-center">
        <div className="text-5xl py-2">👆</div>
        <p className="text-sm text-gray-600">Use your fingerprint or face to unlock the app instead of typing your PIN every time.</p>
        {error&&<p className="text-red-500 text-sm">{error}</p>}
        <button onClick={register} disabled={loading} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium disabled:opacity-50 hover:bg-orange-600 transition-colors">{loading?"Setting up...":"Set Up Biometrics"}</button>
        <button onClick={()=>onDone(false)} className="w-full text-gray-400 text-sm">Not now</button>
      </div>
    </Modal>
  );
}

function ChangePinModal({onClose}){
  const [step,setStep]=useState("current");
  const [cur,setCur]=useState("");
  const [newPin,setNewPin]=useState("");
  const [conf,setConf]=useState("");
  const [error,setError]=useState("");
  const [shake,setShake]=useState(false);

  useEffect(()=>{if(step==="current"&&cur.length===4)verifyCurrent();},[cur,step]);
  useEffect(()=>{if(step==="new"&&newPin.length===4)setTimeout(()=>setStep("confirm"),200);},[newPin,step]);
  useEffect(()=>{if(step==="confirm"&&conf.length===4)finalize();},[conf,step]);

  const verifyCurrent=async()=>{
    const hashed=await hashPin(cur);
    if(hashed===localStorage.getItem(PIN_KEY)){setCur("");setStep("new");setError("");}
    else{setShake(true);setTimeout(()=>{setShake(false);setCur("");setError("Incorrect PIN.");},600);}
  };
  const finalize=async()=>{
    if(conf!==newPin){setShake(true);setTimeout(()=>{setShake(false);setConf("");setError("PINs don't match.");},600);return;}
    localStorage.setItem(PIN_KEY,await hashPin(conf));onClose();
  };
  const active=step==="current"?cur:step==="new"?newPin:conf;
  const setActive=step==="current"?setCur:step==="new"?setNewPin:setConf;
  return(
    <Modal title="Change PIN" onClose={onClose}>
      <div className="flex flex-col items-center">
        <p className="text-sm text-gray-500 mb-1">{step==="current"?"Enter current PIN":step==="new"?"Enter new PIN":"Confirm new PIN"}</p>
        {error&&<p className="text-red-500 text-xs mt-1">{error}</p>}
        <div className={shake?"animate-bounce":""}><PinDots count={active.length}/></div>
        <PinPad onDigit={d=>{if(active.length<4)setActive(p=>p+d);}} onDelete={()=>setActive(p=>p.slice(0,-1))}/>
      </div>
    </Modal>
  );
}

function ConfirmDelete({label,onConfirm,onClose}){
  return(
    <Modal title="Delete?" onClose={onClose}>
      <p className="text-sm text-gray-600 mb-5">Remove <strong>{label}</strong>? This cannot be undone.</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
        <button onClick={()=>{onConfirm();onClose();}} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-600">Delete</button>
      </div>
    </Modal>
  );
}

function PaymentModal({title,defaultAmount,defaultSource,onSave,onClose,incomeSources}){
  const [f,setF]=useState({amount:defaultAmount||"",date:today(),source:defaultSource||incomeSources[0]||""});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Amount Paid"><input type="number" className={inputCls} value={f.amount} onChange={e=>set("amount",e.target.value)} placeholder="0"/></Field>
        <Field label="Date Paid"><input type="date" className={inputCls} value={f.date} onChange={e=>set("date",e.target.value)}/></Field>
        <Field label="Paid From"><Select value={f.source} onChange={e=>set("source",e.target.value)}>{incomeSources.map(s=><option key={s}>{s}</option>)}</Select></Field>
        <button onClick={()=>{onSave({amount:parseFloat(f.amount)||0,date:f.date,source:f.source});onClose();}} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium hover:bg-orange-600 transition-colors">Confirm Payment</button>
      </div>
    </Modal>
  );
}

function ManageListModal({title,items,onSave,onClose}){
  const [list,setList]=useState([...items]);
  const [newItem,setNewItem]=useState("");
  const add=()=>{const v=newItem.trim();if(!v||list.includes(v))return;setList(p=>[...p,v]);setNewItem("");};
  const remove=item=>setList(p=>p.filter(x=>x!==item));
  const moveUp=i=>{if(i===0)return;const a=[...list];[a[i-1],a[i]]=[a[i],a[i-1]];setList(a);};
  const moveDown=i=>{if(i===list.length-1)return;const a=[...list];[a[i],a[i+1]]=[a[i+1],a[i]];setList(a);};
  return(
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input className={inputCls} value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Add new item..."/>
          <button onClick={add} className="bg-orange-500 text-white px-4 rounded-xl text-sm font-medium hover:bg-orange-600 flex-shrink-0">Add</button>
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {list.map((item,i)=>(
            <div key={item} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={()=>moveUp(i)} disabled={i===0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none text-xs">▲</button>
                <button onClick={()=>moveDown(i)} disabled={i===list.length-1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none text-xs">▼</button>
              </div>
              <span className="flex-1 text-sm text-gray-700">{item}</span>
              <button onClick={()=>remove(item)} className="text-gray-300 hover:text-red-400 text-lg leading-none">&times;</button>
            </div>
          ))}
        </div>
        <button onClick={()=>{onSave(list);onClose();}} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium hover:bg-orange-600">Save Changes</button>
      </div>
    </Modal>
  );
}

function BillForm({initial,onSave,onClose,categories,incomeSources}){
  const blank={payment:"",description:"",category:categories[0]||"Other",monthly:"",payrollDate:"",paidFrom:incomeSources[0]||""};
  const [f,setF]=useState(initial||blank);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{if(!f.payment)return;onSave({...f,monthly:parseFloat(f.monthly)||0,id:f.id||uid()});onClose();};
  return(
    <div className="space-y-3">
      <Field label="Bill Name"><input className={inputCls} value={f.payment} onChange={e=>set("payment",e.target.value)} placeholder="e.g. Netflix"/></Field>
      <Field label="Description"><input className={inputCls} value={f.description} onChange={e=>set("description",e.target.value)} placeholder="Optional"/></Field>
      <Field label="Category"><Select value={f.category} onChange={e=>set("category",e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly Amount"><input type="number" className={inputCls} value={f.monthly} onChange={e=>set("monthly",e.target.value)} placeholder="0"/></Field>
        <Field label="Due / Payroll Date"><input className={inputCls} value={f.payrollDate} onChange={e=>set("payrollDate",e.target.value)} placeholder="e.g. 25"/></Field>
      </div>
      <Field label="Default Pay From"><Select value={f.paidFrom} onChange={e=>set("paidFrom",e.target.value)}>{incomeSources.map(s=><option key={s}>{s}</option>)}</Select></Field>
      <button onClick={submit} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium hover:bg-orange-600">{initial?"Update Bill":"Add Bill"}</button>
    </div>
  );
}

function IncomeForm({initial,onSave,onClose,incomeSources}){
  const blank={source:incomeSources[0]||"",description:"",received:today(),amount:""};
  const [f,setF]=useState(initial||blank);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{if(!f.amount)return;onSave({...f,amount:parseFloat(f.amount)||0,id:f.id||uid()});onClose();};
  return(
    <div className="space-y-3">
      <Field label="Income Source"><Select value={f.source} onChange={e=>set("source",e.target.value)}>{incomeSources.map(s=><option key={s}>{s}</option>)}</Select></Field>
      <Field label="Description"><input className={inputCls} value={f.description} onChange={e=>set("description",e.target.value)} placeholder="e.g. via Wise"/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date Received"><input type="date" className={inputCls} value={f.received} onChange={e=>set("received",e.target.value)}/></Field>
        <Field label="Amount"><input type="number" className={inputCls} value={f.amount} onChange={e=>set("amount",e.target.value)} placeholder="0"/></Field>
      </div>
      <button onClick={submit} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium hover:bg-orange-600">{initial?"Update Income":"Add Income"}</button>
    </div>
  );
}

function ExpenseForm({initial,onClose,onSave,categories,paymentMethods}){
  const blank={expense:"",category:categories[0]||"Other",notes:"",date:today(),amount:"",paidFrom:paymentMethods[0]||""};
  const [f,setF]=useState(initial||blank);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{if(!f.expense||!f.amount)return;onSave({...f,amount:parseFloat(f.amount),id:f.id||uid()});onClose();};
  return(
    <Modal title={initial?"Edit Expense":"Add Expense"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Expense Name"><input className={inputCls} value={f.expense} onChange={e=>set("expense",e.target.value)} placeholder="e.g. SM Grocery"/></Field>
        <Field label="Category"><Select value={f.category} onChange={e=>set("category",e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</Select></Field>
        <Field label="Paid From"><Select value={f.paidFrom||""} onChange={e=>set("paidFrom",e.target.value)}>{paymentMethods.map(s=><option key={s}>{s}</option>)}</Select></Field>
        <Field label="Notes"><input className={inputCls} value={f.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Optional"/></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" className={inputCls} value={f.date||""} onChange={e=>set("date",e.target.value)}/></Field>
          <Field label="Amount"><input type="number" className={inputCls} value={f.amount} onChange={e=>set("amount",e.target.value)} placeholder="0"/></Field>
        </div>
        <button onClick={submit} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium hover:bg-orange-600">{initial?"Update Expense":"Add Expense"}</button>
      </div>
    </Modal>
  );
}

function CCForm({initial,onClose,onSave}){
  const blank={name:"",due:"",amountDue:"",minimumDue:"",remaining:""};
  const [f,setF]=useState(initial?{...initial,amountDue:initial.amountDue||"",minimumDue:initial.minimumDue||"",remaining:initial.remaining||""}:blank);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isEdit=!!initial;
  const submit=()=>{
    if(!f.name)return;
    const base=isEdit?initial:{id:uid(),paid:false,amountPaid:0,datePaid:today(),paidFrom:""};
    onSave({...base,...f,amountDue:parseFloat(f.amountDue)||0,minimumDue:parseFloat(f.minimumDue)||0,remaining:parseFloat(f.remaining)||0});
    onClose();
  };
  return(
    <Modal title={isEdit?"Edit Credit Card":"Add Credit Card"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Card Name"><input className={inputCls} value={f.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. BDO Mastercard"/></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount Due"><input type="number" className={inputCls} value={f.amountDue} onChange={e=>set("amountDue",e.target.value)} placeholder="0"/></Field>
          <Field label="Minimum Due"><input type="number" className={inputCls} value={f.minimumDue} onChange={e=>set("minimumDue",e.target.value)} placeholder="0"/></Field>
          <Field label="Due Date"><input className={inputCls} value={f.due||""} onChange={e=>set("due",e.target.value)} placeholder="e.g. 28-Feb"/></Field>
          {isEdit&&<Field label="Remaining Balance"><input type="number" className={inputCls} value={f.remaining} onChange={e=>set("remaining",e.target.value)} placeholder="0"/></Field>}
        </div>
        <button onClick={submit} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium hover:bg-orange-600">{isEdit?"Update Card":"Add Card"}</button>
      </div>
    </Modal>
  );
}

function AIModal({type,onClose,onResult}){
  const [loading,setLoading]=useState(false);
  const [preview,setPreview]=useState(null);
  const [imgData,setImgData]=useState(null);
  const [result,setResult]=useState(null);
  const [error,setError]=useState("");
  const [rawText,setRawText]=useState("");
  const fileRef=useRef();

  const handleFile=e=>{
    const f=e.target.files[0];if(!f)return;
    setResult(null);setError("");setRawText("");
    const r=new FileReader();
    r.onload=ev=>{setPreview(ev.target.result);setImgData(ev.target.result.split(",")[1]);};
    r.readAsDataURL(f);
  };
  const analyze=async()=>{
    const apiKey=localStorage.getItem(API_KEY_KEY);
    if(!apiKey){setError("No API key set. Add your Gemini API key in Settings → AI Features.");return;}
    if(!imgData){setError("Please upload an image first.");return;}
    setLoading(true);setError("");setResult(null);
    try{
      const isReceipt=type==="receipt";
      const mimeType=fileRef.current?.files?.[0]?.type||"image/jpeg";
      const prompt=isReceipt
        ?`Look at this receipt image carefully. Extract the store/merchant name and the total amount paid. Return ONLY a valid JSON array with one object, no markdown:\n[{"expense":"store name","category":"Grocery","notes":"","date":"","amount":0}]\nCategories: Housing,Grocery,Utilities,Entertainment/Shopping,Healthcare,Insurance/Savings/Retirement,Debt,Vacation,Investment,Subscription,Other`
        :`Look at this credit card statement image carefully. Find and extract:\n1. The credit card or bank name\n2. The outstanding/current balance\n3. The minimum amount due\n4. The total amount due or statement balance\n5. The payment due date\nReturn ONLY a valid JSON object, no markdown:\n{"name":"Card Name","remaining":0,"due":"due date","amountDue":0,"minimumDue":0}\nNumbers only, no currency symbols or commas.`;
      const model=localStorage.getItem(GEMINI_MODEL_KEY)||"gemini-1.5-flash";
      const resp=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contents:[{parts:[{inline_data:{mime_type:mimeType,data:imgData}},{text:prompt}]}]})});
      const data=await resp.json();
      if(data.error){setError(`API error: ${data.error.message}`);setLoading(false);return;}
      const text=data.candidates?.[0]?.content?.parts?.[0]?.text||"";
      setRawText(text);
      const cleaned=text.replace(/```json|```/g,"").trim();
      const start=cleaned.search(/[\[{]/);
      const end=Math.max(cleaned.lastIndexOf("}"),cleaned.lastIndexOf("]"));
      if(start===-1||end===-1)throw new Error("No JSON found in response");
      setResult(JSON.parse(cleaned.slice(start,end+1)));
    }catch(e){setError(`Error: ${e.message}`);}
    setLoading(false);
  };
  return(
    <Modal title={type==="receipt"?"Scan Receipt":"Upload CC Statement"} onClose={loading?()=>{}:onClose}>
      <div className="relative space-y-4">
        {loading&&(
          <div className="absolute inset-0 z-20 bg-white/90 rounded-xl flex flex-col items-center justify-center gap-4">
            <div className="relative w-16 h-16">
              <div className="w-16 h-16 border-4 border-orange-100 rounded-full"/>
              <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin absolute inset-0"/>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-800">Analyzing image...</p>
              <p className="text-xs text-gray-400 mt-0.5">This may take a few seconds</p>
            </div>
          </div>
        )}
        <div onClick={()=>!loading&&fileRef.current.click()} className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${loading?"border-gray-100 cursor-not-allowed":"border-gray-200 cursor-pointer hover:border-orange-400"}`}>
          {preview?<img src={preview} className="max-h-48 mx-auto rounded-lg object-contain"/>:<div className="text-gray-400"><div className="text-4xl mb-2">{type==="receipt"?"🧾":"💳"}</div><p className="text-sm">Tap to upload {type==="receipt"?"receipt photo":"statement image"}</p></div>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={loading}/>
        </div>
        {error&&<div className="space-y-2"><p className="text-red-500 text-sm">{error}</p>{rawText&&<div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600"><p className="font-semibold mb-1">Raw response:</p><pre className="whitespace-pre-wrap overflow-auto max-h-36">{rawText}</pre></div>}</div>}
        {result&&<div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700"><p className="font-semibold mb-1">Extracted:</p><pre className="whitespace-pre-wrap overflow-auto">{JSON.stringify(result,null,2)}</pre></div>}
        <div className="flex gap-3">
          <button onClick={analyze} disabled={loading||!imgData} className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl font-medium disabled:opacity-50 hover:bg-orange-600">Analyze</button>
          {result&&<button onClick={()=>{onResult(result);onClose();}} disabled={loading} className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl font-medium disabled:opacity-50">Add to Tracker</button>}
        </div>
      </div>
    </Modal>
  );
}

function APIKeyModal({onClose}){
  const [key,setKey]=useState(localStorage.getItem(API_KEY_KEY)||"");
  const [models,setModels]=useState([]);
  const [selectedModel,setSelectedModel]=useState(localStorage.getItem(GEMINI_MODEL_KEY)||"");
  const [detecting,setDetecting]=useState(false);
  const [detectError,setDetectError]=useState("");
  const hasKey=!!localStorage.getItem(API_KEY_KEY);

  const detectModels=async()=>{
    if(!key.trim()){setDetectError("Enter your API key first.");return;}
    setDetecting(true);setDetectError("");setModels([]);
    try{
      const resp=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`);
      const data=await resp.json();
      if(data.error){setDetectError(`Error: ${data.error.message}`);setDetecting(false);return;}
      const vision=data.models?.filter(m=>m.supportedGenerationMethods?.includes("generateContent")&&(m.name.includes("flash")||m.name.includes("vision")||m.name.includes("pro")))
        .map(m=>m.name.replace("models/",""))||[];
      setModels(vision);
      if(vision.length>0)setSelectedModel(vision[0]);
      else setDetectError("No compatible models found for your key.");
    }catch(e){setDetectError(`Request failed: ${e.message}`);}
    setDetecting(false);
  };

  const save=()=>{
    localStorage.setItem(API_KEY_KEY,key.trim());
    if(selectedModel)localStorage.setItem(GEMINI_MODEL_KEY,selectedModel);
    onClose();
  };

  return(
    <Modal title="Gemini API Key" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Free to use. Get your key at <span className="text-orange-500 font-medium">aistudio.google.com</span>. Stored locally on this device only.</p>
        <Field label="API Key">
          <input className={inputCls} value={key} onChange={e=>{setKey(e.target.value);setModels([]);setSelectedModel("");}} placeholder="AIza..." type="password"/>
        </Field>
        <button onClick={detectModels} disabled={detecting||!key.trim()} className="w-full border border-orange-400 text-orange-500 py-2 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-orange-50">
          {detecting?"Detecting...":"🔍 Detect Available Models"}
        </button>
        {detectError&&<p className="text-red-500 text-xs">{detectError}</p>}
        {models.length>0&&(
          <Field label="Select Model">
            <Select value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}>
              {models.map(m=><option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
        )}
        {selectedModel&&<p className="text-xs text-green-600 font-medium">✓ Will use: {selectedModel}</p>}
        <button onClick={save} disabled={!key.trim()} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium disabled:opacity-40 hover:bg-orange-600">Save Key</button>
        {hasKey&&<button onClick={()=>{localStorage.removeItem(API_KEY_KEY);localStorage.removeItem(GEMINI_MODEL_KEY);setKey("");setModels([]);setSelectedModel("");onClose();}} className="w-full text-red-400 text-sm py-1">Remove Key</button>}
      </div>
    </Modal>
  );
}

function NewMonthModal({existingMonths,onClose,onCreate}){
  const [sel,setSel]=useState("");
  const [year,setYear]=useState(String(new Date().getFullYear()));
  const monthKey=sel&&year?`${sel} ${year}`:"";
  const exists=existingMonths.includes(monthKey);
  return(
    <Modal title="Start New Month" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Your recurring bills will be carried over, expenses and payments reset to zero.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Month"><Select value={sel} onChange={e=>setSel(e.target.value)}><option value="">Select...</option>{MONTHS.map(m=><option key={m}>{m}</option>)}</Select></Field>
          <Field label="Year"><input className={inputCls} value={year} onChange={e=>setYear(e.target.value)} placeholder="2026"/></Field>
        </div>
        {exists&&<p className="text-red-500 text-xs">Month already exists.</p>}
        <button disabled={!monthKey||exists} onClick={()=>{onCreate(monthKey);onClose();}} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium disabled:opacity-40 hover:bg-orange-600">Create Month</button>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════
export default function App(){
  const [unlocked,setUnlocked]=useState(false);

  // ── Load persisted state on mount ──
  const [settings,setSettings]=useState(()=>loadJSON(SETTINGS_KEY,INIT_SETTINGS));
  const [allMonths,setAllMonths]=useState(()=>loadJSON(DATA_KEY,INIT_MONTHS));
  const [currentMonth,setCurrentMonth]=useState(()=>{
    const saved=localStorage.getItem(MONTH_KEY);
    const months=loadJSON(DATA_KEY,INIT_MONTHS);
    return (saved&&months[saved])?saved:Object.keys(months)[0]||defaultMonthKey;
  });

  // ── Persist on every change ──
  useEffect(()=>{ saveJSON(DATA_KEY,allMonths); },[allMonths]);
  useEffect(()=>{ saveJSON(SETTINGS_KEY,settings); },[settings]);
  useEffect(()=>{ localStorage.setItem(MONTH_KEY,currentMonth); },[currentMonth]);

  const [tab,setTab]=useState("overview");
  const [modal,setModal]=useState(null);
  const [bioAvailable,setBioAvailable]=useState(false);
  const [bioEnabled,setBioEnabled]=useState(localStorage.getItem(BIO_KEY)==="true");

  useEffect(()=>{
    if(window.PublicKeyCredential)
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setBioAvailable);
  },[]);

  if(!unlocked)return <LockScreen onUnlock={()=>setUnlocked(true)}/>;

  const M=allMonths[currentMonth]||{income:[],bills:[],cards:[],expenses:[],masterBills:[]};
  const {income,bills,cards,expenses}=M;
  const openModal=m=>setModal(m);
  const closeModal=()=>setModal(null);
  const updateMonth=(key,val)=>setAllMonths(p=>({...p,[currentMonth]:{...p[currentMonth],[key]:val}}));

  const saveIncome=item=>updateMonth("income",income.find(x=>x.id===item.id)?income.map(x=>x.id===item.id?item:x):[...income,item]);
  const deleteIncome=id=>updateMonth("income",income.filter(x=>x.id!==id));

  const saveBill=item=>{
    const next=bills.find(x=>x.id===item.id)?bills.map(x=>x.id===item.id?item:x):[...bills,item];
    const mb=M.masterBills;
    const master={payment:item.payment,description:item.description,category:item.category,monthly:item.monthly,payrollDate:item.payrollDate,paidFrom:item.paidFrom};
    const newMasters=mb.find(x=>x.id===item.id)?mb.map(x=>x.id===item.id?{...x,...master}:x):[...mb,{...master,id:item.id}];
    setAllMonths(p=>({...p,[currentMonth]:{...p[currentMonth],bills:next,masterBills:newMasters}}));
  };
  const deleteBill=id=>setAllMonths(p=>({...p,[currentMonth]:{...p[currentMonth],bills:bills.filter(x=>x.id!==id),masterBills:M.masterBills.filter(x=>x.id!==id)}}));
  const markBillPaid=(bill,payInfo)=>updateMonth("bills",bills.map(x=>x.id===bill.id?{...x,paid:true,amountPaid:payInfo.amount,datePaid:payInfo.date,paidFromActual:payInfo.source}:x));
  const unmarkBillPaid=id=>updateMonth("bills",bills.map(x=>x.id===id?{...x,paid:false,amountPaid:0,datePaid:today(),paidFromActual:x.paidFrom}:x));

  const addCC=c=>updateMonth("cards",[...cards,c]);
  const saveCC=item=>updateMonth("cards",cards.map(x=>x.id===item.id?item:x));
  const deleteCC=id=>updateMonth("cards",cards.filter(x=>x.id!==id));
  const markCCPaid=(card,payInfo)=>updateMonth("cards",cards.map(x=>x.id===card.id?{...x,paid:true,amountPaid:payInfo.amount,datePaid:payInfo.date,paidFrom:payInfo.source,remaining:Math.max(0,x.remaining-payInfo.amount)}:x));
  const unmarkCCPaid=id=>updateMonth("cards",cards.map(x=>x.id===id?{...x,paid:false,amountPaid:0,datePaid:today()}:x));

  const addExpense=e=>updateMonth("expenses",[...expenses,e]);
  const saveExpense=item=>updateMonth("expenses",expenses.map(x=>x.id===item.id?item:x));
  const deleteExp=id=>updateMonth("expenses",expenses.filter(x=>x.id!==id));

  const monthKeys=Object.keys(allMonths);
  const deleteMonth=key=>{
    const rem=monthKeys.filter(k=>k!==key);
    const next={...allMonths};delete next[key];
    setAllMonths(next);
    if(currentMonth===key)setCurrentMonth(rem[rem.length-1]);
  };
  const createMonth=key=>{
    const masters=M.masterBills||MASTER_BILLS;
    setAllMonths(p=>({...p,[key]:{income:[],bills:makeBills(masters),cards:[],expenses:[],masterBills:masters}}));
    setCurrentMonth(key);setTab("overview");
  };

  const totalIncome=income.reduce((a,x)=>a+x.amount,0);
  const totalMonthly=bills.reduce((a,x)=>a+x.monthly,0);
  const paidMonthly=bills.filter(x=>x.paid).reduce((a,x)=>a+x.amountPaid,0);
  const totalCC=cards.reduce((a,x)=>a+x.amountPaid,0);
  const totalExp=expenses.reduce((a,x)=>a+x.amount,0);
  const remaining=totalIncome-(paidMonthly+totalCC+totalExp);
  const ccDebt=cards.reduce((a,x)=>a+Math.max(0,x.remaining),0);

  const incomeBySource=settings.incomeSources.reduce((acc,s)=>{
    const total=income.filter(x=>x.source===s).reduce((a,x)=>a+x.amount,0);
    const spent=bills.filter(x=>x.paid&&x.paidFromActual===s).reduce((a,x)=>a+x.amountPaid,0);
    if(total>0)acc[s]={total,spent,left:total-spent};
    return acc;
  },{});

  const TABS=[{id:"overview",label:"Overview",icon:"📊"},{id:"bills",label:"Bills",icon:"📋"},{id:"cards",label:"Cards",icon:"💳"},{id:"expenses",label:"Expenses",icon:"🧾"},{id:"settings",label:"Settings",icon:"⚙️"}];

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif"}} className="min-h-screen bg-gray-50 max-w-md mx-auto relative">
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-3 sticky top-0 z-40">
        <div className="flex items-center justify-between mb-2">
          <h1 style={{fontFamily:"'Instrument Serif',serif"}} className="text-2xl text-gray-900">Budget Tracker</h1>
          <div className={`border rounded-2xl px-3 py-1.5 text-right ${remaining>=0?"bg-green-50 border-green-200":"bg-red-50 border-red-200"}`}>
            <p className={`text-xs ${remaining>=0?"text-green-600":"text-red-500"}`}>Remaining</p>
            <p className={`text-base font-semibold ${remaining>=0?"text-green-700":"text-red-600"}`}>{fmt(remaining)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {monthKeys.map(mk=>(
            <div key={mk} className={`flex-shrink-0 flex items-center rounded-full transition-all ${currentMonth===mk?"bg-orange-500":"bg-gray-100"}`}>
              <button onClick={()=>setCurrentMonth(mk)} className={`text-xs px-3 py-1.5 font-medium ${currentMonth===mk?"text-white":"text-gray-500"}`}>{mk}</button>
              {monthKeys.length>1&&<button onClick={()=>openModal({type:"delMonth",data:mk})} className={`pr-2.5 text-xs leading-none ${currentMonth===mk?"text-orange-200 hover:text-white":"text-gray-300 hover:text-red-400"}`}>&times;</button>}
            </div>
          ))}
          <button onClick={()=>openModal("newMonth")} className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium bg-gray-100 text-gray-400 hover:bg-orange-50 hover:text-orange-500">+ New Month</button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-28 pt-4 space-y-4">

        {tab==="overview"&&(
          <>
            <div className="bg-white border border-gray-100 rounded-2xl">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <p style={{fontFamily:"'Instrument Serif',serif"}} className="text-lg text-gray-800">Income</p>
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-semibold text-gray-700">{fmt(totalIncome)}</span>
                  <button onClick={()=>openModal("addIncome")} className="bg-orange-500 text-white text-xs px-2.5 py-1 rounded-full font-medium">+ Add</button>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {income.map(inc=>(
                  <div key={inc.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{inc.source}</p>
                      <p className="text-xs text-gray-400">{inc.description}{inc.received&&` · ${inc.received}`}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-green-700">{fmt(inc.amount)}</p>
                      <EllipsisMenu items={[
                        {label:"Edit",icon:"✏️",action:()=>openModal({type:"editIncome",data:inc})},
                        {label:"Delete",icon:"🗑️",action:()=>openModal({type:"delIncome",data:inc}),danger:true}
                      ]}/>
                    </div>
                  </div>
                ))}
                {income.length===0&&<p className="text-sm text-gray-400 text-center py-4">No income added yet</p>}
              </div>
            </div>

            {Object.keys(incomeBySource).length>0&&(
              <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
                <p style={{fontFamily:"'Instrument Serif',serif"}} className="text-lg text-gray-800">Budget per Source</p>
                {Object.entries(incomeBySource).map(([s,v])=>(
                  <div key={s}>
                    <div className="flex justify-between text-xs mb-1"><span className="font-medium text-gray-700">{s}</span><span className="text-gray-500">{fmt(v.left)} left</span></div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${v.spent/v.total>0.9?"bg-red-400":v.spent/v.total>0.7?"bg-orange-400":"bg-green-400"}`} style={{width:`${Math.min(100,(v.spent/v.total)*100)}%`}}/>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Paid: {fmt(v.spent)}</span><span>{Math.round((v.spent/v.total)*100)}% used</span></div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {[
                {label:"Monthly Bills",val:totalMonthly,sub:`${bills.filter(x=>x.paid).length}/${bills.length} paid`,color:"bg-blue-50 border-blue-100"},
                {label:"CC Paid",val:totalCC,sub:`${cards.filter(x=>x.paid).length} cards`,color:"bg-purple-50 border-purple-100"},
                {label:"Other Expenses",val:totalExp,sub:`${expenses.length} transactions`,color:"bg-green-50 border-green-100"},
                {label:"CC Debt",val:ccDebt,sub:"remaining balance",color:"bg-red-50 border-red-100"},
              ].map(c=>(
                <div key={c.label} className={`${c.color} border rounded-2xl p-4`}>
                  <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                  <p className="text-lg font-semibold text-gray-800">{fmt(c.val)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Bills Payment Progress</p>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all" style={{width:`${totalMonthly>0?(paidMonthly/totalMonthly)*100:0}%`}}/>
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-400"><span>Paid: {fmt(paidMonthly)}</span><span>Total: {fmt(totalMonthly)}</span></div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <p style={{fontFamily:"'Instrument Serif',serif"}} className="text-lg text-gray-800 mb-3">Recent Transactions</p>
              <div className="space-y-2">
                {expenses.slice(-5).reverse().map(e=>(
                  <div key={e.id} className="flex items-center justify-between py-1">
                    <div><p className="text-sm font-medium text-gray-800">{e.expense}</p><Badge cat={e.category}/></div>
                    <p className="text-sm font-semibold text-gray-900">{fmt(e.amount)}</p>
                  </div>
                ))}
                {expenses.length===0&&<p className="text-sm text-gray-400 text-center py-4">No expenses yet</p>}
              </div>
            </div>
          </>
        )}

        {tab==="bills"&&(
          <>
            <div className="flex items-center justify-between">
              <p style={{fontFamily:"'Instrument Serif',serif"}} className="text-xl text-gray-800">Monthly Bills</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{fmt(totalMonthly)}</span>
                <button onClick={()=>openModal("addBill")} className="bg-orange-500 text-white text-xs px-3 py-1.5 rounded-full font-medium">+ Add</button>
              </div>
            </div>
            <p className="text-xs text-gray-400 -mt-2">← Swipe left to edit or delete</p>
            <div className="space-y-2">
              {bills.map(b=>(
                <SwipeableCard key={b.id} onEdit={()=>openModal({type:"editBill",data:b})} onDelete={()=>openModal({type:"delBill",data:b})}>
                  <div className={`bg-white border rounded-2xl p-4 transition-all ${b.paid?"border-green-200 bg-green-50/40":"border-gray-100"}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${b.paid?"text-gray-400 line-through":"text-gray-800"}`}>{b.payment}</p>
                          <Badge cat={b.category}/>
                        </div>
                        {b.description&&<p className="text-xs text-gray-400 mt-0.5">{b.description}</p>}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {b.payrollDate&&<p className="text-xs text-gray-400">Due: {b.payrollDate}</p>}
                          {b.paid?(
                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">{fmt(b.amountPaid)}</span>
                              {b.datePaid&&<span className="text-xs text-gray-400">{b.datePaid}</span>}
                              {b.paidFromActual&&<span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{b.paidFromActual}</span>}
                            </div>
                          ):(
                            b.paidFrom&&<span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{b.paidFrom}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-800">{fmt(b.monthly)}</p>
                        <button onClick={()=>b.paid?unmarkBillPaid(b.id):openModal({type:"payBill",data:b})}
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${b.paid?"bg-green-500 border-green-500":"border-gray-300 hover:border-orange-400"}`}>
                          {b.paid&&<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </button>
                      </div>
                    </div>
                  </div>
                </SwipeableCard>
              ))}
            </div>
          </>
        )}

        {tab==="cards"&&(
          <>
            <div className="flex items-center justify-between">
              <p style={{fontFamily:"'Instrument Serif',serif"}} className="text-xl text-gray-800">Credit Cards</p>
              <button onClick={()=>openModal("addCC")} className="bg-orange-500 text-white text-xs px-3 py-1.5 rounded-full font-medium">+ Add</button>
            </div>
            <p className="text-xs text-gray-400 -mt-2">← Swipe left to edit or delete</p>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
              <p className="text-xs text-orange-600">Total CC Debt</p>
              <p style={{fontFamily:"'Instrument Serif',serif"}} className="text-2xl text-orange-700">{fmt(ccDebt)}</p>
              <p className="text-xs text-orange-500 mt-0.5">Paid this month: {fmt(totalCC)}</p>
            </div>
            <div className="space-y-3">
              {cards.map(c=>(
                <SwipeableCard key={c.id} onEdit={()=>openModal({type:"editCC",data:c})} onDelete={()=>openModal({type:"delCC",data:c})}>
                  <div className={`bg-white border rounded-2xl p-4 ${c.paid?"border-green-200":"border-gray-100"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center text-white text-xs font-bold">{c.name.slice(0,2).toUpperCase()}</div>
                        <p className="font-semibold text-gray-800">{c.name}</p>
                      </div>
                      <button onClick={()=>c.paid?unmarkCCPaid(c.id):openModal({type:"payCC",data:c})}
                        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${c.paid?"bg-green-500 border-green-500":"border-gray-300 hover:border-orange-400"}`}>
                        {c.paid&&<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 rounded-xl p-2.5"><p className="text-gray-400">Remaining</p><p className="font-semibold text-gray-700 mt-0.5">{fmt(c.remaining)}</p></div>
                      <div className="bg-gray-50 rounded-xl p-2.5"><p className="text-gray-400">Amount Due</p><p className="font-semibold text-gray-700 mt-0.5">{fmt(c.amountDue)}</p></div>
                      <div className="bg-gray-50 rounded-xl p-2.5"><p className="text-gray-400">Due Date</p><p className="font-semibold text-gray-700 mt-0.5">{c.due||"—"}</p></div>
                      <div className={`rounded-xl p-2.5 ${c.paid?"bg-green-50":"bg-gray-50"}`}>
                        <p className="text-gray-400">Paid</p>
                        <p className={`font-semibold mt-0.5 ${c.paid?"text-green-700":"text-gray-400"}`}>{c.paid?fmt(c.amountPaid):"—"}</p>
                      </div>
                    </div>
                    {c.paid&&(
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {c.datePaid&&<span className="text-xs text-gray-400">Paid on {c.datePaid}</span>}
                        {c.paidFrom&&<span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{c.paidFrom}</span>}
                      </div>
                    )}
                    {c.minimumDue>0&&<p className="text-xs text-gray-400 mt-1.5">Min due: {fmt(c.minimumDue)}</p>}
                  </div>
                </SwipeableCard>
              ))}
              {cards.length===0&&<div className="text-center py-8 text-gray-400"><p className="text-4xl mb-2">💳</p><p className="text-sm">No cards added yet</p></div>}
            </div>
            <button onClick={()=>openModal("ccScan")} className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-4 text-gray-400 text-sm hover:border-orange-400 hover:text-orange-500 transition-colors">
              📄 Upload Statement of Account
            </button>
          </>
        )}

        {tab==="expenses"&&(
          <>
            <div className="flex items-center justify-between">
              <p style={{fontFamily:"'Instrument Serif',serif"}} className="text-xl text-gray-800">Expenses</p>
              <p className="text-sm text-gray-500">{fmt(totalExp)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>openModal("scan")} className="bg-orange-500 text-white rounded-2xl p-3 text-center hover:bg-orange-600 transition-colors">
                <div className="text-2xl mb-1">📷</div><p className="text-sm font-medium">Scan Receipt</p>
              </button>
              <button onClick={()=>openModal("addExp")} className="bg-gray-800 text-white rounded-2xl p-3 text-center hover:bg-gray-700 transition-colors">
                <div className="text-2xl mb-1">✏️</div><p className="text-sm font-medium">Manual Entry</p>
              </button>
            </div>
            <p className="text-xs text-gray-400 -mt-2">← Swipe left to edit or delete</p>
            <div className="space-y-2">
              {expenses.map(e=>(
                <SwipeableCard key={e.id} onEdit={()=>openModal({type:"editExp",data:e})} onDelete={()=>openModal({type:"delExp",data:e})}>
                  <div className="bg-white border border-gray-100 rounded-2xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{e.expense}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge cat={e.category}/>
                          {e.paidFrom&&<span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{e.paidFrom}</span>}
                          {e.date&&<span className="text-xs text-gray-400">{e.date}</span>}
                          {e.notes&&<span className="text-xs text-gray-400">· {e.notes}</span>}
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 ml-2">{fmt(e.amount)}</p>
                    </div>
                  </div>
                </SwipeableCard>
              ))}
              {expenses.length===0&&<div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">🧾</p><p>No expenses recorded</p></div>}
            </div>
          </>
        )}

        {tab==="settings"&&(
          <>
            <p style={{fontFamily:"'Instrument Serif',serif"}} className="text-xl text-gray-800">Settings</p>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
              <div className="px-4 py-3"><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Security</p></div>
              <button onClick={()=>openModal("changePin")} className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50">
                <div className="flex items-center gap-3"><span className="text-xl">🔑</span><div className="text-left"><p className="text-sm font-medium text-gray-800">Change PIN</p><p className="text-xs text-gray-400">Update your 4-digit PIN</p></div></div>
                <span className="text-gray-300">›</span>
              </button>
              {bioAvailable&&(
                <div className="flex items-center justify-between px-4 py-4">
                  <div className="flex items-center gap-3"><span className="text-xl">👆</span><div><p className="text-sm font-medium text-gray-800">Biometric Unlock</p><p className="text-xs text-gray-400">Fingerprint or face unlock</p></div></div>
                  <button onClick={()=>{if(bioEnabled){localStorage.removeItem(BIO_KEY);setBioEnabled(false);}else openModal("bioSetup");}} className={`w-12 h-6 rounded-full transition-all relative ${bioEnabled?"bg-orange-500":"bg-gray-200"}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${bioEnabled?"left-6":"left-0.5"}`}/>
                  </button>
                </div>
              )}
              <button onClick={()=>setUnlocked(false)} className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50">
                <div className="flex items-center gap-3"><span className="text-xl">🔒</span><div className="text-left"><p className="text-sm font-medium text-gray-800">Lock App</p><p className="text-xs text-gray-400">Return to PIN screen</p></div></div>
                <span className="text-gray-300">›</span>
              </button>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
              <div className="px-4 py-3"><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Customize Lists</p></div>
              {[
                {label:"Categories",icon:"🏷️",desc:"Used in Bills & Expenses",key:"categories"},
                {label:"Income Sources",icon:"💰",desc:"Used in income & bill payment",key:"incomeSources"},
                {label:"Payment Methods",icon:"💳",desc:"Used in Expenses paid from",key:"paymentMethods"},
              ].map(item=>(
                <button key={item.key} onClick={()=>openModal({type:"manageList",data:item})} className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50">
                  <div className="flex items-center gap-3"><span className="text-xl">{item.icon}</span><div className="text-left"><p className="text-sm font-medium text-gray-800">{item.label}</p><p className="text-xs text-gray-400">{item.desc}</p></div></div>
                  <span className="text-gray-300">›</span>
                </button>
              ))}
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
              <div className="px-4 py-3"><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">AI Features</p></div>
              <button onClick={()=>openModal("apiKey")} className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50">
                <div className="flex items-center gap-3"><span className="text-xl">🤖</span><div className="text-left"><p className="text-sm font-medium text-gray-800">Gemini API Key</p><p className="text-xs text-gray-400">{localStorage.getItem(API_KEY_KEY)?"Key saved ✓":"Required for scanning features (free)"}</p></div></div>
                <span className="text-gray-300">›</span>
              </button>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
              <div className="px-4 py-3"><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Data</p></div>
              <button onClick={()=>openModal("resetPin")} className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50">
                <div className="flex items-center gap-3"><span className="text-xl">⚠️</span><div className="text-left"><p className="text-sm font-medium text-red-500">Reset PIN</p><p className="text-xs text-gray-400">Clear PIN — you'll set a new one</p></div></div>
                <span className="text-gray-300">›</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-100 px-2 pb-6 pt-2 z-40">
        <div className="flex justify-around">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all ${tab===t.id?"bg-orange-50 text-orange-600":"text-gray-400"}`}>
              <span className="text-xl">{t.icon}</span>
              <span className={`text-xs font-medium ${tab===t.id?"text-orange-600":""}`}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      {modal==="newMonth"&&<NewMonthModal existingMonths={monthKeys} onClose={closeModal} onCreate={createMonth}/>}
      {modal?.type==="delMonth"&&<ConfirmDelete label={modal.data} onConfirm={()=>deleteMonth(modal.data)} onClose={closeModal}/>}

      {modal==="addIncome"&&<Modal title="Add Income" onClose={closeModal}><IncomeForm onSave={saveIncome} onClose={closeModal} incomeSources={settings.incomeSources}/></Modal>}
      {modal?.type==="editIncome"&&<Modal title="Edit Income" onClose={closeModal}><IncomeForm initial={modal.data} onSave={saveIncome} onClose={closeModal} incomeSources={settings.incomeSources}/></Modal>}
      {modal?.type==="delIncome"&&<ConfirmDelete label={`${modal.data.source} — ${fmt(modal.data.amount)}`} onConfirm={()=>deleteIncome(modal.data.id)} onClose={closeModal}/>}

      {modal==="addBill"&&<Modal title="Add Bill" onClose={closeModal}><BillForm onSave={saveBill} onClose={closeModal} categories={settings.categories} incomeSources={settings.incomeSources}/></Modal>}
      {modal?.type==="editBill"&&<Modal title="Edit Bill" onClose={closeModal}><BillForm initial={modal.data} onSave={saveBill} onClose={closeModal} categories={settings.categories} incomeSources={settings.incomeSources}/></Modal>}
      {modal?.type==="delBill"&&<ConfirmDelete label={modal.data.payment} onConfirm={()=>deleteBill(modal.data.id)} onClose={closeModal}/>}
      {modal?.type==="payBill"&&<PaymentModal title={`Pay — ${modal.data.payment}`} defaultAmount={modal.data.monthly} defaultSource={modal.data.paidFrom} onSave={p=>markBillPaid(modal.data,p)} onClose={closeModal} incomeSources={settings.incomeSources}/>}

      {modal==="addCC"&&<CCForm onClose={closeModal} onSave={addCC}/>}
      {modal?.type==="editCC"&&<CCForm initial={modal.data} onClose={closeModal} onSave={saveCC}/>}
      {modal?.type==="delCC"&&<ConfirmDelete label={modal.data.name} onConfirm={()=>deleteCC(modal.data.id)} onClose={closeModal}/>}
      {modal?.type==="payCC"&&<PaymentModal title={`Pay — ${modal.data.name}`} defaultAmount={modal.data.amountDue} defaultSource={settings.incomeSources[0]} onSave={p=>markCCPaid(modal.data,p)} onClose={closeModal} incomeSources={settings.incomeSources}/>}

      {modal==="addExp"&&<ExpenseForm onClose={closeModal} onSave={addExpense} categories={settings.categories} paymentMethods={settings.paymentMethods}/>}
      {modal?.type==="editExp"&&<ExpenseForm initial={modal.data} onClose={closeModal} onSave={saveExpense} categories={settings.categories} paymentMethods={settings.paymentMethods}/>}
      {modal?.type==="delExp"&&<ConfirmDelete label={modal.data.expense} onConfirm={()=>deleteExp(modal.data.id)} onClose={closeModal}/>}

      {modal==="scan"&&<AIModal type="receipt" onClose={closeModal} onResult={r=>{const items=Array.isArray(r)?r:[r];items.forEach(i=>addExpense({...i,id:uid()}));}}/>}
      {modal==="ccScan"&&<AIModal type="statement" onClose={closeModal} onResult={r=>addCC({...r,id:uid(),paid:false,amountPaid:0,datePaid:today(),paidFrom:""})}/>}

      {modal==="apiKey"&&<APIKeyModal onClose={closeModal}/>}
      {modal==="changePin"&&<ChangePinModal onClose={closeModal}/>}
      {modal==="bioSetup"&&<BiometricSetup onDone={ok=>{setBioEnabled(ok);closeModal();}}/>}
      {modal==="resetPin"&&<ConfirmDelete label="your PIN (you will set a new one on next open)" onConfirm={()=>{localStorage.removeItem(PIN_KEY);localStorage.removeItem(BIO_KEY);setUnlocked(false);}} onClose={closeModal}/>}
      {modal?.type==="manageList"&&<ManageListModal title={`Manage ${modal.data.label}`} items={settings[modal.data.key]} onSave={list=>setSettings(p=>({...p,[modal.data.key]:list}))} onClose={closeModal}/>}
    </div>
  );
}
