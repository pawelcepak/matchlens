(() => {
  const VERSION='0.9.6';
  const CUPS=[['CL','Champions League'],['EL','Europa League'],['UCL','Conference League']];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const valid=m=>m.status==='FINISHED'&&Number.isFinite(m.score?.fullTime?.home)&&Number.isFinite(m.score?.fullTime?.away);
  const norm=m=>({id:String(m.id),date:(m.utcDate||'').slice(0,10),homeId:String(m.homeTeam?.id||''),awayId:String(m.awayTeam?.id||''),home:m.homeTeam?.name||'',away:m.awayTeam?.name||'',hs:m.score?.fullTime?.home,as:m.score?.fullTime?.away,season:m.seasonStart,competition:m.competition?.code||''});

  function style(){const s=document.createElement('style');s.textContent=`
    .cup96{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.cup96Row{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:10px 0}.cup96Field{display:flex;flex-direction:column;gap:5px}.cup96Field input{max-width:130px}.cup96Checks{display:flex;gap:8px;flex-wrap:wrap}.cup96Check{display:flex;gap:6px;align-items:center;border:1px solid var(--line);padding:7px 9px;border-radius:9px}.cup96Table{width:100%;border-collapse:collapse;font-size:12px}.cup96Table th,.cup96Table td{padding:8px;border-bottom:1px solid var(--line);text-align:right}.cup96Table th:first-child,.cup96Table td:first-child{text-align:left}.cup96Good{background:rgba(114,213,160,.08)}@media(max-width:800px){.cup96Scroll{overflow-x:auto}.cup96Table{min-width:900px}}
  `;document.head.appendChild(s)}

  async function req(q,retry=0){const r=await fetch('/api/football?'+new URLSearchParams(q),{headers:{Accept:'application/json'}});let d;try{d=await r.json()}catch{d={error:'Nieprawidłowa odpowiedź backendu.'}}if(r.status===429&&retry<5){await sleep(13000);return req(q,retry+1)}if(!r.ok)throw Error(d.error||('HTTP '+r.status));return d}
  async function cupData(code,season){return req({action:'matches',competition:code,season:String(season),includePrevious:'1'})}
  async function teamHistory(teamId,season){const dateFrom=`${season-1}-06-01`,dateTo=`${season+1}-06-30`;return req({action:'teamHistory',teamId:String(teamId),dateFrom,dateTo,limit:'100'})}

  function teamStat(ms,id,N=10){const x=ms.filter(m=>(m.homeId===id||m.awayId===id)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);if(!x.length)return null;let pts=0,gf=0,ga=0;for(const m of x){const home=m.homeId===id,f=home?m.hs:m.as,a=home?m.as:m.hs;gf+=f;ga+=a;pts+=f>a?3:f===a?1:0}return{n:x.length,ppg:pts/x.length,gf:gf/x.length,ga:ga/x.length}}
  function pred(h,a){const diff=(h.ppg-a.ppg)*.75+(h.gf-a.gf)*.25-(h.ga-a.ga)*.18+.16,e=[Math.exp(diff),Math.exp(.48-Math.abs(diff)*.34),Math.exp(-diff)],z=e.reduce((x,y)=>x+y,0);return e.map(x=>x/z)}
  function add(o,p,y){const yy=[0,0,0];yy[y]=1;o.n++;o.b+=p.reduce((z,v,i)=>z+(v-yy[i])**2,0)/3;o.l+=-Math.log(Math.max(1e-6,p[y]));o.ok+=p.indexOf(Math.max(...p))===y}
  const stat=()=>({n:0,b:0,l:0,ok:0});
  const done=o=>({n:o.n,b:o.b/Math.max(1,o.n),l:o.l/Math.max(1,o.n),acc:o.ok/Math.max(1,o.n)});

  async function evaluateCup(code,name,season,status){
    const d=await cupData(code,season),all=(d.matches||[]).filter(valid).map(norm).sort((a,b)=>a.date.localeCompare(b.date));
    const test=all.filter(m=>Number(m.season)===season),teams=[...new Set(test.flatMap(m=>[m.homeId,m.awayId]).filter(Boolean))];
    if(!test.length)throw Error('Brak zakończonych meczów w wybranym sezonie.');
    const histories=new Map();
    for(let i=0;i<teams.length;i++){
      status.textContent=`${name}: historia drużyn ${i+1}/${teams.length} (limit API może wydłużyć test)…`;
      try{const h=await teamHistory(teams[i],season);histories.set(teams[i],(h.matches||[]).filter(valid).map(norm))}catch(e){histories.set(teams[i],[])}
      if(i<teams.length-1)await sleep(6500);
    }
    const cross=stat(),cup=stat(),pairedCross=stat(),pairedCup=stat();let crossEligible=0,cupEligible=0;
    for(let i=0;i<test.length;i++){
      const m=test[i],y=m.hs>m.as?0:m.hs===m.as?1:2,beforeCup=all.filter(x=>x.date<m.date),hh=(histories.get(m.homeId)||[]).filter(x=>x.date<m.date),aa=(histories.get(m.awayId)||[]).filter(x=>x.date<m.date),hs=teamStat(hh,m.homeId),as=teamStat(aa,m.awayId),ch=teamStat(beforeCup,m.homeId),ca=teamStat(beforeCup,m.awayId);
      const hasCross=hs&&as&&hs.n>=5&&as.n>=5,hasCup=ch&&ca&&ch.n>=3&&ca.n>=3;
      if(hasCross){crossEligible++;add(cross,pred(hs,as),y)}
      if(hasCup){cupEligible++;add(cup,pred(ch,ca),y)}
      if(hasCross&&hasCup){add(pairedCross,pred(hs,as),y);add(pairedCup,pred(ch,ca),y)}
    }
    return{name,test:test.length,teams:teams.length,cross:done(cross),cup:done(cup),pairedCross:done(pairedCross),pairedCup:done(pairedCup),crossCoverage:crossEligible/test.length,cupCoverage:cupEligible/test.length};
  }

  async function run(){
    const box=$('btResult'),statusHolder=document.createElement('div'),selected=CUPS.filter(([c])=>document.getElementById('cup96_'+c)?.checked),season=Number(document.getElementById('cup96season')?.value);
    if(!selected.length){box.innerHTML='<div class="card"><div class="notice warning">Wybierz co najmniej jeden puchar.</div></div>';return}
    if(!Number.isInteger(season)||season<2020||season>2100){box.innerHTML='<div class="card"><div class="notice warning">Podaj poprawny rok sezonu testowego.</div></div>';return}
    box.innerHTML='<div class="card"><h3>Historical European Cup Backtest 0.9.6</h3><div id="cup96status" class="status">Start…</div><div class="notice warning" style="margin-top:10px">Pełny test historyczny pobiera historię unikalnych drużyn. Na darmowym limicie Football-Data może potrwać kilka minut. Nie uruchamiaj go drugi raz w trakcie.</div></div>';
    const status=$('cup96status'),results=[];
    for(const [code,name] of selected){try{results.push(await evaluateCup(code,name,season,status))}catch(e){results.push({name,error:e.message})}}
    const ok=results.filter(x=>!x.error&&x.cross.n),n=ok.reduce((z,x)=>z+x.cross.n,0),B=n?ok.reduce((z,x)=>z+x.cross.b*x.cross.n,0)/n:0,L=n?ok.reduce((z,x)=>z+x.cross.l*x.cross.n,0)/n:0,A=n?ok.reduce((z,x)=>z+x.cross.acc*x.cross.n,0)/n:0;
    const pairedN=ok.reduce((z,x)=>z+x.pairedCross.n,0),pCrossB=pairedN?ok.reduce((z,x)=>z+x.pairedCross.b*x.pairedCross.n,0)/pairedN:0,pCupB=pairedN?ok.reduce((z,x)=>z+x.pairedCup.b*x.pairedCup.n,0)/pairedN:0;
    const rows=results.map(x=>x.error?`<tr><td>${x.name}</td><td colspan="8">${x.error}</td></tr>`:`<tr class="${x.pairedCross.n&&x.pairedCross.b<=x.pairedCup.b?'cup96Good':''}"><td>${x.name}</td><td>${x.cross.n}/${x.test}</td><td>${(x.crossCoverage*100).toFixed(0)}%</td><td>${x.cross.b.toFixed(4)}</td><td>${x.cross.l.toFixed(4)}</td><td>${(x.cross.acc*100).toFixed(1)}%</td><td>${x.pairedCross.n}</td><td>${x.pairedCross.n?(x.pairedCup.b.toFixed(4)+' → '+x.pairedCross.b.toFixed(4)):'—'}</td><td>${x.teams}</td></tr>`).join('');
    box.innerHTML=`<div class="card"><h3>Historical European Cup Backtest 0.9.6 — sezon ${season}</h3><div class="notice ${n>=30?'good':'warning'}"><b>${n} prognoz z historii między rozgrywkami.</b>${n?` Brier ${B.toFixed(4)} • log ${L.toFixed(4)} • 1/X/2 ${(A*100).toFixed(1)}%.`:''}</div>${pairedN?`<div class="notice ${pCrossB<=pCupB?'good':'warning'}" style="margin-top:10px"><b>Porównanie na identycznych ${pairedN} meczach:</b> historia tylko pucharu Brier ${pCupB.toFixed(4)} → historia między rozgrywkami ${pCrossB.toFixed(4)} (${pCrossB-pCupB>=0?'+':''}${(pCrossB-pCupB).toFixed(4)}).</div>`:''}<p class="muted">Sezon testowy nie jest dzielony na kilka bieżących spotkań. Testujemy wszystkie zakończone mecze wybranego historycznego sezonu, a dla każdego spotkania filtrujemy historię do dat wcześniejszych niż jego rozpoczęcie.</p><div class="cup96Scroll"><table class="cup96Table"><thead><tr><th>Rozgrywki</th><th>Cross/test</th><th>Pokrycie</th><th>Brier cross</th><th>Log cross</th><th>1/X/2</th><th>Para N</th><th>Brier cup → cross</th><th>Drużyny</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="card"><div class="notice warning"><b>Interpretacja:</b> najważniejsze są liczba prognoz, pokrycie oraz porównanie „cup → cross” na dokładnie tych samych meczach. Dopiero większa próbka pozwoli zdecydować, czy historię między rozgrywkami włączamy do głównego modelu.</div></div>`;
  }

  function upgrade(){
    const v=document.querySelector('.top h1 .muted');if(v)v.textContent=VERSION;
    const sub=document.querySelector('.top .sub');if(sub)sub.textContent='Historical European Cup Backtest — pełny zakończony sezon i historia między rozgrywkami.';
    const btn=$('runBacktest');if(!btn)return;const host=btn.closest('.card'),d=document.createElement('div'),baseSeason=Math.max(2020,(Number($('season')?.value)||2026)-1);d.className='cup96';d.innerHTML=`<h4>Historical European Cup Backtest 0.9.6</h4><div class="muted">Pełny zakończony sezon zamiast kilku meczów bieżącego sezonu. Porównujemy historię pucharową z historią ze wszystkich dostępnych rozgrywek.</div><div class="cup96Row"><div class="cup96Field"><label>Sezon testowy</label><input id="cup96season" type="number" min="2020" max="2100" value="${baseSeason}"></div><div class="cup96Checks">${CUPS.map(([c,n])=>`<label class="cup96Check"><input id="cup96_${c}" type="checkbox" ${c==='CL'?'checked':''}> ${n}</label>`).join('')}</div></div><button id="cup96run" type="button">Uruchom historyczny backtest 0.9.6</button>`;host.appendChild(d);$('cup96run').onclick=run;
  }
  style();upgrade();
})();