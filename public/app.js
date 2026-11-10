import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const configured=!!firebaseConfig.apiKey&&!firebaseConfig.apiKey.startsWith("COLE");
const app=configured?initializeApp(firebaseConfig):null;
const auth=app?getAuth(app):null;if(auth)auth.languageCode="pt";
const fs=app?getFirestore(app):null;

/* Camada fina sobre o Firestore, no formato que o resto do app usa. */
const wrapRef=r=>({set:d=>setDoc(r,d),update:d=>updateDoc(r,d),delete:()=>deleteDoc(r),
  onSnapshot:(n,e)=>onSnapshot(r,s=>n({exists:s.exists(),data:()=>s.data()}),e)});
const DB={
  doc:path=>wrapRef(doc(fs,path)),
  collection:c=>({
    doc:id=>wrapRef(doc(fs,c,id)),
    add:async d=>{const x=await addDoc(collection(fs,c),d);return {id:x.id}},
    onSnapshot:(n,e)=>onSnapshot(collection(fs,c),s=>n({docs:s.docs.map(d=>({id:d.id,exists:true,data:()=>d.data()}))}),e)})
};
const e164=d=>"+55"+d;
const digitsOf=p=>String(p||"").replace(/^\+55/,"");

const ATTRS=[["def","Defesa","DEF","Marcação, desarme, posicionamento"],["pas","Passe","PAS","Precisão, visão de jogo, lançamento"],["ata","Ataque","ATA","Finalização, drible, chegada na área"],["res","Resistência","RES","Fôlego até o fim da partida"],["vel","Velocidade","VEL","Arrancada, rapidez com e sem bola"]];
const TEAMS=[["Azul","--t1"],["Laranja","--t2"],["Verde","--t3"],["Cinza","--t4"]];
const $=id=>document.getElementById(id);
const S={db:null,uid:null,isAdmin:false,isOwner:false,players:new Map(),phones:new Map(),claims:new Map(),ratings:new Map(),mine:{},dirty:false,saved:null,draw:null,loaded:false,obIdx:null,obDone:false};

function ls(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){const v=attrs[k];if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(k,v===true?"":v)}for(const c of kids)if(c!=null&&c!==false)e.append(c);return e}
function status(msg,err){const b=$("status");b.hidden=!msg;b.textContent=msg||"";b.classList.toggle("err",!!err)}
const fmt=n=>n==null?"–":n.toFixed(1).replace(".",",");
const POS={zag:["Zagueiro","ZAG"],mei:["Meio","MEI"],ata:["Atacante","ATA"]};const POS_KEYS=["zag","mei","ata"];
const posOf=p=>POS[p?.pos]?p.pos:"mei";
const pos2Of=p=>p&&p.id?profile(p.id).sec.key:null;
function posLabel(p){const k2=pos2Of(p);return POS[posOf(p)][1]+(k2?"/"+POS[k2][1]:"")}
function posTag(p,short,primaryOnly){const k=posOf(p),k2=primaryOnly?null:pos2Of(p);
  if(short)return el("span",{class:"pos "+k,title:POS[k][0]+(k2?", também "+POS[k2][0]:""),text:posLabel(p)});
  return el("span",{class:"posw"},el("span",{class:"pos "+k,text:POS[k][0]}),k2?el("span",{class:"pos sec",title:"Posição secundária",text:"2ª "+POS[k2][0]}):null)}
function tip(k,text){const a=ATTRS.find(x=>x[0]===k);return el("span",{class:"tip",tabindex:"0","data-tip":`${a[1]}: ${a[3]}`,"aria-label":`${a[1]}: ${a[3]}`,text:text??a[1]})}
const full=m=>!!m&&ATTRS.every(([k])=>m[k]>=1&&m[k]<=5)&&!!POS[m.sec];

/* ---------- celular ---------- */
function normPhone(s){let d=String(s||"").replace(/\D/g,"");if(d.length>11&&d.startsWith("55"))d=d.slice(2);d=d.replace(/^0+/,"");return d.length===10||d.length===11?d:null}
function fmtPhone(d){return d.length===11?`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`:`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`}

/* ---------- quem é quem ---------- */
function sortedPlayers(){return [...S.players.entries()].map(([id,p])=>({id,...p})).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))}
function myPid(){return S.uid&&S.players.has(S.uid)?S.uid:null}
function uidOf(pid){return S.claims.has(pid)?pid:null}
function others(){return sortedPlayers()}
const youName=p=>p.id===myPid()?p.name+" (você)":p.name;
function pending(){return others().filter(p=>!full(S.mine[p.id]))}
function gated(){return !S.isAdmin&&!!myPid()&&pending().length>0}

function profile(pid){
  const sums={},cnt={},sc={};let raters=0;const prim=posOf(S.players.get(pid));
  const add=s=>{let any=false;if(POS[s.sec]&&s.sec!==prim)sc[s.sec]=(sc[s.sec]||0)+1;for(const [k] of ATTRS){const v=+s[k];if(v>=1&&v<=5){sums[k]=(sums[k]||0)+v;cnt[k]=(cnt[k]||0)+1;any=true}}if(any)raters++};
  for(const [uid,r] of S.ratings){if(uid===S.uid)continue;const s=r.scores[pid];if(s)add(s)}
  if(S.uid&&S.mine[pid])add(S.mine[pid]);
  const avg={};let tot=0,n=0;for(const [k] of ATTRS){avg[k]=cnt[k]?sums[k]/cnt[k]:null;if(avg[k]!=null){tot+=avg[k];n++}}
  const vs=Object.entries(sc).sort((a,b)=>b[1]-a[1]);const total=vs.reduce((q,x)=>q+x[1],0);
  const tie=vs.length>1&&vs[0][1]===vs[1][1];
  return {avg,ovr:n?tot/n:null,raters,sec:{key:vs.length&&!tie?vs[0][0]:null,votes:vs.length?vs[0][1]:0,total,tie:tie?vs.map(x=>x[0]):null}};
}

