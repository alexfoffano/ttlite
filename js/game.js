/* === Triple Triad - Game Logic (v15 - Final Polish) === */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ELEMENTS = ["None","Fire","Ice","Thunder","Earth","Poison","Wind","Water","Holy"];

// Audio Manager
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
  firstMove: "random", aiStarts: false,
  deckSelection: [] 
};

const $ = (s)=>document.querySelector(s);
let boardEl, handYouEl, handAiEl, bannerEl;

function debugLog(msg, tag){ if(!state.debug) return; const log=$("#debug-log"); if(!log) return; const div=document.createElement("div"); div.className="line"; const t=document.createElement("span"); t.className="tag "+(tag||""); t.textContent=(tag||"DBG").toUpperCase(); const s=document.createElement("span"); s.textContent=" "+msg; div.append(t,s); log.append(div); log.scrollTop=log.scrollHeight; console.log("TT-Debug",tag||"",msg); }
function debugClear(){ const log=$("#debug-log"); if(log) log.innerHTML=""; }
function showReason(idx, text){ if(!state.debug) return; const cell=boardEl.children[idx]; if(!cell) return; const b=document.createElement("div"); b.className="flip-reason"; b.textContent=text; cell.appendChild(b); setTimeout(()=>{ if(b.parentNode) b.parentNode.removeChild(b); }, 1000); }

function refreshStatusLine(){
  const aiMap={off:"Desligado (2P)", easy:"Fácil", medium:"Médio", hard:"Difícil", master:"Mestre"};
  const rules=[]; if(state.rules.same) rules.push("Same"); if(state.rules.plus) rules.push("Plus"); if(state.rules.samewall) rules.push("Wall("+state.wallLevel+")"); if(state.rules.elemental) rules.push("Elemental"); if(state.rules.combo) rules.push("Combo");
  $("#status-line").innerHTML = `Nível: <b>${state.minLevel}–${state.maxLevel}</b> &nbsp; IA: <b>${aiMap[state.aiLevel]||state.aiLevel}</b> &nbsp; Regras: <b>${rules.join(" ")||"—"}</b>`;
  refreshScoreLabels();
}

function refreshScoreLabels(){
  const ly=$("#label-you"), la=$("#label-ai");
  if(!ly||!la) return;
  if(state.aiLevel==='off'){ ly.textContent='Jogador 1'; la.textContent='Jogador 2'; }
  else { ly.textContent='Você'; la.textContent='Oponente'; }
}

function updateActiveHandIndicator(){
  handYouEl.classList.toggle("active",  state.yourTurn);
  handAiEl.classList.toggle("active", !state.yourTurn);
}

function updateHandInteractivity(){
  document.querySelectorAll('.hand .card').forEach(el=>{
    const owner=el.dataset.owner;
    let canAct = false;
    if(state.aiLevel === "off") {
        canAct = (owner === 'you' && state.yourTurn) || (owner === 'ai' && !state.yourTurn);
    } else {
        canAct = (owner === 'you' && state.yourTurn);
    }
    
    if(state.busy) canAct = false;
    
    el.classList.toggle('disabled', !canAct);
    el.draggable=canAct;
  });
}

