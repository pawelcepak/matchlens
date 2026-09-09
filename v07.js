(() => {
  const VERSION = '0.7';
  const LEAGUES = { DED:88, PL:39, PD:140, BL1:78, SA:135, FL1:61, PPL:94, ELC:40, BSA:71, CL:2 };
  const TTL = 30 * 60 * 1000;

  function norm(s){
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\b(fc|afc|sc|cf|ac|ssc|sv|vfb|rc|cd|ud|club|calcio|football|futbol|deportivo)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ').trim();
  }
  function scoreName(a,b){
    a=norm(a); b=norm(b); if(!a||!b) return 0; if(a===b) return 1;
    if(a.includes(b)||b.includes(a)) return .92;
    const A=new Set(a.split(' ')), B=new Set(b.split(' '));
    const common=[...A].filter(x=>B.has(x)).length;
    return common/Math.max(A.size,B.size,1);
  }
  async function contextApi(params){
    const q=new URLSearchParams(params);
    const r=await fetch('/api/context?'+q.toString(),{headers:{Accept:'application/json'}});
    let d; try{d=await r.json()}catch{throw Error('Nieprawidłowa odpowiedź API-Football.')} 
    if(!r.ok) throw Error(d?.error||('HTTP '+r.status));
    return d;
  }
  function cacheKey(comp,season){return `ml07:injuries:${comp}:${season}`}
  function getCached(comp,season){
    try{const x=JSON.parse(localStorage.getItem(cacheKey(comp,season))||'null'); if(x&&Date.now()-x.ts<TTL)return x.data;}catch{}
    return null;
  }
  function setCached(comp,season,data){try{localStorage.setItem(cacheKey(comp,season),JSON.stringify({ts:Date.now(),data}))}catch{}}

  function installStyle(){
    const s=document.createElement('style');
    s.textContent=`
      .ctxgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.ctxteam{background:var(--p2);border:1px solid var(--line);border-radius:13px;padding:13px}
      .ctxteam strong{font-size:20px}.ctxlist{font-size:12px;color:var(--muted);line-height:1.55;margin-top:8px}.ctxmeta{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      @media(max-width:800px){.ctxgrid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function addContextCard(){
    const cards=[...document.querySelectorAll('#a > .card')];
    const odds=cards.find(x=>x.textContent.includes('Kursy bukmachera'));
    if(!odds) return;
    const card=document.createElement('div');
    card.className='card'; card.id='ml07-context';
    card.innerHTML=`<h3 style="margin-top:0">Kontekst składu — API-Football</h3>
      <div class="muted">Pobiera aktualne wpisy o kontuzjach/absencjach dla wybranej ligi i sezonu. Wynik automatycznie uzupełnia pola absencji; nadal możesz je ręcznie poprawić.</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="ctxLoad">Pobierz absencje</button><button class="btn" id="ctxRefresh">Odśwież</button><span class="status" id="ctxStatus">Nie pobierano kontekstu.</span></div>
      <div id="ctxResult"></div>`;
    odds.parentNode.insertBefore(card,odds);
    $('ctxLoad').onclick=()=>loadContext(false);
    $('ctxRefresh').onclick=()=>loadContext(true);
  }

  function matchTeam(item,homeName,awayName){
    const tn=item?.team?.name||'';
    const sh=scoreName(tn,homeName), sa=scoreName(tn,awayName);
    if(Math.max(sh,sa)<.45) return null;
    return sh>=sa?'home':'away';
  }
  function uniquePlayers(items){
    const m=new Map();
    items.forEach(x=>{
      const p=x?.player||{}; const key=String(p.id||p.name||Math.random());
      if(!m.has(key))m.set(key,{name:p.name||'Nieznany zawodnik',type:x?.player?.type||x?.type||x?.reason||'',reason:x?.player?.reason||x?.reason||''});
    });
    return [...m.values()];
  }
  function renderContext(homeName,awayName,home,away,quota,cached){
    const fmt=xs=>xs.length?xs.slice(0,8).map(x=>esc(x.name)+(x.reason?` — ${esc(x.reason)}`:'')).join('<br>'):'Brak wpisów w odpowiedzi API.';
    $('ctxResult').innerHTML=`<div class="ctxgrid">
      <div class="ctxteam"><strong>${home.length}</strong><small class="muted"> • ${esc(homeName)}</small><div class="ctxlist">${fmt(home)}</div></div>
      <div class="ctxteam"><strong>${away.length}</strong><small class="muted"> • ${esc(awayName)}</small><div class="ctxlist">${fmt(away)}</div></div>
    </div><div class="ctxmeta"><span class="badge">Źródło: API-Football</span>${quota?.remaining!=null?`<span class="badge">Pozostało zapytań: ${esc(quota.remaining)}${quota.limit?` / ${esc(quota.limit)}`:''}</span>`:''}<span class="badge">${cached?'cache lokalny':'świeże dane / cache Vercel'}</span></div>`;
  }

  async function loadContext(force){
    if(!A?.matches?.length){$('ctxStatus').textContent='Najpierw kliknij „Pobierz dane”.';return;}
    const comp=$('comp').value, season=$('season').value, league=LEAGUES[comp];
    if(!league){$('ctxStatus').textContent='Ta liga nie ma jeszcze mapowania API-Football.';return;}
    const hi=$('home').value, ai=$('away').value;
    const homeName=A.teams.get(hi)||$('home').selectedOptions[0]?.textContent||'';
    const awayName=A.teams.get(ai)||$('away').selectedOptions[0]?.textContent||'';
    if(!homeName||!awayName||hi===ai){$('ctxStatus').textContent='Wybierz dwie różne drużyny.';return;}
    $('ctxStatus').textContent='Pobieranie kontekstu…'; $('ctxLoad').disabled=true; $('ctxRefresh').disabled=true;
    try{
      let d=!force&&getCached(comp,season), cached=!!d;
      if(!d){d=await contextApi({action:'injuries',league:String(league),season:String(season)});setCached(comp,season,d)}
      const raw=Array.isArray(d.response)?d.response:[];
      const h=[],a=[];
      raw.forEach(x=>{const side=matchTeam(x,homeName,awayName);if(side==='home')h.push(x);else if(side==='away')a.push(x)});
      const hp=uniquePlayers(h), ap=uniquePlayers(a);
      $('ha').value=hp.length; $('aa').value=ap.length;
      $('ctxStatus').textContent=`Uzupełniono absencje: ${homeName} ${hp.length}, ${awayName} ${ap.length}.`;
      renderContext(homeName,awayName,hp,ap,d.quota||null,cached);
    }catch(e){
      $('ctxStatus').textContent='Błąd: '+e.message;
      $('ctxResult').innerHTML='<div class="notice warning" style="margin-top:12px">API-Football nie zwróciło kontekstu. Pola absencji pozostają ręczne.</div>';
    }finally{$('ctxLoad').disabled=false;$('ctxRefresh').disabled=false}
  }

  function extendDiagnostics(){
    const btn=$('testApi'); if(!btn) return;
    const old=btn.onclick;
    btn.onclick=async()=>{
      if(old) await old();
      const diag=$('diag');
      try{
        const d=await contextApi({action:'health'});
        const q=d.quota||{};
        diag.insertAdjacentHTML('beforeend',`<div class="kv"><div>API-Football</div><div class="ok">${d.configured===false?'klucz nieustawiony':'połączono'}${q.remaining!=null?` • pozostało ${esc(q.remaining)}${q.limit?` / ${esc(q.limit)}`:''}`:''}</div></div>`);
      }catch(e){diag.insertAdjacentHTML('beforeend',`<div class="kv"><div>API-Football</div><div class="bad">${esc(e.message)}</div></div>`)}
    };
  }

  installStyle();
  const ver=document.querySelector('.top h1 .muted'); if(ver)ver.textContent=VERSION;
  const sub=document.querySelector('.top .sub'); if(sub)sub.textContent='Explainable Model + kontekst składu — forma, rating, home/away, H2H, backtest i absencje z API-Football.';
  addContextCard();
  extendDiagnostics();
})();