/* ---------- abas ---------- */
let tab=ls("tab")||"avaliar";
function setTab(t){tab=t;ls("tab",t);render()}
document.querySelectorAll("#tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
function renderShell(){
  const me=myPid(),g=gated();
  $("tabs").hidden=!me;$("v-login").hidden=!!me;
  if(!me){for(const v of ["avaliar","perfis","sorteio","grupo"])$("v-"+v).hidden=true;$("who").textContent="";return false}
  $("tab-grupo").hidden=!S.isAdmin;
  for(const t of ["perfis","sorteio"]){$("tab-"+t).disabled=g;$("tab-"+t).title=g?"Libera depois que você avaliar todo o grupo":""}
  if((tab==="perfis"||tab==="sorteio")&&g)tab="avaliar";
  if(tab==="grupo"&&!S.isAdmin)tab="avaliar";
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===tab));
  for(const v of ["avaliar","perfis","sorteio","grupo"])$("v-"+v).hidden=v!==tab;
  $("who").textContent="Olá, "+S.players.get(me).name+(S.isAdmin?" · organizador":"");
  return true;
}

/* ---------- entrar com celular ---------- */
const L={step:"loading",phone:null,built:null,msg:""};
function setStep(s,msg){L.step=s;L.msg=msg||"";L.built=null;render()}
const claimRef=()=>doc(fs,"claims",auth.currentUser.uid);
function renderLogin(){
  const v=$("v-login");
  if(L.built===L.step)return;L.built=L.step;
  if(!configured){v.replaceChildren(el("div",{class:"login"},el("h2",{text:"Falta configurar"}),el("p",{class:"lead",text:"Preencha o arquivo public/firebase-config.js com os dados do seu projeto Firebase e publique de novo."})));return}
  if(L.step==="loading"){v.replaceChildren(el("div",{class:"login"},el("h2",{text:"Carregando"}),el("p",{class:"lead",text:"Abrindo o app da pelada…"})));return}
  const err=el("div",{class:"err-text",text:L.msg});
  if(L.step==="phone"){
    const inp=el("input",{type:"tel",id:"loginPhone",inputmode:"tel",autocomplete:"tel",placeholder:"(11) 98765-4321","aria-label":"Seu celular"});
    const btn=el("button",{class:"btn primary big",type:"submit",text:"Entrar"});
    const form=el("form",{class:"login",autocomplete:"off"},el("h2",{text:"Entre com seu celular"}),
      el("p",{class:"lead",text:"Use o número que você passou para o organizador da pelada. Sem ele, o app não abre."}),inp,btn,err,
      el("ol",{class:"steps"},
        el("li",{},el("b",{text:"1"}),"Você avalia cada jogador do grupo, um por vez."),
        el("li",{},el("b",{text:"2"}),"Suas notas entram na média e formam o perfil de cada um."),
        el("li",{},el("b",{text:"3"}),"Aí liberam os perfis e o sorteio dos times.")),
      el("p",{class:"note",style:"margin:14px 0 0",text:"Depois de entrar uma vez, este aparelho já abre direto no seu cadastro."}));
    form.addEventListener("submit",async e=>{e.preventDefault();err.textContent="";
      const d=normPhone(inp.value);if(!d){err.textContent="Digite o celular com DDD, por exemplo (11) 98765-4321.";return}
      btn.disabled=true;
      try{
        const ph=e164(d);
        const [idx,adm]=await Promise.all([getDoc(doc(fs,"phoneIndex",ph)),getDoc(doc(fs,"admins",ph))]);
        if(idx.exists()){await setDoc(claimRef(),{phone:ph,pid:idx.data().pid,at:Date.now()});await boot();return}
        if(adm.exists()){await setDoc(claimRef(),{phone:ph,pid:null,at:Date.now()});await boot();return}
        err.textContent="Esse número não está no grupo. Confira com o organizador se ele cadastrou o celular certo.";
      }catch(x){console.error(x);err.textContent=x.code==="permission-denied"?"O Firebase recusou o acesso. Confira se as regras do Firestore foram publicadas.":"Não deu para entrar agora. Confira a internet e tente de novo."}
      finally{btn.disabled=false}});
    v.replaceChildren(form);setTimeout(()=>inp.focus(),0);return;
  }
  if(L.step==="register"){
    const regName=el("input",{type:"text",id:"regName",maxlength:"40",placeholder:"Seu nome","aria-label":"Seu nome"});
    const regPos=el("select",{id:"regPos","aria-label":"Sua posição principal"},el("option",{value:"",disabled:true,selected:true,text:"Sua posição principal"}),...POS_KEYS.map(k=>el("option",{value:k,text:POS[k][0]})));
    const btn=el("button",{class:"btn primary big",type:"submit",text:"Cadastrar e entrar"});
    const form=el("form",{class:"login",autocomplete:"off"},el("h2",{text:"Bem-vindo, organizador"}),
      el("p",{class:"lead",text:"Seu número ainda não está no grupo. Cadastre-se como jogador para entrar."}),
      el("div",{style:"display:flex;flex-direction:column;gap:8px"},regName,regPos),btn,err);
    form.addEventListener("submit",async e=>{e.preventDefault();err.textContent="";
      const name=regName.value.trim().replace(/\s+/g," ");
      if(!name){err.textContent="Digite seu nome.";return}
      if(!POS[regPos.value]){err.textContent="Escolha sua posição principal.";return}
      if([...S.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase())){err.textContent=`"${name}" já está no grupo.`;return}
      btn.disabled=true;
      try{const ref=await S.db.collection("players").add({name,pos:regPos.value,createdAt:Date.now()});
        await S.db.collection("phoneIndex").doc(L.phone).set({pid:ref.id});
        await setDoc(claimRef(),{phone:L.phone,pid:ref.id,at:Date.now()});
        tab="grupo";await boot();}
      catch(x){console.error(x);err.textContent="Não deu para cadastrar agora. Tente de novo.";btn.disabled=false}});
    v.replaceChildren(form);return;
  }
}

