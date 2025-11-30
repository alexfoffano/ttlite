/* === Triple Triad - Comentários de Guia ===
   Este arquivo contém toda a lógica do protótipo.
   Resumo rápido do que foi implementado neste build:
   - IA com 4 níveis: off (2P), easy, medium, hard, master
     • medium: heurística; 50% das jogadas ignora Same/Plus/Same Wall; 1ª jogada aleatória quando a IA começa
     • hard:  1ª jogada com minimax(2); demais com heurística
     • master: minimax(3) com fallback
   - Regras: Same, Plus, Same Wall, Combo e Elemental
   - S-rule: quando uma carta recebe bônus +1 do Elemental e o lado alvo é 'A'(10), o valor vira 'S'(11)
   - Overlay visual de propriedade: verde (você), vermelho (IA)
   - Seletor de dificuldade no menu › Adversário
   Notação das seções abaixo:
   /* [SEÇÃO] Nome               → cabeçalho lógico
   /* Função: nome(...)          → JSDoc simples com o propósito da função
   /* detalhe: ...               → comentários curtos em linhas específicas
   =============================================================== */


const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ELEMENTS = ["None","Fire","Ice","Thunder","Earth","Poison","Wind","Water","Holy"];

// Audio
const AudioManager = (()=>{
  const sources = { place:"assets/sfx/place.wav", flip:"assets/sfx/flip.wav", same:"assets/sfx/same.wav", plus:"assets/sfx/plus.wav", combo:"assets/sfx/combo.wav", win:"assets/sfx/win.wav", lose:"assets/sfx/lose.wav", draw:"assets/sfx/draw.wav" };
  const cache = new Map(); for(const k in sources){ const a=new Audio(sources[k]); a.preload="auto"; cache.set(k,a); }
  function play(key){ if(!state.soundEnabled) return; const a = cache.get(key)?.cloneNode(); if(!a) return; a.volume=Math.max(0,Math.min(1,state.soundVolume??0.6)); a.play().catch(()=>{}); }
  return { play };
})();

const state = {
  board: Array(9).fill(null),
  boardElements: Array(9).fill("None"),
  yourHand: [], aiHand: [],
  yourTurn: true, busy: false,
  rules: { same:true, plus:true, samewall:true, combo:true, elemental:true },
  aiLevel: "medium", hideOpponent: true,
  soundEnabled: true, soundVolume: 0.6,
  minLevel: 1, maxLevel: 10, wallLevel: 5, debug: false,
  firstMove: "random",
  aiStarts: false,
};

const $ = (s)=>document.querySelector(s);
let boardEl, handYouEl, handAiEl, bannerEl;

function debugLog(msg, tag){ if(!state.debug) return; const log=$("#debug-log"); if(!log) return; const div=document.createElement("div"); div.className="line"; const t=document.createElement("span"); t.className="tag "+(tag||""); t.textContent=(tag||"DBG").toUpperCase(); const s=document.createElement("span"); s.textContent=" "+msg; div.append(t,s); log.append(div); log.scrollTop=log.scrollHeight; console.log("%cTT-Debug","color:#9cc1ff",tag||"",msg); }
function debugClear(){ const log=$("#debug-log"); if(log) log.innerHTML=""; }
function showReason(idx, text){ if(!state.debug) return; const cell=boardEl.children[idx]; if(!cell) return; const b=document.createElement("div"); b.className="flip-reason"; b.textContent=text; cell.appendChild(b); setTimeout(()=>{ if(b.parentNode) b.parentNode.removeChild(b); }, 1000); }
/** Função: refreshStatusLine
 * Atualiza o cabeçalho com nível, dificuldade, regras ativas e placar parcial.
 */
function refreshStatusLine(){
  const aiMap={off:"Desligado (2P)", easy:"Fácil", medium:"Médio", hard:"Difícil", master:"Mestre"};
  const ai = aiMap[state.aiLevel]||state.aiLevel;
  const minLvl=state.minLevel, maxLvl=state.maxLevel;
  const wl = state.wallLevel, wlDisp = (wl===10? 'A': String(wl));
  const rules=[];
  if(state.rules.same) rules.push("Same");
  if(state.rules.plus) rules.push("Plus");
  if(state.rules.samewall) rules.push("Wall("+wlDisp+")");
  if(state.rules.elemental) rules.push("Elemental");
  if(state.rules.combo) rules.push("Combo");
  $("#status-line").innerHTML = `Nível: <b>${minLvl}–${maxLvl}</b> &nbsp; IA: <b>${ai}</b> &nbsp; Regras: <b>${rules.join(" ")||"—"}</b>`;
  refreshScoreLabels();
}
function updateActiveHandIndicator(){
  handYouEl.classList.toggle("active",  state.yourTurn);
  handAiEl.classList.toggle("active", !state.yourTurn);
}

function refreshScoreLabels(){
  const ly=document.getElementById('label-you');
  const la=document.getElementById('label-ai');
  if(!ly||!la) return;
  if(state.aiLevel==='off'){ ly.textContent='Jogador 1'; la.textContent='Jogador 2'; }
  else { ly.textContent='Você'; la.textContent='Oponente'; }
}

function updateHandInteractivity(){
  document.querySelectorAll('.hand.you .card, .hand.ai .card').forEach(el=>{
    const owner=el.dataset.owner;
    const canAct=(owner==='you' && state.yourTurn && !state.busy) || (owner==='ai' && state.aiLevel==='off' && !state.yourTurn && !state.busy);
    el.classList.toggle('disabled', !canAct);
    el.draggable=canAct;
  });
}