function initUI(){
  boardEl=$("#board"); handYouEl=$("#hand-you"); handAiEl=$("#hand-ai"); bannerEl=$("#rule-banner");
  boardEl.innerHTML="";
  for(let i=0;i<9;i++){ const c=document.createElement("div"); c.className="cell"; c.dataset.index=i; c.addEventListener("click",()=>onBoardClick(i)); boardEl.appendChild(c); }
  
  const drawer=$("#drawer"), overlay=$("#overlay");
  const closeDrawer=()=>{ drawer.classList.remove("open"); setTimeout(()=>drawer.classList.add("hidden"),200); overlay.classList.add("hidden"); };
  $("#btn-menu").addEventListener("click", ()=>{ drawer.classList.remove("hidden"); setTimeout(()=>drawer.classList.add("open"),10); overlay.classList.remove("hidden"); });
  $("#btn-close-drawer").addEventListener("click", closeDrawer);
  $("#overlay").addEventListener("click", closeDrawer);
  $("#drawer-restart").addEventListener("click", ()=>{ closeDrawer(); openDeckBuilder(); }); 

  $("#rule-same").addEventListener("change",e=>{state.rules.same=e.target.checked; refreshStatusLine();});
  $("#rule-plus").addEventListener("change",e=>{state.rules.plus=e.target.checked; refreshStatusLine();});
  $("#rule-samewall").addEventListener("change",e=>{state.rules.samewall=e.target.checked; refreshStatusLine();});
  $("#rule-combo").addEventListener("change",e=>{state.rules.combo=e.target.checked; refreshStatusLine();});
  $("#rule-elemental").addEventListener("change",e=>{state.rules.elemental=e.target.checked; refreshBoardStats(); refreshStatusLine();});
  
  $("#ai-level").addEventListener("change",e=>{
    state.aiLevel=e.target.value;
    const hideCk=$("#hide-opponent");
    if(state.aiLevel==="off"){ state.hideOpponent=false; if(hideCk){ hideCk.checked=false; hideCk.disabled=true; } }
    else { if(hideCk) hideCk.disabled=false; }
    renderHands(); refreshStatusLine(); updateActiveHandIndicator();
  });
  
  $("#hide-opponent").addEventListener("change",e=>{ if(state.aiLevel==="off") return; state.hideOpponent=e.target.checked; renderHands(); });
  
  // Deck Builder UI
  $("#btn-filter-apply").addEventListener("click", ()=> renderDeckGrid());
  
  // Botão Batalhar (Manual)
  $("#btn-start-battle").addEventListener("click", ()=> {
      document.getElementById("deck-modal").classList.add("hidden");
      startBattleWithSelection();
  });

  // Botão Aleatório (Quick Play)
  $("#btn-random-deck").addEventListener("click", ()=> {
      startRandomBattle();
  });

  const changeLvl = (isMax, val) => {
      val = Math.max(1, Math.min(10, parseInt(val)||1));
      if(isMax){ state.maxLevel=val; if(state.minLevel>val) state.minLevel=val; }
      else { state.minLevel=val; if(state.maxLevel<val) state.maxLevel=val; }
      $("#min-level").value=state.minLevel; $("#max-level").value=state.maxLevel;
      $("#filter-min").value = state.minLevel;
      $("#filter-max").value = state.maxLevel;
      openDeckBuilder(); 
      refreshStatusLine();
  };
  $("#max-level").addEventListener("change",e=>changeLvl(true,e.target.value));
  $("#min-level").addEventListener("change",e=>changeLvl(false,e.target.value));
  $("#wall-level").addEventListener("change",e=>{ let v=e.target.value; if(v==="A"||v==="a")v="10"; state.wallLevel=parseInt(v)||5; refreshStatusLine(); });
  
  $("#first-move").addEventListener("change",e=>{ state.firstMove=e.target.value; });
  $("#btn-restart").addEventListener("click",()=>openDeckBuilder());
  $("#sound-enabled").addEventListener("change",e=>state.soundEnabled=e.target.checked);
  $("#sound-volume").addEventListener("input",e=>state.soundVolume=parseFloat(e.target.value));
  $("#debug-mode").addEventListener("change",e=>{ state.debug=e.target.checked; $("#debug-panel").classList.toggle("hidden", !state.debug); });
  $("#debug-clear").addEventListener("click", debugClear);
  
  $("#btn-again").addEventListener("click", ()=>{ $("#result-modal").classList.remove("show"); openDeckBuilder(); });
  $("#btn-close").addEventListener("click", ()=>{ $("#result-modal").classList.remove("show"); });
  
  refreshStatusLine();
}

/* --- DECK BUILDER LOGIC --- */
function openDeckBuilder(){
    state.deckSelection = [];
    $("#deck-count").textContent = "0";
    $("#deck-preview").innerHTML = "";
    $("#btn-start-battle").disabled = true;
    
    const modal = document.getElementById("deck-modal");
    modal.classList.remove("hidden");
    
    // Sincroniza inputs com o state global
    $("#filter-min").value = state.minLevel;
    $("#filter-max").value = state.maxLevel;
    
    renderDeckGrid();
}