/* ---------- avaliar ---------- */
function renderAvaliar(){
  const v=$("v-avaliar");v.replaceChildren();
  if(!S.loaded){v.append(el("div",{class:"empty",style:"margin-top:24px"},el("strong",{text:"Carregando o grupo"}),"Buscando jogadores e avaliações…"));return}
  const os=others();
  if(!os.length){v.append(el("div",{class:"empty",style:"margin-top:24px"},el("strong",{text:"Só você no grupo por enquanto"}),S.isAdmin?"Cadastre os outros jogadores na aba Grupo, com nome, celular e posição. Depois mande o link para a turma.":"Quando o organizador cadastrar os outros jogadores, eles aparecem aqui para você avaliar."));return}
  if(gated()||S.obIdx!=null&&!S.obDone)return renderOnboard(v,os);
  renderRateList(v,os);
}

function renderOnboard(v,os){
  if(S.obIdx==null||S.obIdx>=os.length){const i=os.findIndex(p=>!full(S.mine[p.id]));S.obIdx=i<0?0:i}
  const p=os[S.obIdx];const m=S.mine[p.id]||{};
  const done=os.filter(x=>full(S.mine[x.id])).length;
  const first=done===0&&S.obIdx===0;
  v.append(el("h2",{text:first?"Primeiro, avalie o grupo":"Avalie o grupo"}),
    el("p",{class:"lead",text:"Perfis e sorteio liberam quando você der nota para todos. Seja justo: a média de todo mundo é que monta os times."}),
    el("div",{class:"prog"},el("span",{text:`${done} de ${os.length} avaliados`}),el("div",{class:"bar"},el("i",{style:`width:${100*done/os.length}%`}))));
  const card=el("div",{class:"ob"},el("div",{class:"count",text:`Jogador ${S.obIdx+1} de ${os.length}`}),
    el("div",{class:"name"},youName(p),posTag(p,false,true)));
  for(const [k,label,,hint] of ATTRS){
    const dots=el("div",{class:"dots",role:"group","aria-label":label});
    for(let n=1;n<=5;n++)dots.append(el("button",{type:"button",class:m[k]===n?"on":"","aria-pressed":String(m[k]===n),"data-p":p.id,"data-k":k,"data-v":n,text:String(n)}));
    card.append(el("div",{class:"q"},el("div",{},el("b",{text:label}),el("small",{text:hint})),dots));
  }
  card.append(el("div",{class:"scale"},el("span",{text:"1 = fraco"}),el("span",{text:"5 = muito acima da média"})));
  card.append(secQuestion(p,m,true));
  const isLastPending=pending().filter(x=>x.id!==p.id).length===0;
  card.append(el("div",{class:"nav"},
    el("button",{class:"btn",type:"button",disabled:S.obIdx===0,text:"Anterior",onclick:()=>{S.obIdx--;render()}}),
    el("button",{class:"btn primary big",type:"button",disabled:!full(m),text:isLastPending&&full(m)?"Concluir":"Próximo",onclick:()=>{
      flushSave();
      const rest=pending();
      if(!rest.length){S.obDone=true;S.obIdx=null;status("Pronto! Você avaliou todo o grupo. Perfis e sorteio liberados.");setTab("perfis");return}
      const after=os.findIndex((x,i)=>i>S.obIdx&&!full(S.mine[x.id]));S.obIdx=after>=0?after:os.findIndex(x=>!full(S.mine[x.id]));render();window.scrollTo({top:0})}})));
  v.append(card,el("div",{class:"saveState",id:"saveState",text:saveMsg}));
}

function secQuestion(p,m,big){
  const prim=posOf(p);const opts=POS_KEYS.filter(k=>k!==prim);
  const dots=el("div",{class:"dots sec",role:"group","aria-label":"Posição secundária de "+p.name});
  for(const k of opts)dots.append(el("button",{type:"button",class:m.sec===k?"on":"","aria-pressed":String(m.sec===k),"data-p":p.id,"data-k":"sec","data-v":k,text:POS[k][0]}));
  if(big)return el("div",{class:"q"},el("div",{},el("b",{text:"Posição secundária ideal"}),el("small",{text:`Além de ${POS[prim][0].toLowerCase()}, onde ${p.id===myPid()?"você":p.name.split(" ")[0]} rende melhor?`})),dots);
  return el("div",{class:"attr"},el("span",{text:"2ª posição"}),dots);
}
function renderRateList(v,os){
  v.append(el("h2",{text:"Suas notas"}),el("p",{class:"lead",text:"Você já avaliou todo o grupo. Pode ajustar qualquer nota quando quiser; ela salva sozinha."}),el("div",{class:"saveState",id:"saveState",text:saveMsg}));
  const list=el("div",{class:"list"});
  for(const p of os){
    const m=S.mine[p.id]||{};
    const attrs=el("div",{class:"attrs"});
    for(const [k,label] of ATTRS){
      const dots=el("div",{class:"dots",role:"group","aria-label":label+" de "+p.name});
      for(let n=1;n<=5;n++)dots.append(el("button",{type:"button",class:m[k]===n?"on":"","aria-pressed":String(m[k]===n),"data-p":p.id,"data-k":k,"data-v":n,text:String(n)}));
      const lb=tip(k,label);attrs.append(el("div",{class:"attr"},lb,dots));
    }
    attrs.append(secQuestion(p,m,false));
    list.append(el("div",{class:"rate"+(full(m)?" done":"")},el("div",{class:"hd"},el("span",{class:"pname",text:youName(p)}),posTag(p,false,true)),attrs));
  }
  v.append(list);
}
$("v-avaliar").addEventListener("click",e=>{
  const b=e.target.closest("button[data-p]");if(!b)return;
  const p=b.dataset.p,k=b.dataset.k,n=k==="sec"?b.dataset.v:+b.dataset.v;
  S.mine[p]={...(S.mine[p]||{}),[k]:n};
  queueSave();render();
});

