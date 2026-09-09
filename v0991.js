(async()=>{
  const VERSION='0.9.9.1';
  const START=1000;
  const OLD_KEY='matchlens.paperBetting.v099';
  const DRAFT_KEY='matchlens.paperDraft.v0991';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>(Number(n)||0).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł';
  const n=v=>Number(v)||0;
  let supabase=null,session=null,account=null,coupons=[],draft=loadDraft(),configError='';

  function loadDraft(){try{const x=JSON.parse(localStorage.getItem(DRAFT_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
  function saveDraft(){localStorage.setItem(DRAFT_KEY,JSON.stringify(draft))}
  function oldLocal(){try{const x=JSON.parse(localStorage.getItem(OLD_KEY)||'null');return x&&Array.isArray(x.coupons)?x:null}catch{return null}}

  function style(){const s=document.createElement('style');s.textContent=`
    .pbcAuth{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.pbcUser{display:flex;align-items:center;gap:10px}.pbcAvatar{width:34px;height:34px;border-radius:50%;object-fit:cover;border:1px solid var(--line)}
    .pbcGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.pbcMetric{background:var(--p2);border:1px solid var(--line);border-radius:13px;padding:14px}.pbcMetric strong{display:block;font-size:23px;margin-top:5px}
    .pbcForm{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end}.pbcLeg{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)}
    .pbcTable{width:100%;border-collapse:collapse;font-size:12px}.pbcTable th,.pbcTable td{padding:9px 7px;border-bottom:1px solid var(--line);text-align:left}.pbcWin{color:var(--green);font-weight:800}.pbcLose{color:var(--red);font-weight:800}.pbcPending{color:var(--yellow);font-weight:800}.pbcActions{display:flex;gap:5px;flex-wrap:wrap}.pbcTiny{padding:6px 8px;border-radius:8px;font-size:11px}.pbcDanger{border-color:#65373d;color:#f1b0b0}.pbcLegs{color:var(--muted);font-size:11px;line-height:1.45;margin-top:4px}.pbcCloud{border-color:#315e49}.pbcDisabled{opacity:.55;pointer-events:none}
    @media(max-width:800px){.pbcGrid{grid-template-columns:repeat(2,1fr)}.pbcForm{grid-template-columns:1fr 1fr}.pbcForm>div:first-child{grid-column:1/-1}.pbcScroll{overflow-x:auto}.pbcTable{min-width:900px}.pbcLeg{grid-template-columns:1fr auto}}
  `;document.head.appendChild(s)}

  function replacePaperSection(){
    const old=$('pb');if(!old)return;
    const sec=document.createElement('section');sec.id='pb';sec.className=old.className;
    sec.innerHTML=`
      <div class="card pbcCloud"><div class="pbcAuth"><div><h3 style="margin:0">Paper Betting Cloud 0.9.9.1</h3><div class="muted" style="margin-top:6px">Wspólny bankroll i kupony na Windowsie, Linuxie i telefonie. Dane MatchLens są w osobnych tabelach Supabase.</div></div><div id="pbcAuth"></div></div><div id="pbcSetup" style="margin-top:12px"></div></div>
      <div id="pbcApp" class="pbcDisabled">
        <div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0">Wirtualny bankroll</h3><div class="muted" style="margin-top:6px">Start 1000 zł. Stawka schodzi z dostępnego salda od razu, a wypłata wraca po rozliczeniu.</div></div><button class="btn pbcDanger" id="pbcReset">Reset do 1000 zł</button></div><div id="pbcMetrics" class="pbcGrid" style="margin-top:14px"></div></div>
        <div class="card"><h3>Buduj kupon</h3><div class="pbcForm"><div><label>Mecz / zdarzenie</label><input id="pbcMatch" placeholder="np. Arsenal – Liverpool"></div><div><label>Typ</label><select id="pbcPick"><option value="1">1</option><option value="X">X</option><option value="2">2</option><option value="Over 2.5">Over 2.5</option><option value="Under 2.5">Under 2.5</option><option value="BTTS TAK">BTTS TAK</option><option value="BTTS NIE">BTTS NIE</option><option value="Inny">Inny</option></select></div><div><label>Kurs</label><input id="pbcOdd" type="number" min="1.01" step="0.01" placeholder="np. 1.85"></div><button class="btn" id="pbcAdd">Dodaj zdarzenie</button></div><div class="row" style="margin-top:10px"><button class="btn" id="pbcFromAnalyzer">Wczytaj z analizatora</button><span class="muted">Snapshot modelu zapisuje się przy każdym zdarzeniu.</span></div><div id="pbcDraft" style="margin-top:12px"></div><div class="row" style="margin-top:14px"><div style="min-width:180px"><label>Stawka kuponu</label><input id="pbcStake" type="number" min="0.01" step="0.01" value="20"></div><button class="btn primary" id="pbcPlace">Postaw wirtualny kupon</button><span id="pbcInfo" class="status">—</span></div></div>
        <div class="card"><div class="row" style="justify-content:space-between"><div><h3 style="margin:0">Kupony z chmury</h3><div class="muted">Rozliczenie zapisuje się od razu w Supabase i jest widoczne na wszystkich urządzeniach.</div></div><button class="btn" id="pbcRefresh">Odśwież</button></div><div class="pbcScroll"><table class="pbcTable"><thead><tr><th>Data</th><th>Kupon</th><th>Stawka</th><th>Kurs</th><th>Potencjalna wypłata</th><th>Status</th><th>Netto</th><th>Akcje</th></tr></thead><tbody id="pbcRows"></tbody></table></div></div>
      </div>`;
    old.replaceWith(sec);

    const tab=document.querySelector('.tab[data-t="pb"]');if(tab){const clone=tab.cloneNode(true);clone.textContent='Paper Betting ☁';tab.replaceWith(clone);clone.onclick=()=>{document.querySelectorAll('.tab').forEach(y=>y.classList.remove('active'));clone.classList.add('active');['a','h','d','pb'].forEach(id=>$(id)?.classList.toggle('hidden',id!=='pb'));renderAll()}}
    $('pbcAdd').onclick=addLeg;$('pbcFromAnalyzer').onclick=fromAnalyzer;$('pbcPlace').onclick=place;$('pbcReset').onclick=resetAll;$('pbcRefresh').onclick=refreshCloud;$('pbcStake').oninput=renderDraft;
  }

  async function initSupabase(){
    try{
      const r=await fetch('/api/supabase-config',{cache:'no-store'}),cfg=await r.json();
      if(!cfg.configured)throw Error('Supabase nie jest jeszcze skonfigurowany w zmiennych środowiskowych Vercel.');
      const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/+esm');
      supabase=mod.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const {data}=await supabase.auth.getSession();session=data.session;
      supabase.auth.onAuthStateChange(async(_event,s)=>{session=s;renderAuth();if(session)await refreshCloud();else{account=null;coupons=[];renderAll()}});
      renderAuth();if(session)await refreshCloud();
    }catch(e){configError=e.message||String(e);renderAuth()}
  }

  function renderAuth(){
    const host=$('pbcAuth'),setup=$('pbcSetup'),app=$('pbcApp');if(!host)return;
    if(configError){host.innerHTML='';setup.innerHTML=`<div class="notice warning"><b>Wymagane dokończenie konfiguracji.</b> ${esc(configError)}</div>`;app.classList.add('pbcDisabled');return}
    if(!supabase){host.innerHTML='<span class="muted">Łączenie z Supabase…</span>';return}
    if(!session){host.innerHTML='<button class="btn primary" id="pbcLogin">Zaloguj przez GitHub</button>';setup.innerHTML='<div class="notice">Zaloguj się tym samym kontem GitHub co w CHB. Po zalogowaniu dostaniesz własny bankroll zabezpieczony RLS.</div>';$('pbcLogin').onclick=login;app.classList.add('pbcDisabled');return}
    const u=session.user,meta=u.user_metadata||{},name=meta.user_name||meta.preferred_username||meta.name||u.email||'Użytkownik';
    host.innerHTML=`<div class="pbcUser">${meta.avatar_url?`<img class="pbcAvatar" src="${esc(meta.avatar_url)}" alt="">`:''}<div><b>${esc(name)}</b><div class="muted">Supabase • synchronizacja aktywna</div></div><button class="btn" id="pbcLogout">Wyloguj</button></div>`;$('pbcLogout').onclick=logout;setup.innerHTML='<div class="notice good">Chmura aktywna. Kupony i saldo są przypisane do Twojego <code>auth.uid()</code>; tabele CHB nie są używane.</div>';app.classList.remove('pbcDisabled');
  }

  async function login(){await supabase.auth.signInWithOAuth({provider:'github',options:{redirectTo:location.origin+'/v06.html?paper=1'}})}
  async function logout(){await supabase.auth.signOut()}

  async function ensureAccount(){const {data,error}=await supabase.rpc('matchlens_ensure_account');if(error)throw error;return data}
  async function refreshCloud(){
    if(!session||!supabase)return;
    setInfo('Synchronizacja z Supabase…');
    try{
      await ensureAccount();
      const [a,c]=await Promise.all([
        supabase.from('matchlens_paper_accounts').select('*').eq('user_id',session.user.id).single(),
        supabase.from('matchlens_coupons').select('*,matchlens_coupon_legs(*)').order('created_at',{ascending:false})
      ]);
      if(a.error)throw a.error;if(c.error)throw c.error;
      account={...a.data,start_balance:n(a.data.start_balance),cash:n(a.data.cash)};
      coupons=(c.data||[]).map(x=>({...x,stake:n(x.stake),odds:n(x.odds),potential:n(x.potential),payout:n(x.payout),net:n(x.net),legs:(x.matchlens_coupon_legs||[]).sort((p,q)=>p.position-q.position).map(l=>({...l,odd:n(l.odd)}))}));
      setInfo('Synchronizacja zakończona.');renderAll();maybeShowImport();
    }catch(e){setInfo('Błąd chmury: '+(e.message||e));const setup=$('pbcSetup');if(setup)setup.innerHTML=`<div class="notice danger"><b>Supabase:</b> ${esc(e.message||e)}. Jeśli tabele jeszcze nie istnieją, uruchom plik <code>supabase/matchlens_paper_betting.sql</code> w SQL Editor.</div>`}
  }

  function maybeShowImport(){
    const old=oldLocal();if(!session||!old?.coupons?.length||coupons.length)return;
    const setup=$('pbcSetup');setup.innerHTML+=`<div class="notice warning" style="margin-top:10px">Znaleziono ${old.coupons.length} kuponów z lokalnej wersji 0.9.9. Chmura jest pusta. <button class="btn" id="pbcImport" style="margin-left:8px">Przenieś lokalne kupony do chmury</button></div>`;$('pbcImport').onclick=importLocal;
  }

  async function importLocal(){
    const old=oldLocal();if(!old?.coupons?.length||coupons.length)return;
    if(!confirm('Przenieść lokalną historię do pustego konta chmurowego? Najpierw zresetujemy chmurowy bankroll do 1000 zł, a potem odtworzymy kupony chronologicznie.'))return;
    setInfo('Import lokalnych kuponów…');
    try{
      let r=await supabase.rpc('matchlens_reset_paper');if(r.error)throw r.error;
      const ordered=[...old.coupons].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
      for(const c of ordered){
        const legs=(c.legs||[]).map(l=>({match:l.match,pick:l.pick,odd:n(l.odd),snapshot:l.snapshot||{version:'0.9.9'}}));if(!legs.length)continue;
        const placed=await supabase.rpc('matchlens_place_coupon',{p_stake:n(c.stake),p_legs:legs,p_model_version:'0.9.9-import',p_created_device:'localStorage import'});if(placed.error)throw placed.error;
        if(c.status&&c.status!=='pending'){const st=c.status==='won'?'won':c.status==='lost'?'lost':'void',s=await supabase.rpc('matchlens_settle_coupon',{p_coupon_id:placed.data,p_status:st});if(s.error)throw s.error}
      }
      localStorage.setItem(OLD_KEY+'.imported','1');await refreshCloud();setInfo('Import zakończony.');
    }catch(e){setInfo('Import przerwany: '+(e.message||e))}
  }

  function snapshot(){let x={version:VERSION};try{if(window.A?.last)x.analysis=window.A.last}catch{}return x}
  function fromAnalyzer(){const h=$('home'),a=$('away');if(!h||!a||!h.value||!a.value){setInfo('Najpierw wybierz mecz w Analizatorze.');return}const hn=h.options[h.selectedIndex]?.textContent||'Gospodarze',an=a.options[a.selectedIndex]?.textContent||'Goście';$('pbcMatch').value=`${hn} – ${an}`;const p=$('pbcPick').value;let odd='';if(p==='1')odd=$('odd1')?.value||'';if(p==='X')odd=$('oddx')?.value||'';if(p==='2')odd=$('odd2')?.value||'';if(odd)$('pbcOdd').value=odd;setInfo('Mecz wczytany z analizatora.')}
  function addLeg(){const match=$('pbcMatch').value.trim(),pick=$('pbcPick').value,odd=n($('pbcOdd').value);if(!match||odd<1.01){setInfo('Podaj mecz i kurs ≥ 1.01.');return}draft.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),match,pick,odd,snapshot:snapshot()});saveDraft();$('pbcMatch').value='';$('pbcOdd').value='';renderDraft()}
  function removeLeg(id){draft=draft.filter(x=>x.id!==id);saveDraft();renderDraft()}
  function combined(){return draft.reduce((z,x)=>z*x.odd,1)}

  async function place(){
    if(!session){setInfo('Najpierw zaloguj się przez GitHub.');return}const stake=n($('pbcStake').value);if(!draft.length){setInfo('Kupon jest pusty.');return}if(stake<=0){setInfo('Podaj prawidłową stawkę.');return}if(account&&stake>account.cash){setInfo('Brak wirtualnych środków.');return}
    disablePlace(true);setInfo('Zapisywanie kuponu w chmurze…');
    const legs=draft.map(l=>({match:l.match,pick:l.pick,odd:l.odd,snapshot:l.snapshot||{version:VERSION}}));
    const {error}=await supabase.rpc('matchlens_place_coupon',{p_stake:stake,p_legs:legs,p_model_version:VERSION,p_created_device:(navigator.userAgent||'browser').slice(0,180)});disablePlace(false);if(error){setInfo('Błąd: '+error.message);return}draft=[];saveDraft();await refreshCloud();setInfo('Kupon zapisany w Supabase.')
  }
  async function settle(id,status){if(!confirm(`Rozliczyć kupon jako: ${status==='won'?'WYGRANY':status==='lost'?'PRZEGRANY':'ZWROT'}?`))return;const {error}=await supabase.rpc('matchlens_settle_coupon',{p_coupon_id:id,p_status:status});if(error){setInfo('Błąd: '+error.message);return}await refreshCloud()}
  async function removeCoupon(id){if(!confirm('Usunąć ten kupon? Oczekujący kupon zwróci wirtualną stawkę do salda.'))return;const {error}=await supabase.rpc('matchlens_delete_coupon',{p_coupon_id:id});if(error){setInfo('Błąd: '+error.message);return}await refreshCloud()}
  async function resetAll(){if(!confirm('Zresetować CAŁY chmurowy Paper Betting? Wszystkie kupony zostaną usunięte, a saldo wróci do 1000 zł na wszystkich urządzeniach.'))return;const {error}=await supabase.rpc('matchlens_reset_paper');if(error){setInfo('Błąd: '+error.message);return}draft=[];saveDraft();await refreshCloud()}

  function metrics(){const pending=coupons.filter(c=>c.status==='pending'),settled=coupons.filter(c=>c.status!=='pending'),op=pending.reduce((z,c)=>z+c.stake,0),profit=settled.reduce((z,c)=>z+c.net,0),turn=settled.reduce((z,c)=>z+c.stake,0),graded=settled.filter(c=>c.status==='won'||c.status==='lost'),won=graded.filter(c=>c.status==='won').length;return{op,profit,turn,roi:turn?profit/turn:0,hit:graded.length?won/graded.length:0,equity:(account?.cash||0)+op}}
  function renderMetrics(){const h=$('pbcMetrics');if(!h)return;if(!account){h.innerHTML='<div class="muted">Zaloguj się, aby pobrać bankroll.</div>';return}const m=metrics();h.innerHTML=`<div class="pbcMetric"><small>Saldo dostępne</small><strong>${money(account.cash)}</strong></div><div class="pbcMetric"><small>W grze</small><strong>${money(m.op)}</strong></div><div class="pbcMetric"><small>Zrealizowany bilans</small><strong class="${m.profit>=0?'pbcWin':'pbcLose'}">${m.profit>=0?'+':''}${money(m.profit)}</strong></div><div class="pbcMetric"><small>ROI rozliczonych</small><strong>${(m.roi*100).toFixed(1)}%</strong></div><div class="pbcMetric"><small>Kapitał bieżący*</small><strong>${money(m.equity)}</strong></div><div class="pbcMetric"><small>Skuteczność</small><strong>${(m.hit*100).toFixed(1)}%</strong></div><div class="pbcMetric"><small>Obrót rozliczony</small><strong>${money(m.turn)}</strong></div><div class="pbcMetric"><small>Kupony</small><strong>${coupons.length}</strong></div>`}
  function renderDraft(){const h=$('pbcDraft');if(!h)return;if(!draft.length)h.innerHTML='<div class="muted">Kupon jest pusty.</div>';else h.innerHTML=draft.map((l,i)=>`<div class="pbcLeg"><div><b>${i+1}. ${esc(l.match)}</b><div class="muted">${esc(l.pick)} • snapshot ${esc(l.snapshot?.version||VERSION)}</div></div><span>${l.odd.toFixed(2)}</span><button class="btn pbcTiny pbcDanger" data-draft="${l.id}">Usuń</button></div>`).join('');h.querySelectorAll?.('[data-draft]').forEach(b=>b.onclick=()=>removeLeg(b.dataset.draft));const stake=n($('pbcStake')?.value),o=draft.length?combined():0;if(draft.length)setInfo(`Łączny kurs ${o.toFixed(2)} • stawka ${money(stake)} • potencjalna wypłata ${money(stake*o)}`)}
  function renderRows(){const h=$('pbcRows');if(!h)return;h.innerHTML=coupons.length?coupons.map(c=>{const status=c.status==='pending'?'<span class="pbcPending">oczekuje</span>':c.status==='won'?'<span class="pbcWin">wygrany</span>':c.status==='lost'?'<span class="pbcLose">przegrany</span>':'zwrot',legs=c.legs.map(l=>`${esc(l.match_name)} — ${esc(l.pick)} @ ${l.odd.toFixed(2)}`).join('<br>'),net=c.status==='pending'?'—':`${c.net>=0?'+':''}${money(c.net)}`;return`<tr><td>${new Date(c.created_at).toLocaleString('pl-PL')}</td><td><b>${c.legs.length===1?'Singiel':`AKO ${c.legs.length}`}</b><div class="pbcLegs">${legs}</div></td><td>${money(c.stake)}</td><td>${c.odds.toFixed(2)}</td><td>${money(c.potential)}</td><td>${status}</td><td class="${c.net>0?'pbcWin':c.net<0?'pbcLose':''}">${net}</td><td><div class="pbcActions">${c.status==='pending'?`<button class="btn pbcTiny" data-win="${c.id}">Wygrany</button><button class="btn pbcTiny" data-lost="${c.id}">Przegrany</button><button class="btn pbcTiny" data-void="${c.id}">Zwrot</button>`:''}<button class="btn pbcTiny pbcDanger" data-rm="${c.id}">Usuń</button></div></td></tr>`}).join(''):'<tr><td colspan="8" class="muted">Brak kuponów w chmurze. Startujesz z wirtualnych 1000 zł.</td></tr>';h.querySelectorAll('[data-win]').forEach(b=>b.onclick=()=>settle(b.dataset.win,'won'));h.querySelectorAll('[data-lost]').forEach(b=>b.onclick=()=>settle(b.dataset.lost,'lost'));h.querySelectorAll('[data-void]').forEach(b=>b.onclick=()=>settle(b.dataset.void,'void'));h.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>removeCoupon(b.dataset.rm))}
  function renderAll(){renderAuth();renderMetrics();renderDraft();renderRows()}
  function setInfo(t){const h=$('pbcInfo');if(h)h.textContent=t}
  function disablePlace(v){const b=$('pbcPlace');if(b)b.disabled=v}

  function upgradeVersion(){const v=document.querySelector('.top h1 .muted');if(v)v.textContent=VERSION;const sub=document.querySelector('.top .sub');if(sub)sub.textContent='Paper Betting Cloud — bankroll i kupony synchronizowane przez Supabase między urządzeniami.'}
  style();replacePaperSection();upgradeVersion();renderAll();await initSupabase();
  if(new URLSearchParams(location.search).get('paper')==='1'){document.querySelector('.tab[data-t="pb"]')?.click()}
})();