function initUI(){
  boardEl=$("#board"); handYouEl=$("#hand-you"); handAiEl=$("#hand-ai"); bannerEl=$("#rule-banner");
  boardEl.innerHTML="";
  for(let i=0;i<9;i++){ const c=document.createElement("div"); c.className="cell"; c.dataset.index=i; c.addEventListener("click",()=>onBoardClick(i)); boardEl.appendChild(c); }
  attachBoardDnD();

  // Drawer
  const drawer=$("#drawer"), overlay=$("#overlay");
  const openDrawer=()=>{ drawer.classList.remove("hidden"); setTimeout(()=>drawer.classList.add("open"),10); overlay.classList.remove("hidden"); };
  const closeDrawer=()=>{ drawer.classList.remove("open"); setTimeout(()=>drawer.classList.add("hidden"),200); overlay.classList.add("hidden"); };
  $("#btn-menu").addEventListener("click", openDrawer);
  $("#btn-close-drawer").addEventListener("click", closeDrawer);
  $("#overlay").addEventListener("click", closeDrawer);
  $("#drawer-restart").addEventListener("click", ()=>{ closeDrawer(); restart(); });

  /* [SEÇÃO] Controles e Menu */
// Controls
  $("#rule-same").addEventListener("change",e=>{state.rules.same=e.target.checked; refreshStatusLine();});
  $("#rule-plus").addEventListener("change",e=>{state.rules.plus=e.target.checked; refreshStatusLine();});
  $("#rule-samewall").addEventListener("change",e=>{state.rules.samewall=e.target.checked; refreshStatusLine();});
  $("#rule-combo").addEventListener("change",e=>{state.rules.combo=e.target.checked; refreshStatusLine();});
  $("#rule-elemental").addEventListener("change",e=>{state.rules.elemental=e.target.checked; refreshBoardStats(); refreshStatusLine();});
  $("#ai-level").addEventListener("change",e=>{
    state.aiLevel=e.target.value;
        // Checkbox “Ocultar cartas” (menu › Adversário)
      const hideCk = document.getElementById("hide-opponent");
    if(state.aiLevel==="off"){ state.hideOpponent=false; if(hideCk){ hideCk.checked=false; hideCk.disabled=true; } }
    else { if(hideCk){ hideCk.disabled=false; } }
    renderHands(); refreshStatusLine(); updateActiveHandIndicator();
  });
  $("#hide-opponent").addEventListener("change",e=>{ if(state.aiLevel==="off"){ e.target.checked=false; state.hideOpponent=false; return;} state.hideOpponent=e.target.checked; renderHands(); refreshStatusLine();});
  const lvl=$("#max-level"); lvl.value=String(state.maxLevel); lvl.addEventListener("change",e=>{ 
    const v = Math.max(1, Math.min(10, parseInt(e.target.value,10)||10));
    if(v < state.minLevel){ state.minLevel = v; const minSel=document.getElementById("min-level"); if(minSel) minSel.value=String(v); }
    state.maxLevel = v; restart(); refreshStatusLine();
  });
  const lvlMin=$("#min-level"); if(lvlMin){ lvlMin.value=String(state.minLevel); lvlMin.addEventListener("change",e=>{
    const v = Math.max(1, Math.min(10, parseInt(e.target.value,10)||1));
    if(v > state.maxLevel){ state.maxLevel = v; const maxSel=document.getElementById("max-level"); if(maxSel) maxSel.value=String(v); }
    state.minLevel = v; restart(); refreshStatusLine();
  }); }
  const wlSel = document.getElementById("wall-level"); if(wlSel){ wlSel.value=String(state.wallLevel); wlSel.addEventListener("change", e=>{
    let v = e.target.value;
    if(v==="A" || v==="a") v="10";
    const num = Math.max(1, Math.min(10, parseInt(v,10)||5));
    state.wallLevel = num;
    refreshStatusLine();
  }); }
  const fm=$("#first-move"); fm.value=state.firstMove; fm.addEventListener("change",e=>{ state.firstMove=e.target.value; restart(); });
  $("#btn-restart").addEventListener("click",()=>{restart(); refreshStatusLine();});
  $("#sound-enabled").addEventListener("change",e=> state.soundEnabled=e.target.checked);
  $("#sound-volume").addEventListener("input",e=> state.soundVolume=parseFloat(e.target.value));
  $("#debug-mode").addEventListener("change",e=>{ state.debug=e.target.checked; $("#debug-panel").classList.toggle("hidden", !state.debug); });
  $("#debug-clear").addEventListener("click",()=> debugClear());
  const btnAgain=document.getElementById('btn-again'); if(btnAgain) btnAgain.addEventListener('click', ()=>{ document.getElementById('result-modal').classList.remove('show'); restart(); });
  const btnClose=document.getElementById('btn-close'); if(btnClose) btnClose.addEventListener('click', ()=>{ document.getElementById('result-modal').classList.remove('show'); });
  refreshStatusLine();
}