function renderDeckGrid(){
    const min = parseInt($("#filter-min").value)||1;
    const max = parseInt($("#filter-max").value)||10;
    
    // Atualiza APENAS state (visual), sem travar lógica de deal ainda
    state.minLevel = min; state.maxLevel = max; 
    refreshStatusLine();

    const grid = $("#deck-grid");
    grid.innerHTML = "";
    
    const pool = CARDS.filter(c => (c.level||1)>=min && (c.level||1)<=max);
    
    pool.forEach(card => {
        const el = document.createElement("div");
        el.className = "deck-card";
        if(state.deckSelection.find(c=>c.id===card.id)) el.classList.add("selected");
        
        el.innerHTML = `
            <img src="${card.image}" loading="lazy" title="${card.name} (Lvl ${card.level})">
            ${getPipHtml(card)} 
        `;
        
        el.addEventListener("click", ()=> toggleDeckCard(card, el));
        grid.appendChild(el);
    });
}

function toggleDeckCard(card, element){
    const idx = state.deckSelection.findIndex(c=>c.id === card.id);
    
    if(idx >= 0){
        state.deckSelection.splice(idx, 1);
        element.classList.remove("selected");
    } else {
        if(state.deckSelection.length < 5){
            state.deckSelection.push(card);
            element.classList.add("selected");
        }
    }
    updateDeckUI();
}

function updateDeckUI(){
    const count = state.deckSelection.length;
    $("#deck-count").textContent = count;
    $("#btn-start-battle").disabled = (count !== 5);
    
    const preview = $("#deck-preview");
    preview.innerHTML = "";
    state.deckSelection.forEach(c => {
        const img = document.createElement("img");
        img.src = c.image;
        preview.appendChild(img);
    });
}

function startBattleWithSelection(){
    deal(state.deckSelection);
    restartGameUI();
}

function startRandomBattle(){
    // Lê os filtros atuais do modal
    const min = parseInt($("#filter-min").value)||1;
    const max = parseInt($("#filter-max").value)||10;
    
    // Atualiza o state global (pois o usuário pediu explicitamente esse range no modal)
    state.minLevel = min;
    state.maxLevel = max;

    // Gera mão aleatória (ponderada) para o Jogador
    const randomDeck = weightedRandomHand(5, min, max);
    
    // Inicia
    document.getElementById("deck-modal").classList.add("hidden");
    deal(randomDeck);
    restartGameUI();
}

/* ------------------------- */

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// NOVA: Sorteio Ponderado (Níveis altos têm mais peso)
function weightedRandomHand(count, min, max){
    // Filtra pool
    let pool = CARDS.filter(c => (c.level||1)>=min && (c.level||1)<=max);
    if(pool.length < count) pool = CARDS; // Fallback

    // Peso = Nível da carta (Nível 10 é 10x mais provável que Nível 1)
    const weightedPool = pool.map(c => ({ card: c, weight: (c.level||1) }));
    
    const out = [];
    
    while(out.length < count && weightedPool.length > 0){
        const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);
        let r = Math.random() * totalWeight;
        
        let selectedIndex = -1;
        for(let i=0; i<weightedPool.length; i++){
            r -= weightedPool[i].weight;
            if(r <= 0){
                selectedIndex = i;
                break;
            }
        }
        if(selectedIndex === -1) selectedIndex = weightedPool.length - 1;
        
        out.push({...weightedPool[selectedIndex].card});
        
        // Remove do pool para evitar duplicatas
        weightedPool.splice(selectedIndex, 1);
    }
    
    // Completa se faltar
    while(out.length < count){
        const randomFallback = pool[Math.floor(Math.random()*pool.length)];
        out.push({...randomFallback});
    }

    return out;
}

