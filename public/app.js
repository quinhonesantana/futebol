import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, runTransaction, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
const full=m=>!!m&&ATTRS.every(([k])=>m[k]>=1&&m[k]<=5);

/* ---------- celular ---------- */
function normPhone(s){let d=String(s||"").replace(/\D/g,"");if(d.length>11&&d.startsWith("55"))d=d.slice(2);d=d.replace(/^0+/,"");return d.length===10||d.length===11?d:null}
function fmtPhone(d){return d.length===11?`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`:`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`}

/* ---------- quem é quem ---------- */
function sortedPlayers(){return [...S.players.entries()].map(([id,p])=>({id,...p})).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))}
function myPid(){return S.uid&&S.players.has(S.uid)?S.uid:null}
function uidOf(pid){return S.claims.has(pid)?pid:null}
function others(){return sortedPlayers()}
function isOrg(pid){const ph=S.phones.get(pid);if(S.isAdmin&&S.adminPhones&&ph)return S.adminPhones.has(e164(ph));return S.players.get(pid)?.role==="org"}
const orgChip=()=>el("span",{class:"chip org",text:"Organizador"});
const youName=p=>p.id===myPid()?p.name+" (você)":p.name;
function pending(){return others().filter(p=>!full(S.mine[p.id]))}
function gated(){return !S.isAdmin&&!!myPid()&&pending().length>0}

const EMPTY_PROFILE={avg:{def:null,pas:null,ata:null,res:null,vel:null},ovr:null,raters:0,sec:{key:null,votes:0,total:0,tie:null}};
function profile(pid){
  if(S.visitor)return S.pub?.[pid]||EMPTY_PROFILE;
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
/* o app sempre abre na aba Ao vivo, para todo mundo */
let tab="aovivo";
/* avisa o Tag Manager de cada aba aberta, já que o app não troca de página */
const TAB_NAMES={perfis:"jogadores",aovivo:"ao_vivo"};
function track(name){try{(window.dataLayer=window.dataLayer||[]).push({event:"aba_aberta",aba:TAB_NAMES[name]||name,visitante:!myPid()})}catch(e){}}
function setTab(t){if(t!==tab)status("");tab=t;ls("tab",t);track(t);render()}
let vtab="aovivo";
$("entrarBtn").addEventListener("click",()=>{vtab="entrar";track("entrar");render();window.scrollTo({top:0})});
document.querySelectorAll("#tabs button").forEach(b=>b.addEventListener("click",()=>{if(!myPid()){vtab=b.dataset.tab;ls("vtab",vtab);track(vtab);render();window.scrollTo({top:0});return}setTab(b.dataset.tab)}));
const VIEWS=["avaliar","perfis","sorteio","aovivo","resultados","grupo"];
function renderShell(){
  const me=myPid(),g=gated();
  $("tabs").hidden=!me;$("v-login").hidden=!!me;$("loginLogo").hidden=!!me;
  if(!me){
    /* visitante: abas Jogadores, Ao vivo e Resultados; Entrar fica no alto, à direita */
    const vis=S.visitor;if(vis&&!["entrar","perfis","aovivo","resultados"].includes(vtab))vtab="aovivo";const cur=vis?vtab:"entrar";
    $("entrarBtn").hidden=!(vis&&cur!=="entrar");
    $("tabs").hidden=!vis;
    for(const b of document.querySelectorAll("#tabs button")){const t=b.dataset.tab;b.hidden=!(t==="perfis"||t==="aovivo"||t==="resultados");b.disabled=false;b.title="";b.setAttribute("aria-selected",String(t===cur))}
    $("v-login").hidden=cur!=="entrar";$("loginLogo").hidden=cur!=="entrar";
    for(const v of VIEWS)$("v-"+v).hidden=!(vis&&v===cur);
    $("visitorHead").hidden=!(vis&&cur!=="entrar");$("who").textContent="";return false}
  $("visitorHead").hidden=true;$("tab-entrar").hidden=true;$("entrarBtn").hidden=true;for(const t of ["avaliar","perfis","sorteio","aovivo","resultados"])$("tab-"+t).hidden=false;
  $("tab-grupo").hidden=!S.isAdmin;
  for(const t of ["perfis","sorteio","resultados"]){$("tab-"+t).disabled=g;$("tab-"+t).title=g?"Libera depois que você avaliar todo o grupo":""}
  if((tab==="perfis"||tab==="sorteio"||tab==="resultados")&&g)tab="avaliar";
  if(tab==="grupo"&&!S.isAdmin)tab="avaliar";
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===tab));
  for(const v of VIEWS)$("v-"+v).hidden=v!==tab;
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
  if(L.step==="loading"){v.replaceChildren(el("div",{class:"login"},el("h2",{text:"Carregando"}),el("p",{class:"lead",text:"Abrindo o app do Peixe…"})));return}
  const err=el("div",{class:"err-text",text:L.msg});
  if(L.step==="phone"){
    const inp=el("input",{type:"tel",id:"loginPhone",inputmode:"tel",autocomplete:"tel",placeholder:"(11) 98765-4321","aria-label":"Seu celular"});
    const btn=el("button",{class:"btn primary big",type:"submit",text:"Entrar"});
    const form=el("form",{class:"login",autocomplete:"off"},el("h2",{text:"Entre com seu celular"}),
      el("p",{class:"lead",text:"Use o número que você passou para o organizador do Peixe para avaliar o grupo e ver o sorteio."}),inp,btn,err,
      el("ol",{class:"steps"},
        el("li",{},el("b",{text:"1"}),"Você avalia cada jogador do grupo, um por vez."),
        el("li",{},el("b",{text:"2"}),"Suas notas entram na média e formam o perfil de cada um."),
        el("li",{},el("b",{text:"3"}),"Aí liberam as abas Jogadores e Sorteio.")),
      el("p",{class:"note",style:"margin:14px 0 0",text:"Depois de entrar uma vez, este aparelho já abre direto no seu cadastro. Visitante? Veja os jogadores e os resultados nas abas acima."}));
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
    el("p",{class:"lead",text:"As abas Jogadores e Sorteio liberam quando você der nota para todos. Cada jogador é salvo quando você toca em Próximo. Seja justo: a média de todo mundo é que monta os times."}),
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
    el("button",{class:"btn primary big",type:"button",disabled:!full(m),text:isLastPending&&full(m)?"Concluir":"Próximo",onclick:async ev=>{
      const bt=ev.currentTarget;bt.disabled=true;if(!await flushSave()){bt.disabled=false;return}
      const rest=pending();
      if(!rest.length){S.obDone=true;S.obIdx=null;status("Pronto! Você avaliou todo o grupo. As abas Jogadores e Sorteio estão liberadas. "+lockText());setTab("perfis");return}
      const after=os.findIndex((x,i)=>i>S.obIdx&&!full(S.mine[x.id]));S.obIdx=after>=0?after:os.findIndex(x=>!full(S.mine[x.id]));render();window.scrollTo({top:0})}})));
  v.append(card,el("div",{class:"saveState",id:"saveState",text:saveMsg}));
}

function secQuestion(p,m,big){
  const prim=posOf(p);const opts=POS_KEYS.filter(k=>k!==prim);
  const dots=el("div",{class:"dots sec",role:"group","aria-label":"Posição secundária de "+p.name});
  for(const k of opts)dots.append(el("button",{type:"button",class:m.sec===k?"on":"","aria-pressed":String(m.sec===k),"data-p":p.id,"data-k":"sec","data-v":k,text:POS[k][0]}));
  if(big)return el("div",{class:"q"},el("div",{},el("b",{text:"Posição secundária ideal (opcional)"}),el("small",{text:`Além de ${POS[prim][0].toLowerCase()}, onde ${p.id===myPid()?"você":p.name.split(" ")[0]} rende melhor? Toque de novo para desmarcar.`})),dots);
  return el("div",{class:"attr"},el("span",{title:"Opcional",text:"2ª posição"}),dots);
}
function renderRateList(v,os){
  v.append(el("h2",{text:"Suas notas"}),el("p",{class:"lead",text:"Toque nas notas que quiser mudar e depois em Salvar notas, no fim da página."}),lockBox());
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
    const lk=entryLocked(p.id);
    if(lk)attrs.querySelectorAll("button").forEach(b=>{b.disabled=true});
    list.append(el("div",{class:"rate"+(full(m)?" done":"")+(lk?" locked":"")},el("div",{class:"hd"},el("span",{class:"pname",text:youName(p)}),el("span",{class:"row",style:"gap:6px"},lk?el("span",{class:"chip lock",text:"Travada"}):null,posTag(p,false,true))),attrs));
  }
  v.append(list,saveBar());
}
$("v-avaliar").addEventListener("click",e=>{
  const b=e.target.closest("button[data-p]");if(!b)return;
  const p=b.dataset.p,k=b.dataset.k,n=k==="sec"?b.dataset.v:+b.dataset.v;
  if(entryLocked(p))return;
  const cur={...(S.mine[p]||{})};const off=k==="sec"&&cur.sec===n;
  if(off)delete cur.sec;else cur[k]=n;S.mine[p]=cur;S.dirty=true;
  /* atualiza só o que mudou: redesenhar a lista inteira a cada toque travava o celular */
  for(const x of b.parentElement.querySelectorAll("button")){const on=x===b&&!off;x.classList.toggle("on",on);x.setAttribute("aria-pressed",String(on))}
  const card=b.closest(".rate");if(card)card.classList.toggle("done",full(S.mine[p]));
  const nx=document.querySelector(".ob .nav .btn.primary");if(nx){nx.disabled=!full(S.mine[p]);if(full(S.mine[p])&&pending().filter(x=>x.id!==p).length===0)nx.textContent="Concluir"}
  setSaveMsg("Você tem alterações que ainda não foram salvas.",true);
});
window.addEventListener("beforeunload",e=>{if(S.dirty){e.preventDefault();e.returnValue=""}});
const monthName=d=>d.toLocaleDateString("pt-BR",{month:"long"});
const sameMonth=(a,b)=>{const x=new Date(a),y=new Date(b);return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()};
function entryLocked(pid){return !!S.notes.locked&&full(S.savedMine[pid])}
function lockText(){
  if(S.notes.locked)return `Suas notas estão travadas desde ${dateBR(S.notes.lockedAt||Date.now())}, quando foi jogada a primeira partida do mês. Para mudar, o presidente precisa abrir uma revisão. Jogadores que você ainda não avaliou continuam liberados.`;
  const now=new Date();const playedThisMonth=S.matches.some(m=>sameMonth(m.at,now));
  const target=playedThisMonth?new Date(now.getFullYear(),now.getMonth()+1,1):now;
  return `Você pode alterar suas notas até a primeira partida de ${monthName(target)}. Depois disso elas ficam travadas, e só o presidente libera uma revisão.`;
}
function lockBox(){return el("p",{class:"lockinfo"+(S.notes.locked?" on":""),id:"lockInfo",text:lockText()})}
function saveBar(){
  const btn=el("button",{class:"btn primary big",type:"button",id:"saveNotes",text:"Salvar notas",onclick:async()=>{btn.disabled=true;btn.textContent="Salvando…";
    const ok=await saveMine();btn.disabled=false;btn.textContent="Salvar notas";
    if(ok){setSaveMsg("Notas salvas.");status("Notas salvas. "+lockText())}}});
  return el("div",{class:"savebar"+(S.dirty?" dirty":""),id:"saveBar"},el("div",{class:"saveState",id:"saveState",text:S.dirty?"Você tem alterações que ainda não foram salvas.":saveMsg}),btn);
}

let saveTimer=null,saving=false,saveMsg="";
function setSaveMsg(t,dirty){saveMsg=dirty?"":t;const s=$("saveState");if(s)s.textContent=t;const b=$("saveBar");if(b)b.classList.toggle("dirty",!!dirty)}
function queueSave(){S.dirty=true;setSaveMsg("Salvando…");clearTimeout(saveTimer);saveTimer=setTimeout(saveMine,700)}
function flushSave(){if(S.dirty){clearTimeout(saveTimer);return saveMine()}return Promise.resolve(true)}
async function saveMine(){
  if(saving)return false;
  saving=true;
  const scores={};for(const pid in S.mine)if(S.players.has(pid)&&Object.keys(S.mine[pid]).length)scores[pid]=entryLocked(pid)?S.savedMine[pid]:S.mine[pid];
  try{await S.db.collection("ratings").doc(S.uid).set({scores,raterPid:myPid(),updatedAt:Date.now()});S.dirty=false;S.savedMine=JSON.parse(JSON.stringify(scores));setSaveMsg("Notas salvas.");return true}
  catch(err){setSaveMsg("Não foi salvo. Toque em Salvar notas de novo.",true);status(err.code==="permission-denied"?"Sem permissão para salvar suas notas. Saia e entre de novo com seu celular.":"Não deu para salvar suas notas agora. Confira a internet e toque em Salvar notas de novo.",true);return false}
  finally{saving=false}
}

/* ---------- perfis ---------- */
function statRow(k,code,v){return el("div",{class:"stat"},el("b",{},tip(k,code)),el("div",{class:"bar"},el("i",{style:`width:${v==null?0:(v/5)*100}%`})),el("em",{text:fmt(v)}))}
function secLine(sec){
  if(sec.key)return el("div",{class:"secline"},"2ª posição: ",el("b",{text:POS[sec.key][0]}),` · ${sec.votes} de ${sec.total} votos`);
  if(sec.tie)return el("div",{class:"secline",text:`2ª posição: empate entre ${sec.tie.map(k=>POS[k][0]).join(" e ")}`});
  return el("div",{class:"secline",text:"2ª posição: sem votos ainda"});
}
/* Nota geral = média das notas do grupo + ajuste de desempenho nos jogos (entre −0,5 e +0,5), sempre entre 1 e 5.
   Nos cards de Jogadores o ajuste sempre entra; no sorteio, só com a opção "Usar resultados dos jogos" ligada. */