function attachBoardDnD(){
  let _hoverCell = null;
  function _hl(cell){
    if(_hoverCell && _hoverCell!==cell){ _hoverCell.classList.remove('drag-hover'); }
    if(cell){ cell.classList.add('drag-hover'); }
    _hoverCell = cell||null;
  }
  function _clearHl(){
    if(_hoverCell){ _hoverCell.classList.remove('drag-hover'); _hoverCell=null; }
  }

  boardEl.addEventListener("dragover",(e)=>{ const cell=e.target.closest(".cell"); if(!cell){ _clearHl(); return; } const idx=parseInt(cell.dataset.index,10); if(!Number.isInteger(idx) || state.busy || state.board[idx]){ _clearHl(); return; } _hl(cell); e.preventDefault(); });
  boardEl.addEventListener("drop", async (e)=>{ _clearHl();
    if(state.busy) return;
    const cell=e.target.closest(".cell"); if(!cell) return;
    const idx=parseInt(cell.dataset.index,10); if(state.board[idx]) return;
    const hindex=e.dataTransfer.getData("text/plain"); const owner=e.dataTransfer.getData("owner")||"you";
    const allowed=(owner==="you" && state.yourTurn) || (owner==="ai" && state.aiLevel==="off" && !state.yourTurn);
    if(!allowed || hindex===""||hindex==null) return;
    await playCard(owner, parseInt(hindex,10), idx);
  });
  window.addEventListener("dragend", _clearHl, {passive:true});

}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function weightedSample(list, n){ const pool=list.map(c=>({c, w:Math.max(1,c.level||1)})); const out=[]; while(out.length<n && pool.length>0){ const total=pool.reduce((s,x)=>s+x.w,0); let r=Math.random()*total; let k=0; for(;k<pool.length;k++){ r-=pool[k].w; if(r<=0) break; } if(k>=pool.length) k=pool.length-1; out.push(pool[k].c); pool.splice(k,1);} return out; }

function determineFirstTurn(){
  if(state.firstMove === "you") return true;
  if(state.firstMove === "ai") return false;
  return Math.random() < 0.5;
}

function deal(){
  // Build pool strictly within [minLevel .. maxLevel]
  let pool = CARDS.filter(c => {
    const lvl = (c.level||1);
    return lvl >= state.minLevel && lvl <= state.maxLevel;
  }).map(c=>({...c}));

  // If still empty (edge case), fall back to full set to avoid dead game,
  // but this should rarely happen given the card database.
  if(pool.length === 0){
    pool = [...CARDS].map(c=>({...c}));
  }

  // Draw up to 10 unique samples (weighted towards higher levels)
  let chosen = weightedSample(pool, Math.min(10, pool.length));

  // If we couldn't reach 10 unique cards (very narrow range), pad by sampling
  // with replacement from the same pool, keeping level constraints intact.
  while(chosen.length < 10 && pool.length > 0){
    const p = pool[Math.floor(Math.random()*pool.length)];
    chosen.push({...p});
  }

  // Shuffle and split hands
  chosen = chosen.sort(()=>Math.random()-0.5);
  state.yourHand = chosen.slice(0,5);
  state.aiHand   = chosen.slice(5,10);

  // Reset board + randomize board elements (kept as in the original)
  state.board=Array(9).fill(null);
  state.boardElements=Array(9).fill("None");
  const n=Math.floor(Math.random()*6);
  const idxs=shuffle([...Array(9).keys()]).slice(0,n);
  for(const i of idxs){
    const e=ELEMENTS[Math.floor(Math.random()*(ELEMENTS.length-1))+1];
    state.boardElements[i]=e;
  }

  state.yourTurn = determineFirstTurn();
  state.busy=false;
}function restart(){
  deal(); renderAll(); updateActiveHandIndicator(); updateHandInteractivity();
  state.aiStarts = !state.yourTurn;
  // 2P: garantir mão do oponente aberta
      // Checkbox “Ocultar cartas” (menu › Adversário)
      const hideCk = document.getElementById("hide-opponent");
  if(state.aiLevel==="off"){ state.hideOpponent=false; if(hideCk){ hideCk.checked=false; hideCk.disabled=true; } }
  else { if(hideCk){ hideCk.disabled=false; } }
  // if AI starts, trigger its move after 1s
  if(!state.yourTurn && state.aiLevel!=="off"){ aiPlay(); }
}

/** Função: getAdjustedStats
 * Retorna os valores dos lados (top/right/bottom/left) ajustados pela casa Elemental.
 * Implementa a S-rule: se o bônus +1 atinge 'A'(10), converte para 11 (exibido como 'S').
 */
function getAdjustedStats(card, index){
  const base={...card.stats}, adj={...base}, tags={T:"",R:"",B:"",L:""};
  if(state.rules.elemental && index!=null){
    const tileElem=state.boardElements[index];
    if(tileElem && tileElem!=="None"){
      if(card.element===tileElem){ for(const k of ["T","R","B","L"]){ // S-rule: se o lado é A(10) e recebe +1 do Elemental, vira 11 (mostrado como "S")
adj[k] = (adj[k]===10 ? 11 : Math.min(10, adj[k]+1)); tags[k]="boost"; } }
      else { for(const k of ["T","R","B","L"]){ adj[k] = (adj[k]===1 ? 0 : Math.max(1, adj[k]-1)) /* 0-rule: 1→0 em Elemental desfavorável */; tags[k]="penalty"; } }
    }
  }
  return {adj,tags};
}
const dirs=[ {name:"T",di:-3,opp:"B",border:[0,1,2]}, {name:"R",di:+1,opp:"L",border:[2,5,8]}, {name:"B",di:+3,opp:"T",border:[6,7,8]}, {name:"L",di:-1,opp:"R",border:[0,3,6]} ];
function neighbors(index){ const list=[]; for(const d of dirs){ const ni=index+d.di; if(d.border.includes(index) || ni<0 || ni>8){ list.push({dir:d.name, opp:d.opp, ni:null}); } else { list.push({dir:d.name, opp:d.opp, ni}); } } return list; }