function deal(playerChoice = null){
  // Definição do Range da IA para esta partida (Variáveis Locais!)
  let aiMin = state.minLevel;
  let aiMax = state.maxLevel;

  // 1. Mão do Jogador
  if(playerChoice && playerChoice.length === 5){
      state.yourHand = playerChoice.map(c=>({...c})); 

      // ADAPTAÇÃO DA IA:
      // Se o jogador escolheu cartas (manualmente ou via random button), 
      // a IA deve jogar no mesmo nível dessas cartas.
      const levels = state.yourHand.map(c => c.level || 1);
      aiMin = Math.min(...levels);
      aiMax = Math.max(...levels);
      
      // NOTA: Não alteramos state.minLevel aqui para preservar a seleção do menu.
      
  } else {
      // Se não houver escolha (ex: first load), usa o padrão global
      state.yourHand = weightedRandomHand(5, state.minLevel, state.maxLevel);
  }

  // 2. Mão da IA (Usa o range calculado localmente)
  state.aiHand = weightedRandomHand(5, aiMin, aiMax);
  
  // 3. Tabuleiro
  state.board=Array(9).fill(null);
  state.boardElements=Array(9).fill("None");
  if(state.rules.elemental){
      const n=Math.floor(Math.random()*6);
      const idxs=shuffle([...Array(9).keys()]).slice(0,n);
      for(const i of idxs) state.boardElements[i]=ELEMENTS[Math.floor(Math.random()*(ELEMENTS.length-1))+1];
  }

  state.yourTurn = (state.firstMove==="you") ? true : (state.firstMove==="ai" ? false : Math.random()<0.5);
  state.aiStarts = !state.yourTurn;
  state.busy=false;
}

function restart(){
    openDeckBuilder();
}

function restartGameUI(){
  renderAll(); updateActiveHandIndicator(); updateHandInteractivity();
  const hideCk=$("#hide-opponent");
  if(state.aiLevel==="off"){ state.hideOpponent=false; if(hideCk){ hideCk.checked=false; hideCk.disabled=true; } }
  else { if(hideCk) hideCk.disabled=false; }
  
  if(!state.yourTurn && state.aiLevel!=="off"){ setTimeout(aiPlay, 1000); }
}

function getAdjustedStats(card, index){
  const base={...card.stats}, adj={...base}, tags={T:"",R:"",B:"",L:""};
  if(state.rules.elemental && index!=null){
    const tileElem=state.boardElements[index];
    if(tileElem && tileElem!=="None"){
      if(card.element===tileElem){ for(const k of ["T","R","B","L"]){ adj[k] = (adj[k]===10 ? 11 : Math.min(10, adj[k]+1)); tags[k]="boost"; } }
      else { for(const k of ["T","R","B","L"]){ adj[k] = (adj[k]===1 ? 0 : Math.max(1, adj[k]-1)); tags[k]="penalty"; } }
    }
  }
  return {adj,tags};
}

const dirs=[ {name:"T",di:-3,opp:"B",border:[0,1,2]}, {name:"R",di:+1,opp:"L",border:[2,5,8]}, {name:"B",di:+3,opp:"T",border:[6,7,8]}, {name:"L",di:-1,opp:"R",border:[0,3,6]} ];
function neighbors(index){ const list=[]; for(const d of dirs){ const ni=index+d.di; if(d.border.includes(index) || ni<0 || ni>8){ list.push({dir:d.name, opp:d.opp, ni:null}); } else { list.push({dir:d.name, opp:d.opp, ni}); } } return list; }

