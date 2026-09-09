(() => {
  const VERSION='0.9.9';
  const KEY='matchlens.paperBetting.v099';
  const START=1000;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>(Number(n)||0).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł';
  const now=()=>new Date().toISOString();

  function load(){
    try{
      const x=JSON.parse(localStorage.getItem(KEY)||'null');
      if(x&&Array.isArray(x.coupons)&&Number.isFinite(x.cash))return x;
    }catch{}
    return{start:START,cash:START,coupons:[],draft:[]};
  }
  let S=load();
  function save(){localStorage.setItem(KEY,JSON.stringify(S))}

  function style(){const s=document.createElement('style');s.textContent=`
    .pbGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.pbMetric{background:var(--p2);border:1px solid var(--line);border-radius:13px;padding:14px}.pbMetric strong{display:block;font-size:23px;margin-top:5px}.pbForm{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end}.pbDraft{margin-top:12px}.pbLeg{display:grid;grid-template-columns:1fr auto auto auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)}.pbTable{width:100%;border-collapse:collapse;font-size:12px}.pbTable th,.pbTable td{padding:9px 7px;border-bottom:1px solid var(--line);text-align:left}.pbWin{color:var(--green);font-weight:800}.pbLose{color:var(--red);font-weight:800}.pbPending{color:var(--yellow);font-weight:800}.pbActions{display:flex;gap:5px;flex-wrap:wrap}.pbTiny{padding:6px 8px;border-radius:8px;font-size:11px}.pbDanger{border-color:#65373d;color:#f1b0b0}.pbNotice{margin-top:10px}.pbCouponLegs{color:var(--muted);font-size:11px;line-height:1.45;margin-top:4px}@media(max-width:800px){.pbGrid{grid-template-columns:repeat(2,1fr)}.pbForm{grid-template-columns:1fr 1fr}.pbForm>div:first-child{grid-column:1/-1}.pbScroll{overflow-x:auto}.pbTable{min-width:900px}.pbLeg{grid-template-columns:1fr auto}}
  `;document.head.appendChild(s)}

  function ensureTab(){
    const tabs=document.querySelector('.tabs');if(!tabs||$('pb'))return;
    const b=document.createElement('button');b.className='tab';b.dataset.t='pb';b.textContent='Paper Betting';tabs.appendChild(b);
    const sec=document.createElement('section');sec.id='pb';sec.className='hidden';sec.innerHTML=`
      <div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0">Paper Betting / Symulator kuponów</h3><div class="muted" style="margin-top:6px">Start: 1000 zł. Stawka jest odejmowana od dostępnego salda od razu, a wygrana wypłaca stawkę × łączny kurs. To wyłącznie wirtualna symulacja.</div></div><button class="btn pbDanger" id="pbReset">Reset do 1000 zł</button></div><div id="pbMetrics" class="pbGrid" style="margin-top:14px"></div></div>
      <div class="card"><h3>Buduj kupon</h3><div class="pbForm"><div><label>Mecz / zdarzenie</label><input id="pbMatch" placeholder="np. Arsenal – Liverpool"></div><div><label>Typ</label><select id="pbPick"><option value="1">1</option><option value="X">X</option><option value="2">2</option><option value="Over 2.5">Over 2.5</option><option value="Under 2.5">Under 2.5</option><option value="BTTS TAK">BTTS TAK</option><option value="BTTS NIE">BTTS NIE</option><option value="Inny">Inny</option></select></div><div><label>Kurs</label><input id="pbOdd" type="number" min="1.01" step="0.01" placeholder="np. 1.85"></div><button class="btn" id="pbAddLeg">Dodaj zdarzenie</button></div><div class="row" style="margin-top:10px"><button class="btn" id="pbFromAnalyzer">Wczytaj mecz z analizatora</button><span class="muted">Snapshot zapisuje wersję MatchLens i, jeśli są dostępne, prawdopodobieństwa 1/X/2 z ostatniej analizy.</span></div><div id="pbDraft" class="pbDraft"></div><div class="row" style="margin-top:14px"><div style="min-width:180px"><label>Stawka kuponu</label><input id="pbStake" type="number" min="0.01" step="0.01" value="20"></div><button class="btn primary" id="pbPlace">Postaw wirtualny kupon</button><span id="pbPlaceInfo" class="status">—</span></div></div>
      <div class="card"><div class="row" style="justify-content:space-between"><div><h3 style="margin:0">Kupony</h3><div class="muted">Rozliczaj po wyniku. Później możemy dołożyć automatyczne rozliczanie z API.</div></div></div><div class="pbScroll"><table class="pbTable"><thead><tr><th>Data</th><th>Kupon</th><th>Stawka</th><th>Kurs</th><th>Potencjalna wypłata</th><th>Status</th><th>Wynik netto</th><th>Akcje</th></tr></thead><tbody id="pbRows"></tbody></table></div></div>`;
    const footer=document.querySelector('footer');footer.parentElement.insertBefore(sec,footer);

    document.querySelectorAll('.tab').forEach(x=>x.onclick=()=>{
      document.querySelectorAll('.tab').forEach(y=>y.classList.remove('active'));x.classList.add('active');
      ['a','h','d','pb'].forEach(id=>$(id)?.classList.toggle('hidden',id!==x.dataset.t));
      if(x.dataset.t==='h'&&typeof window.history==='function')try{window.history()}catch{}
      if(x.dataset.t==='pb')render();
    });
    $('pbAddLeg').onclick=addLeg;$('pbFromAnalyzer').onclick=fromAnalyzer;$('pbPlace').onclick=place;$('pbReset').onclick=resetAll;
  }

  function openStake(){return S.coupons.filter(c=>c.status==='pending').reduce((z,c)=>z+c.stake,0)}
  function settled(){return S.coupons.filter(c=>c.status!=='pending')}
  function realizedProfit(){return settled().reduce((z,c)=>z+(c.net||0),0)}
  function turnover(){return settled().reduce((z,c)=>z+c.stake,0)}
  function metrics(){
    const op=openStake(),profit=realizedProfit(),to=turnover(),won=settled().filter(c=>c.status==='won').length,res=settled().filter(c=>c.status==='won'||c.status==='lost').length;
    return{op,profit,to,roi:to?profit/to:0,hit:res?won/res:0,equity:S.cash+op};
  }

  function analyzerSnapshot(){
    let snap={version:VERSION};
    try{
      if(window.A?.last){const x=window.A.last;snap={...snap,model:x.model||x.probs||null,expected:x.expected||null}}
    }catch{}
    return snap;
  }
  function fromAnalyzer(){
    const h=$('home'),a=$('away');
    if(!h||!a||!h.value||!a.value){$('pbPlaceInfo').textContent='Najpierw wybierz mecz w Analizatorze.';return}
    const hn=h.options[h.selectedIndex]?.textContent||'Gospodarze',an=a.options[a.selectedIndex]?.textContent||'Goście';$('pbMatch').value=`${hn} – ${an}`;
    const pick=$('pbPick').value;let odd='';if(pick==='1')odd=$('odd1')?.value||'';if(pick==='X')odd=$('oddx')?.value||'';if(pick==='2')odd=$('odd2')?.value||'';if(odd)$('pbOdd').value=odd;
    $('pbPlaceInfo').textContent='Mecz wczytany z analizatora.';
  }

  function addLeg(){const match=$('pbMatch').value.trim(),pick=$('pbPick').value,odd=Number($('pbOdd').value);if(!match||!Number.isFinite(odd)||odd<1.01){$('pbPlaceInfo').textContent='Podaj mecz i prawidłowy kurs ≥ 1.01.';return}S.draft.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),match,pick,odd,snapshot:analyzerSnapshot()});save();$('pbMatch').value='';$('pbOdd').value='';renderDraft()}
  function removeLeg(id){S.draft=S.draft.filter(x=>x.id!==id);save();renderDraft()}
  function combined(){return S.draft.reduce((z,x)=>z*x.odd,1)}
  function renderDraft(){const host=$('pbDraft');if(!host)return;if(!S.draft.length){host.innerHTML='<div class="muted">Kupon jest pusty.</div>';updatePlaceInfo();return}host.innerHTML=S.draft.map((l,i)=>`<div class="pbLeg"><div><b>${i+1}. ${esc(l.match)}</b><div class="muted">Typ: ${esc(l.pick)} • snapshot ${esc(l.snapshot?.version||VERSION)}</div></div><span>${l.odd.toFixed(2)}</span><button class="btn pbTiny pbDanger" data-del-leg="${l.id}">Usuń</button></div>`).join('');host.querySelectorAll('[data-del-leg]').forEach(b=>b.onclick=()=>removeLeg(b.dataset.delLeg));updatePlaceInfo()}
  function updatePlaceInfo(){const e=$('pbPlaceInfo');if(!e)return;const stake=Number($('pbStake')?.value)||0,od=S.draft.length?combined():0;e.textContent=S.draft.length?`Łączny kurs ${od.toFixed(2)} • stawka ${money(stake)} • potencjalna wypłata ${money(stake*od)}`:'Dodaj co najmniej jedno zdarzenie.'}

  function place(){const stake=Number($('pbStake').value),od=combined();if(!S.draft.length){$('pbPlaceInfo').textContent='Kupon jest pusty.';return}if(!Number.isFinite(stake)||stake<=0){$('pbPlaceInfo').textContent='Podaj prawidłową stawkę.';return}if(stake>S.cash+1e-9){$('pbPlaceInfo').textContent=`Brak środków. Dostępne: ${money(S.cash)}.`;return}const c={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),createdAt:now(),stake,odds:od,potential:stake*od,status:'pending',net:0,legs:S.draft.map(x=>({...x}))};S.cash-=stake;S.coupons.unshift(c);S.draft=[];save();render();$('pbPlaceInfo').textContent=`Kupon postawiony. Dostępne saldo: ${money(S.cash)}.`}

  function settle(id,status){const c=S.coupons.find(x=>x.id===id);if(!c||c.status!=='pending')return;if(status==='won'){const payout=c.stake*c.odds;S.cash+=payout;c.status='won';c.payout=payout;c.net=payout-c.stake}else if(status==='lost'){c.status='lost';c.payout=0;c.net=-c.stake}else if(status==='void'){S.cash+=c.stake;c.status='void';c.payout=c.stake;c.net=0}c.settledAt=now();save();render()}
  function removeCoupon(id){const c=S.coupons.find(x=>x.id===id);if(!c)return;if(c.status==='pending')S.cash+=c.stake;S.coupons=S.coupons.filter(x=>x.id!==id);save();render()}
  function resetAll(){if(!confirm('Zresetować Paper Betting? Wszystkie kupony zostaną usunięte, a saldo wróci do 1000 zł.'))return;S={start:START,cash:START,coupons:[],draft:[]};save();render()}

  function render(){if(!$('pbMetrics'))return;const m=metrics();$('pbMetrics').innerHTML=`<div class="pbMetric"><small>Saldo dostępne</small><strong>${money(S.cash)}</strong></div><div class="pbMetric"><small>W grze</small><strong>${money(m.op)}</strong></div><div class="pbMetric"><small>Zrealizowany bilans</small><strong class="${m.profit>=0?'pbWin':'pbLose'}">${m.profit>=0?'+':''}${money(m.profit)}</strong></div><div class="pbMetric"><small>ROI rozliczonych</small><strong>${(m.roi*100).toFixed(1)}%</strong></div><div class="pbMetric"><small>Kapitał bieżący*</small><strong>${money(m.equity)}</strong></div><div class="pbMetric"><small>Skuteczność kuponów</small><strong>${(m.hit*100).toFixed(1)}%</strong></div><div class="pbMetric"><small>Obrót rozliczony</small><strong>${money(m.to)}</strong></div><div class="pbMetric"><small>Liczba kuponów</small><strong>${S.coupons.length}</strong></div>`;
    const rows=$('pbRows');rows.innerHTML=S.coupons.length?S.coupons.map(c=>{const st=c.status==='pending'?'<span class="pbPending">oczekuje</span>':c.status==='won'?'<span class="pbWin">wygrany</span>':c.status==='lost'?'<span class="pbLose">przegrany</span>':'zwrot';const legs=c.legs.map(l=>`${esc(l.match)} — ${esc(l.pick)} @ ${l.odd.toFixed(2)}`).join('<br>');const net=c.status==='pending'?'—':`${c.net>=0?'+':''}${money(c.net)}`;return`<tr><td>${new Date(c.createdAt).toLocaleString('pl-PL')}</td><td><b>${c.legs.length===1?'Singiel':`AKO ${c.legs.length}`}</b><div class="pbCouponLegs">${legs}</div></td><td>${money(c.stake)}</td><td>${c.odds.toFixed(2)}</td><td>${money(c.potential)}</td><td>${st}</td><td class="${c.net>0?'pbWin':c.net<0?'pbLose':''}">${net}</td><td><div class="pbActions">${c.status==='pending'?`<button class="btn pbTiny" data-win="${c.id}">Wygrany</button><button class="btn pbTiny" data-loss="${c.id}">Przegrany</button><button class="btn pbTiny" data-void="${c.id}">Zwrot</button>`:''}<button class="btn pbTiny pbDanger" data-rm="${c.id}">Usuń</button></div></td></tr>`}).join(''):'<tr><td colspan="8" class="muted">Brak kuponów. Zacznij od wirtualnego salda 1000 zł.</td></tr>';
    rows.querySelectorAll('[data-win]').forEach(b=>b.onclick=()=>settle(b.dataset.win,'won'));rows.querySelectorAll('[data-loss]').forEach(b=>b.onclick=()=>settle(b.dataset.loss,'lost'));rows.querySelectorAll('[data-void]').forEach(b=>b.onclick=()=>settle(b.dataset.void,'void'));rows.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>removeCoupon(b.dataset.rm));renderDraft();
    const stake=$('pbStake');if(stake)stake.oninput=updatePlaceInfo;
  }

  function upgrade(){const v=document.querySelector('.top h1 .muted');if(v)v.textContent=VERSION;const sub=document.querySelector('.top .sub');if(sub)sub.textContent='Paper Betting — wirtualny bankroll 1000 zł i kupony rozliczane bez prawdziwych pieniędzy.';ensureTab();render()}
  style();upgrade();
})();