let ADJ=null;
function adjMap(){if(!ADJ||ADJ.m!==S.matches||ADJ.p!==S.players)ADJ={m:S.matches,p:S.players,map:perfAdj()};return ADJ.map}
const adjOf=id=>isGuest(id)?0:(adjMap().get(id)||0);
const perfOn=()=>$("usePerf").checked;
function noteOf(id,withAdj){const b=rate(id).ovr;if(b==null)return null;return Math.max(1,Math.min(5,b+(withAdj?adjOf(id):0)))}
const fmtAdj=a=>(a>=0?"+":"−")+Math.abs(a).toFixed(2).replace(".",",");
function renderCards(){
  const c=$("cards");c.replaceChildren();
  const ps=sortedPlayers().map(p=>({...p,pr:profile(p.id),nt:noteOf(p.id,true)})).sort((a,b)=>(b.nt??-1)-(a.nt??-1)||a.name.localeCompare(b.name,"pt-BR"));
  if(!ps.length){c.append(el("div",{class:"empty",style:"grid-column:1/-1"},el("strong",{text:"Nenhum jogador ainda"}),"Os jogadores aparecem aqui quando o organizador cadastrar o grupo."));return}
  const me=myPid();
  for(const p of ps){const r=p.pr.raters;
    c.append(el("div",{class:"card"},
      el("div",{class:"top"},el("div",{class:"ovr"+(p.nt==null?" none":""),text:fmt(p.nt)}),
        el("div",{class:"meta"},el("div",{class:"pname",text:p.name+(p.id===me?" (você)":"")}),el("div",{class:"row",style:"gap:6px;margin-top:3px"},posTag(p),isOrg(p.id)?orgChip():null,el("span",{class:"note",text:r?`${r} ${r===1?"avaliação":"avaliações"}`:"sem avaliações"})))),
      secLine(p.pr.sec),p.pr.ovr!=null&&stats().get(p.id)?.j?el("div",{class:"adjline"},`Notas do grupo ${p.pr.ovr.toFixed(2).replace(".",",")} · desempenho nos jogos `,el("b",{class:adjOf(p.id)>0.005?"up":adjOf(p.id)<-0.005?"down":"",text:fmtAdj(adjOf(p.id))})):null,perfLine(p.id),
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
  $("drawTools").hidden=!S.isAdmin;if(!S.isAdmin){renderResult();return}
  const box=$("pick");box.replaceChildren();const ps=sortedPlayers();
  if(!presentInit&&ps.length)ps.forEach(p=>present.add(p.id));
  for(const id of [...present])if(!hasP(id))present.delete(id);
  if(!ps.length)box.append(el("div",{class:"empty",style:"grid-column:1/-1"},el("strong",{text:"Ninguém para sortear"}),"O organizador cadastra os jogadores na aba Grupo."));
  for(const p of ps){
    const cb=el("input",{type:"checkbox",id:"pr-"+p.id});cb.checked=present.has(p.id);
    cb.addEventListener("change",()=>{present.delete(p.id);if(cb.checked)present.add(p.id);savePresent();renderPick()});
    const ord=[...present].filter(id=>hasP(id)).indexOf(p.id);
    box.append(el("label",{for:"pr-"+p.id},cb,el("span",{class:"ord",title:"Ordem de chegada",text:ord>=0?ord+1+"º":""}),el("span",{text:p.name}),posTag(p,true),el("span",{class:"ovrs",title:"Nota geral",text:fmt(noteOf(p.id,perfOn()))})));
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
  const usePerf=$("usePerf").checked;const adjMap=usePerf?perfAdj():new Map();
  const info=new Map(ids.map(id=>{const pr=rate(id);const v={ovr:pr.ovr??3};for(const [a] of ATTRS)v[a]=pr.avg[a]??v.ovr;const pl=getP(id);const a=usePerf?(adjMap.get(id)||0):0;for(const k in v)v[k]+=a;return [id,{...v,pos:posOf(pl),pos2:pr.sec.key,top:isTop(id)}]}));
  const nTop=ids.filter(id=>info.get(id).top).length;
  const able={};for(const ps of POS_KEYS)able[ps]=ids.filter(id=>info.get(id).pos===ps||info.get(id).pos2===ps).length>=k;
  const keys=["ovr",...ATTRS.map(a=>a[0])];
  const M={};for(const key of keys)M[key]=ids.reduce((s,id)=>s+info.get(id)[key],0)/ids.length;
  function cost(teams){let c=0;
    for(const t of teams){for(const key of keys){const m=t.reduce((s,id)=>s+info.get(id)[key],0)/t.length;c+=(m-M[key])**2*(key==="ovr"?4:.6)}}
    const sizes=teams.map(t=>t.length);if(Math.max(...sizes)-Math.min(...sizes)>1)c+=50;
    /* nível 4 espalhado: no máximo 1 de diferença entre os times, e todo time com pelo menos 1 quando houver para todos */
    if(nTop){const tp=teams.map(t=>t.filter(id=>info.get(id).top).length);if(Math.max(...tp)-Math.min(...tp)>1)c+=80;if(nTop>=k&&tp.some(x=>x===0))c+=80}
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
      if(info.get(id).top){const tc=t=>t.filter(x=>info.get(x).top).length;const mt=Math.min(...opts.map(tc));opts=opts.filter(t=>tc(t)===mt)}
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
  const teams=balance(ids.slice(0,need),k),res=ids.slice(need);
  S.draw=k===2&&res.length?{teams,res:[],subs:splitReserves(teams,res),at:Date.now()}:{teams,res,subs:null,at:Date.now()};renderResult();
  $("result").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
});
/* Com 2 times o jogo é direto e as trocas são no campo: cada time leva os seus reservas.
   Reparte os reservas (o mais forte primeiro) mantendo o número igual, as posições equilibradas
   e a força total dos dois times parecida. Dentro de cada time, eles ficam na ordem de chegada. */
const TOP=4;
const isTop=id=>(noteOf(id,perfOn())??0)>=TOP;
function splitReserves(teams,res){
  const subs=teams.map(()=>[]);const ovr=id=>noteOf(id,perfOn())??3;
  const power=i=>[...teams[i],...subs[i]].reduce((q,id)=>q+ovr(id),0);
  for(const id of [...res].sort((a,b)=>ovr(b)-ovr(a))){
    const n=subs.map(x=>x.length),min=Math.min(...n);let cand=[...subs.keys()].filter(i=>n[i]===min);
    if(isTop(id)){const tc=i=>[...teams[i],...subs[i]].filter(isTop).length;const mt=Math.min(...cand.map(tc));cand=cand.filter(i=>tc(i)===mt)}
    const pos=posOf(getP(id)),cnt=i=>[...teams[i],...subs[i]].filter(x=>posOf(getP(x))===pos).length;
    const mc=Math.min(...cand.map(cnt));cand=cand.filter(i=>cnt(i)===mc).sort((a,b)=>power(a)-power(b));
    subs[cand[0]].push(id)}
  for(const x of subs)x.sort((a,b)=>res.indexOf(a)-res.indexOf(b));
  return subs;
}
function teamStats(t){const f=t;const avg=key=>{const v=f.map(id=>{const p=rate(id);const a=perfOn()?adjOf(id):0;return key==="ovr"?(p.ovr??3)+a:(p.avg[key]??p.ovr??3)+a});return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};return {ovr:avg("ovr"),attrs:ATTRS.map(([k,,c])=>[c,avg(k)])}}
function dateBR(ts){return new Date(ts).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}
function waText(teams,at,res,subs){let s=`⚽ Peixe Futebol Clube · times de ${dateBR(at)}\n`;teams.forEach((t,i)=>{const st=teamStats(t);s+=`\n*Time ${TEAMS[i][0]}* (média ${fmt(st.ovr)})\n`;t.forEach(id=>{const p=hasP(id)?{id,...getP(id)}:null;if(p)s+=`- ${dName(id)} (${posLabel(p)})\n`});const sb=(subs&&subs[i])||[];if(sb.length)s+=`_Reservas:_ ${sb.map(id=>`${dName(id)} (${posLabel({id,...getP(id)})})`).join(", ")}\n`});
  if(res.length){s+=`\n*Reservas* (entram por ordem de chegada)\n`;res.forEach((id,i)=>{const p={id,...getP(id)};s+=`${i+1}. ${dName(id)} (${posLabel(p)})\n`})}
  return s.trim()}
/* Sorteio já usado: teve jogo e passaram 12 horas do último jogo (ou do encerramento do ao vivo), sem partida rolando.
   Aí o app passa a aguardar o próximo sorteio; os times usados ficam em Resultados › Sorteios anteriores. */
function drawUsed(){const d=S.saved;if(!d)return false;const ms=S.matches.filter(m=>m.drawAt===d.at);if(!ms.length)return false;
  const L=S.live&&S.live.drawAt===d.at?S.live:null;if(L&&L.status==="running")return false;
  return Date.now()-Math.max(...ms.map(m=>m.at),L?.closedAt||0)>12*3600e3}
const usedDay=()=>{const ms=S.matches.filter(m=>m.drawAt===S.saved.at);return new Date(Math.min(...ms.map(m=>m.at))).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})};
function renderResult(){
  const r=$("result");r.replaceChildren();
  const used=!S.draw&&drawUsed();
  if(used&&!S.isAdmin){r.append(el("div",{class:"empty",style:"margin-top:24px"},el("strong",{text:"Aguardando o próximo sorteio"}),`Os times da pelada de ${usedDay()} estão guardados em Resultados › Sorteios anteriores. Quando os organizadores sortearem a próxima, os times aparecem aqui.`));return}
  const d=(S.isAdmin&&S.draw)||S.saved;
  if(used)r.append(el("div",{class:"banner"},el("b",{text:"Esse sorteio já foi usado. "}),`Ele é da pelada de ${usedDay()} e está guardado em Resultados › Sorteios anteriores. Marque quem veio e sorteie de novo para a próxima pelada.`));
  if(!d){if(!S.isAdmin)r.append(el("div",{class:"empty",style:"margin-top:24px"},el("strong",{text:"Sorteio ainda não publicado"}),"Quando os organizadores publicarem os times, eles aparecem aqui."));return}
  const teams=d.teams.map(t=>t.filter(id=>hasP(id)));const res=(d.res||[]).filter(id=>hasP(id));const subs=d.subs?teams.map((_,i)=>(d.subs[i]||[]).filter(id=>hasP(id))):null;
  r.append(el("h2",{text:S.draw?"Times sorteados":"Sorteio publicado"}));
  if(S.draw)r.append(el("p",{class:"lead",text:"Prévia: só você está vendo. Toque em Publicar sorteio para mostrar ao grupo, ou sorteie de novo."}));
  else r.append(el("p",{class:"lead",text:`Publicado pelos organizadores em ${dateBR(d.at)}.${d.manual?" Ajustado à mão depois do sorteio.":""}`}));
  if(S.isAdmin)r.append(el("p",{class:"note",text:S.draw?"Toque em Mover ao lado de um nome para trocar alguém de time antes de publicar.":"Toque em Mover ao lado de um nome para trocar alguém de time. A mudança vale na hora para todo o grupo."}));
  const grid=el("div",{class:"teams"});
  teams.forEach((t,i)=>{const st=teamStats(t);
    grid.append(el("div",{class:"team",style:`--tc:var(${TEAMS[i][1]})`},
      el("h3",{},"Time "+TEAMS[i][0],el("small",{text:`média ${fmt(st.ovr)} · ${t.length} jog.${subs&&subs[i].length?` + ${subs[i].length} res.`:""}`})),
      (()=>{const n=[...t,...(subs?subs[i]:[])].filter(isTop).length;return n?el("div",{class:"topline",text:`${n} ${n===1?"jogador":"jogadores"} nível 4`}):null})(),
      el("ol",{},...t.map(id=>{const p={id,...getP(id)};const pr=rate(id);return el("li",{},dName(id)," ",posTag(p,true),el("span",{class:"n"+(isTop(id)?" top":""),text:fmt(noteOf(id,perfOn()))}),moveBtn(id))})),
      subs&&subs[i].length?el("div",{class:"tsubs"},el("b",{text:"Reservas do time"}),el("ul",{},...subs[i].map(id=>{const p={id,...getP(id)};return el("li",{},dName(id)," ",posTag(p,true),el("span",{class:"n",text:fmt(noteOf(id,perfOn()))}),moveBtn(id))}))):null,
      el("div",{class:"tstats"},...st.attrs.flatMap(([c,v],i)=>[i?"  ·  ":"",tip(ATTRS[i][0],c)," "+fmt(v)]))))});
  r.append(grid);
  if(res.length)r.append(el("div",{class:"res"},el("h3",{text:`Reservas (${res.length})`}),el("p",{class:"note",style:"margin:2px 0 0",text:"Entram por ordem de chegada."}),
    el("ol",{},...res.map(id=>{const p={id,...getP(id)};return el("li",{},dName(id)," ",posTag(p,true),moveBtn(id))}))));
  const acts=el("div",{class:"row",style:"margin-top:12px"});
  const box=el("textarea",{class:"copybox",id:"waBox",readonly:true,hidden:true,"aria-label":"Texto para copiar"});
  acts.append(el("button",{class:"btn primary",type:"button",text:"Copiar para o WhatsApp",onclick:ev=>{const txt=waText(teams,d.at,res,subs);box.value=txt;const b=ev.currentTarget;
    const ok=()=>{b.textContent="Copiado";setTimeout(()=>b.textContent="Copiar para o WhatsApp",1800)};const fb=()=>{box.hidden=false;box.select()};
    try{navigator.clipboard.writeText(txt).then(ok,fb)}catch(e){fb()}}}));
  if(S.draw&&S.isAdmin)acts.append(el("button",{class:"btn",type:"button",text:"Publicar sorteio",onclick:async ev=>{const b=ev.currentTarget;b.disabled=true;
    try{if(S.saved&&S.saved.at!==d.at)await archiveDraw();await S.db.doc("draws/latest").set({teams:Object.fromEntries(teams.map((t,i)=>["t"+i,t])),k:teams.length,res,subs:subs?Object.fromEntries(subs.map((x,i)=>["t"+i,x])):null,manual:!!d.manual,guests:Object.fromEntries([...teams.flat(),...res,...(subs||[]).flat()].filter(isGuest).map(id=>{const g=getP(id);return [id,{name:g.name,pos:g.pos,lvl:+g.lvl||3}]})),at:d.at});b.textContent="Publicado para todos";S.draw=null;status("Sorteio publicado. Todo o grupo já vê os times na aba Sorteio. Ainda dá para mover alguém tocando em Mover.")}catch(e){b.disabled=false;status(e.code==="permission-denied"?"Só organizadores podem publicar o sorteio.":"Não foi possível publicar o sorteio.",true)}}}));
  if(S.isAdmin&&S.saved){const running=S.live&&S.live.drawAt===S.saved.at&&S.live.status==="running";
    acts.append(confirmBtn(S.draw?"Cancelar sorteio publicado":"Cancelar publicação",running?"Toque de novo: cancela e para a partida ao vivo sem salvar":"Toque de novo: o grupo deixa de ver os times",cancelPublish,"btn danger"))}
  r.append(acts,box,el("p",{class:"note",style:"margin-top:8px",text:"O número ao lado do nome é a nota geral do perfil"+(perfOn()?", já com o ajuste de desempenho nos jogos.":".")}));
}

/* ---------- ajuste manual do sorteio (organizador) ---------- */
/* Depois do sorteio, o organizador pode mover alguém para outro time ou para os reservas, ou trocar duas pessoas de time.
   Na prévia a mudança fica só na tela; no sorteio publicado ela é gravada e vale na hora para todo o grupo. */
function moveBtn(id){return S.isAdmin?el("button",{class:"mini mv",type:"button","aria-label":"Mover "+getP(id).name,text:"Mover",onclick:()=>openMove(id)}):null}
function drawCopy(){const d=S.draw||S.saved;return {teams:d.teams.map(t=>t.filter(hasP)),res:(d.res||[]).filter(hasP),subs:d.subs?d.teams.map((_,i)=>((d.subs[i])||[]).filter(hasP)):null,at:d.at}}
function locate(c,id){for(let i=0;i<c.teams.length;i++){if(c.teams[i].includes(id))return {kind:"team",i};if(c.subs&&c.subs[i].includes(id))return {kind:"sub",i}}if(c.res.includes(id))return {kind:"res"};return null}
function removeFrom(c,id){c.teams=c.teams.map(t=>t.filter(x=>x!==id));c.res=c.res.filter(x=>x!==id);if(c.subs)c.subs=c.subs.map(s=>s.filter(x=>x!==id))}
async function saveDraw(c,msg){
  c.manual=true;
  if(S.draw){S.draw=c;renderResult();status(msg+" Ainda é uma prévia: publique para o grupo ver.");return}
  const all=[...c.teams.flat(),...c.res,...(c.subs||[]).flat()];
  try{await S.db.doc("draws/latest").set({teams:Object.fromEntries(c.teams.map((t,i)=>["t"+i,t])),k:c.teams.length,res:c.res,subs:c.subs?Object.fromEntries(c.subs.map((x,i)=>["t"+i,x])):null,manual:true,
      guests:Object.fromEntries(all.filter(isGuest).map(id=>{const g=getP(id);return [id,{name:g.name,pos:g.pos,lvl:+g.lvl||3}]})),at:c.at});
    status(msg+" O grupo já vê a mudança.")}
  catch(e){console.error(e);status(e.code==="permission-denied"?"Só organizadores podem ajustar o sorteio.":"Não deu para salvar a mudança. Tente de novo.",true)}
}
function openMove(id){
  const c=drawCopy();const w=locate(c,id);if(!w)return;const name=getP(id).name;
  const here=w.kind==="team"?`Time ${TEAMS[w.i][0]}`:w.kind==="sub"?`reserva do Time ${TEAMS[w.i][0]}`:"reservas";
  const dest=[];
  c.teams.forEach((_,i)=>{if(!(w.kind==="team"&&w.i===i))dest.push({label:`Time ${TEAMS[i][0]}`,c:`var(${TEAMS[i][1]})`,go:x=>x.teams[i].push(id),msg:`${name} foi para o Time ${TEAMS[i][0]}.`})});
  if(c.subs)c.teams.forEach((_,i)=>{if(!(w.kind==="sub"&&w.i===i))dest.push({label:`Reservas do Time ${TEAMS[i][0]}`,c:`var(${TEAMS[i][1]})`,go:x=>x.subs[i].push(id),msg:`${name} virou reserva do Time ${TEAMS[i][0]}.`})});
  else if(w.kind!=="res")dest.push({label:"Reservas",c:"var(--line)",go:x=>x.res.push(id),msg:`${name} foi para os reservas.`});
  const swaps=[];c.teams.forEach((t,i)=>{if(w.kind==="team"&&w.i===i)return;for(const o of t)swaps.push({id:o,i})});
  const pick=async fn=>{lvClose();const x=drawCopy();await fn(x)};
  const destBtns=dest.map(d=>el("button",{type:"button",class:"lv-chip",style:`border-left:6px solid ${d.c}`,text:d.label,onclick:()=>pick(async x=>{removeFrom(x,id);d.go(x);await saveDraw(x,d.msg)})}));
  const swapBtns=swaps.map(sw=>el("button",{type:"button",class:"lv-chip alt",text:`${getP(sw.id).name} (${TEAMS[sw.i][0]})`,onclick:()=>pick(async x=>{
    /* troca no mesmo lugar: cada um assume a posição do outro na lista */
    const arr=loc=>loc.kind==="team"?x.teams[loc.i]:loc.kind==="sub"?x.subs[loc.i]:x.res;
    const a=locate(x,id),b=locate(x,sw.id);if(!a||!b)return;const A=arr(a),B=arr(b),ia=A.indexOf(id),ib=B.indexOf(sw.id);A[ia]=sw.id;B[ib]=id;await saveDraw(x,`${name} e ${getP(sw.id).name} trocaram de lugar.`)})}));
  lvSheet("var(--vest)",el("h3",{text:`Mover ${name}`}),el("p",{class:"note",style:"margin:4px 0 0",text:`Hoje: ${here}.`}),
    el("h4",{text:"Mover para"}),el("div",{class:"lv-chips"},...destBtns),
    swapBtns.length?el("h4",{text:"Ou trocar de lugar com"}):null,swapBtns.length?el("div",{class:"lv-chips"},...swapBtns):null,
    ...replaceSection(id,w,c),
    el("div",{class:"lv-actions"},el("button",{class:"btn",type:"button",text:"Cancelar",onclick:lvClose})));
}
/* Coloca outra pessoa exatamente na vaga de id: alguém do grupo que não entrou no sorteio ou um convidado novo.
   Quem sai deixa o sorteio, ou vai para os reservas se o organizador marcar. */
function replaceSection(id,w,c){
  const name=getP(id).name;const inDraw=new Set([...c.teams.flat(),...c.res,...(c.subs||[]).flat()]);
  const out=sortedPlayers().filter(p=>!inDraw.has(p.id));
  const toRes=el("input",{type:"checkbox",id:"rpToRes"});
  const resLabel=w.kind==="team"?el("label",{for:"rpToRes",class:"note",style:"display:flex;gap:8px;align-items:center;margin:0 0 8px"},toRes,`${name} vai para os reservas${c.subs?` do Time ${TEAMS[w.i][0]}`:""} (sem marcar, sai do sorteio)`):null;
  const doReplace=async(newId,label)=>{lvClose();const x=drawCopy();const loc=locate(x,id);if(!loc)return;
    const arr=loc.kind==="team"?x.teams[loc.i]:loc.kind==="sub"?x.subs[loc.i]:x.res;arr[arr.indexOf(id)]=newId;
    if(toRes.checked&&loc.kind==="team"){if(x.subs)x.subs[loc.i].push(id);else x.res.push(id)}
    await saveDraw(x,`${label} entrou no lugar de ${name}${toRes.checked&&loc.kind==="team"?`, que foi para os reservas`:""}.`)};
  const gName=el("input",{type:"text",id:"rpName",maxlength:"40",placeholder:"Nome do convidado","aria-label":"Nome do convidado"});
  const gPos=el("select",{id:"rpPos","aria-label":"Posição do convidado"},...POS_KEYS.map(k=>el("option",{value:k,text:POS[k][0]})));gPos.value=posOf(getP(id));
  const gLvl=el("select",{id:"rpLvl","aria-label":"Nota do convidado"},...[1,2,3,4,5].map(n=>el("option",{value:n,text:"Nota "+n})));gLvl.value="3";
  const gErr=el("div",{class:"err-text"});
  const gBtn=el("button",{class:"btn primary",type:"button",text:"Colocar convidado",onclick:()=>{
    const nm=gName.value.trim().replace(/\s+/g," ");if(!nm){gErr.textContent="Digite o nome do convidado.";return}
    if([...S.players.values(),...S.guests.values()].some(p=>p.name.toLowerCase()===nm.toLowerCase())){gErr.textContent=`Já existe alguém chamado "${nm}". Use um nome diferente.`;return}
    const gid="g"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    S.guests.set(gid,{name:nm,pos:gPos.value,lvl:+gLvl.value,guest:true});saveGuests();doReplace(gid,`${nm} (convidado)`)}});
  return [el("h4",{text:"Ou colocar outra pessoa no lugar"}),resLabel,
    out.length?el("div",{class:"lv-chips"},...out.map(p=>el("button",{type:"button",class:"lv-chip",text:p.name,onclick:()=>doReplace(p.id,p.name)}))):el("p",{class:"note",style:"margin:0",text:"Todo o grupo já está no sorteio."}),
    el("div",{class:"rpguest"},el("b",{text:"Convidado"}),gName,el("div",{class:"row"},gPos,gLvl,gBtn),gErr)];
}
/* ---------- histórico de sorteios ----------
   Depois que sai o primeiro jogo de um sorteio publicado, ele é guardado em drawHistory/<data do sorteio>
   com os nomes de todo mundo. Se os times forem ajustados depois, o arquivo é atualizado. */
S.drawHist=[];S.histLoaded=false;
const drawSig=d=>JSON.stringify({t:d.teams,s:d.subs||null,r:d.res||[]});
function drawArchiveDoc(d){const ids=[...d.teams.flat(),...(d.res||[]),...(d.subs||[]).flat()];
  return {at:d.at,k:d.teams.length,teams:Object.fromEntries(d.teams.map((t,i)=>["t"+i,t])),subs:d.subs?Object.fromEntries(d.subs.map((x,i)=>["t"+i,x])):null,res:d.res||[],
    names:Object.fromEntries(ids.filter(hasP).map(id=>[id,getP(id).name])),pos:Object.fromEntries(ids.filter(hasP).map(id=>[id,posOf(getP(id))])),guests:ids.filter(isGuest),sig:drawSig(d),archivedAt:Date.now()}}
async function archiveDraw(d){d=d||S.saved;if(!d||!myPid())return;if(!S.matches.some(m=>m.drawAt===d.at))return;
  const old=S.drawHist.find(h=>h.at===d.at);if(old&&old.sig===drawSig(d))return;
  try{await S.db.doc("drawHistory/"+d.at).set(drawArchiveDoc(d))}catch(e){console.error(e)}}
/* Cancela o sorteio publicado: o grupo deixa de ver os times e a partida ao vivo volta a esperar um sorteio.
   Jogos já encerrados continuam em Resultados. A prévia do organizador, se houver, continua na tela para publicar de novo. */
async function cancelPublish(){
  const at=S.saved?.at;await archiveDraw();
  if(S.live&&S.live.drawAt===at)await deleteDoc(doc(fs,"live","current"));
  await S.db.doc("draws/latest").delete();
  status("Publicação cancelada. O grupo não vê mais os times, e a partida ao vivo volta a aguardar um sorteio. Os jogos já encerrados continuam em Resultados.");
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
function renderNotesBox(){
  const b=$("notesBox");if(!b)return;b.replaceChildren();
  const lk=!!S.notes.locked;
  b.append(el("p",{},el("b",{text:lk?"Notas travadas. ":"Notas liberadas. "}),lk?`Desde ${dateBR(S.notes.lockedAt||Date.now())}. Ninguém consegue mudar as notas que já deu, só completar as que faltam.`:`O grupo pode mudar as notas até a primeira partida do mês. Ela trava tudo sozinha quando você lança o primeiro jogo do mês.`),
    el("div",{class:"acts2"},
      confirmBtn(lk?"Abrir revisão de notas":"Travar notas agora",lk?"Toque de novo: todos poderão mudar as notas":"Toque de novo para travar",async()=>{
        await S.db.doc("config/notes").set(lk?{locked:false,reviewAt:Date.now(),by:myPid()}:{locked:true,lockedAt:Date.now(),by:myPid()})},"btn"),
      confirmBtn("Resetar todas as notas","Toque de novo: apaga as notas de todo o grupo",resetAllNotes,"btn")),
    el("p",{class:"note",style:"flex-basis:100%",text:S.pubAt?`Página de visitantes atualizada em ${new Date(S.pubAt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}.`:"A página de visitantes é atualizada sozinha quando um organizador está com o app aberto."}));
}
async function resetAllNotes(){
  const ids=[...S.ratings.keys()];let n=0;
  for(const id of ids){const r=S.ratings.get(id);if(!r||!Object.keys(r.scores||{}).length)continue;
    await S.db.collection("ratings").doc(id).set({scores:{},raterPid:id,updatedAt:Date.now()});n++}
  await S.db.doc("config/notes").set({locked:false,resetAt:Date.now(),by:myPid()});
  S.mine={};S.savedMine={};S.dirty=false;S.obIdx=null;S.obDone=false;
  status(`Notas resetadas: ${n} ${n===1?"avaliação apagada":"avaliações apagadas"}. Cada jogador vai avaliar o grupo de novo no próximo acesso.`);
}
function renderGrupo(){
  renderNotesBox();
  const g=$("gtable");g.replaceChildren();const ps=sortedPlayers();const total=ps.length;
  const st=groupStatus(ps);const cnt={todos:total,nao:0,aval:0,ok:0};for(const x of st.values())cnt[x.st]++;
  $("gbar").replaceChildren(...total?[el("i",{style:`width:${100*cnt.ok/total}%;background:var(--pitch)`,title:"Avaliaram todos"}),el("i",{style:`width:${100*cnt.aval/total}%;background:var(--vest)`,title:"Faltam avaliar"})]:[]);
  $("summary").replaceChildren(...GF.map(([k,label])=>el("button",{type:"button","aria-pressed":String(gFilter===k),onclick:()=>{gFilter=k;ls("gFilter",k);renderGrupo()}},el("b",{text:String(cnt[k])}),label)));
  const shown=ps.filter(p=>gFilter==="todos"||st.get(p.id).st===gFilter);
  if(gFilter==="aval")shown.sort((a,b)=>st.get(a.id).n-st.get(b.id).n);
  const notes={todos:total?`${cnt.ok} de ${total} já avaliaram todo o grupo. Faltam ${cnt.nao} entrar e ${cnt.aval} terminar de avaliar.`:"",nao:"Cadastrados que ainda não entraram no app.",aval:"Entraram, mas ainda não avaliaram todo o grupo. Os que estão mais atrasados aparecem primeiro.",ok:"Já deram nota para todos os jogadores."};
  $("gnote").textContent=notes[gFilter];
  const cm=$("copyMissing");cm.hidden=!(gFilter==="nao"||gFilter==="aval")||!shown.length;
  cm.onclick=()=>{const txt=(gFilter==="nao"?"Ainda faltam entrar no app do Peixe:\n":"Ainda faltam terminar a avaliação:\n")+shown.map(p=>{const x=st.get(p.id);return "- "+p.name+(gFilter==="aval"?` (${x.n}/${x.need})`:"")}).join("\n");
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
    if(isOrg(p.id))chip=el("span",{class:"row",style:"gap:4px;justify-self:end"},orgChip(),chip);
    const acts=el("div",{class:"acts"});
    const sel=el("select",{"aria-label":"Posição de "+p.name},...POS_KEYS.map(k=>el("option",{value:k,text:POS[k][0]})));sel.value=posOf(p);
    sel.addEventListener("change",async()=>{try{await S.db.collection("players").doc(p.id).update({pos:sel.value})}catch(e){status("Não deu para mudar a posição.",true);sel.value=posOf(p)}});
    acts.append(sel);
    if(ph&&p.id!==myPid()){const org=isOrg(p.id);
      acts.append(confirmBtn(org?"Tirar de organizador":"Tornar organizador",org?"Toque de novo: "+p.name+" vira jogador":"Toque de novo: "+p.name+" poderá sortear e cadastrar",async()=>{
        if(org){await S.db.collection("admins").doc(e164(ph)).delete();await S.db.collection("players").doc(p.id).update({role:"jogador"})}
        else{await S.db.collection("admins").doc(e164(ph)).set({nome:p.name,pid:p.id});await S.db.collection("players").doc(p.id).update({role:"org"})}},org?"mini danger":"mini"))}
    if(u&&u!==S.uid)acts.append(confirmBtn("Zerar notas","Toque de novo: apaga as notas que "+p.name+" deu",async()=>{await S.db.collection("ratings").doc(p.id).delete()}));
    if(p.id!==myPid())acts.append(confirmBtn("Remover","Toque de novo para remover "+p.name,async()=>{if(ph)await S.db.collection("phoneIndex").doc(e164(ph)).delete();await S.db.collection("ratings").doc(p.id).delete();await S.db.collection("players").doc(p.id).delete()}));
    g.append(el("div",{class:"grow"},
      el("div",{},el("div",{class:"pname"},p.name," ",posTag(p)),el("div",{class:"ph",text:ph?fmtPhone(ph):"celular não carregado"})),
      chip,acts));
  }
}
/* ---------- resumo da noite ---------- */
/* Junta os jogos de um mesmo dia: classificação dos times (3 pontos por vitória, 1 por empate; desempate por saldo,
   gols marcados e vitórias), artilheiro, líder de assistências, defesa menos vazada e o zagueiro que tomou menos gol. */
const dayKey=ts=>{const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
let resDay=null;
function daySummary(ms){
  const T=new Map(),P=new Map();const t=i=>{if(!T.has(i))T.set(i,{i,j:0,v:0,e:0,d:0,gp:0,gc:0,pts:0});return T.get(i)};
  const pl=(id,m)=>{if(!P.has(id))P.set(id,{id,name:m.names?.[id]||getP(id)?.name||"?",g:0,a:0,j:0,gc:0,cs:0});return P.get(id)};
  for(const m of ms){
    for(const [me,op] of [[m.a,m.b],[m.b,m.a]]){const x=t(me.team);x.j++;x.gp+=me.goals;x.gc+=op.goals;
      if(me.goals>op.goals){x.v++;x.pts+=3}else if(me.goals===op.goals){x.e++;x.pts++}else x.d++;
      for(const id of me.roster||[]){const p=pl(id,m);p.j++;p.gc+=op.goals;if(op.goals===0&&me.goals>op.goals)p.cs++}}
    for(const [id,n] of Object.entries(m.scorers||{}))pl(id,m).g+=n;
    for(const [id,n] of Object.entries(m.assists||{}))pl(id,m).a+=n;
  }
  const table=[...T.values()].sort((a,b)=>b.pts-a.pts||(b.gp-b.gc)-(a.gp-a.gc)||b.gp-a.gp||b.v-a.v||a.i-b.i);
  return {table,players:[...P.values()]};
}
const joinNames=xs=>xs.length<=1?(xs[0]||""):xs.slice(0,-1).join(", ")+" e "+xs[xs.length-1];
function leaders(list,val,better){if(!list.length)return null;let best=null;for(const x of list){const v=val(x);if(best===null||better(v,best))best=v}
  return {v:best,who:list.filter(x=>val(x)===best)}}
/* dados do resumo de um dia, usados na tela, na imagem e no texto do WhatsApp */
function dayData(key){
  const ms=S.matches.filter(m=>dayKey(m.at)===key).sort((a,b)=>a.at-b.at);if(!ms.length)return null;
  const {table,players}=daySummary(ms);
  const label=new Date(ms[0].at).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"});
  const short=new Date(ms[0].at).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
  const top=table[0],tied=table.filter(x=>x.pts===top.pts&&(x.gp-x.gc)===(top.gp-top.gc)&&x.gp===top.gp);
  const awards=[];
  const sc=leaders(players.filter(p=>p.g>0),p=>p.g,(a,b)=>a>b);
  awards.push(sc?{t:"Artilheiro da noite",m:joinNames(sc.who.map(p=>p.name)),s:`${sc.v} ${sc.v===1?"gol":"gols"}`,c:"--vest"}:{t:"Artilheiro da noite",m:"Sem gols",s:"nenhum gol com autor",c:"--line"});
  const as=leaders(players.filter(p=>p.a>0),p=>p.a,(a,b)=>a>b);
  awards.push(as?{t:"Líder de assistências",m:joinNames(as.who.map(p=>p.name)),s:`${as.v} ${as.v===1?"assistência":"assistências"}`,c:"--pitch"}:{t:"Líder de assistências",m:"Sem registro",s:"nenhuma assistência marcada",c:"--line"});
  const df=leaders(table,x=>x.gc/x.j,(a,b)=>a<b);const dfT=df.who.sort((a,b)=>b.j-a.j);
  awards.push({t:"Defesa menos vazada",m:joinNames(dfT.map(x=>"Time "+TEAMS[x.i][0])),s:dfT.length===1?`${dfT[0].gc} ${dfT[0].gc===1?"gol sofrido":"gols sofridos"} em ${dfT[0].j} ${dfT[0].j===1?"jogo":"jogos"}`:`${fmt(df.v)} gol sofrido por jogo`,c:TEAMS[dfT[0].i][1]});
  const zb=leaders(players.filter(p=>p.j>0&&S.players.has(p.id)&&isZag(p.id)),p=>p.gc/p.j,(a,b)=>a<b);
  if(zb){const who=zb.who.sort((a,b)=>b.cs-a.cs||b.j-a.j);const best=who.filter(p=>p.cs===who[0].cs&&p.j===who[0].j);
    awards.push({t:"Zagueiro que tomou menos gol",m:joinNames(best.map(p=>p.name)),s:best.length===1?`${best[0].gc} ${best[0].gc===1?"gol sofrido":"gols sofridos"} em ${best[0].j} ${best[0].j===1?"jogo":"jogos"}${best[0].cs?` · ${best[0].cs} ${best[0].cs===1?"vitória":"vitórias"} sem sofrer gol`:""}`:`${fmt(zb.v)} gol sofrido por jogo`,c:"--t3"})}
  else awards.push({t:"Zagueiro que tomou menos gol",m:"Sem zagueiro",s:"nenhum zagueiro jogou",c:"--line"});
  return {key,ms,table,label,short,top,tied,awards};
}
/* resumo da última noite: fica na aba Ao vivo até a próxima partida começar */
function renderDayResults(box,pick){
  box.replaceChildren();
  const days=[...new Set(S.matches.map(m=>dayKey(m.at)))].sort().reverse();if(!days.length)return;
  if(!pick||!resDay||!days.includes(resDay))resDay=days[0];
  const D=dayData(resDay);const {table,label,top,tied,ms}=D;
  const sel=pick&&days.length>1?el("select",{id:"resDaySel","aria-label":"Escolher o dia"},...days.map(k=>{const m=S.matches.find(x=>dayKey(x.at)===k);return el("option",{value:k,text:new Date(m.at).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})})})):null;
  if(sel){sel.value=resDay;sel.addEventListener("change",()=>{resDay=sel.value;renderDayResults(box,pick)})}
  box.append(el("div",{class:"dhead"},el("h2",{text:"Resumo da noite"}),sel||el("span",{class:"note",text:label})));
  if(tied.length>1)box.append(el("div",{class:"champ tie"},el("div",{},el("small",{text:`${label} · ${ms.length} ${ms.length===1?"jogo":"jogos"}`}),el("b",{text:`Empate: ${joinNames(tied.map(x=>TEAMS[x.i][0]))}`})),el("div",{class:"pts",text:String(top.pts)},el("span",{text:"pontos cada"}))));
  else box.append(el("div",{class:"champ",style:`--tc:var(${TEAMS[top.i][1]})`},el("div",{},el("small",{text:`Campeão da noite · ${label}`}),el("b",{text:`Time ${TEAMS[top.i][0]}`})),el("div",{class:"pts",text:String(top.pts)},el("span",{text:"pontos"}))));
  box.append(el("div",{class:"tbl ltbl"},el("table",{},el("thead",{},el("tr",{},...[["Time",""],["P","Pontos"],["J","Jogos"],["V","Vitórias"],["E","Empates"],["D","Derrotas"],["GP","Gols marcados"],["GC","Gols sofridos"],["SG","Saldo de gols"]].map(([t,ti])=>el("th",{text:t,title:ti})))),
    el("tbody",{},...table.map((x,k)=>el("tr",{class:k===0&&tied.length===1?"first":""},el("td",{},el("span",{class:"tdot",style:`--tc:var(${TEAMS[x.i][1]})`}),TEAMS[x.i][0]),...[x.pts,x.j,x.v,x.e,x.d,x.gp,x.gc,(x.gp-x.gc>0?"+":"")+(x.gp-x.gc)].map(v=>el("td",{text:String(v)}))))))));
  box.append(el("div",{class:"awards"},...D.awards.map(a=>el("div",{class:"award",style:`--ac:var(${a.c})`},el("small",{text:a.t}),el("b",{text:a.m}),el("span",{text:a.s})))));
  const msg=el("div",{class:"note",role:"status",style:"margin-top:6px"});
  box.append(el("div",{class:"shareRow"},
    el("button",{class:"btn primary",type:"button",text:"Baixar imagem",onclick:async ev=>{const b=ev.currentTarget;b.disabled=true;msg.textContent="Gerando a imagem…";
      try{const blob=await dayImage(D);const a=el("a",{href:URL.createObjectURL(blob),download:`peixe-resumo-${D.key}.png`});document.body.append(a);a.click();a.remove();msg.textContent="Imagem baixada."}
      catch(e){console.error(e);msg.textContent="Não deu para gerar a imagem neste aparelho."}finally{b.disabled=false}}}),
    el("button",{class:"btn wa",type:"button",text:"Compartilhar no WhatsApp",onclick:async ev=>{const b=ev.currentTarget;b.disabled=true;
      const text=dayText(D);
      try{const blob=await dayImage(D);const file=new File([blob],`peixe-resumo-${D.key}.png`,{type:"image/png"});
        if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text});msg.textContent=""}
        else{window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank","noopener");msg.textContent="Este aparelho não envia imagem direto. Abrimos o WhatsApp com o texto; para mandar a imagem, use Baixar imagem."}}
      catch(e){if(e&&e.name==="AbortError"){msg.textContent=""}else{window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank","noopener")}}
      finally{b.disabled=false}}})),msg);
}
/* texto do resumo para o WhatsApp */
function dayText(D){
  let s=`⚽ *Peixe Futebol Clube* · resumo da noite ${D.short}\n\n`;
  s+=D.tied.length>1?`Empate na liderança: ${joinNames(D.tied.map(x=>"Time "+TEAMS[x.i][0]))} (${D.top.pts} ${D.top.pts===1?"pt":"pts"})\n`:`🏆 Campeão: *Time ${TEAMS[D.top.i][0]}* (${D.top.pts} ${D.top.pts===1?"pt":"pts"})\n`;
  s+=`\n*Classificação*\n`+D.table.map((x,k)=>`${k+1}º ${TEAMS[x.i][0]} · ${x.pts} ${x.pts===1?"pt":"pts"} (${x.v}V ${x.e}E ${x.d}D, saldo ${x.gp-x.gc>0?"+":""}${x.gp-x.gc})`).join("\n");
  s+=`\n\n`+D.awards.map(a=>`*${a.t}:* ${a.m} (${a.s})`).join("\n");
  return s+`\n\n${location.host}`;
}
/* desenha o resumo numa imagem 1080 × 1350 (formato de post), com as cores e o escudo do Peixe */
let crestImg=null;
function loadCrest(){if(crestImg)return Promise.resolve(crestImg);return new Promise((ok,ko)=>{const i=new Image();i.onload=()=>{crestImg=i;ok(i)};i.onerror=ko;i.src="logo.jpg"})}
async function dayImage(D){
  try{await Promise.all([document.fonts.load('800 60px "Barlow Condensed"'),document.fonts.load('600 30px Inter'),document.fonts.load('700 30px Inter')])}catch(e){}
  const crest=await loadCrest().catch(()=>null);
  const css=getComputedStyle(document.documentElement);const col=v=>(css.getPropertyValue(v)||"").trim()||"#2f6fd6";
  const W=1080,H=1350,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");
  const DISP='"Barlow Condensed","Arial Narrow",sans-serif',BODY='Inter,system-ui,sans-serif';
  const fit=(txt,max,size,weight,fam)=>{let s=size;g.font=`${weight} ${s}px ${fam}`;while(g.measureText(txt).width>max&&s>18){s-=2;g.font=`${weight} ${s}px ${fam}`}return s};
  const rr=(x,y,w,h,r)=>{g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()};
  /* fundo */
  let bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#0f2247");bg.addColorStop(1,"#050f24");g.fillStyle=bg;g.fillRect(0,0,W,H);
  g.fillStyle="#d9a62b";g.fillRect(0,170,W,6);
  if(crest){g.save();rr(56,34,110,110,20);g.clip();g.drawImage(crest,56,34,110,110);g.restore()}
  g.fillStyle="#c9d4ea";g.font=`600 28px ${BODY}`;g.textBaseline="alphabetic";g.fillText(`Resumo da noite · ${D.label}`,190,78);
  g.fillStyle="#fff";g.font=`800 70px ${DISP}`;g.fillText("PEIXE FUTEBOL CLUBE",190,142);
  /* campeão */
  let y=210;const champC=D.tied.length>1?"#3a4a6b":col(TEAMS[D.top.i][1]);
  rr(56,y,W-112,190,26);let cg=g.createLinearGradient(56,y,W-56,y+190);cg.addColorStop(0,champC);cg.addColorStop(1,"#0a1d3d");g.fillStyle=cg;g.fill();
  g.fillStyle="rgba(255,255,255,.85)";g.font=`700 26px ${BODY}`;g.fillText(D.tied.length>1?`EMPATE NA LIDERANÇA · ${D.ms.length} ${D.ms.length===1?"JOGO":"JOGOS"}`:`CAMPEÃO DA NOITE · ${D.ms.length} ${D.ms.length===1?"JOGO":"JOGOS"}`,92,y+56);
  const champTxt=(D.tied.length>1?joinNames(D.tied.map(x=>TEAMS[x.i][0])):`TIME ${TEAMS[D.top.i][0]}`).toUpperCase();
  g.fillStyle="#fff";fit(champTxt,640,96,800,DISP);g.fillText(champTxt,92,y+150);
  g.textAlign="right";g.font=`800 120px ${DISP}`;g.fillText(String(D.top.pts),W-92,y+140);g.font=`600 26px ${BODY}`;g.fillStyle="rgba(255,255,255,.85)";g.fillText(D.tied.length>1?"pontos cada":"pontos",W-92,y+174);g.textAlign="left";
  /* classificação */
  y=440;rr(56,y,W-112,70+D.table.length*62,22);g.fillStyle="rgba(255,255,255,.06)";g.fill();
  const cols=[["P",560],["J",640],["V",715],["E",790],["D",865],["SG",960]];
  g.fillStyle="#9fb0d0";g.font=`700 24px ${BODY}`;g.fillText("CLASSIFICAÇÃO",88,y+46);g.textAlign="center";for(const [t,x] of cols)g.fillText(t,x,y+46);g.textAlign="left";
  D.table.forEach((x,k)=>{const ry=y+70+k*62;g.fillStyle="rgba(255,255,255,.08)";g.fillRect(88,ry,W-176,1);
    g.fillStyle=col(TEAMS[x.i][1]);g.beginPath();g.arc(104,ry+32,11,0,7);g.fill();
    g.fillStyle="#fff";g.font=`${k===0?800:700} 40px ${DISP}`;g.fillText(`${k+1}º  ${TEAMS[x.i][0].toUpperCase()}`,128,ry+45);
    g.font=`${k===0?700:600} 30px ${BODY}`;g.textAlign="center";const sg=x.gp-x.gc;
    [x.pts,x.j,x.v,x.e,x.d,(sg>0?"+":"")+sg].forEach((v,j)=>{g.fillStyle=j===0?"#f2c94c":"#e8eef9";g.fillText(String(v),cols[j][1],ry+43)});g.textAlign="left"});
  /* destaques 2 × 2 */
  y=440+70+D.table.length*62+30;const bw=(W-112-24)/2,bh=180;
  D.awards.forEach((a,k)=>{const x=56+(k%2)*(bw+24),yy=y+Math.floor(k/2)*(bh+24);
    rr(x,yy,bw,bh,20);g.fillStyle="#fff";g.fill();g.save();rr(x,yy,bw,bh,20);g.clip();g.fillStyle=a.c==="--line"?"#9fb0d0":col(a.c);g.fillRect(x,yy,12,bh);g.restore();
    g.fillStyle="#596479";g.font=`700 22px ${BODY}`;g.fillText(a.t.toUpperCase(),x+36,yy+46);
    g.fillStyle="#111a2c";const m=a.m.toUpperCase();fit(m,bw-60,52,800,DISP);g.fillText(m,x+36,yy+108);
    g.fillStyle="#596479";fit(a.s,bw-60,24,500,BODY);g.fillText(a.s,x+36,yy+150)});
  /* placares da noite, em duas colunas, até onde couber */
  let gy=y+2*(bh+24)+16;const lineH=42,room=Math.max(0,Math.floor((H-76-(gy+40))/lineH))*2;
  if(room>0){const cut=D.ms.length>room;g.fillStyle="#9fb0d0";g.font=`700 24px ${BODY}`;g.fillText(cut?`ÚLTIMOS ${room} DE ${D.ms.length} JOGOS`:"JOGOS DA NOITE",56,gy+24);gy+=40;
    const list=cut?D.ms.slice(-room):D.ms;const half=Math.ceil(list.length/2);
    list.forEach((m,k)=>{const cx=56+(k<half?0:(W-112)/2),cy=gy+(k%half)*lineH+30;
      g.fillStyle=col(TEAMS[m.a.team][1]);g.beginPath();g.arc(cx+9,cy-10,8,0,7);g.fill();
      g.fillStyle="#fff";g.font=`700 32px ${DISP}`;const t=`${TEAMS[m.a.team][0].toUpperCase()} ${m.a.goals} x ${m.b.goals} ${TEAMS[m.b.team][0].toUpperCase()}`;g.fillText(t,cx+26,cy);
      const w=g.measureText(t).width;g.fillStyle=col(TEAMS[m.b.team][1]);g.beginPath();g.arc(cx+26+w+16,cy-10,8,0,7);g.fill()})}
  g.fillStyle="#9fb0d0";g.font=`600 24px ${BODY}`;g.textAlign="center";g.fillText(location.host,W/2,H-36);g.textAlign="left";
  return await new Promise((ok,ko)=>c.toBlob(b=>b?ok(b):ko(new Error("toBlob")),"image/png"));
}
/* ---------- resultados ---------- */
S.matches=[];S.notes={locked:false};S.savedMine={};let MF=null;
{const u=ls("usePerf");if(u===false)$("usePerf").checked=false}
$("usePerf").addEventListener("change",()=>{ls("usePerf",$("usePerf").checked);renderPick()});
const isZag=id=>posOf(S.players.get(id))==="zag";
function stats(ms){ms=ms||S.matches;
  const st=new Map();const get=id=>{if(!st.has(id))st.set(id,{j:0,v:0,e:0,d:0,g:0,a:0,cs:0,pts:0,gp:0,gc:0});return st.get(id)};
  for(const m of ms){
    const sides=[[m.a,m.b],[m.b,m.a]];
    for(const [me,op] of sides)for(const id of me.roster||[]){if(!S.players.has(id))continue;const x=get(id);x.j++;x.gp+=me.goals||0;x.gc+=op.goals||0;
      if(me.goals>op.goals){x.v++;x.pts+=3;if(op.goals===0&&isZag(id))x.cs++}else if(me.goals===op.goals){x.e++;x.pts++}else x.d++}
    for(const [id,n] of Object.entries(m.scorers||{}))if(S.players.has(id))get(id).g+=n;
    for(const [id,n] of Object.entries(m.assists||{}))if(S.players.has(id))get(id).a+=n;
  }
  return st;
}
/* Ajuste de força pelo desempenho, comparado com a média do grupo: pontos por jogo pesam 0,3, gols por jogo 0,15
   e assistências por jogo 0,1. Zagueiros somam também as vitórias sem sofrer gol por jogo (0,1), comparadas só
   com a média dos zagueiros. Cresce com o número de jogos (jogos ÷ (jogos+3)) e fica entre −0,5 e +0,5. */
function perfAdj(){
  const st=stats();const xs=[...st.entries()].filter(([,x])=>x.j>0);const out=new Map();if(!xs.length)return out;
  const avg=f=>xs.reduce((q,[,x])=>q+f(x)/x.j,0)/xs.length;const avgP=avg(x=>x.pts),avgG=avg(x=>x.g),avgA=avg(x=>x.a);
  const zs=xs.filter(([id])=>isZag(id));const avgCS=zs.length?zs.reduce((q,[,x])=>q+x.cs/x.j,0)/zs.length:0;
  for(const [id,x] of xs){const cs=isZag(id)?(x.cs/x.j-avgCS)*0.1:0;const raw=((x.pts/x.j-avgP)*0.3+(x.g/x.j-avgG)*0.15+(x.a/x.j-avgA)*0.1+cs)*(x.j/(x.j+3));out.set(id,Math.max(-0.5,Math.min(0.5,raw)))}
  return out;
}
function perfLine(pid){const x=stats().get(pid);if(!x||!x.j)return null;
  return el("div",{class:"perfline",text:`${x.j} ${x.j===1?"jogo":"jogos"} · ${x.v}V ${x.e}E ${x.d}D · ${x.g} ${x.g===1?"gol":"gols"} · ${x.a} ${x.a===1?"assist.":"assists."}${isZag(pid)?` · ${x.cs} ${x.cs===1?"vitória":"vitórias"} sem sofrer gol`:""}`})}
const tName=i=>"Time "+TEAMS[i][0];
function newMF(){const d=S.saved;if(!d||d.teams.length<2)return null;
  return {a:0,b:1,extraA:[],extraB:[],g:{},as:{},ownA:0,ownB:0,drawAt:d.at}}
/* corrigir um jogo já lançado: o formulário abre com os times, gols e assistências daquele jogo */
function editMF(m){const sum=s=>(s.roster||[]).reduce((q,id)=>q+((m.scorers||{})[id]||0),0);
  return {edit:{id:m.id,at:m.at,rA:[...(m.a.roster||[])],rB:[...(m.b.roster||[])],names:{...(m.names||{})}},a:m.a.team,b:m.b.team,extraA:[],extraB:[],
    g:{...(m.scorers||{})},as:{...(m.assists||{})},ownA:m.a.own??Math.max(0,m.a.goals-sum(m.a)),ownB:m.b.own??Math.max(0,m.b.goals-sum(m.b))}}
const mfName=id=>getP(id)?.name||MF?.edit?.names?.[id]||"?";
const mfLabel=id=>hasP(id)?dName(id):mfName(id);
function rosterOf(side){if(MF.edit)return [...(side==="A"?MF.edit.rA:MF.edit.rB),...(side==="A"?MF.extraA:MF.extraB)];const d=S.saved;const i=side==="A"?MF.a:MF.b;return [...(d.teams[i]||[]),...((d.subs||[])[i]||[]),...(side==="A"?MF.extraA:MF.extraB)].filter(hasP)}
function sideGoals(side){return rosterOf(side).reduce((q,id)=>q+(MF.g[id]||0),0)+(side==="A"?MF.ownA:MF.ownB)}
function stepper(val,onChange,label,what){what=what||"gol";
  const out=el("output",{text:String(val)});
  return el("span",{class:"step"},el("button",{type:"button","aria-label":`Tirar ${what} de ${label}`,text:"−",onclick:()=>onChange(Math.max(0,val-1))}),out,
    el("button",{type:"button","aria-label":`Somar ${what} para ${label}`,text:"+",onclick:()=>onChange(val+1)}))}
function renderMatchForm(){
  const box=$("matchForm");box.replaceChildren();if(!S.isAdmin)return;
  const ed=MF?.edit;
  /* o formulário manual fica escondido; abre no botão Lançar jogo (ou ao editar um jogo) */
  if(!ed&&!S.mfOpen){box.append(el("button",{class:"btn primary",type:"button",style:"margin-top:16px",text:"+ Lançar jogo",onclick:()=>{S.mfOpen=true;renderMatchForm()}}));return}
  box.append(el("div",{class:"dhead",style:"margin-top:16px"},el("h2",{style:"margin:0",text:ed?"Editar jogo":"Lançar jogo"}),
    ed?null:el("button",{class:"btn",type:"button",text:"Fechar",onclick:()=>{S.mfOpen=false;renderMatchForm()}})));
  if(!ed){
    if(!S.saved){box.append(el("p",{class:"lead",text:"Publique um sorteio na aba Sorteio para lançar os resultados com aqueles times."}));return}
    if(!MF||MF.drawAt!==S.saved.at)MF=newMF();if(!MF)return}
  const n=ed?TEAMS.length:S.saved.teams.length;
  const sel=(v,on)=>{const s=el("select",{},...Array.from({length:n},(_,i)=>el("option",{value:i,text:tName(i)})));s.value=v;s.disabled=!!ed;s.addEventListener("change",()=>on(+s.value));return s};
  const err=el("div",{class:"err-text"});
  const f=el("div",{class:"mform"},el("div",{class:"vs"},sel(MF.a,v=>{MF.a=v;MF.extraA=[];renderMatchForm()}),el("b",{text:"x"}),sel(MF.b,v=>{MF.b=v;MF.extraB=[];renderMatchForm()}),
    el("span",{class:"note",text:ed?`Corrigindo o jogo de ${new Date(ed.at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}`:`Times do sorteio de ${dateBR(S.saved.at)}`})));
  const teams=el("div",{class:"mteams"});
  for(const side of ["A","B"]){
    const idx=side==="A"?MF.a:MF.b;const rs=rosterOf(side);
    const panel=el("div",{class:"mteam",style:`--tc:var(${TEAMS[idx][1]})`},el("div",{class:"hd"},el("h3",{text:tName(idx)}),el("span",{class:"score",text:String(sideGoals(side))})));
    panel.append(el("div",{class:"grow2 ghead2"},el("span"),el("span",{class:"colh",text:"Gols"}),el("span",{class:"colh",text:"Assist."})));
    for(const id of rs)panel.append(el("div",{class:"grow2"},el("span",{text:mfLabel(id)}),stepper(MF.g[id]||0,v=>{MF.g[id]=v;renderMatchForm()},mfName(id)),stepper((MF.as||{})[id]||0,v=>{MF.as=MF.as||{};MF.as[id]=v;renderMatchForm()},mfName(id),"assistência")));
    const own=side==="A"?MF.ownA:MF.ownB;
    panel.append(el("div",{class:"grow2"},el("span",{class:"note",text:"Gol contra / sem autor"}),stepper(own,v=>{side==="A"?MF.ownA=v:MF.ownB=v;renderMatchForm()},"gol sem autor"),el("span",{class:"colh-gap","aria-hidden":"true"})));
    const used=new Set([...rosterOf("A"),...rosterOf("B")]);
    const opts=(ed?[...S.players.keys()].sort((x,y)=>mfName(x).localeCompare(mfName(y),"pt-BR")):[...(S.saved.res||[]),...S.saved.teams.flat()]).filter(id=>hasP(id)&&!used.has(id));
    if(opts.length){const add=el("select",{"aria-label":"Adicionar jogador ao "+tName(idx)},el("option",{value:"",text:ed?"+ Faltou alguém neste time?":"+ Entrou alguém de fora do time?"}),...opts.map(id=>el("option",{value:id,text:dName(id)})));
      add.addEventListener("change",()=>{if(!add.value)return;(side==="A"?MF.extraA:MF.extraB).push(add.value);renderMatchForm()});panel.append(add)}
    teams.append(panel);
  }
  const save=el("button",{class:"btn primary big",type:"button",style:"margin-top:12px"+(ed?";width:100%":""),text:ed?"Salvar correção":"Salvar jogo",onclick:async()=>{
    err.textContent="";if(MF.a===MF.b){err.textContent="Escolha dois times diferentes.";return}
    const rA=rosterOf("A"),rB=rosterOf("B");const scorers={};for(const id of [...rA,...rB])if(MF.g[id])scorers[id]=MF.g[id];
    const assists={};for(const id of [...rA,...rB])if((MF.as||{})[id])assists[id]=MF.as[id];
    const names={};for(const id of [...rA,...rB])names[id]=mfName(id);
    save.disabled=true;
    if(ed){try{await S.db.collection("matches").doc(ed.id).update({a:{team:MF.a,roster:rA,goals:sideGoals("A"),own:MF.ownA},b:{team:MF.b,roster:rB,goals:sideGoals("B"),own:MF.ownB},scorers,assists,names,events:null,editedAt:Date.now(),editedBy:myPid()});
        MF=null;status("Jogo corrigido.");renderResultados()}
      catch(e){console.error(e);save.disabled=false;err.textContent=e.code==="permission-denied"?"Só organizadores corrigem jogos.":"Não deu para salvar a correção. Tente de novo."}
      return}
    const firstOfMonth=!S.matches.some(m=>sameMonth(m.at,Date.now()));
    try{if(firstOfMonth&&!S.notes.locked)await S.db.doc("config/notes").set({locked:true,lockedAt:Date.now(),by:myPid()});
      await S.db.collection("matches").add({at:Date.now(),drawAt:S.saved.at,a:{team:MF.a,roster:rA,goals:sideGoals("A"),own:MF.ownA},b:{team:MF.b,roster:rB,goals:sideGoals("B"),own:MF.ownB},scorers,assists,names});
      const keep={a:MF.a,b:MF.b};MF=newMF();MF.a=keep.a;MF.b=keep.b;status("Jogo salvo.");renderMatchForm()}
    catch(e){console.error(e);save.disabled=false;err.textContent=e.code==="permission-denied"?"Só organizadores lançam resultados. Confira se as regras novas do Firestore foram publicadas.":"Não deu para salvar o jogo. Tente de novo."}}});
  f.append(teams,save);
  if(ed)f.append(el("button",{class:"btn",type:"button",style:"margin-top:8px;width:100%",text:"Cancelar edição",onclick:()=>{MF=null;renderResultados()}}));
  f.append(err);box.append(f);
}
/* Resultados mostra o acumulado do mês (artilharia, desempenho e jogos); dá para ver outros meses ou tudo */
let resMonth=null;
const monthKey=t=>{const d=new Date(t);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")};
const resMonthName=k=>{if(k==="all")return "todo o período";const [y,m]=k.split("-").map(Number);return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long"})+(y!==new Date().getFullYear()?" de "+y:"")};
const cap=x=>x.charAt(0).toUpperCase()+x.slice(1);
function renderMonthHead(ms,months){
  const box=$("monthRes");box.replaceChildren();
  const sel=el("select",{"aria-label":"Escolher o mês"},...months.map(k=>el("option",{value:k,text:cap(resMonthName(k))})),el("option",{value:"all",text:"Todo o período"}));
  sel.value=resMonth;sel.addEventListener("change",()=>{resMonth=sel.value;renderResultados()});
  const nights=new Set(ms.map(m=>dayKey(m.at))).size,goals=ms.reduce((q,m)=>q+(m.a.goals||0)+(m.b.goals||0),0);
  box.append(el("div",{class:"dhead"},el("h2",{text:resMonth==="all"?"Acumulado geral":"Acumulado de "+resMonthName(resMonth)}),sel),
    el("div",{class:"mstats"},...[[nights,nights===1?"noite":"noites"],[ms.length,ms.length===1?"jogo":"jogos"],[goals,goals===1?"gol":"gols"]].map(([v,t])=>el("div",{},el("b",{text:String(v)}),el("span",{text:t})))));
}
function renderDrawHist(){
  const box=$("drawHist");box.replaceChildren();
  const hs=S.drawHist.filter(h=>resMonth==="all"||monthKey(h.at)===resMonth);
  if(!hs.length){box.append(el("p",{class:"note",text:"Os sorteios ficam guardados aqui depois que os jogos da noite acontecem."}));return}
  for(const h of hs){
    const ms=S.matches.filter(m=>m.drawAt===h.at).sort((a,b)=>a.at-b.at);const nm=id=>h.names?.[id]||getP(id)?.name||"?";
    const day=new Date(ms[0]?.at||h.at).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"});
    let champ="";if(ms.length){const {table}=daySummary(ms);const t=table[0];const tied=table.filter(x=>x.pts===t.pts&&(x.gp-x.gc)===(t.gp-t.gc)&&x.gp===t.gp);champ=tied.length>1?" · empate na ponta":` · campeão ${TEAMS[t.i][0]}`}
    const teams=[];for(let i=0;i<(h.k||0);i++)teams.push({i,ids:h.teams["t"+i]||[],subs:(h.subs||{})["t"+i]||[]});
    const tag=id=>{const k=h.pos?.[id]||posOf(getP(id));return k&&POS[k]?el("span",{class:"pos "+k,title:POS[k][0],text:POS[k][1]}):null};
    const body=el("div",{class:"hbody"},
      el("div",{class:"lv-rosters"},...teams.map(t=>el("div",{class:"lv-roster",style:`--tc:var(${TEAMS[t.i][1]})`},el("h3",{text:TEAMS[t.i][0]}),
        el("ul",{},...[...t.ids,...t.subs].map(id=>el("li",{},tag(id),el("span",{class:"n",text:nm(id)+((h.guests||[]).includes(id)?" (convidado)":"")}),t.subs.includes(id)?el("span",{class:"lv-sub",text:"reserva"}):null)))))),
      h.res?.length?el("p",{class:"note",style:"margin:10px 0 0",text:"Reservas: "+h.res.map(nm).join(", ")}):null,
      ms.length?el("div",{class:"hgames"},...ms.map(m=>el("div",{class:"lv-gameline"},TEAMS[m.a.team][0],el("b",{text:` ${m.a.goals} x ${m.b.goals} `}),TEAMS[m.b.team][0]))):null);
    box.append(el("details",{class:"hcard"},el("summary",{},el("b",{text:cap(day)}),el("span",{class:"note",text:` · ${teams.length} times · ${ms.length} ${ms.length===1?"jogo":"jogos"}${champ}`})),body));
  }
}
function renderResultados(){
  renderMatchForm();
  const now=monthKey(Date.now());const months=[...new Set([now,...S.matches.map(m=>monthKey(m.at))])].sort().reverse();
  if(!resMonth||(resMonth!=="all"&&!months.includes(resMonth)))resMonth=now;
  const ms=resMonth==="all"?S.matches:S.matches.filter(m=>monthKey(m.at)===resMonth);
  renderMonthHead(ms,months);
  const st=stats(ms);const rows=[...st.entries()].filter(([,x])=>x.j>0).map(([id,x])=>({id,...x,name:S.players.get(id).name}));
  /* classificação: cada jogador soma o resultado do time em que jogou (vitória 3, empate 1).
     Desempate como nos campeonatos: pontos, vitórias, saldo de gols, gols pró. Empatados em tudo dividem a posição. */
  const rk=$("rankTable");rk.replaceChildren();
  if(!rows.length)rk.append(el("div",{class:"empty",style:"margin-top:10px"},el("strong",{text:"Sem jogos no período"}),"A classificação aparece quando os jogos forem lançados."));
  else{const cmp=(a,b)=>b.pts-a.pts||b.v-a.v||(b.gp-b.gc)-(a.gp-a.gc)||b.gp-a.gp;
    const rr=[...rows].sort((a,b)=>cmp(a,b)||a.name.localeCompare(b.name,"pt-BR"));let pos=0;
    rk.append(el("div",{class:"tbl ltbl rank"},el("table",{},el("thead",{},el("tr",{},...[["#","Posição"],["Jogador",""],["P","Pontos"],["J","Jogos"],["V","Vitórias"],["E","Empates"],["D","Derrotas"],["GP","Gols pró do time"],["GC","Gols contra o time"],["SG","Saldo de gols"],["%","Aproveitamento"]].map(([t,ti])=>el("th",{text:t,title:ti})))),
      el("tbody",{},...rr.map((r,k)=>{if(k===0||cmp(rr[k-1],r))pos=k+1;const sg=r.gp-r.gc;
        return el("tr",{class:pos===1?"first":""},el("td",{class:"n",text:pos+"º"}),el("td",{text:r.name}),...[r.pts,r.j,r.v,r.e,r.d,r.gp,r.gc,(sg>0?"+":"")+sg,Math.round(r.pts/(r.j*3)*100)+"%"].map(v=>el("td",{text:String(v)})))})))))}
  const top=$("topScorers");top.replaceChildren();
  const sc=rows.filter(r=>r.g>0).sort((a,b)=>b.g-a.g||a.j-b.j||a.name.localeCompare(b.name,"pt-BR")).slice(0,10);
  if(!sc.length)top.append(el("div",{class:"empty",style:"margin-top:10px"},el("strong",{text:"Nenhum gol lançado"}),resMonth==="all"?"Os artilheiros aparecem aqui quando os jogos forem lançados.":`Os artilheiros de ${resMonthName(resMonth)} aparecem aqui quando os jogos forem lançados.`));
  else top.append(el("div",{class:"tbl"},el("table",{},el("thead",{},el("tr",{},...["Jogador","Gols","Jogos","Média"].map(t=>el("th",{text:t})))),
    el("tbody",{},...sc.map((r,i)=>el("tr",{},el("td",{},el("span",{class:"n",text:i+1+"º "}),r.name),el("td",{text:String(r.g)}),el("td",{text:String(r.j)}),el("td",{text:fmt(r.g/r.j)})))))));
  const pt=$("perfTable");pt.replaceChildren();
  if(!rows.length)pt.append(el("div",{class:"empty",style:"margin-top:10px"},el("strong",{text:"Sem jogos ainda"}),"Vitórias, empates e derrotas de cada um aparecem aqui."));
  else{const adj=adjMap();rows.sort((a,b)=>b.pts-a.pts||b.v-a.v||b.g-a.g||a.name.localeCompare(b.name,"pt-BR"));
    pt.append(el("div",{class:"tbl"},el("table",{},el("thead",{},el("tr",{},...[["Jogador",""],["J","Jogos"],["V","Vitórias"],["E","Empates"],["D","Derrotas"],["G","Gols"],["A","Assistências"],["VSG","Vitórias sem sofrer gol (só zagueiros)"],["Pts","Pontos"],["Ajuste","Quanto o desempenho soma ou tira da nota geral no sorteio"]].map(([t,ti])=>el("th",{text:t,title:ti})))),
      el("tbody",{},...rows.map(r=>{const a=adj.get(r.id)||0;return el("tr",{},el("td",{text:r.name}),...[r.j,r.v,r.e,r.d,r.g,r.a,isZag(r.id)?r.cs:"–",r.pts].map(v=>el("td",{text:String(v)})),el("td",{class:"n",text:(a>=0?"+":"−")+Math.abs(a).toFixed(2).replace(".",",")}))})))))}
  const ml=$("matchList");ml.replaceChildren();
  if(!ms.length){ml.append(el("div",{class:"empty"},el("strong",{text:resMonth==="all"?"Nenhum jogo lançado":"Nenhum jogo em "+resMonthName(resMonth)}),S.isAdmin?"Lance o primeiro jogo no formulário acima.":"Os jogos aparecem aqui quando os organizadores lançarem."));return}
  renderDrawHist();
  let day="";
  for(const m of ms){
    const dk=dateBR(m.at);if(dk!==day){day=dk;ml.append(el("div",{class:"mday",text:new Date(m.at).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})}))}
    const nm=id=>m.names?.[id]||getP(id)?.name||"?";
    const goalsTxt=side=>{const s=m[side];const parts=(s.roster||[]).filter(id=>m.scorers?.[id]).map(id=>nm(id)+(m.scorers[id]>1?` (${m.scorers[id]})`:""));if(s.own)parts.push(`${s.own} sem autor`);return parts.join(", ")};
    const card=el("div",{class:"mcard"},el("div",{class:"mline"},
      el("span",{class:"dot",style:`--tc:var(${TEAMS[m.a.team][1]})`}),TEAMS[m.a.team][0],el("span",{class:"sc",text:`${m.a.goals} x ${m.b.goals}`}),TEAMS[m.b.team][0],el("span",{class:"dot",style:`--tc:var(${TEAMS[m.b.team][1]})`})));
    const ga=goalsTxt("a"),gb=goalsTxt("b");
    if(ga)card.append(el("div",{class:"who",text:`${TEAMS[m.a.team][0]}: ${ga}`}));
    if(gb)card.append(el("div",{class:"who",text:`${TEAMS[m.b.team][0]}: ${gb}`}));
    if(MF?.edit?.id===m.id)card.classList.add("editing");
    if(S.isAdmin)card.append(el("div",{class:"acts"},el("button",{class:"mini",type:"button",text:"Editar jogo",onclick:()=>{MF=editMF(m);renderResultados();$("matchForm").scrollIntoView({behavior:"smooth",block:"start"})}}),
      confirmBtn("Apagar jogo","Toque de novo para apagar",async()=>{if(MF?.edit?.id===m.id)MF=null;await S.db.collection("matches").doc(m.id).delete()})));
    ml.append(card);
  }
}

/* ---------- ao vivo ---------- */
/* A partida ao vivo é um documento compartilhado (live/current) que todos os celulares escutam.
   Começar e encerrar usam transação, para dois toques ao mesmo tempo não criarem o mesmo jogo duas vezes.
   Ao encerrar, o jogo vira um documento em matches e aparece na aba Resultados. */
const LV={SESSION:90*60,MATCH3:7*60,WEEKDAY:1,H:19,M:30,CLOSE_AFTER:30*60};
const liveRef=()=>doc(fs,"live","current");
S.live=null;let lvTimer=null,lvTimeUpShown=null,lvWake=null;
function lvSessionStart(ref){const d=new Date(ref);d.setHours(LV.H,LV.M,0,0);d.setDate(d.getDate()-((d.getDay()-LV.WEEKDAY+7)%7));return d.getTime()}
function lvWindow(now){const s0=lvSessionStart(now),end=s0+(LV.SESSION+LV.CLOSE_AFTER)*1000;
  if(now>=s0&&now<end)return {open:true,next:s0};return {open:false,next:now<s0?s0:s0+7*24*3600e3}}
function lvFmt(){return (S.saved?.teams?.length||0)===2?"2":"3"}
/* estado da partida do sorteio publicado; se ainda não existe, o padrão do formato */
function lvState(){
  const L=S.live;if(L&&S.saved&&L.drawAt===S.saved.at)return L;
  const fmt=lvFmt();return {drawAt:S.saved?.at,fmt,status:fmt==="2"?"ready":"setup",a:fmt==="2"?0:null,b:fmt==="2"?1:null,queue:[],streak:{},gameNo:0,events:[],startedAt:null,sessionStart:null,dur:fmt==="2"?LV.SESSION:LV.MATCH3,fresh:true}}
function lvOpen(){if(!S.saved)return false;const L=lvState();if(L.status==="running")return true;
  /* depois de encerrar o ao vivo, o resumo do dia fica na tela por 12 horas */
  if(L.status==="done"&&L.closedAt&&Date.now()-L.closedAt<12*3600e3)return true;if((L.forceUntil||0)>Date.now())return true;if(drawUsed())return false;return lvWindow(Date.now()).open}
const lvIds=i=>[...(S.saved.teams[i]||[]),...((S.saved.subs||[])[i]||[])].filter(hasP);
const lvIsSub=(i,id)=>((S.saved.subs||[])[i]||[]).includes(id);
const lvTeam=i=>({name:TEAMS[i][0],c:`var(${TEAMS[i][1]})`,ids:lvIds(i)});
function lvElapsed(L){return L.status==="running"&&L.startedAt?Math.max(0,(Date.now()-L.startedAt)/1000):0}
function lvRemaining(L){return Math.max(0,(L.dur||LV.MATCH3)-lvElapsed(L))}
const lvMin=L=>Math.min(Math.ceil((L.dur||0)/60),Math.floor(lvElapsed(L)/60)+1);
const lvClock=s=>{s=Math.ceil(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=String(s%60).padStart(2,"0");return h?`${h}:${String(m).padStart(2,"0")}:${x}`:`${String(m).padStart(2,"0")}:${x}`};
function lvGoals(L,side){return (L.events||[]).filter(e=>e.kind==="goal"&&e.team===L[side]).length}
const lvMe=()=>myPid()||("v:"+(auth?.currentUser?.uid||"anon"));
function lvMyName(){return S.players.get(myPid())?.name||"Alguém"}
function lvToast(msg,action){const old=document.querySelector(".lv-toast");if(old)old.remove();const t=el("div",{class:"lv-toast",role:"status"},el("span",{text:msg}),action?el("button",{type:"button",class:"lv-toastbtn",text:action.label,onclick:()=>{t.remove();action.fn()}}):null);document.body.append(t);setTimeout(()=>t.remove(),action?6000:3400)}
async function lvAwake(on){try{if(on&&!lvWake&&navigator.wakeLock)lvWake=await navigator.wakeLock.request("screen");if(!on&&lvWake){await lvWake.release();lvWake=null}}catch(e){lvWake=null}}
/* regra do rodízio com 3 times */
function lvPlan(L,ga,gb){
  if(L.fmt==="2"||!(L.queue||[]).length)return {out:null,why:L.fmt==="2"?"":"Só dois times: os dois continuam."};
  if((L.gameNo||0)===0){if(ga!==gb){const l=ga>gb?L.b:L.a;return {out:l,why:`${TEAMS[l][0]} perdeu o 1º jogo e sai.`}}return {out:null,pick:true,why:"Empate no 1º jogo: escolham quem sai."}}
  const l=(L.streak?.[L.a]||0)>=2?L.a:L.b;return {out:l,why:`${TEAMS[l][0]} jogou 2 seguidas e sai.`};
}
/* ---------- ações ---------- */
async function lvTx(fn){try{await runTransaction(fs,async tx=>{const snap=await tx.get(liveRef());const cur=snap.exists()?snap.data():null;await fn(tx,cur)});return true}
  catch(e){console.error(e);status(e.code==="permission-denied"?"Sem permissão para mexer na partida. Confira se as regras novas do Firestore foram publicadas.":e.message&&e.message.startsWith("lv:")?e.message.slice(3):"Não deu para atualizar a partida. Confira a internet e tente de novo.",true);return false}}
async function lvPickStart(a,b){
  const n=S.saved.teams.length;const queue=[...Array(n).keys()].filter(i=>i!==a&&i!==b);const now=Date.now();
  const ok=await lvTx(async(tx,cur)=>{if(cur&&cur.drawAt===S.saved.at&&cur.status!=="setup")throw new Error("lv:A partida já começou em outro celular.");
    tx.set(liveRef(),{drawAt:S.saved.at,fmt:"3",status:"running",a,b,queue,streak:{[a]:1,[b]:1},gameNo:0,startedAt:now,sessionStart:now,dur:LV.MATCH3,events:[{id:"s"+now,kind:"start",by:myPid(),at:now}],forceUntil:cur?.forceUntil||0})});
  if(ok){lvAwake(true);lvToast(`1º jogo: ${TEAMS[a][0]} x ${TEAMS[b][0]}. ${queue.map(i=>TEAMS[i][0]).join(" e ")} espera.`)}
}
async function lvStart(){
  const L0=lvState();const now=Date.now();
  const ok=await lvTx(async(tx,cur)=>{const L=cur&&cur.drawAt===S.saved.at?cur:L0;if(L.status!=="ready")throw new Error("lv:A partida já começou em outro celular.");
    tx.set(liveRef(),{...L,fresh:null,drawAt:S.saved.at,status:"running",startedAt:now,sessionStart:L.sessionStart||now,dur:L.fmt==="2"?LV.SESSION:LV.MATCH3,events:[{id:"s"+now,kind:"start",by:myPid(),at:now}]})});
  if(ok)lvAwake(true);
}
async function lvGoal(ev){try{await updateDoc(liveRef(),{events:arrayUnion(ev)});lvToast(`Gol do ${TEAMS[ev.team][0]}${ev.scorer&&ev.scorer!=="?"?`: ${ev.own?"contra de ":""}${getP(ev.scorer)?.name||""}`:""} aos ${ev.min}'.`)}
  catch(e){console.error(e);status("Não deu para marcar o gol. Confira a internet e tente de novo.",true)}}
async function lvUndo(ev){try{await updateDoc(liveRef(),{events:arrayRemove(ev)});lvToast("Gol cancelado.")}catch(e){console.error(e);status("Não deu para cancelar o gol.",true)}}
/* × no canto do lance: 1º toque pergunta, 2º toque cancela o gol */
function lvXBtn(ev){const b=el("button",{class:"lv-gx",type:"button","aria-label":"Cancelar este gol",title:"Cancelar este gol",text:"×"});
  b.addEventListener("click",()=>{if(b.dataset.c!=="1"){b.dataset.c="1";b.classList.add("ask");b.textContent="Cancelar gol?";setTimeout(()=>{b.dataset.c="";b.classList.remove("ask");b.textContent="×"},4000);return}
    b.disabled=true;lvUndo(ev)});return b}
async function lvEnd(expectedGame,chosenOut){
  const now=Date.now();let summary="";
  const firstOfMonth=!S.matches.some(m=>{const x=new Date(m.at),y=new Date(now);return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()});
  const ok=await lvTx(async(tx,L)=>{
    if(!L||L.drawAt!==S.saved.at||L.status!=="running"||(L.gameNo||0)!==expectedGame)throw new Error("lv:Essa partida já foi encerrada em outro celular.");
    const ga=lvGoals(L,"a"),gb=lvGoals(L,"b");const goalsEv=(L.events||[]).filter(e=>e.kind==="goal");
    const side=t=>{const ids=lvIds(t);const own=goalsEv.filter(e=>e.team===t&&(e.own||e.scorer==="?")).length;return {team:t,roster:ids,goals:goalsEv.filter(e=>e.team===t).length,own}};
    const scorers={};for(const e of goalsEv)if(!e.own&&e.scorer&&e.scorer!=="?")scorers[e.scorer]=(scorers[e.scorer]||0)+1;
    const assists={};for(const e of goalsEv)if(e.assist)assists[e.assist]=(assists[e.assist]||0)+1;
    const names={};for(const t of [L.a,L.b])for(const id of lvIds(t))names[id]=getP(id).name;
    const minutes=Math.round(Math.min(L.dur,(now-L.startedAt)/1000)/60);
    tx.set(doc(collection(fs,"matches")),{at:now,drawAt:S.saved.at,a:side(L.a),b:side(L.b),scorers,assists,names,minutes,source:"live",by:myPid(),events:goalsEv.map(e=>({team:e.team,scorer:e.scorer,assist:e.assist||null,own:!!e.own,min:e.min,by:e.by}))});
    if(L.fmt==="2"){tx.set(liveRef(),{...L,status:"done",gameNo:(L.gameNo||0)+1,endedAt:now});summary=`Pelada encerrada: ${TEAMS[L.a][0]} ${ga} x ${gb} ${TEAMS[L.b][0]}. O resultado já está na aba Resultados.`;return}
    const plan=lvPlan(L,ga,gb);const out=plan.out??chosenOut;if(out==null)throw new Error("lv:Escolha quem sai antes de salvar.");
    const stay=out===L.a?L.b:L.a;const queue=[...(L.queue||[]),out];const inn=queue.shift();const streak={...(L.streak||{})};streak[out]=0;streak[stay]=(streak[stay]||0)+1;streak[inn]=1;
    tx.set(liveRef(),{...L,status:"ready",a:stay,b:inn,queue,streak,gameNo:(L.gameNo||0)+1,startedAt:null,events:[]});
    summary=`Jogo salvo nos Resultados. Próximo: ${TEAMS[stay][0]} x ${TEAMS[inn][0]}.`;
  });
  if(!ok)return;lvAwake(false);lvToast(summary);
  if(firstOfMonth&&!S.notes.locked)S.db.doc("config/notes").set({locked:true,lockedAt:now,by:myPid()}).catch(e=>console.error(e));
}
/* Desfaz o início da partida (começaram sem querer ou com os times errados). Nada vai para Resultados e os gols marcados são apagados.
   No 1º jogo com 3 times volta para a escolha de quem começa; nos outros casos volta para antes do início, com os mesmos times. */
async function lvCancelStart(expectedGame){
  let msg="";
  const ok=await lvTx(async(tx,L)=>{
    if(!L||L.drawAt!==S.saved.at||L.status!=="running"||(L.gameNo||0)!==expectedGame)throw new Error("lv:Essa partida já foi encerrada ou cancelada em outro celular.");
    const first=(L.gameNo||0)===0;
    if(L.fmt==="3"&&first){tx.set(liveRef(),{...L,status:"setup",a:null,b:null,queue:[],streak:{},startedAt:null,sessionStart:null,events:[]});msg="Início cancelado. Escolham de novo quem começa."}
    else{tx.set(liveRef(),{...L,status:"ready",startedAt:null,sessionStart:first?null:L.sessionStart,events:[]});msg="Início cancelado. A partida voltou para antes do começo."}});
  if(ok){S.lvPick=[];lvAwake(false);lvToast(msg)}
}
/* Encerra a partida ao vivo do dia (organizador). Só quando não há jogo rolando; os jogos já encerrados continuam em Resultados. */
async function lvCloseDay(){
  const ok=await lvTx(async(tx,cur)=>{const L=cur&&cur.drawAt===S.saved.at?cur:lvState();
    if(L.status==="running")throw new Error("lv:Tem uma partida rolando. Encerre ou cancele a partida antes de fechar o ao vivo.");
    tx.set(liveRef(),{...L,fresh:null,drawAt:S.saved.at,status:"done",forceUntil:0,closedAt:Date.now(),closedBy:myPid()})});
  if(ok){lvAwake(false);lvToast("Ao vivo encerrado. Valeu, Peixe!")}
}
async function lvReopen(){const until=Date.now()+3*3600e3;
  const ok=await lvTx(async(tx,cur)=>{const L=cur&&cur.drawAt===S.saved.at?cur:lvState();
    tx.set(liveRef(),{...L,fresh:null,drawAt:S.saved.at,status:L.a!=null?"ready":"setup",forceUntil:until,closedAt:null})});
  if(ok)lvToast("Ao vivo reaberto pelas próximas 3 horas.")}
async function lvForceOpen(){const until=Date.now()+3*3600e3;
  const ok=await lvTx(async(tx,cur)=>{const L=cur&&cur.drawAt===S.saved.at?cur:lvState();tx.set(liveRef(),{...L,fresh:null,drawAt:S.saved.at,forceUntil:until})});
  if(ok)lvToast("Partida ao vivo aberta pelas próximas 3 horas.")}
/* ---------- tela ---------- */
function lvSheet(tc,...kids){document.body.classList.add("lv-lock");document.querySelector(".lv-toast")?.remove();const sheet=el("div",{class:"lv-sheet",role:"dialog","aria-modal":"true",style:`--tc:${tc}`},...kids);
  const scrim=el("div",{class:"lv-scrim",onclick:e=>{if(e.target===scrim)lvClose()}},sheet);$("lvLayer").replaceChildren(scrim);const f=sheet.querySelector("button");if(f)f.focus()}
function lvClose(){$("lvLayer").replaceChildren();document.body.classList.remove("lv-lock")}
document.addEventListener("keydown",e=>{if(e.key==="Escape")lvClose()});
/* Lançar gol no celular em 2 toques: 1) quem fez (grade de botões grandes); 2) quem deu a assistência ou "Sem assistência".
   O gol é salvo no 2º toque. "Não sei quem fez" e gol contra salvam no 1º toque. Para cancelar, o × no canto do lance. */
function lvOpenGoal(L,t){
  const T=lvTeam(t),opp=t===L.a?L.b:L.a,O=lvTeam(opp);const min=lvMin(L);const gameNo=L.gameNo||0;
  const save=(scorer,own,assist)=>{const cur=lvState();if(cur.status!=="running"||(cur.gameNo||0)!==gameNo){lvClose();status("Essa partida já foi encerrada.",true);return}
    lvClose();lvGoal({id:"g"+Date.now()+Math.random().toString(36).slice(2,6),kind:"goal",team:t,scorer,own,assist:assist||null,min,by:lvMe(),at:Date.now()})};
  const pbtn=(id,onclick,cls)=>{const p=getP(id);return el("button",{type:"button",class:"lv-pbtn"+(cls?" "+cls:""),onclick},el("span",{class:"nm",text:p.name}),el("span",{class:"ps",text:POS[posOf(p)]?.[1]||""}))};
  const order=ids=>[...ids].sort((a,b)=>POS_KEYS.indexOf(posOf(getP(b)))-POS_KEYS.indexOf(posOf(getP(a)))||getP(a).name.localeCompare(getP(b).name,"pt-BR"));
  const body=el("div",{class:"lv-gbody"}),head=el("div",{class:"lv-ghead"}),foot=el("div",{class:"lv-gfoot"});
  function step1(){
    head.replaceChildren(el("h3",{text:`Gol do ${T.name} · ${min}'`}),el("p",{class:"lv-q",text:"Quem fez o gol?"}));
    body.replaceChildren(el("div",{class:"lv-pgrid"},...order(T.ids).map(id=>pbtn(id,()=>step2(id)))),
      el("button",{type:"button",class:"lv-link",text:`Foi gol contra de alguém do ${O.name}?`,onclick:stepOwn}));
    foot.replaceChildren(el("button",{type:"button",class:"btn",text:"Cancelar",onclick:lvClose}),el("button",{type:"button",class:"btn lv-unk",text:"Não sei quem fez",onclick:()=>save("?",false,null)}));
  }
  function step2(scorer){
    const mates=order(T.ids.filter(id=>id!==scorer));
    head.replaceChildren(el("h3",{text:`Gol de ${getP(scorer).name} · ${min}'`}),el("p",{class:"lv-q",text:"Quem deu a assistência?"}));
    body.replaceChildren(el("div",{class:"lv-pgrid"},...mates.map(id=>pbtn(id,()=>save(scorer,false,id)))),
      el("button",{type:"button",class:"lv-link",text:"← Trocar quem fez o gol",onclick:step1}));
    foot.replaceChildren(el("button",{type:"button",class:"btn primary big lv-noast",text:"Sem assistência · salvar gol",onclick:()=>save(scorer,false,null)}));
  }
  function stepOwn(){
    head.replaceChildren(el("h3",{text:`Gol contra · ${min}'`}),el("p",{class:"lv-q",text:`Quem do ${O.name} fez contra? O gol conta para o ${T.name}.`}));
    body.replaceChildren(el("div",{class:"lv-pgrid"},...order(O.ids).map(id=>pbtn(id,()=>save(id,true,null),"own"))),
      el("button",{type:"button",class:"lv-link",text:"← Voltar",onclick:step1}));
    foot.replaceChildren(el("button",{type:"button",class:"btn",text:"Cancelar",onclick:lvClose}));
  }
  lvSheet(T.c,head,body,foot);step1();
}
function lvOpenEnd(L){
  const ga=lvGoals(L,"a"),gb=lvGoals(L,"b"),A=lvTeam(L.a),B=lvTeam(L.b);const gameNo=L.gameNo||0;
  const sum=el("div",{class:"lv-sum"},el("i",{style:`--tc:${A.c}`}),A.name,el("span",{class:"n",text:`${ga} x ${gb}`}),B.name,el("i",{style:`--tc:${B.c}`}));
  const save=el("button",{class:"btn primary big",type:"button",style:"flex:1",text:L.fmt==="2"?"Salvar resultado":"Salvar e montar o próximo"});
  const rule=el("div",{class:"lv-rule"});let chosen=null;const plan=lvPlan(L,ga,gb);
  const paint=()=>{if(L.fmt==="2"){rule.replaceChildren(el("b",{text:ga===gb?"Empate. ":`${ga>gb?A.name:B.name} venceu. `}),`${Math.round(Math.min(L.dur,lvElapsed(L))/60)} minutos de jogo.`);return}
    const out=plan.out??chosen;if(out==null){rule.replaceChildren(el("b",{text:plan.why}));save.disabled=true;return}
    const stay=out===L.a?L.b:L.a;rule.replaceChildren(el("b",{text:plan.pick?`${TEAMS[out][0]} sai (escolhido no empate). `:plan.why+" "}),`Próximo jogo: ${TEAMS[stay][0]} x ${TEAMS[L.queue[0]][0]}.`);save.disabled=false};
  const chooser=plan.pick?el("div",{class:"lv-chips",style:"justify-content:center;margin-top:10px"},...[L.a,L.b].map(t=>el("button",{type:"button",class:"lv-chip","aria-pressed":"false",text:`Sai o ${TEAMS[t][0]}`,onclick:ev=>{chosen=t;for(const x of ev.currentTarget.parentElement.children)x.setAttribute("aria-pressed",String(x===ev.currentTarget));paint()}}))):null;
  save.addEventListener("click",async()=>{save.disabled=true;await lvEnd(gameNo,chosen);lvClose()});
  lvSheet("var(--vest)",el("h3",{text:L.fmt==="2"?"Encerrar pelada":"Encerrar partida"}),sum,rule,chooser,el("p",{class:"note",text:"O jogo vai para a aba Resultados com os gols e as assistências."}),
    el("div",{class:"lv-actions"},el("button",{class:"btn",type:"button",text:"Voltar",onclick:lvClose}),save));paint();
}
function lvRoster(t,L,goalsById){const T=lvTeam(t);
  return el("div",{class:"lv-roster",style:`--tc:${T.c}`},el("h3",{text:T.name}),el("ul",{},...T.ids.map(id=>{const g=goalsById[id]||0;const p={id,...getP(id)};
    return el("li",{},posTag(p,true),el("span",{class:"n",text:dName(id)}),lvIsSub(t,id)?el("span",{class:"lv-sub",text:"reserva"}):null,g?el("span",{class:"lv-balls",text:g+(g>1?" gols":" gol")}):null)})))}
function lvLastNight(box){const dr=el("section",{class:"dayres lv-night"});renderDayResults(dr,false);if(dr.childNodes.length)box.append(dr)}
function lvWaiting(box){
  const w=lvWindow(Date.now());const when=new Date(w.next);const has=!!S.saved&&!drawUsed();
  const cd=el("div",{class:"lv-cd",id:"lvCountdown"});
  box.append(el("div",{class:"lv-gate"},el("img",{src:"logo.jpg",alt:"Escudo do Peixe Futebol Clube",class:"lv-crest"}),
    has?el("span",{class:"lv-state ok",text:"Times publicados"}):el("span",{class:"lv-state wait",text:"Aguardando o sorteio"}),
    el("h2",{text:"Próxima pelada"}),el("div",{class:"lv-when",text:`${when.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})} · 19:30`}),cd,
    el("p",{class:"note",text:has?"A partida ao vivo abre sozinha na segunda às 19:30, com os times publicados.":"A partida ao vivo abre na segunda às 19:30, depois que os organizadores publicarem os times."}),
    has&&S.isAdmin?el("button",{class:"btn",type:"button",text:"Abrir agora (fora do horário)",onclick:lvForceOpen}):null,
    !has&&S.isAdmin?el("p",{class:"note"},el("b",{text:"Organizador: "}),"publique o sorteio na aba Sorteio para liberar esta tela."):null));
  lvLastNight(box);
  if(has){const pv=el("div",{class:"lv-rosters",style:"margin-top:14px"});S.saved.teams.forEach((_,i)=>pv.append(lvRoster(i,null,{})));box.append(pv)}
  lvTick();
}
function renderAoVivo(){
  const box=$("v-aovivo");box.replaceChildren();
  if(gated()){const n=pending().length;box.append(el("div",{class:"banner",style:"margin:0 0 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"},
    el("span",{style:"flex:1;min-width:200px",text:`Falta você avaliar ${n} ${n===1?"jogador":"jogadores"}. Jogadores, Sorteio e Resultados liberam depois disso.`}),
    el("button",{class:"btn primary",type:"button",text:"Avaliar agora",onclick:()=>setTab("avaliar")})))}
  if(!lvOpen()){lvWaiting(box);return}
  const L=lvState();const fmt=L.fmt;
  if(L.status==="done"){const ms=S.matches.filter(m=>m.drawAt===S.saved.at).sort((a,b)=>a.at-b.at);box.append(el("div",{class:"lv-gate"},el("img",{src:"logo.jpg",alt:"",class:"lv-crest"}),el("span",{class:"lv-state",text:"Pelada encerrada"}),el("h2",{text:"Valeu, Peixe!"}),
    el("p",{class:"note",text:ms.length?`${ms.length===1?"Foi 1 jogo":`Foram ${ms.length} jogos`} hoje. O resumo da noite está logo abaixo.`:"Nenhum jogo foi encerrado hoje."}),...ms.map(m=>el("div",{class:"lv-gameline"},TEAMS[m.a.team][0],el("b",{text:` ${m.a.goals} x ${m.b.goals} `}),TEAMS[m.b.team][0])),
    el("p",{class:"note",text:`A próxima abre ${new Date(lvWindow(Date.now()+12*3600e3).next).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})} às 19:30.`}),
    S.isAdmin?confirmBtn("Reabrir o ao vivo","Toque de novo: reabre por 3 horas",lvReopen,"btn"):null));lvLastNight(box);return}
  /* placar */
  const board=el("section",{class:"lv-board","aria-label":"Placar"});
  const st=L.status==="setup"?["paused","Não começou"]:L.status==="ready"?["paused","Não começou"]:lvRemaining(L)<=0?["over","Fim do tempo"]:["","Ao vivo"];
  const metaTxt=fmt==="2"?"2 times · jogo direto até o fim":`${(L.gameNo||0)+1}º jogo de hoje · 7 min`;
  board.append(el("div",{class:"lv-meta"},el("span",{class:"lv-live "+st[0]},el("i"),st[1]),el("span",{text:metaTxt})));
  if(L.status==="setup"){board.append(el("div",{class:"lv-setupmsg"},el("b",{text:"Quem começa?"}),el("span",{text:"Escolham abaixo os 2 times do 1º jogo. O outro espera."})))}
  else{const A=lvTeam(L.a),B=lvTeam(L.b);board.style.setProperty("--ca",A.c);board.style.setProperty("--cb",B.c);
    const sideEl=(side,T)=>{const t=L[side];const s=L.streak?.[t]||0;return el("div",{class:"lv-side",style:`--tc:${T.c}`},el("div",{class:"lv-tname"},el("i"),T.name),el("div",{class:"lv-goals",text:String(lvGoals(L,side))}),
      fmt==="3"?el("div",{class:"lv-streak",text:(L.gameNo||0)===0?"1º jogo":s>=2?"2º jogo seguido · sai no fim":"entrou agora"}):null)};
    board.append(el("span",{class:"lv-bar l"}),el("span",{class:"lv-bar r"}),el("div",{class:"lv-score"},sideEl("a",A),el("div",{class:"lv-mid"},el("div",{class:"lv-x",text:"x"}),el("div",{class:"lv-clock",id:"lvClock"})),sideEl("b",B)),
      el("div",{class:"lv-tbar"},el("i",{id:"lvTbar"})))}
  if(fmt==="3")board.append(el("div",{class:"lv-sess"},"Pelada 1h30",el("span",{class:"lv-sbar"},el("i",{id:"lvSbar"})),el("span",{},"faltam ",el("b",{id:"lvSess"}))));
  box.append(board);
  /* controles: qualquer jogador ou organizador; convidados (sem login) só marcam gols e assistências */
  const ctl=el("section",{class:"lv-panel"});
  if(!myPid()){
    if(L.status==="running"){const A=lvTeam(L.a),B=lvTeam(L.b);
      ctl.append(el("div",{class:"lv-goalbtns"},el("button",{class:"lv-goalbtn",type:"button",style:`--tc:${A.c}`,onclick:()=>lvOpenGoal(lvState(),L.a)},"+ Gol "+A.name,el("small",{text:"toque para marcar"})),
        el("button",{class:"lv-goalbtn",type:"button",style:`--tc:${B.c}`,onclick:()=>lvOpenGoal(lvState(),L.b)},"+ Gol "+B.name,el("small",{text:"toque para marcar"}))),
        el("p",{class:"note",style:"margin:8px 0 0",text:"Você está como convidado: dá para marcar gols e assistências. Começar e encerrar a partida fica com quem entrou com o celular."}))}
    else ctl.append(el("p",{class:"note",style:"margin:0",text:L.status==="setup"?"A partida ainda não começou. Quem entrou com o celular escolhe os times e dá o início.":"A próxima partida ainda não começou. Assim que começar, os botões de gol aparecem aqui."}));
  }else if(L.status==="setup"){const pick=S.lvPick||[];const n=S.saved.teams.length;
    ctl.append(el("h2",{text:"Escolha quem começa"}));
    const grid=el("div",{class:"lv-pick"});
    for(let i=0;i<n;i++){const T=lvTeam(i);const on=pick.includes(i);grid.append(el("button",{type:"button",class:"lv-pickbtn",style:`--tc:${T.c}`,"aria-pressed":String(on),onclick:()=>{S.lvPick=on?pick.filter(x=>x!==i):[...pick,i].slice(-2);renderAoVivo()}},el("i"),T.name,el("small",{text:on?"Começa jogando":"Toque para escolher"})))}
    ctl.append(grid,el("button",{class:"btn primary big",type:"button",style:"width:100%;margin-top:10px",disabled:pick.length!==2,text:pick.length===2?`Começar ${TEAMS[pick[0]][0]} x ${TEAMS[pick[1]][0]}`:"Escolha 2 times",onclick:()=>lvPickStart(pick[0],pick[1])}),
      el("p",{class:"note",style:"margin:8px 0 0",text:"No 1º jogo o perdedor sai. Depois, sai sempre quem jogou 2 seguidas."}));
  }else{
    if(L.status==="running"){const A=lvTeam(L.a),B=lvTeam(L.b);
      ctl.append(el("div",{class:"lv-goalbtns"},el("button",{class:"lv-goalbtn",type:"button",style:`--tc:${A.c}`,onclick:()=>lvOpenGoal(lvState(),L.a)},"+ Gol "+A.name,el("small",{text:"toque para marcar"})),
        el("button",{class:"lv-goalbtn",type:"button",style:`--tc:${B.c}`,onclick:()=>lvOpenGoal(lvState(),L.b)},"+ Gol "+B.name,el("small",{text:"toque para marcar"}))),
        el("button",{class:"btn big lv-end",type:"button",text:fmt==="2"?"Encerrar pelada":"Encerrar partida",onclick:()=>lvOpenEnd(lvState())}),
        el("div",{class:"lv-cancel"},confirmBtn("Cancelar início",(L.events||[]).some(e=>e.kind==="goal")?"Toque de novo: volta para antes do começo e apaga os gols marcados":"Toque de novo: volta para antes do começo",()=>lvCancelStart(L.gameNo||0),"mini danger")))}
    else ctl.append(el("button",{class:"btn primary big",type:"button",style:"width:100%",text:fmt==="2"?"Começar a pelada":`Começar ${TEAMS[L.a][0]} x ${TEAMS[L.b][0]}`,onclick:lvStart}));
    ctl.append(el("p",{class:"note",style:"margin:8px 0 0",text:fmt==="2"?"Com 2 times o jogo vai direto até o fim da 1h30. As substituições não precisam ser marcadas.":"Qualquer jogador pode começar e encerrar a partida e marcar gols. O seu nome fica registrado."}));
  }
  if(S.isAdmin&&L.status!=="running")ctl.append(el("div",{class:"lv-closeday"},confirmBtn("Encerrar o ao vivo de hoje","Toque de novo: fecha a partida ao vivo para todos",lvCloseDay,"btn danger")));
  box.append(ctl);
  /* lances */
  const tl=el("ul",{class:"lv-tl"});const evs=[...(L.events||[])].reverse();
  for(const e of evs){
    if(e.kind==="goal"){const T=lvTeam(e.team);const p=getP(e.scorer);const as=e.assist?getP(e.assist):null;const who=e.by===lvMe()?"você":String(e.by||"").startsWith("v:")?"convidado":(S.players.get(e.by)?.name||"alguém");
      tl.append(el("li",{style:`--tc:${T.c}`},el("span",{class:"min",text:e.min+"'"}),el("span",{class:"dot"}),
        el("span",{class:"what"},el("b",{text:e.own?`Gol contra de ${p?.name||"?"}`:e.scorer==="?"?"Gol (autor não informado)":`Gol de ${p?.name||"?"}`}),el("small",{text:`${T.name}${as?` · assistência de ${as.name}`:""} · marcado por ${who}`})),
        (S.isAdmin||e.by===lvMe())&&L.status==="running"?lvXBtn(e):el("span")))}
    else{const who=e.by===myPid()?"você começou":`começada por ${S.players.get(e.by)?.name||"alguém"}`;tl.append(el("li",{class:"sys"},el("span",{class:"min",text:"1'"}),el("span",{class:"dot"}),el("span",{class:"what",text:`Bola rolando · ${who}`}),el("span")))}
  }
  if(!evs.length)tl.append(el("li",{class:"sys"},el("span"),el("span"),el("span",{class:"what",text:L.status==="setup"?"Nenhum lance ainda. Escolham os times e comecem o 1º jogo.":"Nenhum lance ainda."}),el("span")));
  box.append(el("section",{class:"lv-panel"},el("h2",{text:"Lances"}),tl));
  /* em campo, próximos, jogos de hoje */
  const gById={};for(const e of L.events||[])if(e.kind==="goal"&&!e.own&&e.scorer)gById[e.scorer]=(gById[e.scorer]||0)+1;
  const rs=el("div",{class:"lv-rosters"});const on=L.status==="setup"?S.saved.teams.map((_,i)=>i):[L.a,L.b];for(const t of on)rs.append(lvRoster(t,L,gById));
  box.append(el("section",{class:"lv-panel"},el("h2",{text:L.status==="setup"?"Times":"Em campo"}),rs));
  if(fmt==="3"&&L.status!=="setup"){const q=el("div",{class:"lv-queue"});
    (L.queue||[]).forEach((t,i)=>{const T=lvTeam(t);q.append(el("div",{class:"lv-qitem",style:`--tc:${T.c}`},el("b",{text:T.name}),el("span",{class:"note",text:T.ids.map(id=>getP(id).name.split(" ")[0]).join(", ")}),i===0?el("span",{class:"lv-tag",text:"Entra a seguir"}):null))});
    const res=(S.saved.res||[]).filter(hasP);if(res.length)q.append(el("div",{class:"lv-qitem",style:"--tc:var(--line)"},el("b",{text:"Reservas"}),el("span",{class:"note",text:res.map(id=>getP(id).name).join(", ")})));
    const plan=lvPlan(L,lvGoals(L,"a"),lvGoals(L,"b"));
    box.append(el("section",{class:"lv-panel"},el("h2",{text:"Próximos"}),q,el("p",{class:"note",style:"margin:8px 0 0",text:`No 1º jogo o perdedor sai (no empate, vocês escolhem). Depois, sai sempre quem jogou 2 seguidas.${L.status==="running"?" Se acabasse agora: "+plan.why:""}`})))}
  const ms=S.matches.filter(m=>m.drawAt===S.saved.at).sort((a,b)=>a.at-b.at);
  if(fmt==="3")box.append(el("section",{class:"lv-panel"},el("h2",{text:"Jogos de hoje"}),ms.length?el("ol",{class:"lv-games"},...ms.map(m=>el("li",{},el("i",{style:`--tc:var(${TEAMS[m.a.team][1]})`}),TEAMS[m.a.team][0],el("b",{text:`${m.a.goals} x ${m.b.goals}`}),TEAMS[m.b.team][0],el("i",{style:`--tc:var(${TEAMS[m.b.team][1]})`})))):el("p",{class:"note",text:"Nenhum jogo encerrado ainda."})));
  lvTick();
}
function lvTick(){
  if(myPid()?tab!=="aovivo":!(S.visitor&&vtab==="aovivo"))return;
  const c=$("lvCountdown");if(c){const w=lvWindow(Date.now());if(lvOpen()){renderAoVivo();return}let t=Math.max(0,Math.floor((w.next-Date.now())/1000));
    c.replaceChildren(...[[Math.floor(t/86400),"dias"],[Math.floor(t%86400/3600),"horas"],[Math.floor(t%3600/60),"min"],[t%60,"seg"]].map(([n,l])=>el("div",{},el("b",{text:String(n).padStart(2,"0")}),el("span",{text:l}))));return}
  const L=lvState();const k=$("lvClock");
  if(k){const r=L.status==="running"?lvRemaining(L):(L.fmt==="2"?LV.SESSION:LV.MATCH3);k.textContent=lvClock(r);k.classList.toggle("warn",r<=60&&r>0);k.classList.toggle("over",L.status==="running"&&r<=0);
    const tb=$("lvTbar");if(tb)tb.style.width=(L.status==="running"?Math.min(100,100*lvElapsed(L)/L.dur):0)+"%";
    if(L.status==="running"&&r<=0&&lvTimeUpShown!==`${L.drawAt}:${L.gameNo}`){lvTimeUpShown=`${L.drawAt}:${L.gameNo}`;lvToast(L.fmt==="2"?"Fim da 1h30. Toque em Encerrar pelada para salvar.":"Tempo esgotado. Toque em Encerrar partida para salvar o resultado.");renderAoVivo();return}}
  const se=$("lvSess");if(se){const used=L.sessionStart?(Date.now()-L.sessionStart)/1000:0;se.textContent=lvClock(Math.max(0,LV.SESSION-used));const sb=$("lvSbar");if(sb)sb.style.width=Math.min(100,100*used/LV.SESSION)+"%"}
}
setInterval(lvTick,500);

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
function confirmBtn(label,confirmLabel,fn,cls){
  const b=el("button",{class:cls||"mini danger",type:"button",text:label});
  b.addEventListener("click",async()=>{if(b.dataset.c!=="1"){b.dataset.c="1";b.textContent=confirmLabel;setTimeout(()=>{b.dataset.c="";b.textContent=label},4000);return}
    b.disabled=true;try{await fn()}catch(e){status("Não deu para concluir. Tente de novo.",true);b.disabled=false}});
  return b;
}

/* ---------- render ---------- */
function render(){if(!renderShell()){renderLogin();if(S.visitor){if(vtab==="perfis")renderCards();else if(vtab==="resultados")renderResultados();else if(vtab==="aovivo")renderAoVivo()}return}if(tab==="avaliar")renderAvaliar();else if(tab==="perfis")renderCards();else if(tab==="resultados")renderResultados();else if(tab==="aovivo")renderAoVivo();else if(tab==="sorteio")renderPick();else renderGrupo()}

/* ---------- início ---------- */
let unsubs=[];
function stopData(){unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[]}
function enterAs(pid){S.uid=pid;S.claims.set(pid,pid);S.obIdx=null;S.obDone=false;
  /* o perfil mostra quem é organizador */
  const want=S.isAdmin?"org":null;if(want&&S.players.get(pid)?.role!==want)S.db.collection("players").doc(pid).update({role:want}).catch(e=>console.error(e));
  /* marca o primeiro acesso: o documento de notas existe a partir daqui */
  if(!S.ratings.has(pid))S.db.collection("ratings").doc(pid).set({scores:S.mine||{},raterPid:pid,updatedAt:Date.now()}).catch(e=>console.error(e));}
function startData(){
  stopData();
  const need=new Set(["players","ratings"]);
  const ready=n=>{if(need.delete(n)&&!need.size)S.loaded=true;render()};
  const fail=e=>{console.error(e);status("Não deu para carregar o grupo. Recarregue a página.",true)};
  unsubs.push(S.db.collection("players").onSnapshot(s=>{S.players=new Map(s.docs.map(d=>[d.id,d.data()]));ready("players");schedulePub();lvAutoHome()},fail));
  if(S.isAdmin)unsubs.push(S.db.doc("public/profiles").onSnapshot(d=>{S.pubLast=d.exists?JSON.stringify(d.data().p||{}):null;S.pubAt=d.exists?d.data().at:null;if(tab==="grupo")renderNotesBox();schedulePub()},fail));
  unsubs.push(S.db.collection("ratings").onSnapshot(s=>{
    S.ratings=new Map(s.docs.map(d=>{const x=d.data();return [d.id,{scores:x.scores||{},raterPid:x.raterPid}]}));
    S.claims=new Map(s.docs.map(d=>[d.id,d.id]));if(S.uid)S.claims.set(S.uid,S.uid);
    if(S.uid){S.savedMine=JSON.parse(JSON.stringify(S.ratings.get(S.uid)?.scores||{}));if(!S.dirty)S.mine=JSON.parse(JSON.stringify(S.savedMine))}ready("ratings");schedulePub()},fail));
  unsubs.push(S.db.doc("config/notes").onSnapshot(d=>{S.notes=d.exists?d.data():{locked:false};if(tab==="avaliar"&&!S.dirty)render();else if(tab==="grupo")renderNotesBox()},fail));
  unsubs.push(S.db.collection("matches").onSnapshot(s=>{S.matches=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.at-a.at);syncArchive();if(tab==="resultados"||tab==="perfis"||tab==="aovivo"||tab==="sorteio")render()},fail));
  unsubs.push(S.db.collection("drawHistory").onSnapshot(s=>{S.drawHist=s.docs.map(d=>d.data()).sort((a,b)=>b.at-a.at);S.histLoaded=true;syncArchive();if(tab==="resultados")render()},fail));
  unsubs.push(onSnapshot(doc(fs,"live","current"),d=>{S.live=d.exists()?d.data():null;lvAutoHome();if(tab==="aovivo")renderAoVivo()},fail));
  unsubs.push(S.db.doc("draws/latest").onSnapshot(d=>{applyDraw(d);lvAutoHome();syncArchive();if(tab==="sorteio")renderResult();else if(tab==="aovivo")renderAoVivo()},fail));
  if(S.isAdmin)unsubs.push(S.db.collection("admins").onSnapshot(s=>{S.adminPhones=new Set(s.docs.map(d=>d.id));if(tab==="grupo")renderGrupo()},fail));
  if(S.isAdmin)unsubs.push(S.db.collection("phoneIndex").onSnapshot(s=>{S.phones=new Map(s.docs.map(d=>[d.data().pid,digitsOf(d.id)]));if(tab==="grupo")renderGrupo()},fail));
}
function resetState(){stopData();S.uid=null;S.isAdmin=S.isOwner=false;S.loaded=false;S.players=new Map();S.ratings=new Map();S.claims=new Map();S.phones=new Map();S.adminPhones=null;S.visitor=false;S.pub=null;S.pubLast=null;clearTimeout(pubTimer);S.live=null;S.lvPick=[];S.lvAutoDone=false;S.mine={};S.savedMine={};S.notes={locked:false};S.dirty=false;S.saved=null;S.draw=null;S.matches=[];MF=null;S.mfOpen=false;S.drawHist=[];S.histLoaded=false}
/* Lê o vínculo deste aparelho (claims/<uid>) e decide para onde ir. */
/* quem está logado guarda no histórico o sorteio publicado assim que ele tiver jogo (ou se os times mudarem depois) */
function syncArchive(){if(S.histLoaded&&S.loaded!==undefined&&S.saved&&myPid())archiveDraw()}
function applyDraw(d){if(d.exists){const x=d.data();const teams=[];for(let i=0;i<(x.k||0);i++)teams.push(x.teams["t"+i]||[]);S.savedGuests=x.guests||{};S.saved={teams,res:x.res||[],subs:x.subs?teams.map((_,i)=>x.subs["t"+i]||[]):null,at:x.at,manual:!!x.manual}}else S.saved=null}
/* com uma partida rolando, o app abre direto na aba Ao vivo (uma vez a cada entrada) */
function lvAutoHome(){
  if(S.lvAutoDone)return;if(!S.visitor&&!myPid())return;/* espera saber quem é a pessoa */
  const L=S.live;if(!L||!S.saved||L.drawAt!==S.saved.at)return;
  S.lvAutoDone=true;if(L.status!=="running")return;
  if(myPid())tab="aovivo";else if(S.visitor)vtab="aovivo";render();
}
function startPublic(){
  stopData();S.visitor=true;
  const fail=e=>console.error(e);
  unsubs.push(S.db.doc("draws/latest").onSnapshot(d=>{applyDraw(d);lvAutoHome();if(vtab==="aovivo")render()},fail));
  unsubs.push(onSnapshot(doc(fs,"live","current"),d=>{S.live=d.exists()?d.data():null;lvAutoHome();if(vtab==="aovivo")render()},fail));
  unsubs.push(S.db.collection("players").onSnapshot(s=>{S.players=new Map(s.docs.map(d=>[d.id,d.data()]));render()},fail));
  unsubs.push(S.db.collection("matches").onSnapshot(s=>{S.matches=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.at-a.at);render()},fail));
  unsubs.push(S.db.doc("public/profiles").onSnapshot(d=>{S.pub=d.exists?d.data().p||{}:{};render()},fail));
  unsubs.push(S.db.collection("drawHistory").onSnapshot(s=>{S.drawHist=s.docs.map(d=>d.data()).sort((a,b)=>b.at-a.at);S.histLoaded=true;if(vtab==="resultados")render()},fail));
}
/* Organizadores mantêm o resumo público (só médias) sempre que notas ou jogadores mudam. */
let pubTimer=null;
function schedulePub(){if(!S.isAdmin||!S.loaded)return;clearTimeout(pubTimer);pubTimer=setTimeout(publishPublic,2000)}
async function publishPublic(){
  if(!S.isAdmin||S.dirty)return;
  const r2=x=>x==null?null:Math.round(x*100)/100;const p={};
  for(const id of S.players.keys()){const x=profile(id);p[id]={avg:Object.fromEntries(ATTRS.map(([k])=>[k,r2(x.avg[k])])),ovr:r2(x.ovr),raters:x.raters,sec:x.sec}}
  const js=JSON.stringify(p);if(js===S.pubLast)return;
  try{await S.db.doc("public/profiles").set({p,at:Date.now()});S.pubLast=js}catch(e){console.error(e)}
}
async function boot(){
  resetState();status("");setStep("loading");
  try{
    const c=await getDoc(claimRef());
    if(!c.exists()){$("logoutBtn").hidden=true;setStep("phone");startPublic();return}
    const cl=c.data();L.phone=cl.phone;$("logoutBtn").hidden=false;
    S.isAdmin=S.isOwner=(await getDoc(doc(fs,"admins",cl.phone))).exists();
    if(!cl.pid){if(S.isAdmin){startData();setStep("register")}else{await deleteDoc(claimRef());setStep("phone")}return}
    S.uid=cl.pid;S.claims.set(S.uid,S.uid);startData();
    const wait=setInterval(async()=>{if(!S.loaded)return;clearInterval(wait);
      if(S.players.has(S.uid)){enterAs(S.uid);render()}
      else{/* jogador removido do grupo */await deleteDoc(claimRef()).catch(()=>{});resetState();$("logoutBtn").hidden=true;setStep("phone","Seu cadastro não está mais no grupo. Fale com o organizador.")}},150);
  }catch(x){console.error(x);status("Não deu para abrir o app. Confira a internet e recarregue a página.",true)}
}
$("logoutBtn").addEventListener("click",async()=>{try{await deleteDoc(claimRef())}catch(e){}tab="aovivo";vtab="aovivo";await boot()});
render();
if(configured){
  S.db=DB;
  onAuthStateChanged(auth,user=>{
    if(!user){signInAnonymously(auth).catch(x=>{console.error(x);status(x.code&&x.code.includes("operation-not-allowed")?"Ative o login Anônimo no Firebase (Authentication > Método de login > Anônimo).":"Não deu para conectar ao Firebase. Recarregue a página.",true)});return}
    boot();
  });
}