let saveTimer=null,saving=false,saveMsg="";
function setSaveMsg(t){saveMsg=t;const s=$("saveState");if(s)s.textContent=t}
function queueSave(){S.dirty=true;setSaveMsg("Salvando…");clearTimeout(saveTimer);saveTimer=setTimeout(saveMine,700)}
function flushSave(){if(S.dirty){clearTimeout(saveTimer);saveMine()}}
async function saveMine(){
  if(saving){queueSave();return}
  saving=true;
  const scores={};for(const pid in S.mine)if(S.players.has(pid)&&Object.keys(S.mine[pid]).length)scores[pid]=S.mine[pid];
  try{await S.db.collection("ratings").doc(S.uid).set({scores,raterPid:myPid(),updatedAt:Date.now()});S.dirty=false;setSaveMsg("Notas salvas")}
  catch(err){setSaveMsg("");status(err.code==="permission-denied"?"Sem permissão para salvar suas notas. Saia e entre de novo com seu celular.":"Não deu para salvar suas notas agora. Elas serão enviadas na próxima nota que você der.",true)}
  finally{saving=false}
}

/* ---------- perfis ---------- */
function statRow(k,code,v){return el("div",{class:"stat"},el("b",{},tip(k,code)),el("div",{class:"bar"},el("i",{style:`width:${v==null?0:(v/5)*100}%`})),el("em",{text:fmt(v)}))}
function secLine(sec){
  if(sec.key)return el("div",{class:"secline"},"2ª posição: ",el("b",{text:POS[sec.key][0]}),` · ${sec.votes} de ${sec.total} votos`);
  if(sec.tie)return el("div",{class:"secline",text:`2ª posição: empate entre ${sec.tie.map(k=>POS[k][0]).join(" e ")}`});
  return el("div",{class:"secline",text:"2ª posição: sem votos ainda"});
}
function renderCards(){
  const c=$("cards");c.replaceChildren();
  const ps=sortedPlayers().map(p=>({...p,pr:profile(p.id)})).sort((a,b)=>(b.pr.ovr??-1)-(a.pr.ovr??-1)||a.name.localeCompare(b.name,"pt-BR"));
  if(!ps.length){c.append(el("div",{class:"empty",style:"grid-column:1/-1"},el("strong",{text:"Sem perfis ainda"}),"Os perfis aparecem quando houver jogadores cadastrados e notas."));return}
  const me=myPid();
  for(const p of ps){const r=p.pr.raters;
    c.append(el("div",{class:"card"},
      el("div",{class:"top"},el("div",{class:"ovr"+(p.pr.ovr==null?" none":""),text:fmt(p.pr.ovr)}),
        el("div",{class:"meta"},el("div",{class:"pname",text:p.name+(p.id===me?" (você)":"")}),el("div",{class:"row",style:"gap:6px;margin-top:3px"},posTag(p),el("span",{class:"note",text:r?`${r} ${r===1?"avaliação":"avaliações"}`:"sem avaliações"})))),
      secLine(p.pr.sec),
      ...ATTRS.map(([k,,code])=>statRow(k,code,p.pr.avg[k]))));
  }
}

/* ---------- sorteio ---------- */
S.guests=new Map(Object.entries(ls("guests")||{}));S.savedGuests={};
function saveGuests(){ls("guests",Object.fromEntries(S.guests))}
function getP(id){return S.players.get(id)||S.guests.get(id)||S.savedGuests[id]||null}
function hasP(id){return !!getP(id)}
function isGuest(id){return !S.players.has(id)&&hasP(id)}
function rate(id){if(!isGuest(id))return profile(id);const l=+getP(id).lvl||3;return {ovr:l,avg:Object.fromEntries(ATTRS.map(([k])=>[k,l])),raters:0,sec:{key:null,votes:0,total:0,tie:null}}}
const dName=id=>getP(id).name+(isGuest(id)?" (convidado)":"");
let present=new Set(ls("present")||[]);let presentInit=ls("present")!=null;
function savePresent(){presentInit=true;ls("present",[...present])}
function renderPick(){
  const box=$("pick");box.replaceChildren();const ps=sortedPlayers();
  if(!presentInit&&ps.length)ps.forEach(p=>present.add(p.id));
  for(const id of [...present])if(!hasP(id))present.delete(id);
  if(!ps.length)box.append(el("div",{class:"empty",style:"grid-column:1/-1"},el("strong",{text:"Ninguém para sortear"}),"O organizador cadastra os jogadores na aba Grupo."));
  for(const p of ps){
    const cb=el("input",{type:"checkbox",id:"pr-"+p.id});cb.checked=present.has(p.id);
    cb.addEventListener("change",()=>{present.delete(p.id);if(cb.checked)present.add(p.id);savePresent();renderPick()});
    const ord=[...present].filter(id=>hasP(id)).indexOf(p.id);
    box.append(el("label",{for:"pr-"+p.id},cb,el("span",{class:"ord",title:"Ordem de chegada",text:ord>=0?ord+1+"º":""}),el("span",{text:p.name}),posTag(p,true),el("span",{class:"ovrs",title:"Nota geral",text:fmt(rate(p.id).ovr)})));
  }
  const gs=[...S.guests.entries()];
  if(gs.length)box.append(el("div",{class:"ghead",text:`Convidados (${gs.length})`}));
  for(const [id,g] of gs){
    const p={id,...g};const cb=el("input",{type:"checkbox",id:"pr-"+id});cb.checked=present.has(id);
    cb.addEventListener("change",()=>{present.delete(id);if(cb.checked)present.add(id);savePresent();renderPick()});
    const ord=[...present].filter(x=>hasP(x)).indexOf(id);
    const del=el("button",{class:"mini danger",type:"button",text:"Tirar","aria-label":"Tirar convidado "+g.name,onclick:ev=>{ev.preventDefault();S.guests.delete(id);present.delete(id);saveGuests();savePresent();renderPick()}});
    box.append(el("label",{for:"pr-"+id},cb,el("span",{class:"ord",text:ord>=0?ord+1+"º":""}),el("span",{text:g.name}),el("span",{class:"pos sec",text:"Convidado"}),posTag(p,true),el("span",{class:"ovrs",title:"Nota do convidado",text:fmt(+g.lvl||3)}),del));
  }
  updateCount();renderResult();
}
function updateCount(){
  const n=[...present].filter(id=>hasP(id)).length;const k=+$("nTeams").value,per=+$("perTeam").value,need=k*per;
  $("presentCount").textContent=`${n} presentes`;
  $("drawHint").textContent=n<k*2?`Marque pelo menos ${k*2} jogadores`:n>=need?`${need} titulares${n>need?` · ${n-need} ${n-need===1?"reserva":"reservas"}`:""}`:`Faltam ${need-n} para completar ${k} times de ${per}`;
  $("drawBtn").disabled=n<k*2}
