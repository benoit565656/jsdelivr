<script>
(function(){
  /* =========================================================
     Core helpers / state
  ========================================================= */
  const $  = (s, r=document)=>r.querySelector(s);

  window.state = window.state || {};
  const S = window.state;

  // Global CFG
  window.CFG = {
    ENABLE_PREGAME_WHEEL: false,
    CSV_URL: "https://cdn.prod.website-files.com/68e32480e91a304b261eee45/68ef23ee54fab999d8fd19ee_FOREPLAY%20-%20Sheet1%20(11).csv",
    LEVEL_QUOTA: { "1":1, "2":1, "3":1, "4":1, "5":1, "6":1, "7":1, "8":1, "9":1, "10":1 , "11":1, "12":1, "13":1, "14":1},
    SLOT: { reelSize: 20, uniqueCards: 10, durationMs: 4000, settleMs: 400 },
    TIMER_END_SOUND: "https://cdn.prod.website-files.com/68e32480e91a304b261eee45/68e7d324046a90c13e9bf39d_challenge-over.mp3",
  };

  // Strong section switcher
  window.showScreen = function(id){
    const ids = [
      '#screen-start','#screen-players','#screen-draw',
      '#screen-action','#screen-wheel','#screen-gameover'
    ];
    for (const sel of ids){
      const el = document.querySelector(sel);
      if (!el) continue;
      el.style.setProperty('display','none','important');
      el.style.setProperty('visibility','hidden','important');
      el.style.setProperty('pointer-events','none','important');
    }
    const target = document.querySelector(id);
    if (target){
      target.style.removeProperty('visibility');
      target.style.removeProperty('pointer-events');
      target.style.setProperty('display','block','important');
    }
  };

  // One-time init
  if (!S.__baseInit){
    S.__baseInit = true;
    S.players = [];
    S.assistantName = "";
    S.startIndex = 0;
    S.currentIndex = 0;
    S.preGamesDone = false;
    S.pregameQueue = [];
    S.csvReady=false; S.csvRows=[]; S.deckByLevel={}; S.usedCardIds=new Set();
    S.levelPlan=[]; S.phaseIdx=0; S.totalPerPlayerCached=0;
    S.playedCountPerPlayer=S.playedCountPerPlayer||{};
    S.jokers=S.jokers||{};
    S.timer={secondsLeft:0, handle:null, running:false};
    S.nextCard = null;
    S.playerBranch = S.playerBranch || {}; // per-player branching memory
  }

  function pIdx(){
    const idx=[S.currentIndex,S.turnIdx,S.activeIdx,S.playerIdx].find(v=>typeof v==='number');
    return (typeof idx==='number') ? idx : 0;
  }
  function nextLevel(){ return String((S.levelPlan||[])[S.phaseIdx] ?? ''); }
  function setPhaseTo(levelStr){
    if (!Array.isArray(S.levelPlan)) return;
    const i = S.levelPlan.map(String).indexOf(String(levelStr));
    if (i>=0) S.phaseIdx=i;
  }
  function playerName(){
    if (S.currentPlayerName) return String(S.currentPlayerName);
    const i=pIdx();
    if (Array.isArray(S.players) && S.players.length){
      const p=S.players[i] ?? S.players[0];
      if (!p) return 'PLAYER';
      return (typeof p==='string') ? p : (p.name||p.label||p.displayName||p.username||'PLAYER');
    }
    return 'PLAYER';
  }
  function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function setDisplay(target, value){ const el = typeof target === "string" ? $(target) : target; if (!el) return; el.style.setProperty("display", value, "important"); }
  window.currentPlayerIdx = () => (S.currentIndex ?? 0);

  // RESET overlays/choices on Play
  function resetGameFlowLayers(){
    S.playerBranch = {};
    ['#screen-choices1','#screen-choices2','#screen-choices3'].forEach(id=>{
      const el = document.querySelector(id); if (!el) return;
      el.style.cssText = '';
      el.setAttribute('aria-hidden','true');
      el.hidden = true;
      el.style.setProperty('display','none','important');
      el.style.setProperty('visibility','hidden','important');
      el.style.setProperty('opacity','0','important');
      el.style.setProperty('pointer-events','none','important');
      el.style.setProperty('z-index','0','important');
    });
  }

  /* =========================================================
     Start / Players flow
  ========================================================= */
  document.addEventListener('DOMContentLoaded', () => {
    const assistantInput = document.querySelector('#AssistantName');
    if (assistantInput) assistantInput.value = 'Assistant';
    showScreen('#screen-start');
  });

  function getInputs(){
    const p1 = ($("#PlayerName1")?.value || "").trim();
    const p2 = ($("#PlayerName2")?.value || "").trim();
    const p3 = ($("#PlayerName3")?.value || "").trim();
    const p4 = ($("#PlayerName4")?.value || "").trim();
    const as = ($("#AssistantName")?.value || "").trim();
    const players = [p1,p2,p3,p4].filter(Boolean);
    return { players, assistant: as };
  }

  function chainIntroCopy(players){
    if (!players.length) return "";
    const parts = [];
    for (let i=0;i<players.length;i++){
      const cur = players[i];
      const nxt = players[(i+1)%players.length];
      parts.push(`${cur} choose for ${nxt}`);
    }
    return `Choose a sexy outfit (costume and lingerie) for another player. ${parts.join(", ")}.`;
  }

  function drawWhoStarts(players){
    if (players.length < 2) return 0;
    return Math.floor(Math.random()*players.length);
  }

  document.addEventListener('click', (e)=>{
    if (!e.target.closest('#btnStart')) return;
    e.preventDefault();
    showScreen('#screen-players');
  }, true);

  document.addEventListener('click', (e)=>{
    if (!e.target.closest('#btnWhoStarts')) return;
    e.preventDefault();

    const { players, assistant } = getInputs();
    const err = $('#errorForrm');
    const out = $('#playerStarts');

    if (players.length < 2 || !assistant){
      if (err){ err.style.display='block'; err.textContent='You need at least 2 Players and 1 Assistant'; }
      if (out) out.textContent = '';
      return;
    }
    if (err) err.style.display='none';

    S.players = players;
    S.assistantName = assistant;
    S.startIndex = drawWhoStarts(players);
    S.currentIndex = S.startIndex;
    S.preGamesDone = false;

    S.jokers = S.jokers || {};
    S.playedCountPerPlayer = S.playedCountPerPlayer || {};
    for (let i=0;i<S.players.length;i++){
      if (typeof S.jokers[i] !== 'number') S.jokers[i] = 4;
      if (typeof S.playedCountPerPlayer[i] !== 'number') S.playedCountPerPlayer[i] = 0;
    }

    if (out) out.textContent = `${players[S.startIndex]} STARTS`;
    const btnPlay = $('#btnPlay');
    if (btnPlay) btnPlay.style.display = 'block';
  }, true);

  document.addEventListener('click', async (e)=>{
    if (!e.target.closest('#btnPlay')) return;
    e.preventDefault();

    const { players, assistant } = getInputs();
    const err = $('#errorForrm');
    if (players.length < 2 || !assistant){
      if (err){ err.style.display='block'; err.textContent='You need at least 2 Players'; }
      return;
    }
    if (err) err.style.display='none';

    // RESET stale states that can block Play
    resetGameFlowLayers();
    S.usedCardIds = new Set();  // fresh deck usage
    S.phaseIdx = 0;             // restart level plan

    S.players = players;
    S.assistantName = assistant;
    S.currentIndex = S.startIndex;
    S.preGamesDone = false;

    if (window.CFG?.ENABLE_PREGAME_WHEEL) {
      buildPregameQueue?.();
      const intro  = $('#screen-draw #introText');
      const btnSpin= $('#screen-draw #btnSpinWheel');
      const btnDraw= $('#screen-draw #btnDrawCard');
      if (intro){ intro.style.display='block'; intro.textContent = chainIntroCopy(S.players); }
      if (btnSpin) btnSpin.style.display='block';
      if (btnDraw) btnDraw.style.display='none';
      showScreen('#screen-draw');
    } else {
      S.preGamesDone = true;
      prepareAndShowDrawScreen();
    }
  }, true);

  /* =========================================================
     Wheel (optional)
  ========================================================= */
  window.buildPregameQueue = function buildPregameQueue(){
    const n = (S.players || []).length;
    if (!n) return;
    const start = (((S.startIndex ?? 0) % n) + n) % n;
    S.pregameQueue = [];
    for (let i=0;i<n;i++) S.pregameQueue.push((start + i) % n);
    S.wheelMode    = 'pregame';
    S.preGamesDone = false;
  };

  window.startPregameWheel = function startPregameWheel(){ window.buildPregameQueue?.(); showWheelForCurrentPlayer('pregame'); };

  window.showWheelForCurrentPlayer = function showWheelForCurrentPlayer(mode){
    S.wheelMode = mode || 'pregame';
    const nextIdx = (S.pregameQueue && S.pregameQueue.length) ? S.pregameQueue[0] : (S.currentIndex ?? 0);
    S.currentIndex = nextIdx;
    const hud = document.querySelector('#screen-wheel #hudName');
    if (hud && S.players && S.players[nextIdx]) hud.textContent = S.players[nextIdx];
    showScreen('#screen-wheel');
    _primeWheelUI?.();
  };

  window.endPregameToDraw = function endPregameToDraw(){
    S.preGamesDone = true;
    S.currentIndex = S.startIndex;
    prepareAndShowDrawScreen();
  };

  window.onWheelNextPlayer = function onWheelNextPlayer(){
    if (!Array.isArray(S.pregameQueue)) S.pregameQueue = [];
    S.pregameQueue.shift();
    if (S.pregameQueue.length > 0){ showWheelForCurrentPlayer('pregame'); } else { window.endPregameToDraw(); }
  };

  window.onWheelContinue = function onWheelContinue(){ prepareAndShowDrawScreen(); }

  ;(function(){
    const wheelScreen = $('#screen-wheel');
    function hideHard(el){ if (!el) return; el.style.setProperty('display','none','important'); el.style.setProperty('visibility','hidden','important'); el.style.setProperty('pointer-events','none','important'); el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); }
    function showBlock(el){ if (!el) return; el.style.removeProperty('visibility'); el.style.removeProperty('pointer-events'); el.removeAttribute('hidden'); el.setAttribute('aria-hidden','false'); el.style.setProperty('display','block','important'); }
    function firstOf(selectors){ for (const s of (selectors||[])){ const n = document.querySelector(s); if (n) return n; } return null; }
    function primeWheelUI(){ const res = $('#resultSpin'); const spin = firstOf(['#btbSpin','#btnSpin','#btnSpinWheel','#btbSpinWheel']); const next = $('#btnNextPlayerWheel'); const cont = $('#btnContinueWheel'); if(res) res.textContent = ''; showBlock(spin); hideHard(next); hideHard(cont); }
    window._primeWheelUI = primeWheelUI;

    function ensureWheelSound(){ if (!S.wheelSpinSound){ S.wheelSpinSound = new Audio('https://cdn.prod.website-files.com/68e32480e91a304b261eee45/68e51926165226c403bd3b2f_spin.mp3'); S.wheelSpinSound.preload = 'auto'; } return S.wheelSpinSound; }
    if (wheelScreen){
      const obs = new MutationObserver(()=>{ const visible = getComputedStyle(wheelScreen).display !== 'none'; if(visible) primeWheelUI(); });
      obs.observe(wheelScreen, { attributes:true, attributeFilter:['style','class'] });
      if (getComputedStyle(wheelScreen).display !== 'none') primeWheelUI();
    }

    function showButtonAfterSpin(){
      const txt = ($('#resultSpin')?.textContent || '').trim();
      const spin = $('#btbSpin');
      const next = $('#btnNextPlayerWheel');
      const cont = $('#btnContinueWheel');
      if (txt === 'Spin Again'){ showBlock(spin); hideHard(next); hideHard(cont); return; }
      if ((S.wheelMode||'pregame') === 'random'){ hideHard(next); showBlock(cont); hideHard(spin); }
      else { hideHard(cont); showBlock(next); hideHard(spin); }
    }

    function spinWheelOnce(){
      const wheel = $('#wheelInner'); const res = $('#resultSpin'); const spin = $('#btbSpin'); const next = $('#btnNextPlayerWheel'); const cont = $('#btnContinueWheel');
      if (!wheel || !spin) return;
      hideHard(spin); hideHard(next); hideHard(cont);
      if(res) res.textContent = '';
      const SECTORS = [
        'Pick a partner, each down a 15 ml shot, and seal it with a French kiss',
        'You: 1 Shot (30ml)',
        'Left: 1 Shot (30ml)',
        'Right: 1 Shot(30ml)',
        'Give 1 Shot to Someone (45ml)',
        'Everyone: 1 Shot (45ml)',
        'You: 1 Shot (15ml)',
        'Pick a Partner (1 Shot each: 15ml)',
        'Spin Again',
        'You: 1 Shot (No Hands 30ml)',
        'Body Shot (you drink 30ml)',
        'Body Shot (you are the body 30ml)'
      ];
      const NUM = SECTORS.length; const arc = 360 / NUM; const target = Math.floor(Math.random()*NUM); const turns = 5*360; const angle = 360 - (target*arc + arc/2); S.wheelRotation = (S.wheelRotation||0) + (turns + angle);
      try { const snd = ensureWheelSound(); snd.currentTime = 0; snd.play().catch(()=>{}); } catch(_){ }
      wheel.style.transition = 'transform 6s cubic-bezier(0.33,1,0.68,1)';
      wheel.style.transform = `rotate(${S.wheelRotation}deg)`;
      let done=false;
      const finish = ()=>{
        if (done) return; done=true;
        wheel.style.transition = '';
        const norm = ((S.wheelRotation % 360)+360)%360;
        const corr = (360 - norm + arc/2) % 360;
        const idx = Math.floor(corr/arc) % NUM;
        const text = SECTORS[idx] || '???';
        if (res) res.textContent = text;
        showButtonAfterSpin();
      };
      const onEnd = ()=>{ wheel.removeEventListener('transitionend', onEnd); finish(); };
      wheel.addEventListener('transitionend', onEnd);
      setTimeout(finish, 6600);
    }

    document.addEventListener('click', (e)=>{
      if (e.target.closest('#btbSpin,#btnSpin,#btnSpinWheel,#btbSpinWheel')){ e.preventDefault(); spinWheelOnce(); return; }
      if (e.target.closest('#btnNextPlayerWheel')){
        const vis = $('#screen-wheel') && getComputedStyle($('#screen-wheel')).display !== 'none';
        if (vis && (S.wheelMode||'pregame') === 'pregame'){ e.preventDefault(); window.onWheelNextPlayer?.(); setTimeout(primeWheelUI, 0); }
        return;
      }
      if (e.target.closest('#btnContinueWheel')){
        const vis = $('#screen-wheel') && getComputedStyle($('#screen-wheel')).display !== 'none';
        if (vis && (S.wheelMode||'pregame') === 'random'){ e.preventDefault(); window.onWheelContinue?.(); }
        return;
      }
    }, true);
  })();

  /* =========================================================
     CSV / Decks / Draw & Action flow
  ========================================================= */
  ;(function injectSlotStyle(){ try{ const id = '__slot_style__'; if (!document.getElementById(id)){ const st = document.createElement('style'); st.id = id; st.textContent = `.card-list{ width: 100%; will-change: transform, filter; }`; document.head.appendChild(st); } }catch(_){ } })();

  async function loadCSVOnce(){
    if (S.csvReady) return;
    const res = await fetch(CFG.CSV_URL,{cache:'no-store'});
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(x=>x.trim().length);
    const header = lines.shift().split(",").map(h=>h.trim().toLowerCase());
    const rows=[];
    for (const line of lines){
      const cols = parseCSV(line); if (!cols.length) continue;
      const rec={}; header.forEach((k,i)=> rec[k] = (cols[i] ?? "").trim());
      const level = (rec["level"]||"").trim(); if (!level) continue;
      const urlCol = rec["url card"] || rec["card file name"] || "";
      const urlFull = urlCol ? ("https://cdn.prod.website-files.com/68e32480e91a304b261eee45/" + urlCol.replace(/^https?:\/\/[^/]+\//,"")) : "";
      rows.push({
        id: rec["number"] || `${level}:${urlCol}`,
        level: String(level),
        levelName: rec["level name"] || "",
        url: urlFull,
        description: rec["description"] || "",
        partner: rec["partner"] || "",
        timeMins: rec["time"] ? parseFloat(rec["time"]) : null,
        priority: (rec["priority"]||"").toLowerCase() === "yes"
      });
    }
    S.csvRows = rows; S.csvReady = true;
    buildDecks(); buildLevelPlan();
  }
  function parseCSV(line){
    const out=[]; let cur=""; let q=false;
    for (let i=0;i<line.length;i++){
      const c=line[i];
      if (c==='"'){
        if (q && line[i+1]==='"'){ cur+='"'; i++; } else q=!q;
      } else if (c===',' && !q){
        out.push(cur); cur='';
      } else cur+=c;
    }
    out.push(cur); return out;
  }
  function buildDecks(){
    S.deckByLevel = {};
    for (const r of (S.csvRows||[])){ if (!S.deckByLevel[r.level]) S.deckByLevel[r.level]=[]; S.deckByLevel[r.level].push(r); }
    for (const k of Object.keys(S.deckByLevel)) shuffle(S.deckByLevel[k]);
    S.usedCardIds = S.usedCardIds || new Set();
  }
function buildLevelPlan(){
  // clone the configured quotas
  const base = { ...CFG.LEVEL_QUOTA };

  // Decide whether to include Level 13 based on player count
  const nPlayers = (S.players || []).length;
  if (nPlayers <= 2) {
    // Skip Level 13 when 1–2 players
    base['13'] = 0;
  } else {
    // Ensure Level 13 exists when >2 players (fallback to 1 if missing)
    if (base['13'] == null) base['13'] = 1;
  }

  // Build the flat plan in numeric level order
  const plan = [];
  Object.keys(base)
    .map(k => Number(k))
    .sort((a,b)=>a-b)
    .forEach(levelNum => {
      const lvl = String(levelNum);
      const count = Number(base[lvl] || 0);
      for (let i = 0; i < count; i++) plan.push(lvl);
    });

  S.levelPlan = plan;
  S.phaseIdx = 0;
  S.totalPerPlayerCached = plan.length;
}

  function totalPerPlayer(){ return S.totalPerPlayerCached ?? 0; }
  function levelDisplay(level){
    const row = (S.csvRows||[]).find(r => r.level === String(level) && r.levelName);
    const nm = row?.levelName || `LEVEL ${level}`;
    return `LEVEL${level}: ${String(nm).toUpperCase()}`;
  }

  window.prepareAndShowDrawScreen = async function(){
    const idx = window.currentPlayerIdx();
    const hudName = $("#screen-draw #hudName");
    const hudCount = $("#screen-draw #hudCount");
    const hudLevel = $("#screen-draw #hudLevel");
    if (hudName) hudName.textContent = S.players?.[idx] || "PLAYER NAME";

    setDisplay("#screen-draw #introText", "none");
    setDisplay("#screen-draw #btnSpinWheel", "none");
    setDisplay("#screen-draw #btnDrawCard", "none");

    renderJokers("#screen-draw #ListJokers", idx, false);
    updateJokerCount("#screen-draw #jokerCount", idx);
    showScreen('#screen-draw');

    await loadCSVOnce();
    if (hudCount) hudCount.textContent = `CARDS ${S.playedCountPerPlayer[idx]||0}/${totalPerPlayer()}`;
    if (hudLevel) hudLevel.textContent = levelDisplay(S.levelPlan[S.phaseIdx] || "-");

    try { await prepareSlotReel(); setDisplay("#screen-draw #btnDrawCard", "block"); }
    catch(err) { console.error("Failed to prepare slot reel:", err); setDisplay("#screen-draw #btnDrawCard", "block"); }
  };

  async function preloadCardImages(cards) {
    const promises = cards.map(card => new Promise((resolve) => {
      if (!card.url) return resolve();
      const img = new Image(); img.src = card.url; img.onload = resolve; img.onerror = resolve;
    }));
    await Promise.race([Promise.all(promises), wait(8000)]);
  }

  async function prepareSlotReel() {
    let currentLevel = S.levelPlan[S.phaseIdx];
    if (!currentLevel) { showScreen("#screen-gameover"); return; }

    S.nextCard = pickCardForLevel(currentLevel);
    if (!S.nextCard) {
      S.phaseIdx++;
      if (S.phaseIdx >= S.levelPlan.length){ showScreen("#screen-gameover"); return; }
      return prepareSlotReel();
    }

    const host = $("#card-container");
    const list = host?.querySelector(".card-list");
    if (!host || !list) return;

    list.innerHTML = "";
    const pool = [...(S.csvRows||[])].filter(r => r.url);
    if (!pool.length) return;
    shuffle(pool);

    const reelCards = [];
    const seenUrls = new Set();
    for(const card of pool) {
      if(reelCards.length >= CFG.SLOT.reelSize - 1) break;
      if(!seenUrls.has(card.url)) { reelCards.push(card); seenUrls.add(card.url); }
    }
    reelCards.push(S.nextCard);

    await preloadCardImages(reelCards);

    for (const c of reelCards) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.backgroundImage = `url('${c.url}')`;
      card.style.height = '484px';
      card.style.width = '100%';
      card.style.flexShrink = '0';
      if (c === S.nextCard) card.setAttribute('data-target', '1');
      list.appendChild(card);
    }
  }

  document.addEventListener("click",(e)=>{ if (!e.target.closest("#btnDrawCard")) return; e.preventDefault(); onDrawCard(); }, true);

  async function onDrawCard(){
    const idx = window.currentPlayerIdx();
    const cardToPlay = S.nextCard;
    if (!cardToPlay) { console.error("No card prepared."); return; }
    populateAction(cardToPlay, idx, { deferDetails: true });
    await runSlot();
    populateAction(cardToPlay, idx, { revealDetails: true });
  }

  function pickCardForLevel(level){
    const deck = S.deckByLevel[level] || [];
    const pIdx = deck.findIndex(c => c.priority && !S.usedCardIds.has(c.id));
    if (pIdx >= 0){ const [card] = deck.splice(pIdx,1); S.usedCardIds.add(card.id); return card; }
    while (deck.length){ const c = deck.shift(); if (!S.usedCardIds.has(c.id)){ S.usedCardIds.add(c.id); return c; } }
    return null;
  }

  async function runSlot() {
    if (S._slotRunning) return;
    S._slotRunning = true;

    const host = $("#card-container");
    const list = host?.querySelector(".card-list");
    const gsap = window.gsap;

    try {
      if (!gsap || !host || !list) throw new Error("GSAP or required elements not found.");

      const lastCard = list.querySelector('.card[data-target]');
      if (!lastCard) throw new Error("Target card not found in reel.");

      gsap.set(list, { y: 0, filter: 'blur(6px)' });
      host.style.overflow = 'hidden';

      await wait(50);

      const firstCard = list.querySelector('.card');
      const cardStyle = getComputedStyle(firstCard);
      const cardHeight = firstCard.offsetHeight;
      const cardMargin = parseFloat(cardStyle.marginBottom);
      const totalCardHeight = cardHeight + cardMargin;

      const allCards = Array.from(list.children);
      const targetIndex = allCards.indexOf(lastCard);
      const offset = targetIndex * totalCardHeight;

      const tl = gsap.timeline();
      const duration = CFG.SLOT.durationMs / 1000;

      tl.to(list, { y: -offset, duration: duration, ease: 'power2.out' });
      tl.to(list, { filter: 'blur(0px)', duration: duration * 0.8, ease: 'power1.out' }, "<");

      await tl;
      await wait(CFG.SLOT.settleMs);

      const finalClone = lastCard.cloneNode(true);
      list.innerHTML = '';
      list.appendChild(finalClone);
      gsap.set(list, { clearProps: 'all' });

      finalClone.style.height = '484px';
      finalClone.style.width = '100%';

    } catch (err) {
      console.error("Error during slot animation:", err);
      const targetCard = list?.querySelector('.card[data-target]');
      if (targetCard) {
        const clone = targetCard.cloneNode(true);
        list.innerHTML = '';
        list.appendChild(clone);
      }
    } finally {
      if(host) host.style.overflow = '';
      S._slotRunning = false;
    }
  }

  function populateAction(card, playerIdx, opts){
    opts = opts || {};
    showScreen("#screen-action");

    const hudName  = $("#screen-action #hudName");
    const hudCount = $("#screen-action #hudCount");
    const hudLevel = $("#screen-action #hudLevel");
    if (hudName)  hudName.textContent  = S.players?.[playerIdx] || "PLAYER NAME";
    if (hudCount) hudCount.textContent = `CARDS ${(S.playedCountPerPlayer[playerIdx]||0)}/${totalPerPlayer()}`;
    if (hudLevel) hudLevel.textContent = levelDisplay(S.levelPlan[S.phaseIdx] || "-");

    const desc    = $("#screen-action #textDescription");
    const partner = $("#screen-action #textPartner");

    if (opts.deferDetails){
      if (desc) desc.textContent = '';
      if (partner) partner.textContent = '';
    }
    if (opts.revealDetails){
      if (desc && card.description) desc.textContent = card.description;
      if (partner && card.partner) partner.textContent = card.partner;
      if(hudCount) hudCount.textContent = `CARDS ${(S.playedCountPerPlayer[playerIdx]||0)+1}/${totalPerPlayer()}`;
    }

    const circleNo  = $("#screen-action #circleNoTime");
    const circleYes = $("#screen-action #circleTime");
    const timeMnsEl = $("#screen-action #timeMns");
    const liveEl    = $("#screen-action #timerCountdown");

    resetTimer();

    if (opts.deferDetails){
      if (timeMnsEl) timeMnsEl.textContent = '';
      setDisplay(circleYes, "none");
      setDisplay(circleNo,  "block");
      setDisplay("#screen-action #btnNextPlayer","none");
    } else {
      if (card.timeMins && !isNaN(card.timeMins)){
        const mins = Number(card.timeMins);
        if (timeMnsEl) timeMnsEl.textContent = String(mins);
        setDisplay(circleYes, "block");
        setDisplay(circleNo,  "none");
        S.timer.initialSeconds = Math.round(mins*60);
        S.timer.secondsLeft = S.timer.initialSeconds;
        if (opts.revealDetails && liveEl) liveEl.textContent = fmt(S.timer.secondsLeft);
        setDisplay("#screen-action #btnNextPlayer","none");
      } else {
        setDisplay(circleYes, "none");
        setDisplay(circleNo,  "block");
        setDisplay("#screen-action #btnNextPlayer","block");
      }
    }

    renderJokers("#screen-action #ListJokers", playerIdx, true);
    updateJokerCount("#screen-action #jokerCount", playerIdx);
    S.currentCard = { ...card, playerIdx };
  }

  document.addEventListener("click",(e)=>{ if (!e.target.closest("#btnStartTimer")) return false; e.preventDefault(); startTimer(); }, true);
  document.addEventListener("click",(e)=>{ if (!e.target.closest("#btnPauseTimer")) return false; e.preventDefault(); pauseTimer(); }, true);
  document.addEventListener("click",(e)=>{ if (!e.target.closest("#btnResetTimer")) return false; e.preventDefault(); resetTimer(); const t=$("#screen-action #timerCountdown"); if (t) t.textContent=fmt(S.timer.secondsLeft||0); }, true);

  function startTimer(){ if (S.timer.running || !S.timer.secondsLeft) return; setDisplay("#screen-action #btnNextPlayer","none"); S.timer.running = true; tick(); }
  function tick(){
    if (!S.timer.running) return;
    const el = $("#screen-action #timerCountdown");
    if (S.timer.secondsLeft <= 0){
      S.timer.running = false;
      if (el) el.textContent = "00:00";
      try{ new Audio(CFG.TIMER_END_SOUND).play().catch(()=>{});}catch(_){ }
      setDisplay("#screen-action #btnNextPlayer","block");
      return;
    }
    if (el) el.textContent = fmt(S.timer.secondsLeft);
    S.timer.secondsLeft -= 1;
    S.timer.handle = setTimeout(tick, 1000);
  }
  function pauseTimer(){ S.timer.running = false; if (S.timer.handle){ clearTimeout(S.timer.handle); S.timer.handle=null; } setDisplay("#screen-action #btnNextPlayer","block"); }
  function resetTimer(){ S.timer.running = false; if (S.timer.handle){ clearTimeout(S.timer.handle); S.timer.handle=null; } if (typeof S.timer.initialSeconds === 'number'){ S.timer.secondsLeft = S.timer.initialSeconds; } else { S.timer.secondsLeft = 0; } setDisplay("#screen-action #btnNextPlayer","none"); }
  function fmt(sec){ const m=Math.floor(sec/60), s=sec%60; return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; }

  document.addEventListener("click",(e)=>{ if (!e.target.closest("#btnNextPlayer")) return; e.preventDefault(); confirmAndNext(); }, true);
  function confirmAndNext(){
    const c = S.currentCard; if (!c) return;

    // --- Joker-safe post-fork arming: only when Action is finished
    {
      const key = String(c.playerIdx);
      const pb = (S.playerBranch[key] ||= {});
      const here = String(S.levelPlan[S.phaseIdx] || '');
      const isForkL1 = (here === '2' || here === '3' || here === '4');   // → 5
      const isForkL6 = (here === '7' || here === '8');                    // → 9
      const isForkL9 = (here === '10' || here === '11');                  // → 12
      if (pb.awaitPostFork && (isForkL1 || isForkL6 || isForkL9)) {
        pb.overrideNext = pb.awaitPostFork;   // arm it now
        delete pb.awaitPostFork;
      }
    }

    S.playedCountPerPlayer[c.playerIdx] = (S.playedCountPerPlayer[c.playerIdx] || 0) + 1;

    const n = S.players.length;
    const nextPlayer = (S.currentIndex + 1) % n;
    S.currentIndex = nextPlayer;

    // If we wrapped to the starting player, we advance phase (level)
    if (S.currentIndex === S.startIndex){ S.phaseIdx++; }

    if (S.phaseIdx >= (S.levelPlan?.length||0)){ showScreen("#screen-gameover"); return; }
    prepareAndShowDrawScreen();
  }

  /* Jokers */
  window.renderJokers = function(containerSel, playerIdx, clickable){
    const host = typeof containerSel === "string" ? $(containerSel) : containerSel;
    if (!host) return;
    host.innerHTML = "";
    host.style.display = "flex"; host.style.flexDirection = "column";
    host.style.justifyContent = "center"; host.style.alignItems = "center"; host.style.gap = "6px";
    const count = S.jokers?.[playerIdx] ?? 4;
    for (let i=0;i<count;i++){
      const wrap = document.createElement("div"); wrap.className = "div-block-7 btn-joker"; wrap.style.cursor = clickable ? "pointer" : "default";
      const img = document.createElement("img"); img.className = "image-joker";
      img.setAttribute('sizes','(max-width: 800px) 100vw, 800px');
      img.setAttribute('srcset', 'https://cdn.prod.website-files.com/68e32480e91a304b261eee45/68e33140a05be1f4def2b10a_joker-p-500.png 500w, https://cdn.prod.website-files.com/68e32480e91a304b261eee45/68e33140a05be1f4def2b10a_joker.png 800w');
      img.src = 'https://cdn.prod.website-files.com/68e32480e91a304b261eee45/68e33140a05be1f4def2b10a_joker.png'; img.alt = '';
      wrap.appendChild(img); host.appendChild(wrap);
      if (clickable){
        wrap.addEventListener('click', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const p = S.currentCard?.playerIdx ?? playerIdx;
          if (p == null || (S.jokers[p] ?? 0) <= 0) return;
          S.jokers[p]--;
          try { wrap.remove(); } catch(_) { wrap.style.display = 'none'; }
          updateJokerCount("#screen-action #jokerCount", p);
          updateJokerCount("#screen-draw #jokerCount", p);
          // Joker: same player gets a fresh draw at the SAME phaseIdx (no post-fork yet)
          S.currentIndex = p;
          prepareAndShowDrawScreen();
        }, { passive: false });
      }
    }
  };
  window.updateJokerCount = function(sel, idx){ const el = typeof sel === "string" ? $(sel) : sel; if (!el) return; el.textContent = `JOKER ${S.jokers?.[idx] ?? 4} REMAINING`; };

  /* =========================================================
     Branching / Choices (ID-based) + HUD name on choices
  ========================================================= */
  const HIDE_UNDER = ['#screen-action','#screen-draw'];

  function hideById(id){ const el=$(id); if(!el) return;
    el.style.setProperty('display','none','important');
    el.style.setProperty('visibility','hidden','important');
    el.style.setProperty('pointer-events','none','important');
  }
  function hardHideChoice(id){
    const el = $(id); if (!el) return;
    el.style.cssText = '';
    el.setAttribute('aria-hidden','true'); el.hidden = true;
    el.style.setProperty('display','none','important');
    el.style.setProperty('visibility','hidden','important');
    el.style.setProperty('opacity','0','important');
    el.style.setProperty('pointer-events','none','important');
    el.style.setProperty('position','relative','important');
    el.style.setProperty('z-index','0','important');
    el.querySelectorAll('*').forEach(n=>n.style.setProperty('pointer-events','none','important'));
  }
  function hardShowChoice(id){
    const el = $(id); if (!el) return;
    el.hidden = false; el.removeAttribute('aria-hidden');
    el.style.cssText = '';
    el.style.setProperty('display','block','important');
    el.style.setProperty('visibility','visible','important');
    el.style.setProperty('opacity','1','important');
    el.style.setProperty('pointer-events','auto','important');
    el.style.setProperty('position','relative','important');
    el.style.setProperty('z-index','99999','important');
    el.querySelectorAll('*').forEach(n=>n.style.removeProperty('pointer-events'));
  }
  function setHudNameOn(sectionId){
    const el=$(sectionId); if(!el) return;
    const hud=el.querySelector('#hudName'); if(!hud) return;
    hud.textContent = playerName().toUpperCase();
  }
  function sectionIsVisible(id){
    const el = $(id); if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && el.getAttribute('aria-hidden') !== 'true';
  }

  function showChoice(sectionId){
    // Hide all choices hard
    ['#screen-choices1','#screen-choices2','#screen-choices3'].forEach(hardHideChoice);

    // Hide gameplay layers beneath
    HIDE_UNDER.forEach(hideById);

    // HUD name
    setHudNameOn(sectionId);

    // Hard show requested section (works for 1,2,3)
    hardShowChoice(sectionId);

    // Defensive: neutralize common overlays that might sit on top
    try {
      document.querySelectorAll('.w-nav-overlay, .w-lightbox-backdrop, [data-wf-overlay]')
        .forEach(el => { el.style.pointerEvents = 'none'; el.style.zIndex = '0'; });
      document.querySelectorAll('[style*="z-index"]').forEach(el=>{
        const id = (el.id||'').toLowerCase();
        if (id && (id.includes('header') || id.includes('nav') || id.includes('overlay'))) {
          el.style.zIndex = '0';
        }
      });
    } catch(_){}

    window.scrollTo(0, 0);
  }

  function resumeDraw(){
    ['#screen-choices1','#screen-choices2','#screen-choices3'].forEach(hardHideChoice);
    showScreen('#screen-draw');
    if (typeof window.prepareAndShowDrawScreen === 'function') window.prepareAndShowDrawScreen();
  }

  // Force-hide any inline-visible choices at load
  ['#screen-choices1','#screen-choices2','#screen-choices3'].forEach(hardHideChoice);

  // Gate Draw/Action to show choices at 2/3/4, 7/8, 10/11
  const ORIG_SHOW = window.showScreen;
  window.showScreen = function(id){
    if (S.preGamesDone && (id === '#screen-draw' || id === '#screen-action')){
      const key = String(pIdx());
      const pb = (S.playerBranch[key] ||= {});
      const next = nextLevel();

      // keep choice open if flagged
      if (pb.choiceOpen === '3'){ showChoice('#screen-choices3'); return; }
      if (pb.choiceOpen === '2'){ showChoice('#screen-choices2'); return; }

      // Apply immediate override (chosen fork)
      if (id === '#screen-draw' && pb.overrideNow){
        if (next !== pb.overrideNow) setPhaseTo(pb.overrideNow);
        delete pb.overrideNow;
        return ORIG_SHOW.apply(this, arguments);
      }

      // Apply post-fork override when armed
      if (id === '#screen-draw' && pb.overrideNext){
        if (next !== pb.overrideNext) setPhaseTo(pb.overrideNext);
        delete pb.overrideNext;
        return ORIG_SHOW.apply(this, arguments);
      }

      // Prompt logic
      if (id === '#screen-draw'){
        if ((next==='2'||next==='3'||next==='4') && !pb.pickL1){
          pb.choiceOpen = '2'; showChoice('#screen-choices1'); return;
        }
        if ((next==='7'||next==='8') && !pb.pickL6){
          pb.choiceOpen = '2'; showChoice('#screen-choices2'); return;
        }
        if ((next==='10'||next==='11') && !pb.pickL9){
          pb.choiceOpen = '3'; showChoice('#screen-choices3'); return;
        }
      }
    }
    return ORIG_SHOW.apply(this, arguments);
  };

  // ---- Buttons: robust mapping by section, Joker-safe (post-fork is delayed) ----

  // choices1: #position_option1 → 2, #position_option2 → 3, #position_option3 → 4 ; then (later) → 5
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('#position_option1, #position_option2, #position_option3');
    if (!t) return;
    if (!t.closest('#screen-choices1') || !sectionIsVisible('#screen-choices1')) return;

    e.preventDefault(); e.stopPropagation();
    const key=String(pIdx()); const pb=(S.playerBranch[key] ||= {});
    let pick='2'; if (t.id==='position_option2') pick='3'; else if (t.id==='position_option3') pick='4';
    pb.pickL1 = pick;
    pb.overrideNow = pick;        // immediate chosen fork level
    pb.awaitPostFork = '5';       // defer post-fork until Action is finished
    pb.choiceOpen = undefined;
    setPhaseTo(pick);
    resumeDraw();
  }, true);

  // choices2: allow id sets (4/5) or (6/7) → map to 7/8 ; then (later) → 9
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('#position_option4, #position_option5, #position_option6, #position_option7');
    if (!t) return;
    if (!t.closest('#screen-choices2') || !sectionIsVisible('#screen-choices2')) return;

    e.preventDefault(); e.stopPropagation();
    const key=String(pIdx()); const pb=(S.playerBranch[key] ||= {});
    let pick = (t.id==='position_option6' || t.id==='position_option4') ? '7' : '8';
    pb.pickL6 = pick;
    pb.overrideNow = pick;        // immediate chosen fork level
    pb.awaitPostFork = '9';       // defer post-fork until Action is finished
    pb.choiceOpen = undefined;
    setPhaseTo(pick);
    resumeDraw();
  }, true);

  // choices3: allow id sets (6/7) or (4/5) → map to 10/11 ; then (later) → 12
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('#position_option6, #position_option7, #position_option4, #position_option5');
    if (!t) return;
    if (!t.closest('#screen-choices3') || !sectionIsVisible('#screen-choices3')) return;

    e.preventDefault(); e.stopPropagation();
    const key=String(pIdx()); const pb=(S.playerBranch[key] ||= {});
    let pick = (t.id==='position_option6' || t.id==='position_option4') ? '10' : '11';
    pb.pickL9 = pick;
    pb.overrideNow  = pick;       // immediate chosen fork level
    pb.awaitPostFork = '12';      // defer post-fork until Action is finished
    pb.choiceOpen = undefined;
    setPhaseTo(pick);
    resumeDraw();
  }, true);

})();
</script>
<script>
(function(){
  const ORIG_SHOW = window.showScreen;
  if (typeof ORIG_SHOW !== 'function') return;

  window.showScreen = function(id){
    // call the real switcher
    const res = ORIG_SHOW.apply(this, arguments);

    // lock page scroll only on draw/action
    const lock = (id === '#screen-draw' || id === '#screen-action');
    const b = document.body, h = document.documentElement;
    b.style.overflowY = lock ? 'hidden' : '';
    h.style.overflowY = lock ? 'hidden' : '';
    b.style.overscrollBehaviorY = lock ? 'contain' : '';
    h.style.overscrollBehaviorY = lock ? 'contain' : '';

    // keep layout stable and avoid “1px jump”
    const tgt = document.querySelector(id);
    if (tgt){
      tgt.style.minHeight = '100dvh';
      tgt.style.height = '100dvh';
      tgt.style.maxHeight = '100dvh';
      tgt.style.overflow = 'hidden';
    }
    return res;
  };
})();
</script>