/** Função: detectSamePlus
 * Analisa o tabuleiro após uma jogada e detecta ativações de Same / Plus / Same Wall.
 * Retorna as posições afetadas para o encadeamento de capturas (Combo).
 */
/* [SEÇÃO] Regras (Same/Plus/Same Wall/Combo/Elemental) */
function detectSamePlus(owner, index, placedCard){
  const placedAdj=getAdjustedStats(placedCard,index).adj;
  const neigh=neighbors(index);
  const sameEnemyIdx=[]; let sameAnyCount=0; const plusPairs=[];

  for(const nb of neigh){
    const ni = nb.ni;
    if(ni===null){ if(state.rules.same && state.rules.samewall && placedAdj[nb.dir]===state.wallLevel){ sameAnyCount++; debugLog(`Same Wall: lado ${nb.dir}=${state.wallLevel} contra parede`, "wall"); } continue; }
    const slot = state.board[ni]; if(!slot) continue;
    const oppAdj=getAdjustedStats(slot.card, ni).adj;
    if(state.rules.same && placedAdj[nb.dir]===oppAdj[nb.opp]){
      sameAnyCount++;
      if(slot.owner!==owner){ sameEnemyIdx.push(ni); debugLog(`Same vs inimigo: ${index} (${nb.dir}=${placedAdj[nb.dir]}) = ${ni} (${nb.opp}=${oppAdj[nb.opp]})`, "same"); }
      else { debugLog(`Same vs aliado: ${index} (${nb.dir}=${placedAdj[nb.dir]}) = ${ni} (${nb.opp}=${oppAdj[nb.opp]})`, "same"); }
    }
    if(state.rules.plus){ plusPairs.push({ni:ni, sum: placedAdj[nb.dir]+oppAdj[nb.opp]}); }
  }

  const sameTriggered = state.rules.same && (sameAnyCount >= 2) && (sameEnemyIdx.length >= 1);
  const sameFlipIdx = sameTriggered ? sameEnemyIdx.slice() : [];
  let plusTriggered=false; const plusFlipIdx=[];
  if(state.rules.plus){
    const sums = new Map();
    for(const p of plusPairs){ if(!sums.has(p.sum)) sums.set(p.sum, []); sums.get(p.sum).push(p); }
    for(const [sum, arr] of sums){
      if(arr.length>=2){
        plusTriggered=true;
        arr.forEach(x=>{ const slot = state.board[x.ni]; if(slot && slot.owner!==owner){ if(!plusFlipIdx.includes(x.ni)) plusFlipIdx.push(x.ni); } });
        debugLog(`Plus: soma ${sum} em pelo menos dois lados`, "plus");
      }
    }
  }
  return { sameTriggered, plusTriggered, sameFlipIdx, plusFlipIdx };
}

function normalFlipReasons(owner, index, placedCard){
  const placedAdj=getAdjustedStats(placedCard,index).adj, flips=[], reasons=[];
  for(const nb of neighbors(index)){
    const ni = nb.ni; if(ni===null) continue;
    const slot=state.board[ni]; if(!slot||slot.owner===owner) continue;
    const oppAdj=getAdjustedStats(slot.card, ni).adj;
    if(placedAdj[nb.dir] > oppAdj[nb.opp]){ flips.push(ni); reasons.push({ni:ni, dir:nb.dir, my:placedAdj[nb.dir], theirs:oppAdj[nb.opp]}); }
  }
  return {flips, reasons};
}

/** Função: renderHands
 * Desenha as mãos do jogador e da IA. Considera a opção 'Ocultar cartas'.
 */