$("perTeam").addEventListener("change",()=>{ls("perTeam",$("perTeam").value);updateCount()});
{const n=ls("perTeam");if(n)$("perTeam").value=n}
$("nTeams").addEventListener("change",()=>{ls("nTeams",$("nTeams").value);updateCount()});
{const n=ls("nTeams");if(n)$("nTeams").value=n}
$("allBtn").onclick=()=>{S.players.forEach((_,id)=>present.add(id));S.guests.forEach((_,id)=>present.add(id));savePresent();renderPick()};
$("noneBtn").onclick=()=>{present.clear();savePresent();renderPick()};

$("guestForm").addEventListener("submit",e=>{
  e.preventDefault();const err=$("gErr");err.textContent="";
  const name=$("gName").value.trim().replace(/\s+/g," ");
  if(!name){err.textContent="Digite o nome do convidado.";return}
  if(!POS[$("gPos").value]){err.textContent="Escolha a posição em que ele joga.";return}
  const all=[...S.players.values(),...S.guests.values()];
  if(all.some(p=>p.name.toLowerCase()===name.toLowerCase())){err.textContent=`Já existe alguém chamado "${name}". Use um nome diferente, como "${name} (amigo do João)".`;return}
  const id="g"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  S.guests.set(id,{name,pos:$("gPos").value,lvl:+$("gLvl").value,guest:true});present.delete(id);present.add(id);
  saveGuests();savePresent();$("gName").value="";$("gPos").value="";$("gLvl").value="3";renderPick();$("gName").focus();
});
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a}
function balance(ids,k){
  const info=new Map(ids.map(id=>{const pr=rate(id);const v={ovr:pr.ovr??3};for(const [a] of ATTRS)v[a]=pr.avg[a]??v.ovr;const pl=getP(id);return [id,{...v,pos:posOf(pl),pos2:pr.sec.key}]}));
  const able={};for(const ps of POS_KEYS)able[ps]=ids.filter(id=>info.get(id).pos===ps||info.get(id).pos2===ps).length>=k;
  const keys=["ovr",...ATTRS.map(a=>a[0])];
  const M={};for(const key of keys)M[key]=ids.reduce((s,id)=>s+info.get(id)[key],0)/ids.length;
  function cost(teams){let c=0;
    for(const t of teams){for(const key of keys){const m=t.reduce((s,id)=>s+info.get(id)[key],0)/t.length;c+=(m-M[key])**2*(key==="ovr"?4:.6)}}
    const sizes=teams.map(t=>t.length);if(Math.max(...sizes)-Math.min(...sizes)>1)c+=50;
    for(const ps of POS_KEYS){
      const n=teams.map(t=>t.filter(id=>info.get(id).pos===ps).length);if(Math.max(...n)-Math.min(...n)>1)c+=6;
      const cov=teams.map((t,i)=>n[i]+t.filter(id=>info.get(id).pos2===ps).length*.5);const mc=cov.reduce((a,b)=>a+b,0)/k;c+=cov.reduce((q,x)=>q+(x-mc)**2,0)*.5;
      if(able[ps])for(const t of teams)if(!t.some(id=>info.get(id).pos===ps||info.get(id).pos2===ps))c+=30}
    return c}
  const results=[];
  for(let trial=0;trial<250;trial++){
    const teams=Array.from({length:k},()=>[]);
    for(const ps of shuffle([...POS_KEYS])){for(const id of shuffle(ids.filter(id=>info.get(id).pos===ps))){
      const min=Math.min(...teams.map(t=>t.length));let opts=teams.filter(t=>t.length===min);
      const cnt=t=>t.filter(x=>info.get(x).pos===ps).length;const mc=Math.min(...opts.map(cnt));opts=opts.filter(t=>cnt(t)===mc);
      opts[Math.random()*opts.length|0].push(id)}}
    let best=cost(teams),improved=true,guard=0;
    while(improved&&guard++<30){improved=false;
      for(let i=0;i<k;i++)for(let j=i+1;j<k;j++)for(let a=0;a<teams[i].length;a++)for(let b=0;b<teams[j].length;b++){
        const x=teams[i][a],y=teams[j][b];
        teams[i][a]=y;teams[j][b]=x;const c=cost(teams);if(c<best-1e-9){best=c;improved=true}else{teams[i][a]=x;teams[j][b]=y}}}
    results.push({teams:teams.map(t=>[...t]),cost:best});
  }
  results.sort((a,b)=>a.cost-b.cost);
  const good=results.filter(r=>r.cost<=results[0].cost+0.02).slice(0,40);
  const pick=good[Math.random()*good.length|0];
  pick.teams.forEach(t=>t.sort((a,b)=>POS_KEYS.indexOf(info.get(a).pos)-POS_KEYS.indexOf(info.get(b).pos)||info.get(b).ovr-info.get(a).ovr));
  return pick.teams;
}
$("drawBtn").addEventListener("click",()=>{
  const ids=[...present].filter(id=>hasP(id));const k=+$("nTeams").value,need=k*+$("perTeam").value;if(ids.length<k*2)return;
  S.draw={teams:balance(ids.slice(0,need),k),res:ids.slice(need),at:Date.now()};renderResult();
  $("result").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
});
function teamStats(t){const f=t;const avg=key=>{const v=f.map(id=>{const p=rate(id);return key==="ovr"?(p.ovr??3):(p.avg[key]??p.ovr??3)});return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};return {ovr:avg("ovr"),attrs:ATTRS.map(([k,,c])=>[c,avg(k)])}}
function dateBR(ts){return new Date(ts).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}
function waText(teams,at,res){let s=`⚽ Times da pelada (${dateBR(at)})\n`;teams.forEach((t,i)=>{const st=teamStats(t);s+=`\n*Time ${TEAMS[i][0]}* (média ${fmt(st.ovr)})\n`;t.forEach(id=>{const p=hasP(id)?{id,...getP(id)}:null;if(p)s+=`- ${dName(id)} (${posLabel(p)})\n`})});
  if(res.length){s+=`\n*Reservas* (entram por ordem de chegada)\n`;res.forEach((id,i)=>{const p={id,...getP(id)};s+=`${i+1}. ${dName(id)} (${posLabel(p)})\n`})}
  return s.trim()}