function detectSamePlus(owner, index, placedCard){
  const placedAdj=getAdjustedStats(placedCard,index).adj;
  const neigh=neighbors(index);
  const sameEnemyIdx=[]; let sameAnyCount=0; const plusPairs=[];

  for(const nb of neigh){
    const ni = nb.ni;
    if(ni===null){ if(state.rules.same && state.rules.samewall && placedAdj[nb.dir]===state.wallLevel){ sameAnyCount++; } continue; }
    const slot = state.board[ni]; if(!slot) continue;
    const oppAdj=getAdjustedStats(slot.card, ni).adj;
    if(state.rules.same && placedAdj[nb.dir]===oppAdj[nb.opp]){
      sameAnyCount++;
      if(slot.owner!==owner) sameEnemyIdx.push(ni);
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
        const hasEnemy = arr.some(x => {
            const slot = state.board[x.ni];
            return slot && slot.owner !== owner;
        });

        if(hasEnemy){
            plusTriggered=true;
            arr.forEach(x=>{ 
                const slot = state.board[x.ni]; 
                if(slot && slot.owner!==owner){ 
                    if(!plusFlipIdx.includes(x.ni)) plusFlipIdx.push(x.ni); 
                } 
            });
        }
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
    if(placedAdj[nb.dir] > oppAdj[nb.opp]){ flips.push(ni); reasons.push({ni:ni, dir:nb.dir, val:placedAdj[nb.dir]}); }
  }
  return {flips, reasons};
}

/* --- VISUALS --- */
function showStat(n){ return n===11 ? "S" : (n===10 ? "A" : n); }

function renderHands(){
  handYouEl.innerHTML=""; state.yourHand.forEach((c,i)=> handYouEl.appendChild(createHandCard(c,"you",i)));
  const faceDownOpp = (state.aiLevel!=="off") && state.hideOpponent;
  handAiEl.innerHTML=""; state.aiHand.forEach((c,i)=> handAiEl.appendChild(createHandCard(c,"ai",i, faceDownOpp)));
  updateActiveHandIndicator(); updateHandInteractivity();
}
function createHandCard(card, owner, handIndex, faceDown=false){
  const w=document.createElement("div"); w.className="card owner-"+owner;
  w.dataset.owner=owner; w.dataset.hindex=handIndex;
  w.innerHTML = `<div class="card-inner">
      <div class="card-face front">
          <img src="${card.image}">
          ${faceDown ? '' : getPipHtml(card)}
      </div>
      <div class="card-face back"><img src="assets/ui/card_back.png"></div>
  </div>`;
  if(faceDown) w.classList.add("flipped");
  w.addEventListener("click",()=>{
    let canAct=false;
    if(state.aiLevel==="off") canAct=(state.yourTurn && owner==='you')||(!state.yourTurn && owner==='ai');
    else canAct=(state.yourTurn && owner==='you');
    if(!canAct || state.busy) return;
    const already=w.classList.contains("selected");
    document.querySelectorAll(".card.selected").forEach(e=>e.classList.remove("selected"));
    boardEl.classList.remove("placing");
    if(!already){ w.classList.add("selected"); boardEl.classList.add("placing"); }
  });
  return w;
}
function getPipHtml(card, idx=null){
  const {adj,tags} = getAdjustedStats(card, idx);
  return `<div class="stats-central">
    <div class="pip T ${tags.T}">${showStat(adj.T)}</div>
    <div class="pip R ${tags.R}">${showStat(adj.R)}</div>
    <div class="pip B ${tags.B}">${showStat(adj.B)}</div>
    <div class="pip L ${tags.L}">${showStat(adj.L)}</div>
  </div>`;
}

function renderBoard(){
  for(let i=0;i<9;i++){
    const cell=boardEl.children[i], elem=state.boardElements[i];
    if(elem!=="None"){ 
        cell.dataset.element=elem;
        cell.style.background="linear-gradient(to bottom right, rgba(96,165,250,.12), rgba(96,165,250,.02))";
        if(!cell.querySelector(".element-badge")){ 
            const b=document.createElement("div"); b.className="element-badge"; b.textContent=elem; cell.appendChild(b); 
        }
    } else { 
        cell.removeAttribute("data-element"); 
        cell.style.background=""; 
        const b=cell.querySelector(".element-badge"); if(b) b.remove(); 
    }
    const slot=state.board[i];
    cell.classList.toggle("empty", !slot);
    const existing = cell.querySelector(".tile-card");
    if(existing) existing.remove();
    if(slot){
        const w=document.createElement("div"); w.className="tile-card owner-"+slot.owner;
        w.innerHTML = `<img src="${slot.card.image}">` + getPipHtml(slot.card, i);
        cell.appendChild(w);
    }
  }
}
function refreshBoardStats(){ renderBoard(); } 
function renderScores(){ 
    const you = state.yourHand.length + state.board.filter(s=>s && s.owner==="you").length; 
    const ai  = state.aiHand.length + state.board.filter(s=>s && s.owner==="ai").length;
    $("#score-you").textContent=you; $("#score-ai").textContent=ai;
}
function renderAll(){ renderHands(); renderBoard(); renderScores(); }

/* --- ACTIONS --- */
async function onBoardClick(i){
  if(state.busy||state.board[i]) return;
  const sel = document.querySelector(".hand .card.selected");
  if(!sel) return;
  const owner = sel.dataset.owner;
  await playCard(owner, parseInt(sel.dataset.hindex), i);
}

// BATCH FLIP
async function flipBatch(indices, newOwner){
    if(!indices || indices.length === 0) return;
    AudioManager.play('flip');
    const cells = Array.from(boardEl.children);
    indices.forEach(idx => {
        const cell = cells[idx];
        const tile = cell.querySelector('.tile-card');
        if(tile) tile.classList.add('flip-anim');
    });
    await sleep(350);
    let changed = false;
    indices.forEach(idx => {
        if(state.board[idx] && state.board[idx].owner !== newOwner){
            state.board[idx].owner = newOwner;
            changed = true;
        }
    });
    if(changed){ renderBoard(); renderScores(); }
    await sleep(150);
}

async function playCard(owner, handIndex, cellIndex){
  if(state.busy || state.board[cellIndex]) return;
  state.busy=true; updateHandInteractivity();
  
  const card=(owner==="you"? state.yourHand.splice(handIndex,1)[0] : state.aiHand.splice(handIndex,1)[0]);
  state.board[cellIndex]={card, owner};
  AudioManager.play('place');
  renderHands(); renderBoard(); renderScores();
  
  const res=detectSamePlus(owner, cellIndex, card);
  let specialFlips = []; 
  
  if(res.sameTriggered || res.plusTriggered){
    const msg = (res.sameTriggered && res.plusTriggered)?"SAME + PLUS":(res.sameTriggered?"SAME":"PLUS");
    showBanner(msg);
    if(msg.includes("SAME")) AudioManager.play('same');
    if(msg.includes("PLUS")) AudioManager.play('plus');
    
    await sleep(400);
    const targets = [...new Set([...res.sameFlipIdx, ...res.plusFlipIdx])];
    targets.forEach(idx => showReason(idx, msg));
    
    await flipBatch(targets, owner);
    specialFlips = targets;
    
    if(state.rules.combo){
        for(const idx of targets){ await comboFrom(idx, owner); }
    }
  }

  const nf = normalFlipReasons(owner, cellIndex, card);
  const normalTargets = nf.flips.filter(idx => !specialFlips.includes(idx));
  
  if(normalTargets.length > 0){
      normalTargets.forEach(idx => showReason(idx, "Normal"));
      await flipBatch(normalTargets, owner);
  }

  if(isGameOver()){ await sleep(500); endGame(); }
  else {
      state.yourTurn = !state.yourTurn;
      boardEl.classList.remove("placing");
      renderHands(); updateActiveHandIndicator();
      state.busy=false; updateHandInteractivity();
      if(!state.yourTurn && state.aiLevel!=="off") setTimeout(aiPlay, 800);
  }
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
  if(targets.length > 0){
      showBanner("COMBO");
      AudioManager.play('combo');
      targets.forEach(t => showReason(t, "Combo"));
      await flipBatch(targets, newOwner);
      for(const t of targets){ await comboFrom(t, newOwner); }
  }
}

function isGameOver(){ return state.board.every(Boolean) || (state.yourHand.length===0 && state.aiHand.length===0); }
function endGame(){
  const ai=state.aiHand.length + state.board.filter(s=>s&&s.owner==='ai').length;
  const you=state.yourHand.length + state.board.filter(s=>s&&s.owner==='you').length;
  const diff=you-ai;
  let msg,sfx;
  if(state.aiLevel==="off"){
      if(diff>0){msg="Jogador 1 Venceu!";sfx="win";} else if(diff<0){msg="Jogador 2 Venceu!";sfx="win";} else{msg="Empate!";sfx="draw";}
  } else {
      if(diff>0){msg="Você Venceu!";sfx="win";} else if(diff<0){msg="Você Perdeu.";sfx="lose";} else{msg="Empate!";sfx="draw";}
  }
  $("#result-title").textContent=msg;
  $("#result-detail").textContent=`Placar Final: ${you} x ${ai}`;
  $("#result-modal").classList.add("show");
  AudioManager.play(sfx);
}
function showBanner(t){ bannerEl.textContent=t; bannerEl.classList.remove("hidden"); setTimeout(()=>bannerEl.classList.add("hidden"),1200); }

/* --- AI --- */
function snapshot(){ return { board:JSON.parse(JSON.stringify(state.board)), boardElements:[...state.boardElements], yourHand:JSON.parse(JSON.stringify(state.yourHand)), aiHand:JSON.parse(JSON.stringify(state.aiHand)), rules:JSON.parse(JSON.stringify(state.rules)) }; }

function getAdjustedStatsSim(ns, card, index){
  const adj={...card.stats};
  if(ns.rules.elemental && index!=null && ns.boardElements[index]!=="None"){
      if(card.element===ns.boardElements[index]) { for(const k of ["T","R","B","L"]) adj[k]=adj[k]===10?11:Math.min(10,adj[k]+1); }
      else { for(const k of ["T","R","B","L"]) adj[k]=adj[k]===1?0:Math.max(1,adj[k]-1); }
  }
  return adj;
}

function detectSamePlusSim(ns, owner, index, card){
  const placedAdj=getAdjustedStatsSim(ns,card,index);
  let sameEnemy=[], plus=[], sameAny=0;
  for(const nb of neighbors(index)){
      const ni=nb.ni; 
      if(ni===null){ if(ns.rules.same&&ns.rules.samewall&&placedAdj[nb.dir]===5) sameAny++; continue; }
      const s=ns.board[ni]; if(!s) continue;
      const opp=getAdjustedStatsSim(ns,s.card,ni);
      if(ns.rules.same && placedAdj[nb.dir]===opp[nb.opp]){ sameAny++; if(s.owner!==owner) sameEnemy.push(ni); }
      if(ns.rules.plus) plus.push({ni, sum:placedAdj[nb.dir]+opp[nb.opp]});
  }
  const sameTrig = ns.rules.same && sameAny>=2 && sameEnemy.length>=1;
  let plusTrig=false, plusFlip=[];
  if(ns.rules.plus){
      const map={}; plus.forEach(p=>{ map[p.sum]=map[p.sum]||[]; map[p.sum].push(p.ni); });
      for(const k in map) {
          const arr=map[k];
          if(arr.length>=2){
             const hasEnemy = arr.some(x => { const s=ns.board[x]; return s && s.owner!==owner; });
             if(hasEnemy){
                 plusTrig=true; 
                 arr.forEach(x=>{ if(!plusFlip.includes(x)) plusFlip.push(x); });
             }
          }
      }
  }
  return { sameTriggered: sameTrig, plusTriggered: plusTrig, sameFlipIdx: (sameTrig?sameEnemy:[]), plusFlipIdx: (plusTrig?plusFlip:[]) };
}

function simulatePlay(sim, owner, hi, ci){
    const hand=owner==="you"?sim.yourHand:sim.aiHand;
    const card=hand.splice(hi,1)[0];
    sim.board[ci]={card, owner};
    
    const r=detectSamePlusSim(sim,owner,ci,card);
    const special=new Set();
    
    const initialFlips = [...r.sameFlipIdx, ...r.plusFlipIdx];
    initialFlips.forEach(i => {
        if(sim.board[i] && sim.board[i].owner !== owner){
            sim.board[i].owner = owner;
            special.add(i);
        }
    });

    if(sim.rules.combo && (r.sameTriggered || r.plusTriggered)){
        const q = [...special]; 
        while(q.length){
            const i = q.pop();
            for(const nb of neighbors(i)){
                if(nb.ni===null) continue;
                const s = sim.board[nb.ni];
                if(s && s.owner !== owner && !special.has(nb.ni)){
                    const a = getAdjustedStatsSim(sim, sim.board[i].card, i);
                    const b = getAdjustedStatsSim(sim, s.card, nb.ni);
                    if(a[nb.dir] > b[nb.opp]){
                        s.owner = owner;
                        special.add(nb.ni);
                        q.push(nb.ni);
                    }
                }
            }
        }
    }

    const nrm=normalFlipTargetsSim(sim, owner, ci, card);
    for(const i of nrm){
        if(!special.has(i) && sim.board[i] && sim.board[i].owner!==owner){
            sim.board[i].owner=owner;
        }
    }
    return sim;
}

function normalFlipTargetsSim(ns, owner, index, card){
  const adj=getAdjustedStatsSim(ns,card,index), flips=[];
  for(const nb of neighbors(index)){ const ni=nb.ni; if(ni===null) continue; const slot=ns.board[ni]; if(!slot||slot.owner===owner) continue; const oppAdj=getAdjustedStatsSim(ns,slot.card, ni); if(adj[nb.dir]>oppAdj[nb.opp]) flips.push(ni); }
  return flips;
}

function evaluate(ns){ 
    return (ns.aiHand.length + ns.board.filter(s=>s&&s.owner==="ai").length) - 
           (ns.yourHand.length + ns.board.filter(s=>s&&s.owner==="you").length); 
}
function minimax(ns, depth, maxing, a, b){
    if(depth===0 || ns.board.every(x=>x) || (!ns.yourHand.length && !ns.aiHand.length)) return evaluate(ns);
    const cells=[]; for(let i=0;i<9;i++) if(!ns.board[i]) cells.push(i);
    if(maxing){
        let v=-Infinity;
        for(let h=0;h<ns.aiHand.length;h++) for(const c of cells){
            v=Math.max(v, minimax(simulatePlay(JSON.parse(JSON.stringify(ns)),"ai",h,c), depth-1, false, a, b));
            a=Math.max(a,v); if(b<=a) break;
        } return v;
    } else {
        let v=Infinity;
        for(let h=0;h<ns.yourHand.length;h++) for(const c of cells){
            v=Math.min(v, minimax(simulatePlay(JSON.parse(JSON.stringify(ns)),"you",h,c), depth-1, true, a, b));
            b=Math.min(b,v); if(b<=a) break;
        } return v;
    }
}

function generateAIMoves(){ 
    const cells=[]; 
    for(let i=0;i<9;i++) if(!state.board[i]) cells.push(i);
    const res=[]; 
    state.aiHand.forEach((c,hi)=> cells.forEach(ci=> res.push({handIndex:hi, cellIndex:ci, card:c}))); 
    return res; 
}

function chooseHeuristic(moves, opts){ opts=opts||{};
  let best=null, bestScore=-1e9;
  for(const m of moves){
    let snap = snapshot(); 
    if(opts.ignoreSamePlusWall){ snap.rules={...snap.rules, same:false, plus:false, samewall:false}; } 
    const ns=simulatePlay(snap, "ai", m.handIndex, m.cellIndex);
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

function minimaxRoot(depth){ 
    const moves=generateAIMoves(); 
    let best=null, bestVal=-Infinity; 
    for(const m of moves){ 
        const val=minimax(simulatePlay(snapshot(),"ai",m.handIndex,m.cellIndex), depth-1, false, -Infinity, +Infinity); 
        if(val>bestVal){ bestVal=val; best=m; } 
    } 
    return best; 
}

async function aiPlay(){
    const moves=generateAIMoves(); 
    if(moves.length===0){ return; }
    
    const isFirstAIMove = state.aiStarts && state.board.every(s=>!s);
    let chosen;
    
    if(state.aiLevel==="easy"){
        chosen = moves[Math.floor(Math.random()*moves.length)];
        debugLog(`AI easy`,"normal");
    }
    else if(state.aiLevel==="medium"){
        if(isFirstAIMove){
            chosen = moves[Math.floor(Math.random()*moves.length)];
        } else {
            const forgetRules = Math.random() < 0.5;
            chosen = chooseHeuristic(moves, {ignoreSamePlusWall: forgetRules}) || moves[Math.floor(Math.random()*moves.length)];
        }
        debugLog(`AI medium`,"normal");
    }
    else if(state.aiLevel==="hard"){
        if(isFirstAIMove){
            chosen = minimaxRoot(2) || chooseHeuristic(moves) || moves[Math.floor(Math.random()*moves.length)];
        } else {
            chosen = chooseHeuristic(moves) || minimaxRoot(2) || moves[Math.floor(Math.random()*moves.length)];
        }
        debugLog(`AI hard`,"normal");
    }
    else if(state.aiLevel==="master"){
        chosen = minimaxRoot(3) || minimaxRoot(2) || chooseHeuristic(moves) || moves[Math.floor(Math.random()*moves.length)];
        debugLog(`AI master`,"normal");
    }
    else {
        chosen = moves[Math.floor(Math.random()*moves.length)];
    }
    
    await playCard("ai", chosen.handIndex, chosen.cellIndex);
}

document.addEventListener("DOMContentLoaded", ()=>{ initUI(); openDeckBuilder(); });