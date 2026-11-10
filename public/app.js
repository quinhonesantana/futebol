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
let tab=ls("tab")||"avaliar";
function setTab(t){tab=t;ls("tab",t);render()}
let vtab=ls("vtab")||"entrar";
document.querySelectorAll("#tabs button").forEach(b=>b.addEventListener("click",()=>{if(!myPid()){vtab=b.dataset.tab;ls("vtab",vtab);render();window.scrollTo({top:0});return}setTab(b.dataset.tab)}));
const VIEWS=["avaliar","perfis","sorteio","aovivo","resultados","grupo"];
function renderShell(){
  const me=myPid(),g=gated();
  $("tabs").hidden=!me;$("v-login").hidden=!!me;$("loginLogo").hidden=!!me;
  if(!me){
    /* visitante: abas Entrar, Perfis e Resultados */
    const vis=S.visitor;if(!vis||!["entrar","perfis","resultados"].includes(vtab))vtab="entrar";
    $("tabs").hidden=!vis;
    for(const b of document.querySelectorAll("#tabs button")){const t=b.dataset.tab;b.hidden=!(t==="entrar"||t==="perfis"||t==="resultados");b.disabled=false;b.title="";b.setAttribute("aria-selected",String(t===vtab))}
    $("v-login").hidden=vtab!=="entrar";$("loginLogo").hidden=vtab!=="entrar";
    for(const v of VIEWS)$("v-"+v).hidden=!(vis&&v===vtab);
    $("visitorHead").hidden=!(vis&&vtab!=="entrar");$("who").textContent="";return false}
  $("visitorHead").hidden=true;$("tab-entrar").hidden=true;for(const t of ["avaliar","perfis","sorteio","aovivo","resultados"])$("tab-"+t).hidden=false;
  $("tab-grupo").hidden=!S.isAdmin;
  for(const t of ["perfis","sorteio","aovivo","resultados"]){$("tab-"+t).disabled=g;$("tab-"+t).title=g?"Libera depois que você avaliar todo o grupo":""}
  if((tab==="perfis"||tab==="sorteio"||tab==="aovivo"||tab==="resultados")&&g)tab="avaliar";
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
function renderCards(){
  const c=$("cards");c.replaceChildren();
  const ps=sortedPlayers().map(p=>({...p,pr:profile(p.id)})).sort((a,b)=>(b.pr.ovr??-1)-(a.pr.ovr??-1)||a.name.localeCompare(b.name,"pt-BR"));
  if(!ps.length){c.append(el("div",{class:"empty",style:"grid-column:1/-1"},el("strong",{text:"Nenhum jogador ainda"}),"Os jogadores aparecem aqui quando o organizador cadastrar o grupo."));return}
  const me=myPid();
  for(const p of ps){const r=p.pr.raters;
    c.append(el("div",{class:"card"},
      el("div",{class:"top"},el("div",{class:"ovr"+(p.pr.ovr==null?" none":""),text:fmt(p.pr.ovr)}),
        el("div",{class:"meta"},el("div",{class:"pname",text:p.name+(p.id===me?" (você)":"")}),el("div",{class:"row",style:"gap:6px;margin-top:3px"},posTag(p),isOrg(p.id)?orgChip():null,el("span",{class:"note",text:r?`${r} ${r===1?"avaliação":"avaliações"}`:"sem avaliações"})))),
      secLine(p.pr.sec),perfLine(p.id),
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
  const usePerf=$("usePerf").checked;const adjMap=usePerf?perfAdj():new Map();
  const info=new Map(ids.map(id=>{const pr=rate(id);const v={ovr:pr.ovr??3};for(const [a] of ATTRS)v[a]=pr.avg[a]??v.ovr;const pl=getP(id);const a=usePerf?(adjMap.get(id)||0):0;for(const k in v)v[k]+=a;return [id,{...v,pos:posOf(pl),pos2:pr.sec.key}]}));
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
function waText(teams,at,res){let s=`⚽ Peixe Futebol Clube · times de ${dateBR(at)}\n`;teams.forEach((t,i)=>{const st=teamStats(t);s+=`\n*Time ${TEAMS[i][0]}* (média ${fmt(st.ovr)})\n`;t.forEach(id=>{const p=hasP(id)?{id,...getP(id)}:null;if(p)s+=`- ${dName(id)} (${posLabel(p)})\n`})});
  if(res.length){s+=`\n*Reservas* (entram por ordem de chegada)\n`;res.forEach((id,i)=>{const p={id,...getP(id)};s+=`${i+1}. ${dName(id)} (${posLabel(p)})\n`})}
  return s.trim()}
function renderResult(){
  const r=$("result");r.replaceChildren();
  const d=(S.isAdmin&&S.draw)||S.saved;
  if(!d){if(!S.isAdmin)r.append(el("div",{class:"empty",style:"margin-top:24px"},el("strong",{text:"Sorteio ainda não publicado"}),"Quando os organizadores publicarem os times, eles aparecem aqui."));return}
  const teams=d.teams.map(t=>t.filter(id=>hasP(id)));const res=(d.res||[]).filter(id=>hasP(id));
  r.append(el("h2",{text:S.draw?"Times sorteados":"Sorteio publicado"}));
  if(S.draw)r.append(el("p",{class:"lead",text:"Prévia: só você está vendo. Toque em Publicar sorteio para mostrar ao grupo, ou sorteie de novo."}));
  else r.append(el("p",{class:"lead",text:`Publicado pelos organizadores em ${dateBR(d.at)}.`}));
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
  if(S.draw&&S.isAdmin)acts.append(el("button",{class:"btn",type:"button",text:"Publicar sorteio",onclick:async ev=>{const b=ev.currentTarget;b.disabled=true;
    try{await S.db.doc("draws/latest").set({teams:Object.fromEntries(teams.map((t,i)=>["t"+i,t])),k:teams.length,res,guests:Object.fromEntries([...teams.flat(),...res].filter(isGuest).map(id=>{const g=getP(id);return [id,{name:g.name,pos:g.pos,lvl:+g.lvl||3}]})),at:d.at});b.textContent="Publicado para todos";status("Sorteio publicado. Todo o grupo já vê os times na aba Sorteio.")}catch(e){b.disabled=false;status(e.code==="permission-denied"?"Só organizadores podem publicar o sorteio.":"Não foi possível publicar o sorteio.",true)}}}));
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
/* ---------- resultados ---------- */
S.matches=[];S.notes={locked:false};S.savedMine={};let MF=null;
{const u=ls("usePerf");if(u===false)$("usePerf").checked=false}
$("usePerf").addEventListener("change",()=>ls("usePerf",$("usePerf").checked));
function stats(){
  const st=new Map();const get=id=>{if(!st.has(id))st.set(id,{j:0,v:0,e:0,d:0,g:0,pts:0});return st.get(id)};
  for(const m of S.matches){
    const sides=[[m.a,m.b],[m.b,m.a]];
    for(const [me,op] of sides)for(const id of me.roster||[]){if(!S.players.has(id))continue;const x=get(id);x.j++;
      if(me.goals>op.goals){x.v++;x.pts+=3}else if(me.goals===op.goals){x.e++;x.pts++}else x.d++}
    for(const [id,n] of Object.entries(m.scorers||{}))if(S.players.has(id))get(id).g+=n;
  }
  return st;
}
/* Ajuste de força pelo desempenho: até meio ponto para cima ou para baixo, crescendo com o número de jogos. */
function perfAdj(){
  const st=stats();const xs=[...st.entries()].filter(([,x])=>x.j>0);const out=new Map();if(!xs.length)return out;
  const avgP=xs.reduce((q,[,x])=>q+x.pts/x.j,0)/xs.length,avgG=xs.reduce((q,[,x])=>q+x.g/x.j,0)/xs.length;
  for(const [id,x] of xs){const raw=((x.pts/x.j-avgP)*0.3+(x.g/x.j-avgG)*0.15)*(x.j/(x.j+3));out.set(id,Math.max(-0.5,Math.min(0.5,raw)))}
  return out;
}
function perfLine(pid){const x=stats().get(pid);if(!x||!x.j)return null;
  return el("div",{class:"perfline",text:`${x.j} ${x.j===1?"jogo":"jogos"} · ${x.v}V ${x.e}E ${x.d}D · ${x.g} ${x.g===1?"gol":"gols"}`})}
const tName=i=>"Time "+TEAMS[i][0];
function newMF(){const d=S.saved;if(!d||d.teams.length<2)return null;
  return {a:0,b:1,extraA:[],extraB:[],g:{},ownA:0,ownB:0,drawAt:d.at}}
function rosterOf(side){const d=S.saved;const i=side==="A"?MF.a:MF.b;return [...(d.teams[i]||[]),...(side==="A"?MF.extraA:MF.extraB)].filter(hasP)}
function sideGoals(side){return rosterOf(side).reduce((q,id)=>q+(MF.g[id]||0),0)+(side==="A"?MF.ownA:MF.ownB)}
function stepper(val,onChange,label){
  const out=el("output",{text:String(val)});
  return el("span",{class:"step"},el("button",{type:"button","aria-label":"Tirar gol de "+label,text:"−",onclick:()=>onChange(Math.max(0,val-1))}),out,
    el("button",{type:"button","aria-label":"Somar gol para "+label,text:"+",onclick:()=>onChange(val+1)}))}
function renderMatchForm(){
  const box=$("matchForm");box.replaceChildren();if(!S.isAdmin)return;
  box.append(el("h2",{text:"Lançar jogo"}));
  if(!S.saved){box.append(el("p",{class:"lead",text:"Publique um sorteio na aba Sorteio para lançar os resultados com aqueles times."}));return}
  if(!MF||MF.drawAt!==S.saved.at)MF=newMF();if(!MF)return;
  const n=S.saved.teams.length;
  const sel=(v,on)=>{const s=el("select",{},...Array.from({length:n},(_,i)=>el("option",{value:i,text:tName(i)})));s.value=v;s.addEventListener("change",()=>on(+s.value));return s};
  const err=el("div",{class:"err-text"});
  const f=el("div",{class:"mform"},el("div",{class:"vs"},sel(MF.a,v=>{MF.a=v;MF.extraA=[];renderMatchForm()}),el("b",{text:"x"}),sel(MF.b,v=>{MF.b=v;MF.extraB=[];renderMatchForm()}),
    el("span",{class:"note",text:`Times do sorteio de ${dateBR(S.saved.at)}`})));
  const teams=el("div",{class:"mteams"});
  for(const side of ["A","B"]){
    const idx=side==="A"?MF.a:MF.b;const rs=rosterOf(side);
    const panel=el("div",{class:"mteam",style:`--tc:var(${TEAMS[idx][1]})`},el("div",{class:"hd"},el("h3",{text:tName(idx)}),el("span",{class:"score",text:String(sideGoals(side))})));
    for(const id of rs)panel.append(el("div",{class:"grow2"},el("span",{text:dName(id)}),stepper(MF.g[id]||0,v=>{MF.g[id]=v;renderMatchForm()},getP(id).name)));
    const own=side==="A"?MF.ownA:MF.ownB;
    panel.append(el("div",{class:"grow2"},el("span",{class:"note",text:"Gol contra / sem autor"}),stepper(own,v=>{side==="A"?MF.ownA=v:MF.ownB=v;renderMatchForm()},"gol sem autor")));
    const used=new Set([...rosterOf("A"),...rosterOf("B")]);
    const opts=[...(S.saved.res||[]),...S.saved.teams.flat()].filter(id=>hasP(id)&&!used.has(id));
    if(opts.length){const add=el("select",{"aria-label":"Adicionar jogador ao "+tName(idx)},el("option",{value:"",text:"+ Entrou alguém de fora do time?"}),...opts.map(id=>el("option",{value:id,text:dName(id)})));
      add.addEventListener("change",()=>{if(!add.value)return;(side==="A"?MF.extraA:MF.extraB).push(add.value);renderMatchForm()});panel.append(add)}
    teams.append(panel);
  }
  const save=el("button",{class:"btn primary big",type:"button",style:"margin-top:12px",text:"Salvar jogo",onclick:async()=>{
    err.textContent="";if(MF.a===MF.b){err.textContent="Escolha dois times diferentes.";return}
    const rA=rosterOf("A"),rB=rosterOf("B");const scorers={};for(const id of [...rA,...rB])if(MF.g[id])scorers[id]=MF.g[id];
    const names={};for(const id of [...rA,...rB])names[id]=getP(id).name;
    save.disabled=true;
    const firstOfMonth=!S.matches.some(m=>sameMonth(m.at,Date.now()));
    try{if(firstOfMonth&&!S.notes.locked)await S.db.doc("config/notes").set({locked:true,lockedAt:Date.now(),by:myPid()});
      await S.db.collection("matches").add({at:Date.now(),drawAt:S.saved.at,a:{team:MF.a,roster:rA,goals:sideGoals("A"),own:MF.ownA},b:{team:MF.b,roster:rB,goals:sideGoals("B"),own:MF.ownB},scorers,names});
      const keep={a:MF.a,b:MF.b};MF=newMF();MF.a=keep.a;MF.b=keep.b;status("Jogo salvo.");renderMatchForm()}
    catch(e){console.error(e);save.disabled=false;err.textContent=e.code==="permission-denied"?"Só organizadores lançam resultados. Confira se as regras novas do Firestore foram publicadas.":"Não deu para salvar o jogo. Tente de novo."}}});
  f.append(teams,save,err);box.append(f);
}
function renderResultados(){
  renderMatchForm();
  const st=stats();const rows=[...st.entries()].filter(([,x])=>x.j>0).map(([id,x])=>({id,...x,name:S.players.get(id).name}));
  const top=$("topScorers");top.replaceChildren();
  const sc=rows.filter(r=>r.g>0).sort((a,b)=>b.g-a.g||a.j-b.j||a.name.localeCompare(b.name,"pt-BR")).slice(0,10);
  if(!sc.length)top.append(el("div",{class:"empty",style:"margin-top:10px"},el("strong",{text:"Nenhum gol lançado"}),"Os artilheiros aparecem aqui quando os organizadores lançarem os jogos."));
  else top.append(el("div",{class:"tbl"},el("table",{},el("thead",{},el("tr",{},...["Jogador","Gols","Jogos","Média"].map(t=>el("th",{text:t})))),
    el("tbody",{},...sc.map((r,i)=>el("tr",{},el("td",{},el("span",{class:"n",text:i+1+"º "}),r.name),el("td",{text:String(r.g)}),el("td",{text:String(r.j)}),el("td",{text:fmt(r.g/r.j)})))))));
  const pt=$("perfTable");pt.replaceChildren();
  if(!rows.length)pt.append(el("div",{class:"empty",style:"margin-top:10px"},el("strong",{text:"Sem jogos ainda"}),"Vitórias, empates e derrotas de cada um aparecem aqui."));
  else{const adj=perfAdj();rows.sort((a,b)=>b.pts-a.pts||b.v-a.v||b.g-a.g||a.name.localeCompare(b.name,"pt-BR"));
    pt.append(el("div",{class:"tbl"},el("table",{},el("thead",{},el("tr",{},...["Jogador","J","V","E","D","Gols","Pts","Ajuste"].map(t=>el("th",{text:t,title:t==="Ajuste"?"Quanto o desempenho soma ou tira da nota geral no sorteio":""})))),
      el("tbody",{},...rows.map(r=>{const a=adj.get(r.id)||0;return el("tr",{},el("td",{text:r.name}),...[r.j,r.v,r.e,r.d,r.g,r.pts].map(v=>el("td",{text:String(v)})),el("td",{class:"n",text:(a>=0?"+":"−")+Math.abs(a).toFixed(2).replace(".",",")}))})))))}
  const ml=$("matchList");ml.replaceChildren();
  if(!S.matches.length){ml.append(el("div",{class:"empty"},el("strong",{text:"Nenhum jogo lançado"}),S.isAdmin?"Lance o primeiro jogo no formulário acima.":"Os jogos aparecem aqui quando os organizadores lançarem."));return}
  let day="";
  for(const m of S.matches){
    const dk=dateBR(m.at);if(dk!==day){day=dk;ml.append(el("div",{class:"mday",text:new Date(m.at).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})}))}
    const nm=id=>m.names?.[id]||getP(id)?.name||"?";
    const goalsTxt=side=>{const s=m[side];const parts=(s.roster||[]).filter(id=>m.scorers?.[id]).map(id=>nm(id)+(m.scorers[id]>1?` (${m.scorers[id]})`:""));if(s.own)parts.push(`${s.own} sem autor`);return parts.join(", ")};
    const card=el("div",{class:"mcard"},el("div",{class:"mline"},
      el("span",{class:"dot",style:`--tc:var(${TEAMS[m.a.team][1]})`}),TEAMS[m.a.team][0],el("span",{class:"sc",text:`${m.a.goals} x ${m.b.goals}`}),TEAMS[m.b.team][0],el("span",{class:"dot",style:`--tc:var(${TEAMS[m.b.team][1]})`})));
    const ga=goalsTxt("a"),gb=goalsTxt("b");
    if(ga)card.append(el("div",{class:"who",text:`${TEAMS[m.a.team][0]}: ${ga}`}));
    if(gb)card.append(el("div",{class:"who",text:`${TEAMS[m.b.team][0]}: ${gb}`}));
    if(S.isAdmin)card.append(el("div",{class:"acts"},confirmBtn("Apagar jogo","Toque de novo para apagar",async()=>{await S.db.collection("matches").doc(m.id).delete()})));
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
function lvOpen(){if(!S.saved)return false;const L=lvState();if(L.status==="running")return true;if((L.forceUntil||0)>Date.now())return true;return lvWindow(Date.now()).open}
const lvTeam=i=>({name:TEAMS[i][0],c:`var(${TEAMS[i][1]})`,ids:(S.saved.teams[i]||[]).filter(hasP)});
function lvElapsed(L){return L.status==="running"&&L.startedAt?Math.max(0,(Date.now()-L.startedAt)/1000):0}
function lvRemaining(L){return Math.max(0,(L.dur||LV.MATCH3)-lvElapsed(L))}
const lvMin=L=>Math.min(Math.ceil((L.dur||0)/60),Math.floor(lvElapsed(L)/60)+1);
const lvClock=s=>{s=Math.ceil(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=String(s%60).padStart(2,"0");return h?`${h}:${String(m).padStart(2,"0")}:${x}`:`${String(m).padStart(2,"0")}:${x}`};
function lvGoals(L,side){return (L.events||[]).filter(e=>e.kind==="goal"&&e.team===L[side]).length}
function lvMyName(){return S.players.get(myPid())?.name||"Alguém"}
function lvToast(msg){const old=document.querySelector(".lv-toast");if(old)old.remove();const t=el("div",{class:"lv-toast",role:"status",text:msg});document.body.append(t);setTimeout(()=>t.remove(),3400)}
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
async function lvUndo(ev){try{await updateDoc(liveRef(),{events:arrayRemove(ev)});lvToast("Gol desfeito.")}catch(e){console.error(e);status("Não deu para desfazer o gol.",true)}}
async function lvEnd(expectedGame,chosenOut){
  const now=Date.now();let summary="";
  const firstOfMonth=!S.matches.some(m=>{const x=new Date(m.at),y=new Date(now);return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()});
  const ok=await lvTx(async(tx,L)=>{
    if(!L||L.drawAt!==S.saved.at||L.status!=="running"||(L.gameNo||0)!==expectedGame)throw new Error("lv:Essa partida já foi encerrada em outro celular.");
    const ga=lvGoals(L,"a"),gb=lvGoals(L,"b");const goalsEv=(L.events||[]).filter(e=>e.kind==="goal");
    const side=t=>{const ids=(S.saved.teams[t]||[]).filter(hasP);const own=goalsEv.filter(e=>e.team===t&&(e.own||e.scorer==="?")).length;return {team:t,roster:ids,goals:goalsEv.filter(e=>e.team===t).length,own}};
    const scorers={};for(const e of goalsEv)if(!e.own&&e.scorer&&e.scorer!=="?")scorers[e.scorer]=(scorers[e.scorer]||0)+1;
    const assists={};for(const e of goalsEv)if(e.assist)assists[e.assist]=(assists[e.assist]||0)+1;
    const names={};for(const t of [L.a,L.b])for(const id of (S.saved.teams[t]||[]))if(hasP(id))names[id]=getP(id).name;
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
async function lvForceOpen(){const until=Date.now()+3*3600e3;
  const ok=await lvTx(async(tx,cur)=>{const L=cur&&cur.drawAt===S.saved.at?cur:lvState();tx.set(liveRef(),{...L,fresh:null,drawAt:S.saved.at,forceUntil:until})});
  if(ok)lvToast("Partida ao vivo aberta pelas próximas 3 horas.")}
/* ---------- tela ---------- */
function lvSheet(tc,...kids){const sheet=el("div",{class:"lv-sheet",role:"dialog","aria-modal":"true",style:`--tc:${tc}`},...kids);
  const scrim=el("div",{class:"lv-scrim",onclick:e=>{if(e.target===scrim)lvClose()}},sheet);$("lvLayer").replaceChildren(scrim);const f=sheet.querySelector("button");if(f)f.focus()}
function lvClose(){$("lvLayer").replaceChildren()}
document.addEventListener("keydown",e=>{if(e.key==="Escape")lvClose()});
function lvOpenGoal(L,t){
  const T=lvTeam(t),opp=t===L.a?L.b:L.a,O=lvTeam(opp);const sel={scorer:null,own:false,assist:null};const min=lvMin(L);const gameNo=L.gameNo||0;
  const scorers=el("div",{class:"lv-chips"}),owns=el("div",{class:"lv-chips"}),assists=el("div",{class:"lv-chips"}),aTitle=el("h4",{text:"Assistência (opcional)"});
  const ok=el("button",{class:"btn primary big",type:"button",disabled:true,text:"Confirmar gol",style:"flex:1",onclick:()=>{
    const cur=lvState();if(cur.status!=="running"||(cur.gameNo||0)!==gameNo){lvClose();status("Essa partida já foi encerrada.",true);return}
    lvClose();lvGoal({id:"g"+Date.now()+Math.random().toString(36).slice(2,6),kind:"goal",team:t,scorer:sel.scorer,own:sel.own,assist:sel.own||sel.scorer==="?"?null:sel.assist,min,by:myPid(),at:Date.now()})}});
  const chip=(txt,on,fn,alt)=>el("button",{type:"button",class:"lv-chip"+(alt?" alt":""),"aria-pressed":String(!!on),text:txt,onclick:fn});
  function paint(){
    scorers.replaceChildren(...T.ids.map(id=>chip(getP(id).name,!sel.own&&sel.scorer===id,()=>{sel.scorer=id;sel.own=false;paint()})),chip("Não sei quem fez",sel.scorer==="?",()=>{sel.scorer="?";sel.own=false;sel.assist=null;paint()},true));
    owns.replaceChildren(...O.ids.map(id=>chip(getP(id).name,sel.own&&sel.scorer===id,()=>{sel.scorer=id;sel.own=true;sel.assist=null;paint()},true)));
    const showA=sel.scorer&&!sel.own&&sel.scorer!=="?";aTitle.hidden=assists.hidden=!showA;
    assists.replaceChildren(...T.ids.filter(id=>id!==sel.scorer).map(id=>chip(getP(id).name,sel.assist===id,()=>{sel.assist=sel.assist===id?null:id;paint()})),chip("Sem assistência",!sel.assist,()=>{sel.assist=null;paint()},true));
    ok.disabled=!sel.scorer}
  lvSheet(T.c,el("h3",{text:`Gol do ${T.name} · ${min}'`}),el("h4",{text:"Quem fez"}),scorers,aTitle,assists,el("h4",{text:`Gol contra de alguém do ${O.name}`}),owns,
    el("div",{class:"lv-actions"},el("button",{class:"btn",type:"button",text:"Cancelar",onclick:lvClose}),ok));paint();
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
    return el("li",{},posTag(p,true),el("span",{class:"n",text:dName(id)}),g?el("span",{class:"lv-balls",text:g+(g>1?" gols":" gol")}):null)})))}
function lvWaiting(box){
  const w=lvWindow(Date.now());const when=new Date(w.next);
  const cd=el("div",{class:"lv-cd",id:"lvCountdown"});
  box.append(el("div",{class:"lv-gate"},el("img",{src:"logo.jpg",alt:"Escudo do Peixe Futebol Clube",class:"lv-crest"}),
    S.saved?el("span",{class:"lv-state ok",text:"Times publicados"}):el("span",{class:"lv-state wait",text:"Aguardando o sorteio"}),
    el("h2",{text:"Próxima pelada"}),el("div",{class:"lv-when",text:`${when.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})} · 19:30`}),cd,
    el("p",{class:"note",text:S.saved?"A partida ao vivo abre sozinha na segunda às 19:30, com os times publicados.":"A partida ao vivo abre na segunda às 19:30, depois que os organizadores publicarem os times."}),
    S.saved&&S.isAdmin?el("button",{class:"btn",type:"button",text:"Abrir agora (fora do horário)",onclick:lvForceOpen}):null,
    !S.saved&&S.isAdmin?el("p",{class:"note"},el("b",{text:"Organizador: "}),"publique o sorteio na aba Sorteio para liberar esta tela."):null));
  if(S.saved){const pv=el("div",{class:"lv-rosters",style:"margin-top:14px"});S.saved.teams.forEach((_,i)=>pv.append(lvRoster(i,null,{})));box.append(pv)}
  lvTick();
}
function renderAoVivo(){
  const box=$("v-aovivo");box.replaceChildren();
  if(!lvOpen()){lvWaiting(box);return}
  const L=lvState();const fmt=L.fmt;
  if(L.status==="done"){const ms=S.matches.filter(m=>m.drawAt===S.saved.at);box.append(el("div",{class:"lv-gate"},el("img",{src:"logo.jpg",alt:"",class:"lv-crest"}),el("span",{class:"lv-state",text:"Pelada encerrada"}),el("h2",{text:"Valeu, Peixe!"}),
    el("p",{class:"note",text:"O resultado já está na aba Resultados."}),...ms.map(m=>el("div",{class:"lv-gameline"},TEAMS[m.a.team][0],el("b",{text:` ${m.a.goals} x ${m.b.goals} `}),TEAMS[m.b.team][0]))));return}
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
  /* controles: qualquer jogador ou organizador */
  const ctl=el("section",{class:"lv-panel"});
  if(L.status==="setup"){const pick=S.lvPick||[];const n=S.saved.teams.length;
    ctl.append(el("h2",{text:"Escolha quem começa"}));
    const grid=el("div",{class:"lv-pick"});
    for(let i=0;i<n;i++){const T=lvTeam(i);const on=pick.includes(i);grid.append(el("button",{type:"button",class:"lv-pickbtn",style:`--tc:${T.c}`,"aria-pressed":String(on),onclick:()=>{S.lvPick=on?pick.filter(x=>x!==i):[...pick,i].slice(-2);renderAoVivo()}},el("i"),T.name,el("small",{text:on?"Começa jogando":"Toque para escolher"})))}
    ctl.append(grid,el("button",{class:"btn primary big",type:"button",style:"width:100%;margin-top:10px",disabled:pick.length!==2,text:pick.length===2?`Começar ${TEAMS[pick[0]][0]} x ${TEAMS[pick[1]][0]}`:"Escolha 2 times",onclick:()=>lvPickStart(pick[0],pick[1])}),
      el("p",{class:"note",style:"margin:8px 0 0",text:"No 1º jogo o perdedor sai. Depois, sai sempre quem jogou 2 seguidas."}));
  }else{
    if(L.status==="running"){const A=lvTeam(L.a),B=lvTeam(L.b);
      ctl.append(el("div",{class:"lv-goalbtns"},el("button",{class:"lv-goalbtn",type:"button",style:`--tc:${A.c}`,onclick:()=>lvOpenGoal(lvState(),L.a)},"+ Gol "+A.name,el("small",{text:"toque e escolha quem fez"})),
        el("button",{class:"lv-goalbtn",type:"button",style:`--tc:${B.c}`,onclick:()=>lvOpenGoal(lvState(),L.b)},"+ Gol "+B.name,el("small",{text:"toque e escolha quem fez"}))),
        el("button",{class:"btn big lv-end",type:"button",text:fmt==="2"?"Encerrar pelada":"Encerrar partida",onclick:()=>lvOpenEnd(lvState())}))}
    else ctl.append(el("button",{class:"btn primary big",type:"button",style:"width:100%",text:fmt==="2"?"Começar a pelada":`Começar ${TEAMS[L.a][0]} x ${TEAMS[L.b][0]}`,onclick:lvStart}));
    ctl.append(el("p",{class:"note",style:"margin:8px 0 0",text:fmt==="2"?"Com 2 times o jogo vai direto até o fim da 1h30. As substituições não precisam ser marcadas.":"Qualquer jogador pode começar e encerrar a partida e marcar gols. O seu nome fica registrado."}));
  }
  box.append(ctl);
  /* lances */
  const tl=el("ul",{class:"lv-tl"});const evs=[...(L.events||[])].reverse();
  for(const e of evs){
    if(e.kind==="goal"){const T=lvTeam(e.team);const p=getP(e.scorer);const as=e.assist?getP(e.assist):null;const who=e.by===myPid()?"você":(S.players.get(e.by)?.name||"alguém");
      tl.append(el("li",{style:`--tc:${T.c}`},el("span",{class:"min",text:e.min+"'"}),el("span",{class:"dot"}),
        el("span",{class:"what"},el("b",{text:e.own?`Gol contra de ${p?.name||"?"}`:e.scorer==="?"?"Gol (autor não informado)":`Gol de ${p?.name||"?"}`}),el("small",{text:`${T.name}${as?` · assistência de ${as.name}`:""} · marcado por ${who}`})),
        (S.isAdmin||e.by===myPid())&&L.status==="running"?el("button",{class:"mini",type:"button",text:"Desfazer",onclick:()=>lvUndo(e)}):el("span")))}
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
  if(tab!=="aovivo"||!myPid())return;
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
function render(){if(!renderShell()){renderLogin();if(S.visitor){if(vtab==="perfis")renderCards();else if(vtab==="resultados")renderResultados()}return}if(tab==="avaliar")renderAvaliar();else if(tab==="perfis")renderCards();else if(tab==="resultados")renderResultados();else if(tab==="aovivo")renderAoVivo();else if(tab==="sorteio")renderPick();else renderGrupo()}

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
  unsubs.push(S.db.collection("players").onSnapshot(s=>{S.players=new Map(s.docs.map(d=>[d.id,d.data()]));ready("players");schedulePub()},fail));
  if(S.isAdmin)unsubs.push(S.db.doc("public/profiles").onSnapshot(d=>{S.pubLast=d.exists?JSON.stringify(d.data().p||{}):null;S.pubAt=d.exists?d.data().at:null;if(tab==="grupo")renderNotesBox();schedulePub()},fail));
  unsubs.push(S.db.collection("ratings").onSnapshot(s=>{
    S.ratings=new Map(s.docs.map(d=>{const x=d.data();return [d.id,{scores:x.scores||{},raterPid:x.raterPid}]}));
    S.claims=new Map(s.docs.map(d=>[d.id,d.id]));if(S.uid)S.claims.set(S.uid,S.uid);
    if(S.uid){S.savedMine=JSON.parse(JSON.stringify(S.ratings.get(S.uid)?.scores||{}));if(!S.dirty)S.mine=JSON.parse(JSON.stringify(S.savedMine))}ready("ratings");schedulePub()},fail));
  unsubs.push(S.db.doc("config/notes").onSnapshot(d=>{S.notes=d.exists?d.data():{locked:false};if(tab==="avaliar"&&!S.dirty)render();else if(tab==="grupo")renderNotesBox()},fail));
  unsubs.push(S.db.collection("matches").onSnapshot(s=>{S.matches=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.at-a.at);if(tab==="resultados"||tab==="perfis"||tab==="aovivo")render()},fail));
  unsubs.push(onSnapshot(doc(fs,"live","current"),d=>{S.live=d.exists()?d.data():null;if(tab==="aovivo")renderAoVivo()},fail));
  unsubs.push(S.db.doc("draws/latest").onSnapshot(d=>{if(d.exists){const x=d.data();const teams=[];for(let i=0;i<(x.k||0);i++)teams.push(x.teams["t"+i]||[]);S.savedGuests=x.guests||{};S.saved={teams,res:x.res||[],at:x.at}}else S.saved=null;if(tab==="sorteio")renderResult();else if(tab==="aovivo")renderAoVivo()},fail));
  if(S.isAdmin)unsubs.push(S.db.collection("admins").onSnapshot(s=>{S.adminPhones=new Set(s.docs.map(d=>d.id));if(tab==="grupo")renderGrupo()},fail));
  if(S.isAdmin)unsubs.push(S.db.collection("phoneIndex").onSnapshot(s=>{S.phones=new Map(s.docs.map(d=>[d.data().pid,digitsOf(d.id)]));if(tab==="grupo")renderGrupo()},fail));
}
function resetState(){stopData();S.uid=null;S.isAdmin=S.isOwner=false;S.loaded=false;S.players=new Map();S.ratings=new Map();S.claims=new Map();S.phones=new Map();S.adminPhones=null;S.visitor=false;S.pub=null;S.pubLast=null;clearTimeout(pubTimer);S.live=null;S.lvPick=[];S.mine={};S.savedMine={};S.notes={locked:false};S.dirty=false;S.saved=null;S.draw=null;S.matches=[];MF=null}
/* Lê o vínculo deste aparelho (claims/<uid>) e decide para onde ir. */
function startPublic(){
  stopData();S.visitor=true;
  const fail=e=>console.error(e);
  unsubs.push(S.db.collection("players").onSnapshot(s=>{S.players=new Map(s.docs.map(d=>[d.id,d.data()]));render()},fail));
  unsubs.push(S.db.collection("matches").onSnapshot(s=>{S.matches=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.at-a.at);render()},fail));
  unsubs.push(S.db.doc("public/profiles").onSnapshot(d=>{S.pub=d.exists?d.data().p||{}:{};render()},fail));
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
$("logoutBtn").addEventListener("click",async()=>{try{await deleteDoc(claimRef())}catch(e){}tab="avaliar";await boot()});
render();
if(configured){
  S.db=DB;
  onAuthStateChanged(auth,user=>{
    if(!user){signInAnonymously(auth).catch(x=>{console.error(x);status(x.code&&x.code.includes("operation-not-allowed")?"Ative o login Anônimo no Firebase (Authentication > Método de login > Anônimo).":"Não deu para conectar ao Firebase. Recarregue a página.",true)});return}
    boot();
  });
}