function renderResult(){
  const r=$("result");r.replaceChildren();
  const d=S.draw||S.saved;if(!d)return;
  const teams=d.teams.map(t=>t.filter(id=>hasP(id)));const res=(d.res||[]).filter(id=>hasP(id));
  r.append(el("h2",{text:S.draw?"Times sorteados":"Sorteio da semana"}));
  if(!S.draw)r.append(el("p",{class:"lead",text:`Salvo pelo organizador em ${dateBR(d.at)}.`}));
  const grid=el("div",{class:"teams"});
  teams.forEach((t,i)=>{const st=teamStats(t);
    grid.append(el("div",{class:"team",style:`--tc:var(${TEAMS[i][1]})`},
      el("h3",{},"Time "+TEAMS[i][0],el("small",{text:`média ${fmt(st.ovr)} · ${t.length} jog.`})),
      el("ol",{},...t.map(id=>{const p={id,...getP(id)};const pr=rate(id);return el("li",{},dName(id)," ",posTag(p,true),el("span",{class:"n",text:fmt(pr.ovr)}))})),
      el("div",{class:"tstats"},...st.attrs.flatMap(([c,v],i)=>[i?"  ·  ":"",tip(ATTRS[i][0],c)," "+fmt(v)]))))});
  r.append(grid);
  if(res.length)r.append(el("div",{class:"res"},el("h3",{text:`Reservas (${res.length})`}),el("p",{class:"note",style:"margin:2px 0 0",text:"Entram por ordem de chegada."}),
    el("ol",{},...res.map(id=>{const p={id,...getP(id)};return el("li",{},dName(id)," ",posTag(p,true))}))));
  const acts=el("div",{class:"row",style:"margin-top:12px"});
  const box=el("textarea",{class:"copybox",id:"waBox",readonly:true,hidden:true,"aria-label":"Texto para copiar"});
  acts.append(el("button",{class:"btn primary",type:"button",text:"Copiar para o WhatsApp",onclick:ev=>{const txt=waText(teams,d.at,res);box.value=txt;const b=ev.currentTarget;
    const ok=()=>{b.textContent="Copiado";setTimeout(()=>b.textContent="Copiar para o WhatsApp",1800)};const fb=()=>{box.hidden=false;box.select()};
    try{navigator.clipboard.writeText(txt).then(ok,fb)}catch(e){fb()}}}));
  if(S.draw&&S.isAdmin)acts.append(el("button",{class:"btn",type:"button",text:"Salvar como sorteio da semana",onclick:async ev=>{const b=ev.currentTarget;b.disabled=true;
    try{await S.db.doc("draws/latest").set({teams:Object.fromEntries(teams.map((t,i)=>["t"+i,t])),k:teams.length,res,guests:Object.fromEntries([...teams.flat(),...res].filter(isGuest).map(id=>{const g=getP(id);return [id,{name:g.name,pos:g.pos,lvl:+g.lvl||3}]})),at:d.at});b.textContent="Salvo para todos"}catch(e){b.disabled=false;status("Não foi possível salvar o sorteio.",true)}}}));
  r.append(acts,box,el("p",{class:"note",style:"margin-top:8px",text:"O número ao lado do nome é a nota geral do perfil."}));
}