function renderHands(){
  handYouEl.innerHTML=""; state.yourHand.forEach((c,i)=> handYouEl.appendChild(createHandCard(c,"you",i)));
  const faceDownOpp = (state.aiLevel!=="off") && state.hideOpponent;
  handAiEl.innerHTML=""; state.aiHand.forEach((c,i)=> handAiEl.appendChild(createHandCard(c,"ai",i, faceDownOpp)));
  updateActiveHandIndicator();
  updateHandInteractivity();
}
function createHandCard(card, owner, handIndex, faceDown=false){
  const w=document.createElement("div"); w.className="card owner-"+owner;
  const canAct = (owner==="you" && state.yourTurn && !state.busy) || (owner==="ai" && state.aiLevel==="off" && !state.yourTurn && !state.busy);
  w.draggable=canAct; w.dataset.owner=owner; w.dataset.hindex=handIndex;
  const inner=document.createElement("div"); inner.className="card-inner";
  const f=document.createElement("div"); f.className="card-face front";
  const img=document.createElement("img"); img.src=card.image; img.alt=card.name; f.appendChild(img);
  if(!faceDown){ const st=getAdjustedStats(card,null).adj; const stats=document.createElement("div"); stats.className="stats-central";
    stats.innerHTML=`<div class="pip T">${showStat(st.T)}</div><div class="pip R">${showStat(st.R)}</div><div class="pip B">${showStat(st.B)}</div><div class="pip L">${showStat(st.L)}</div>`; f.appendChild(stats); }
  const b=document.createElement("div"); b.className="card-face back"; const backImg=document.createElement("img"); backImg.src="assets/ui/card_back.png"; backImg.alt="Card back"; b.appendChild(backImg);
  inner.appendChild(f); inner.appendChild(b); w.appendChild(inner);
  if(faceDown) w.classList.add("flipped");
  w.classList.toggle("disabled", !canAct);

  w.addEventListener("dragstart",(e)=>{
    const owner=e.currentTarget.dataset.owner;
    const allowed = (owner==="you" && state.yourTurn && !state.busy) || (owner==="ai" && state.aiLevel==="off" && !state.yourTurn && !state.busy);
    if(!allowed){ e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", e.currentTarget.dataset.hindex);
    e.dataTransfer.setData("owner", owner);
    boardEl.classList.add("placing");
  });
  w.addEventListener("dragend",()=> boardEl.classList.remove("placing"));

  w.addEventListener("click",()=>{
    const owner=w.dataset.owner;
    const allowed = (owner==="you" && state.yourTurn && !state.busy) || (owner==="ai" && state.aiLevel==="off" && !state.yourTurn && !state.busy);
    if(!allowed) return;
    const already=w.classList.contains("selected");
    document.querySelectorAll(".hand.you .card.selected, .hand.ai .card.selected").forEach(e=> e.classList.remove("selected"));
    if(already){ w.classList.remove("selected"); boardEl.classList.remove("placing"); }
    else { w.classList.add("selected"); boardEl.classList.add("placing"); }
  });
  return w;
}
/** Função: showStat
 * Formata números dos lados: 1..9, A(10) e S(11) (apenas quando ativo por Elemental +1).
 */
function showStat(n){ return n===11 ? "S" : (n===10 ? "A" : n); }

/** Função: renderBoard
 * Desenha o tabuleiro e as cartas nele. Aplica o overlay de propriedade (verde/vermelho).
 */
/* [SEÇÃO] Renderização (Tabuleiro e Mãos) */
function renderBoard(){
  for(let i=0;i<9;i++){
    const cell=boardEl.children[i], elem=state.boardElements[i];
    if(elem && elem!=="None"){ cell.dataset.element=elem; cell.style.background="linear-gradient(to bottom right, rgba(96,165,250,.12), rgba(96,165,250,.02))"; let badge=cell.querySelector(".element-badge"); if(!badge){ badge=document.createElement("div"); badge.className="element-badge"; cell.appendChild(badge); } badge.textContent=elem; }
    else{ cell.style.background=""; cell.removeAttribute("data-element"); const b=cell.querySelector(".element-badge"); if(b) b.remove(); }
    const old=cell.querySelector(".tile-card"); if(old) old.remove();
    const slot=state.board[i];
    cell.classList.toggle("empty", !slot); cell.classList.toggle("filled", !!slot);
    if(slot){ cell.appendChild(createTileCard(slot.card, slot.owner, i)); }
  }
}
function createTileCard(card, owner, index){
  const {adj,tags}=getAdjustedStats(card,index);
  const w=document.createElement("div"); w.className="tile-card owner-"+owner;
  w.innerHTML = `
    <img src="${card.image}" alt="${card.name}" />
    <div class="stats-central">
      <div class="pip T ${tags.T}">${showStat(adj.T)}</div>
      <div class="pip R ${tags.R}">${showStat(adj.R)}</div>
      <div class="pip B ${tags.B}">${showStat(adj.B)}</div>
      <div class="pip L ${tags.L}">${showStat(adj.L)}</div>
    </div>
  `;
  return w;
}
function refreshBoardStats(){
  for(let i=0;i<9;i++){
    const slot=state.board[i]; if(!slot) continue;
    const {adj,tags}=getAdjustedStats(slot.card,i);
    const cell = boardEl.children[i];
    const container = cell.querySelector(".stats-central"); if(!container) continue;
    const parts = { T: container.querySelector(".pip.T"), R: container.querySelector(".pip.R"), B: container.querySelector(".pip.B"), L: container.querySelector(".pip.L") };
    for(const k of ["T","R","B","L"]){ const el = parts[k]; if(!el) continue; el.className = `pip ${k} ${tags[k]||""}`.trim(); el.textContent = showStat(adj[k]); }
  }
}
function renderScores(){ const you = state.yourHand.length + state.board.filter(s=>s && s.owner==="you").length; const ai  = state.aiHand.length + state.board.filter(s=>s && s.owner==="ai").length; const sy=$("#score-you"), sa=$("#score-ai"); if(sy) sy.textContent=String(you); if(sa) sa.textContent=String(ai); }
function renderAll(){ renderHands(); renderBoard(); renderScores(); }

async function onBoardClick(i){
  if(state.busy||state.board[i]) return;
  const sel = document.querySelector(".hand.you .card.selected") || document.querySelector(".hand.ai .card.selected");
  if(!sel) return;
  const owner = sel.dataset.owner;
  const allowed = (owner==="you" && state.yourTurn) || (owner==="ai" && state.aiLevel==="off" && !state.yourTurn);
  if(!allowed) return;
  const hindex=parseInt(sel.dataset.hindex,10);
  await playCard(owner, hindex, i);
}

function onDragStart(e){ /* replaced by inline listeners */ }
function onDragEnd(){ /* replaced by inline listeners */ }

function countBoard(owner){ return state.board.reduce((a,s)=>a+(s&&s.owner===owner?1:0),0); }
function emptyCells(){ const r=[]; for(let i=0;i<9;i++) if(!state.board[i]) r.push(i); return r; }

async function playCard(owner, handIndex, cellIndex){
  if(state.busy) return; if(state.board[cellIndex]) return;
  if(owner==="you" && !state.yourTurn && state.aiLevel!=="off") return;
  if(owner==="ai" && (state.aiLevel!=="off" ? state.yourTurn : state.yourTurn)){} // permissões tratadas no caller
  state.busy=true; updateHandInteractivity();
  const card=(owner==="you"? state.yourHand.splice(handIndex,1)[0] : state.aiHand.splice(handIndex,1)[0]);
  state.board[cellIndex]={card, owner};
  AudioManager.play('place');
  renderHands(); renderBoard(); renderScores();
  debugLog(`Jogada: ${owner} colocou "${card.name}" em ${cellIndex}`, "normal");

  const res=detectSamePlus(owner, cellIndex, card);
  const specialSet=new Set();
  if(res.sameTriggered || res.plusTriggered){
    showBanner((res.sameTriggered && res.plusTriggered)?"SAME + PLUS":(res.sameTriggered?"SAME":"PLUS"));
    await sleep(350);
    const flipList=[...new Set([...(res.sameFlipIdx||[]), ...(res.plusFlipIdx||[])])];
    for(const idx of flipList){
      showReason(idx, (res.sameFlipIdx.includes(idx)&&res.plusFlipIdx.includes(idx))?"Same+Plus":(res.sameFlipIdx.includes(idx)?"Same":"Plus"));
      await flipAt(idx, owner); specialSet.add(idx);
    }
    if(state.rules.combo){ for(const idx of flipList){ debugLog(`Combo a partir de ${idx}`, "combo"); await comboFrom(idx, owner); } }
  }

  const nf = normalFlipReasons(owner, cellIndex, card);
  const remaining = nf.flips.filter(i=>!specialSet.has(i));
  if(remaining.length){
    debugLog(`Capturas normais: ${remaining.join(", ")}`, "normal");
    for(const r of nf.reasons){ if(!remaining.includes(r.ni)) continue; showReason(r.ni, `Normal ${r.dir}: ${r.my} > ${r.theirs}`); await flipAt(r.ni, owner); }
  }

  if(emptyCells().length===0 || (state.yourHand.length===0 && state.aiHand.length===0)){ await sleep(350); endGame(); state.busy=false; return; }
  state.yourTurn=!state.yourTurn;
  document.querySelectorAll('.card.selected').forEach(e=>e.classList.remove('selected'));
  boardEl.classList.remove("placing");
  updateActiveHandIndicator();
  renderHands();
  updateHandInteractivity();
  if(!state.yourTurn && state.aiLevel!=="off"){ state.busy=false; updateHandInteractivity(); await sleep(1000); await aiPlay(); return; }
  state.busy=false; updateHandInteractivity();
}

async function comboFrom(index, newOwner){
  const slot=state.board[index]; if(!slot||slot.owner!==newOwner) return;
  const targets=[];
  for(const nb of neighbors(index)){
    const ni = nb.ni; if(ni===null) continue;
    const nslot=state.board[ni]; if(!nslot||nslot.owner===newOwner) continue;
    const adjA=getAdjustedStats(slot.card,index).adj, adjB=getAdjustedStats(nslot.card,ni).adj;
    if(adjA[nb.dir]>adjB[nb.opp]) targets.push(ni);
  }
  if(targets.length>0) showBanner("COMBO");
  for(const t of targets){ showReason(t, "Combo"); debugLog(`Combo: ${index} → ${t}`,"combo"); await flipAt(t,newOwner); await comboFrom(t,newOwner); }
}

async function flipAt(index,newOwner){
  const cell=boardEl.children[index], tile=cell.querySelector(".tile-card");
  if(tile){ tile.classList.add("flip-anim"); AudioManager.play('flip'); await sleep(300); }
  if(state.board[index]){ state.board[index].owner=newOwner; renderBoard(); renderScores(); }
  await sleep(50);
}

function showBanner(text){
  bannerEl.textContent=text; bannerEl.classList.remove("hidden");
  const t=(text||"").toUpperCase();
  if(t.includes("COMBO")) AudioManager.play("combo");
  else if(t.includes("PLUS")) AudioManager.play("plus");
  else if(t.includes("SAME")) AudioManager.play("same");
  setTimeout(()=>bannerEl.classList.add("hidden"),1000);
}

// ---- AI helpers & levels ----
/** Função: snapshot
 * Cria um clone imutável do estado atual para simulações.
 * Usado pela IA ao testar jogadas sem afetar o jogo real.
 */
function snapshot(){ return { board:JSON.parse(JSON.stringify(state.board)), boardElements:[...state.boardElements], yourHand:JSON.parse(JSON.stringify(state.yourHand)), aiHand:JSON.parse(JSON.stringify(state.aiHand)), rules:JSON.parse(JSON.stringify(state.rules)) }; }
function snapshotOf(ns){ return JSON.parse(JSON.stringify(ns)); }
function neighborsSim(i){ return neighbors(i); }
/** Função: getAdjustedStatsSim
 * Versão para simulação (AI); mesma lógica do getAdjustedStats, sem tocar no DOM.
 */
function getAdjustedStatsSim(ns, card, index){
  const adj={...card.stats};
  if(ns.rules.elemental && index!=null){ const tileElem=ns.boardElements[index]; if(tileElem && tileElem!=="None"){ if(card.element===tileElem){ for(const k of ["T","R","B","L"]) // S-rule: se o lado é A(10) e recebe +1 do Elemental, vira 11 (mostrado como "S")
adj[k] = (adj[k]===10 ? 11 : Math.min(10, adj[k]+1)); } else { for(const k of ["T","R","B","L"]) adj[k] = (adj[k]===1 ? 0 : Math.max(1, adj[k]-1)) /* 0-rule: 1→0 em Elemental desfavorável */; } } }
  return adj;
}
/* [SEÇÃO] Regras (Same/Plus/Same Wall/Combo/Elemental) */
function detectSamePlusSim(ns, owner, index, card){
  const placedAdj=getAdjustedStatsSim(ns,card,index);
  const neigh=neighborsSim(index);
  const eqEnemy=[], plus=[]; let eqAny=0;
  for(const nb of neigh){
    const ni=nb.ni;
    if(ni===null){ if(ns.rules.same && ns.rules.samewall && placedAdj[nb.dir]===5){ eqAny++; } continue; }
    const slot=ns.board[ni]; if(!slot) continue;
    const oppAdj=getAdjustedStatsSim(ns,slot.card, ni);
    if(ns.rules.same && placedAdj[nb.dir]===oppAdj[nb.opp]){ eqAny++; if(slot.owner!==owner) eqEnemy.push(ni); }
    if(ns.rules.plus) plus.push({ni:ni, sum: placedAdj[nb.dir]+oppAdj[nb.opp]});
  }
  const sameTrig = ns.rules.same && (eqAny >= 2) && (eqEnemy.length >= 1);
  let plusTrig=false; const plusFlip=[];
  if(ns.rules.plus){ const map=new Map(); for(const p of plus){ if(!map.has(p.sum)) map.set(p.sum,[]); map.get(p.sum).push(p.ni); } for(const [s,idxs] of map){ if(idxs.length>=2){ plusTrig=true; idxs.forEach(x=>{ if(!plusFlip.includes(x)) plusFlip.push(x); }); } } }
  const sameFlip = sameTrig ? eqEnemy.slice() : [];
  return { sameTriggered:sameTrig, plusTriggered:plusTrig, sameFlipIdx:sameFlip, plusFlipIdx:plusFlip };
}
function normalFlipTargetsSim(ns, owner, index, card){
  const adj=getAdjustedStatsSim(ns,card,index), flips=[];
  for(const nb of neighborsSim(index)){ const ni=nb.ni; if(ni===null) continue; const slot=ns.board[ni]; if(!slot||slot.owner===owner) continue; const oppAdj=getAdjustedStatsSim(ns,slot.card, ni); if(adj[nb.dir]>oppAdj[nb.opp]) flips.push(ni); }
  return flips;
}
function comboFromSim(ns, index, newOwner){
  for(const nb of neighborsSim(index)){ const ni=nb.ni; if(ni===null) continue; const a=ns.board[index], b=ns.board[ni]; if(!a||!b||b.owner===newOwner) continue; const adjA=getAdjustedStatsSim(ns,a.card,index), adjB=getAdjustedStatsSim(ns,b.card,ni); if(adjA[nb.dir]>adjB[nb.opp]){ b.owner=newOwner; comboFromSim(ns, ni, newOwner); } }
}
/** Função: simulatePlay
 * Aplica, em um snapshot, o efeito de jogar uma carta em uma casa.
 * Resolve viradas, Same/Plus/Same Wall e Combo, devolvendo o novo estado simulado.
 */
function simulatePlay(sim, owner, handIndex, cellIndex){
  const ns=JSON.parse(JSON.stringify(sim));
  const hand=owner==="you"?ns.yourHand:ns.aiHand;
  const card=hand.splice(handIndex,1)[0];
  ns.board[cellIndex]={card, owner};
  const r=detectSamePlusSim(ns, owner, cellIndex, card);
  const special=new Set();
  if(r.sameTriggered){ r.sameFlipIdx.forEach(i=>{ if(ns.board[i] && ns.board[i].owner!==owner){ ns.board[i].owner=owner; special.add(i);} }); }
  if(r.plusTriggered){ r.plusFlipIdx.forEach(i=>{ if(ns.board[i] && ns.board[i].owner!==owner){ ns.board[i].owner=owner; special.add(i);} }); }
  if(ns.rules.combo){ for(const idx of special){ comboFromSim(ns, idx, owner); } }
  const nrm=normalFlipTargetsSim(ns, owner, cellIndex, card);
  for(const i of nrm){ if(!special.has(i) && ns.board[i] && ns.board[i].owner!==owner) ns.board[i].owner=owner; }
  return ns;
}
function evaluate(ns){ const ai=ns.aiHand.length + ns.board.filter(s=>s && s.owner==="ai").length; const you=ns.yourHand.length + ns.board.filter(s=>s && s.owner==="you").length; return ai-you; }
function isTerminal(ns){ return ns.board.every(Boolean) || (ns.yourHand.length===0 && ns.aiHand.length===0); }
/** Função: minimaxRoot
 * Nó raiz do minimax (versão otimizada para escolher a jogada inicial).
 * A profundidade é passada por parâmetro (ex.: 2 para 'hard', 3 para 'master').
 */
function minimaxRoot(depth){ const moves=generateAIMoves(); let best=null, bestVal=-Infinity; for(const m of moves){ const val=minimax(simulatePlay(snapshot(),"ai",m.handIndex,m.cellIndex), depth-1, false, -Infinity, +Infinity); if(val>bestVal){ bestVal=val; best=m; } } return best; }
function minimax(ns, depth, maximizing, alpha, beta){
  if(depth===0 || isTerminal(ns)) return evaluate(ns);
  const cells=[]; for(let i=0;i<9;i++) if(!ns.board[i]) cells.push(i);
  if(maximizing){
    let maxEval=-Infinity;
    for(let hi=0; hi<ns.aiHand.length; hi++){
      for(const ci of cells){
        const child=simulatePlay(snapshotOf(ns),"ai",hi,ci);
        const val=minimax(child, depth-1, false, alpha, beta);
        maxEval=Math.max(maxEval,val); alpha=Math.max(alpha,val);
        if(beta<=alpha) break;
      }
    } return maxEval;
  }else{
    let minEval=+Infinity;
    for(let hi=0; hi<ns.yourHand.length; hi++){
      for(const ci of cells){
        const child=simulatePlay(snapshotOf(ns),"you",hi,ci);
        const val=minimax(child, depth-1, true, alpha, beta);
        minEval=Math.min(minEval,val); beta=Math.min(beta,val);
        if(beta<=alpha) break;
      }
    } return minEval;
  }
}
function generateAIMoves(){ const cells=emptyCells(), res=[]; state.aiHand.forEach((c,hi)=> cells.forEach(ci=> res.push({handIndex:hi, cellIndex:ci, card:c}))); return res; }
/** Função: chooseHeuristic
 * Escolhe a melhor jogada dentre 'moves' usando uma heurística leve.
 * Quando opts.ignoreSamePlusWall = true, a avaliação ignora Same/Plus/Same Wall (Elemental ainda conta).
 */
function chooseHeuristic(moves, opts){ opts=opts||{};
  let best=null, bestScore=-1e9;
  for(const m of moves){
    let snap = snapshot(); // Modo “aprendiz” do nível Médio: 50% das vezes ignora Same/Plus/Same Wall
if(opts.ignoreSamePlusWall){ snap.rules={...snap.rules, same:false, plus:false, samewall:false}; } const ns=simulatePlay(snap, "ai", m.handIndex, m.cellIndex);
    const ai=ns.aiHand.length + ns.board.filter(s=>s && s.owner==="ai").length;
    const you=ns.yourHand.length + ns.board.filter(s=>s && s.owner==="you").length;
    const diff=ai-you;
    const corner=[0,2,6,8].includes(m.cellIndex) ? 0.8 : 0;
    const center=(m.cellIndex===4) ? 0.4 : 0;
    const score=diff+corner+center;
    if(score>bestScore){ bestScore=score; best=m; }
  }
  return best || moves[Math.floor(Math.random()*moves.length)];
}
/*[SEÇÃO] IA */
async function aiPlay(){
  const moves=generateAIMoves();
  if(moves.length===0){ state.yourTurn=true; updateTurnIndicator(); renderHands(); updateHandInteractivity(); return; }
  const isFirstAIMove = state.aiStarts && state.board.every(s=>!s);
  let chosen;
  if(state.aiLevel==="easy"){
    chosen = moves[Math.floor(Math.random()*moves.length)];
    debugLog(`AI easy → mão ${chosen.handIndex}, casa ${chosen.cellIndex}`,"normal");
  }
  else if(state.aiLevel==="medium"){
    if(isFirstAIMove){
      chosen = moves[Math.floor(Math.random()*moves.length)];
    } else {
      const forgetRules = Math.random() < 0.5;
      chosen = chooseHeuristic(moves, {ignoreSamePlusWall: forgetRules}) || moves[Math.floor(Math.random()*moves.length)];
    }
    debugLog(`AI medium → mão ${chosen.handIndex}, casa ${chosen.cellIndex}`,"normal");
  }
  else if(state.aiLevel==="hard"){
    if(isFirstAIMove){
      chosen = minimaxRoot(2) || chooseHeuristic(moves) || moves[Math.floor(Math.random()*moves.length)];
    } else {
      chosen = chooseHeuristic(moves) || minimaxRoot(2) || moves[Math.floor(Math.random()*moves.length)];
    }
    debugLog(`AI hard → mão ${chosen.handIndex}, casa ${chosen.cellIndex}`,"normal");
  }
  else if(state.aiLevel==="master"){
    chosen = minimaxRoot(3) || minimaxRoot(2) || chooseHeuristic(moves) || moves[Math.floor(Math.random()*moves.length)];
    debugLog(`AI master → mão ${chosen.handIndex}, casa ${chosen.cellIndex}`,"normal");
  }
  else {
    chosen = minimaxRoot(2) || chooseHeuristic(moves) || moves[Math.floor(Math.random()*moves.length)];
    debugLog(`AI default → mão ${chosen.handIndex}, casa ${chosen.cellIndex}`,"normal");
  }
return playCard("ai", chosen.handIndex, chosen.cellIndex);
}

function endGame(){
  const ai=state.aiHand.length + countBoard("ai");
  const you=state.yourHand.length + countBoard("you");
  const diff = you - ai;
  const titleEl = document.getElementById("result-title");
  const detailEl = document.getElementById("result-detail");
  let msg, sfx;
  if(state.aiLevel==="off"){
    if(diff>0){ msg="Jogador 1 venceu!"; sfx="win"; }
    else if(diff<0){ msg="Jogador 2 venceu!"; sfx="win"; }
    else { msg="Empate!"; sfx="draw"; }
  } else {
    if(diff>0){ msg="Você venceu!"; sfx="win"; }
    else if(diff<0){ msg="Você perdeu."; sfx="lose"; }
    else { msg="Empate!"; sfx="draw"; }
  }
  AudioManager.play(sfx);
  if(titleEl) titleEl.textContent = msg;
  if(detailEl) detailEl.textContent = (state.aiLevel==='off' ? `Placar final — Jogador 1: ${you} • Jogador 2: ${ai}` : `Placar final — Você: ${you} • Oponente: ${ai}`);
  const modal=document.getElementById("result-modal");
  if(modal) modal.classList.add("show");
}

document.addEventListener("DOMContentLoaded", ()=>{ initUI(); restart(); });
