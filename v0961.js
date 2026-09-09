(() => {
  const VERSION='0.9.6.1';
  const CUPS=[['CL','Champions League'],['EL','Europa League'],['UCL','Conference League']];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const $=id=>document.getElementById(id);
  const valid=m=>m.status==='FINISHED'&&Number.isFinite(m.score?.fullTime?.home)&&Number.isFinite(m.score?.fullTime?.away);
  const norm=m=>({id:String(m.id),date:(m.utcDate||'').slice(0,10),homeId:String(m.homeTeam?.id||''),awayId:String(m.awayTeam?.id||''),home:m.homeTeam?.name||'',away:m.awayTeam?.name||'',hs:m.score?.fullTime?.home,as:m.score?.fullTime?.away,season:m.seasonStart,competition:m.competition?.code||''});
  const iso=d=>d.toISOString().slice(0,10);
  const addDays=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return iso(d)};

  async function req(q,retry=0){
    const r=await fetch('/api/football?'+new URLSearchParams(q),{headers:{Accept:'application/json'}});
    let d;try{d=await r.json()}catch{d={error:'Nieprawidłowa odpowiedź backendu.'}}
    if(r.status===429&&retry<6){await sleep(13000);return req(q,retry+1)}
    if(!r.ok)throw Error(d.error||('HTTP '+r.status));
    return d;
  }

  function splitRange(from,to,maxDays=300){
    const out=[];let cur=from;
    while(cur<=to){const endCandidate=addDays(cur,maxDays-1),end=endCandidate<to?endCandidate:to;out.push([cur,end]);cur=addDays(end,1)}
    return out;
  }

  async function teamHistoryChunked(teamId,from,to,status,label){
    const chunks=splitRange(from,to,300),map=new Map();
    for(let i=0;i<chunks.length;i++){
      const [dateFrom,dateTo]=chunks[i];
      status.textContent=`${label}: historia ${teamId}, część ${i+1}/${chunks.length} (${dateFrom}–${dateTo})…`;
      const d=await req({action:'teamHistory',teamId:String(teamId),dateFrom,dateTo,limit:'100'});
      for(const m of (d.matches||[]).filter(valid).map(norm))map.set(m.id,m);
      await sleep(7000);
    }
    return [...map.values()];
  }

  function teamStat(ms,id,N=10){const x=ms.filter(m=>m.homeId===id||m.awayId===id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);if(!x.length)return null;let pts=0,gf=0,ga=0;for(const m of x){const home=m.homeId===id,f=home?m.hs:m.as,a=home?m.as:m.hs;gf+=f;ga+=a;pts+=f>a?3:f===a?1:0}return{n:x.length,ppg:pts/x.length,gf:gf/x.length,ga:ga/x.length}}
  function pred(h,a){const diff=(h.ppg-a.ppg)*.75+(h.gf-a.gf)*.25-(h.ga-a.ga)*.18+.16,e=[Math.exp(diff),Math.exp(.48-Math.abs(diff)*.34),Math.exp(-diff)],z=e.reduce((x,y)=>x+y,0);return e.map(x=>x/z)}
  const stat=()=>({n:0,b:0,l:0,ok:0});
  function add(o,p,y){const yy=[0,0,0];yy[y]=1;o.n++;o.b+=p.reduce((z,v,i)=>z+(v-yy[i])**2,0)/3;o.l+=-Math.log(Math.max(1e-6,p[y]));o.ok+=p.indexOf(Math.max(...p))===y}
  const done=o=>({n:o.n,b:o.b/Math.max(1,o.n),l:o.l/Math.max(1,o.n),acc:o.ok/Math.max(1,o.n)});

  async function evaluate(code,name,season,status){
    const d=await req({action:'matches',competition:code,season:String(season),includePrevious:'1'}),all=(d.matches||[]).filter(valid).map(norm).sort((a,b)=>a.date.localeCompare(b.date));
    const test=all.filter(m=>Number(m.season)===season),teams=[...new Set(test.flatMap(m=>[m.homeId,m.awayId]).filter(Boolean))];
    if(!test.length)throw Error('Brak zakończonych meczów w wybranym sezonie.');
    const first=test[0].date,last=test[test.length-1].date,historyFrom=addDays(first,-300),historyTo=addDays(last,-1),histories=new Map(),historyErrors=[];
    for(let i=0;i<teams.length;i++){
      const id=teams[i];status.textContent=`${name}: drużyna ${i+1}/${teams.length} — pobieranie historii w krótszych zakresach…`;
      try{histories.set(id,await teamHistoryChunked(id,historyFrom,historyTo,status,`${name} ${i+1}/${teams.length}`))}catch(e){histories.set(id,[]);historyErrors.push(`${id}: ${e.message}`)}
    }
    const cross=stat(),cup=stat(),pairedCross=stat(),pairedCup=stat();let crossEligible=0,cupEligible=0;
    for(const m of test){
      const y=m.hs>m.as?0:m.hs===m.as?1:2,beforeCup=all.filter(x=>x.date<m.date),hh=(histories.get(m.homeId)||[]).filter(x=>x.date<m.date),aa=(histories.get(m.awayId)||[]).filter(x=>x.date<m.date),hs=teamStat(hh,m.homeId),as=teamStat(aa,m.awayId),ch=teamStat(beforeCup,m.homeId),ca=teamStat(beforeCup,m.awayId),hasCross=hs&&as&&hs.n>=5&&as.n>=5,hasCup=ch&&ca&&ch.n>=3&&ca.n>=3;
      if(hasCross){crossEligible++;add(cross,pred(hs,as),y)}if(hasCup){cupEligible++;add(cup,pred(ch,ca),y)}if(hasCross&&hasCup){add(pairedCross,pred(hs,as),y);add(pairedCup,pred(ch,ca),y)}
    }
    return{name,test:test.length,teams:teams.length,cross:done(cross),cup:done(cup),pairedCross:done(pairedCross),pairedCup:done(pairedCup),crossCoverage:crossEligible/test.length,cupCoverage:cupEligible/test.length,historyErrors:historyErrors.length,historyFrom,historyTo};
  }

  async function run(){
    const box=$('btResult'),selected=CUPS.filter(([c])=>$('cup96_'+c)?.checked),season=Number($('cup96season')?.value),btn=$('cup96run');
    if(!selected.length){box.innerHTML='<div class="card"><div class="notice warning">Wybierz co najmniej jeden puchar.</div></div>';return}
    if(!Number.isInteger(season)||season<2020||season>2100){box.innerHTML='<div class="card"><div class="notice warning">Podaj poprawny rok sezonu testowego.</div></div>';return}
    if(btn)btn.disabled=true;
    box.innerHTML='<div class="card"><h3>Historical European Cup Backtest 0.9.6.1</h3><div id="cup961status" class="status">Start…</div><div class="notice warning" style="margin-top:10px">Poprawiona wersja pobiera historię w odcinkach maks. 300 dni. To omija problem zbyt szerokiego zakresu dat. Przy darmowym limicie test może potrwać kilka–kilkanaście minut.</div></div>';
    const status=$('cup961status'),results=[];
    for(const [code,name] of selected){try{results.push(await evaluate(code,name,season,status))}catch(e){results.push({name,error:e.message})}}
    const ok=results.filter(x=>!x.error&&x.cross.n),n=ok.reduce((z,x)=>z+x.cross.n,0),B=n?ok.reduce((z,x)=>z+x.cross.b*x.cross.n,0)/n:0,L=n?ok.reduce((z,x)=>z+x.cross.l*x.cross.n,0)/n:0,A=n?ok.reduce((z,x)=>z+x.cross.acc*x.cross.n,0)/n:0,pairedN=ok.reduce((z,x)=>z+x.pairedCross.n,0),pCrossB=pairedN?ok.reduce((z,x)=>z+x.pairedCross.b*x.pairedCross.n,0)/pairedN:0,pCupB=pairedN?ok.reduce((z,x)=>z+x.pairedCup.b*x.pairedCup.n,0)/pairedN:0;
    const rows=results.map(x=>x.error?`<tr><td>${x.name}</td><td colspan="9">${x.error}</td></tr>`:`<tr><td>${x.name}</td><td>${x.cross.n}/${x.test}</td><td>${(x.crossCoverage*100).toFixed(0)}%</td><td>${x.cross.b.toFixed(4)}</td><td>${x.cross.l.toFixed(4)}</td><td>${(x.cross.acc*100).toFixed(1)}%</td><td>${x.pairedCross.n}</td><td>${x.pairedCross.n?(x.pairedCup.b.toFixed(4)+' → '+x.pairedCross.b.toFixed(4)):'—'}</td><td>${x.teams}</td><td>${x.historyErrors}</td></tr>`).join('');
    box.innerHTML=`<div class="card"><h3>Historical European Cup Backtest 0.9.6.1 — sezon ${season}</h3><div class="notice ${n>=30?'good':'warning'}"><b>${n} prognoz z historii między rozgrywkami.</b>${n?` Brier ${B.toFixed(4)} • log ${L.toFixed(4)} • 1/X/2 ${(A*100).toFixed(1)}%.`:''}</div>${pairedN?`<div class="notice ${pCrossB<=pCupB?'good':'warning'}" style="margin-top:10px"><b>Porównanie na identycznych ${pairedN} meczach:</b> historia tylko pucharu Brier ${pCupB.toFixed(4)} → cross ${pCrossB.toFixed(4)} (${pCrossB-pCupB>=0?'+':''}${(pCrossB-pCupB).toFixed(4)}).</div>`:''}<p class="muted">Historia każdej drużyny jest pobierana porcjami do 300 dni i potem odcinana do daty sprzed konkretnego meczu. Kolumna „Błędy historii” pokaże od razu, czy API odrzuciło część drużyn.</p><div class="cup96Scroll"><table class="cup96Table"><thead><tr><th>Rozgrywki</th><th>Cross/test</th><th>Pokrycie</th><th>Brier cross</th><th>Log cross</th><th>1/X/2</th><th>Para N</th><th>Brier cup → cross</th><th>Drużyny</th><th>Błędy historii</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    if(btn)btn.disabled=false;
  }

  function upgrade(){
    const v=document.querySelector('.top h1 .muted');if(v)v.textContent=VERSION;
    const sub=document.querySelector('.top .sub');if(sub)sub.textContent='Historical European Cup Backtest — poprawione pobieranie historii w krótkich zakresach bez look-ahead.';
    const btn=$('cup96run');if(btn){btn.textContent='Uruchom historyczny backtest 0.9.6.1';btn.onclick=run}
    const h=[...document.querySelectorAll('h4')].find(x=>x.textContent.includes('Historical European Cup Backtest 0.9.6'));if(h)h.textContent='Historical European Cup Backtest 0.9.6.1';
  }
  upgrade();
})();