/* ---------- grupo (organizador) ---------- */
$("addForm").addEventListener("submit",async e=>{
  e.preventDefault();const err=$("addErr");err.textContent="";
  const name=$("newName").value.trim().replace(/\s+/g," ");const d=normPhone($("newPhone").value);
  if(!name){err.textContent="Digite o nome do jogador.";return}
  if(!d){err.textContent="Digite o celular com DDD, por exemplo (11) 98765-4321.";return}
  if(!POS[$("newPos").value]){err.textContent="Escolha a posição principal do jogador.";return}
  if([...S.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase())){err.textContent=`"${name}" já está no grupo.`;return}
  $("addBtn").disabled=true;
  try{
    const dupPid=[...S.phones.entries()].find(([,ph])=>ph===d)?.[0];if(dupPid){err.textContent=`Esse celular já é do ${S.players.get(dupPid)?.name||"outro jogador"}.`;return}
    const ref=await S.db.collection("players").add({name,pos:$("newPos").value,createdAt:Date.now()});
    await S.db.collection("phoneIndex").doc(e164(d)).set({pid:ref.id});
    $("newName").value="";$("newPhone").value="";$("newPos").value="";$("newName").focus();
  }catch(x){err.textContent=x.code==="permission-denied"?"Só organizadores podem cadastrar jogadores.":"Não deu para cadastrar agora. Tente de novo."}
  finally{$("addBtn").disabled=false}
});
let gFilter=ls("gFilter")||"todos";
const GF=[["todos","Todos"],["nao","Não acessaram"],["aval","Faltam avaliar"],["ok","Avaliaram todos"]];
function groupStatus(ps){
  const need=ps.length;const out=new Map();
  for(const p of ps){const u=uidOf(p.id);
    if(!u){out.set(p.id,{st:"nao",n:0,need,u:null});continue}
    const sc=u===S.uid?S.mine:(S.ratings.get(u)?.scores||{});const n=ps.filter(o=>full(sc[o.id])).length;
    out.set(p.id,{st:n>=need?"ok":"aval",n,need,u})}
  return out;
}
function renderGrupo(){
  const g=$("gtable");g.replaceChildren();const ps=sortedPlayers();const total=ps.length;
  const st=groupStatus(ps);const cnt={todos:total,nao:0,aval:0,ok:0};for(const x of st.values())cnt[x.st]++;
  $("gbar").replaceChildren(...total?[el("i",{style:`width:${100*cnt.ok/total}%;background:var(--pitch)`,title:"Avaliaram todos"}),el("i",{style:`width:${100*cnt.aval/total}%;background:var(--vest)`,title:"Faltam avaliar"})]:[]);
  $("summary").replaceChildren(...GF.map(([k,label])=>el("button",{type:"button","aria-pressed":String(gFilter===k),onclick:()=>{gFilter=k;ls("gFilter",k);renderGrupo()}},el("b",{text:String(cnt[k])}),label)));
  const shown=ps.filter(p=>gFilter==="todos"||st.get(p.id).st===gFilter);
  if(gFilter==="aval")shown.sort((a,b)=>st.get(a.id).n-st.get(b.id).n);
  const notes={todos:total?`${cnt.ok} de ${total} já avaliaram todo o grupo. Faltam ${cnt.nao} entrar e ${cnt.aval} terminar de avaliar.`:"",nao:"Cadastrados que ainda não entraram no app.",aval:"Entraram, mas ainda não avaliaram todo o grupo. Os que estão mais atrasados aparecem primeiro.",ok:"Já deram nota para todos os jogadores."};
  $("gnote").textContent=notes[gFilter];
  const cm=$("copyMissing");cm.hidden=!(gFilter==="nao"||gFilter==="aval")||!shown.length;
  cm.onclick=()=>{const txt=(gFilter==="nao"?"Ainda faltam entrar no app da pelada:\n":"Ainda faltam terminar a avaliação:\n")+shown.map(p=>{const x=st.get(p.id);return "- "+p.name+(gFilter==="aval"?` (${x.n}/${x.need})`:"")}).join("\n");
    const ok=()=>{cm.textContent="Copiado";setTimeout(()=>cm.textContent="Copiar nomes",1800)};
    try{navigator.clipboard.writeText(txt).then(ok,()=>status(txt))}catch(e){status(txt)}};
  if(!total){g.append(el("div",{class:"empty",style:"border:0"},el("strong",{text:"Grupo vazio"}),"Cadastre o primeiro jogador no formulário acima."));return}
  if(!shown.length){g.append(el("div",{class:"empty",style:"border:0"},el("strong",{text:"Ninguém aqui"}),gFilter==="ok"?"Ninguém terminou de avaliar ainda.":"Todo mundo já passou dessa etapa."));return}
  for(const p of shown){
    const x=st.get(p.id),u=x.u;const ph=S.phones.get(p.id);
    let chip;
    if(x.st==="nao")chip=el("span",{class:"chip wait",text:"Não acessou"});
    else if(x.st==="aval")chip=el("span",{class:"chip go",text:`Avaliou ${x.n} de ${x.need}`});
    else chip=el("span",{class:"chip ok",text:"Avaliou todos"});
    if(u&&u===S.uid&&S.isAdmin)chip=el("span",{class:"row",style:"gap:4px;justify-self:end"},el("span",{class:"chip ok",text:"Organizador"}),chip);
    const acts=el("div",{class:"acts"});
    const sel=el("select",{"aria-label":"Posição de "+p.name},...POS_KEYS.map(k=>el("option",{value:k,text:POS[k][0]})));sel.value=posOf(p);
    sel.addEventListener("change",async()=>{try{await S.db.collection("players").doc(p.id).update({pos:sel.value})}catch(e){status("Não deu para mudar a posição.",true);sel.value=posOf(p)}});
    acts.append(sel);
    if(u&&u!==S.uid)acts.append(confirmBtn("Zerar notas","Toque de novo: apaga as notas que "+p.name+" deu",async()=>{await S.db.collection("ratings").doc(p.id).delete()}));
    if(p.id!==myPid())acts.append(confirmBtn("Remover","Toque de novo para remover "+p.name,async()=>{if(ph)await S.db.collection("phoneIndex").doc(e164(ph)).delete();await S.db.collection("ratings").doc(p.id).delete();await S.db.collection("players").doc(p.id).delete()}));
    g.append(el("div",{class:"grow"},
      el("div",{},el("div",{class:"pname"},p.name," ",posTag(p)),el("div",{class:"ph",text:ph?fmtPhone(ph):"celular não carregado"})),
      chip,acts));
  }
}
/* ---------- importar cadastro (organizador) ---------- */
$("importBtn").addEventListener("click",async()=>{
  const msg=$("importMsg"),btn=$("importBtn");const f=$("importFile").files[0];
  if(!f){msg.textContent="Escolha o arquivo de cadastro primeiro.";return}
  let data;try{data=JSON.parse(await f.text())}catch(e){msg.textContent="Esse arquivo não é um cadastro válido (.json).";return}
  const list=Array.isArray(data.players)?data.players:[];
  if(!list.length){msg.textContent="O arquivo não tem jogadores.";return}
  btn.disabled=true;msg.textContent="Importando…";
  const byPhone=new Map([...S.phones.entries()].map(([pid,ph])=>[ph,pid]));
  const map={};let created=0,existed=0,bad=0;
  try{
    for(const p of list){
      const d=normPhone(p.phone);
      if(!d||!p.name||!p.id){bad++;continue}
      if(byPhone.has(d)){map[p.id]=byPhone.get(d);existed++;continue}
      const pos=POS[p.pos]?p.pos:"mei";
      await S.db.collection("players").doc(p.id).set({name:String(p.name).slice(0,40),pos,createdAt:p.createdAt||Date.now()});
      await S.db.collection("phoneIndex").doc(e164(d)).set({pid:p.id});
      byPhone.set(d,p.id);map[p.id]=p.id;created++;
    }
    /* Notas: as regras só deixam gravar as notas de quem está logado. */
    let mineRated=0,skipped=0;const me=myPid();
    for(const r of Array.isArray(data.ratings)?data.ratings:[]){
      if(map[r.raterId]!==me){skipped++;continue}
      for(const [oldPid,sc] of Object.entries(r.scores||{})){const pid=map[oldPid];if(!pid)continue;
        const cur=S.mine[pid]||{};const clean={};
        for(const [k] of ATTRS){const v=+sc[k];if(v>=1&&v<=5)clean[k]=v}
        if(POS[sc.sec])clean.sec=sc.sec;
        S.mine[pid]={...clean,...cur};mineRated++}
    }
    if(mineRated){S.dirty=true;await saveMine()}
    msg.textContent=[`${created} jogadores importados.`,existed?`${existed} já estavam no grupo e foram mantidos.`:"",bad?`${bad} linhas sem nome ou celular válido foram ignoradas.`:"",
      mineRated?`Suas notas para ${mineRated} jogadores foram importadas.`:"",skipped?`As notas de ${skipped} outra(s) pessoa(s) não foram importadas: cada um precisa entrar e avaliar.`:""].filter(Boolean).join("\n");
  }catch(x){console.error(x);msg.textContent=(x.code==="permission-denied"?"O Firebase recusou: só organizadores importam.":"A importação parou no meio. Rode de novo: quem já entrou não é duplicado.")+` (${created} importados até aqui)`}
  finally{btn.disabled=false}
});
function confirmBtn(label,confirmLabel,fn){
  const b=el("button",{class:"mini danger",type:"button",text:label});
  b.addEventListener("click",async()=>{if(b.dataset.c!=="1"){b.dataset.c="1";b.textContent=confirmLabel;setTimeout(()=>{b.dataset.c="";b.textContent=label},4000);return}
    b.disabled=true;try{await fn()}catch(e){status("Não deu para concluir. Tente de novo.",true);b.disabled=false}});
  return b;
}

/* ---------- render ---------- */
function render(){if(!renderShell())return renderLogin();if(tab==="avaliar")renderAvaliar();else if(tab==="perfis")renderCards();else if(tab==="sorteio")renderPick();else renderGrupo()}

/* ---------- início ---------- */
let unsubs=[];
function stopData(){unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[]}
function enterAs(pid){S.uid=pid;S.claims.set(pid,pid);S.obIdx=null;S.obDone=false;
  /* marca o primeiro acesso: o documento de notas existe a partir daqui */
  if(!S.ratings.has(pid))S.db.collection("ratings").doc(pid).set({scores:S.mine||{},raterPid:pid,updatedAt:Date.now()}).catch(e=>console.error(e));}
function startData(){
  stopData();
  const need=new Set(["players","ratings"]);
  const ready=n=>{if(need.delete(n)&&!need.size)S.loaded=true;render()};
  const fail=e=>{console.error(e);status("Não deu para carregar o grupo. Recarregue a página.",true)};
  unsubs.push(S.db.collection("players").onSnapshot(s=>{S.players=new Map(s.docs.map(d=>[d.id,d.data()]));ready("players")},fail));
  unsubs.push(S.db.collection("ratings").onSnapshot(s=>{
    S.ratings=new Map(s.docs.map(d=>{const x=d.data();return [d.id,{scores:x.scores||{},raterPid:x.raterPid}]}));
    S.claims=new Map(s.docs.map(d=>[d.id,d.id]));if(S.uid)S.claims.set(S.uid,S.uid);
    if(S.uid&&!S.dirty)S.mine=JSON.parse(JSON.stringify(S.ratings.get(S.uid)?.scores||{}));ready("ratings")},fail));
  unsubs.push(S.db.doc("draws/latest").onSnapshot(d=>{if(d.exists){const x=d.data();const teams=[];for(let i=0;i<(x.k||0);i++)teams.push(x.teams["t"+i]||[]);S.savedGuests=x.guests||{};S.saved={teams,res:x.res||[],at:x.at}}else S.saved=null;if(tab==="sorteio")renderResult()},fail));
  if(S.isAdmin)unsubs.push(S.db.collection("phoneIndex").onSnapshot(s=>{S.phones=new Map(s.docs.map(d=>[d.data().pid,digitsOf(d.id)]));if(tab==="grupo")renderGrupo()},fail));
}
function resetState(){stopData();S.uid=null;S.isAdmin=S.isOwner=false;S.loaded=false;S.players=new Map();S.ratings=new Map();S.claims=new Map();S.phones=new Map();S.mine={};S.saved=null;S.draw=null}
/* Lê o vínculo deste aparelho (claims/<uid>) e decide para onde ir. */
async function boot(){
  resetState();status("");setStep("loading");
  try{
    const c=await getDoc(claimRef());
    if(!c.exists()){$("logoutBtn").hidden=true;setStep("phone");return}
    const cl=c.data();L.phone=cl.phone;$("logoutBtn").hidden=false;
    S.isAdmin=S.isOwner=(await getDoc(doc(fs,"admins",cl.phone))).exists();
    if(!cl.pid){if(S.isAdmin){startData();setStep("register")}else{await deleteDoc(claimRef());setStep("phone")}return}
    S.uid=cl.pid;S.claims.set(S.uid,S.uid);startData();
    const wait=setInterval(async()=>{if(!S.loaded)return;clearInterval(wait);
      if(S.players.has(S.uid)){enterAs(S.uid);render()}
      else{/* jogador removido do grupo */await deleteDoc(claimRef()).catch(()=>{});resetState();$("logoutBtn").hidden=true;setStep("phone","Seu cadastro não está mais no grupo. Fale com o organizador.")}},150);
  }catch(x){console.error(x);status("Não deu para abrir o app. Confira a internet e recarregue a página.",true)}
}
$("logoutBtn").addEventListener("click",async()=>{try{await deleteDoc(claimRef())}catch(e){}tab="avaliar";await boot()});
render();
if(configured){
  S.db=DB;
  onAuthStateChanged(auth,user=>{
    if(!user){signInAnonymously(auth).catch(x=>{console.error(x);status(x.code&&x.code.includes("operation-not-allowed")?"Ative o login Anônimo no Firebase (Authentication > Método de login > Anônimo).":"Não deu para conectar ao Firebase. Recarregue a página.",true)});return}
    boot();
  });
}
