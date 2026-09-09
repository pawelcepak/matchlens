(() => {
  const VERSION='0.8';

  function installStyle(){
    const s=document.createElement('style');
    s.textContent=`
      .labtable{width:100%;border-collapse:collapse;font-size:12px}.labtable th,.labtable td{padding:9px 7px;border-bottom:1px solid var(--line);text-align:right}.labtable th:first-child,.labtable td:first-child{text-align:left}
      .bestrow{background:rgba(114,213,160,.08)}.baseline{background:rgba(155,168,186,.05)}
      .deltaGood{color:var(--green);font-weight:800}.deltaBad{color:var(--red);font-weight:800}.deltaNeutral{color:var(--muted)}
      .matrix{display:grid;grid-template-columns:80px repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:10px}.matrix>div{background:var(--p2);padding:10px;text-align:center}.matrix .mh{color:var(--muted);font-size:11px}.matrix .ml{text-align:left;font-weight:800}
      .seasonGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.seasonBox{background:var(--p2);border:1px solid var(--line);border-radius:12px;padding:12px}.seasonBox strong{font-size:20px}.seasonBox small{display:block;color:var(--muted);margin-top:4px}
      @media(max-width:800px){.labscroll{overflow-x:auto}.labtable{min-width:720px}.seasonGrid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
  const sm=(xs)=>{const e=xs.map(Math.exp),z=e.reduce((a,b)=>a+b,0);return e.map(x=>x/z)};

  function eloUpdate(ratings,m){
    const K=22,homeAdv=55;
    const rh=ratings.get(m.homeId)??1500,ra=ratings.get(m.awayId)??1500;
    const eh=1/(1+Math.pow(10,(ra-(rh+homeAdv))/400));
    const sh=m.hs>m.as?1:m.hs===m.as?.5:0;
    const mult=Math.log(Math.max(1,Math.abs(m.hs-m.as))+1)*1.25;
    const d=K*mult*(sh-eh); ratings.set(m.homeId,rh+d);ratings.set(m.awayId,ra-d);
  }

  function modelProb({hs,as,hv,av,rh,ra,h2hHome=.5,h2hAway=.5,decay=.88,useElo=true,useVenue=true,useH2H=true}){
    const formH=hs.ppg/3,formA=as.ppg/3;
    const venueH=hv.n?hv.ppg/3:formH,venueA=av.n?av.ppg/3:formA;
    const eloDiff=useElo?(rh-ra)/400:0;
    const h2hH=useH2H?h2hHome:.5,h2hA=useH2H?h2hAway:.5;
    const vH=useVenue?venueH:formH,vA=useVenue?venueA:formA;
    const sh=1.05*formH+.35*hs.g-.28*hs.a+.22*vH+.70*eloDiff+.07*h2hH+.18;
    const sa=1.05*formA+.35*as.g-.28*as.a+.20*vA-.70*eloDiff+.07*h2hA;
    const close=1-clip(Math.abs(sh-sa)/2.2,0,1);
    return sm([sh,.56+.44*close-.08*((hs.g+as.g)/2),sa]);
  }

  function statsInit(){return{n:0,ok:0,brier:0,log:0,conf:[[0,0,0],[0,0,0],[0,0,0]],seasons:new Map()}}
  function addMetric(s,p,y,season){
    const pred=p.indexOf(Math.max(...p)),yy=[0,0,0];yy[y]=1;s.n++;if(pred===y)s.ok++;
    s.brier+=(Math.pow(p[0]-yy[0],2)+Math.pow(p[1]-yy[1],2)+Math.pow(p[2]-yy[2],2))/3;
    s.log+=-Math.log(Math.max(1e-6,p[y])); s.conf[y][pred]++;
    const z=s.seasons.get(String(season??'?'))||{n:0,ok:0,brier:0,log:0};z.n++;if(pred===y)z.ok++;z.brier+=(Math.pow(p[0]-yy[0],2)+Math.pow(p[1]-yy[1],2)+Math.pow(p[2]-yy[2],2))/3;z.log+=-Math.log(Math.max(1e-6,p[y]));s.seasons.set(String(season??'?'),z);
  }
  function finish(s){return{...s,acc:s.n?s.ok/s.n:0,brier:s.n?s.brier/s.n:NaN,log:s.n?s.log/s.n:NaN}}

  function baselineProb(past){
    let h=1,d=1,a=1;past.forEach(m=>{if(m.hs>m.as)h++;else if(m.hs===m.as)d++;else a++});const z=h+d+a;return[h/z,d/z,a/z];
  }

  function evaluateAll(){
    if(!A?.matches?.length)return null;
    const min=+$('btMin').value,N=+$('btN').value;
    const variants=[
      {id:'full',name:'Pełny model',decay:.88},
      {id:'noH2H',name:'Bez H2H',decay:.88,useH2H:false},
      {id:'noElo',name:'Bez ratingu Elo',decay:.88,useElo:false},
      {id:'noVenue',name:'Bez home/away',decay:.88,useVenue:false},
      {id:'d82',name:'Forma — mocna (0.82)',decay:.82},
      {id:'d94',name:'Forma — łagodna (0.94)',decay:.94},
      {id:'baseline',name:'Baseline ligi'}
    ];
    const out=new Map(variants.map(v=>[v.id,statsInit()]));
    const ordered=[...A.matches].sort((a,b)=>a.date.localeCompare(b.date));
    const past=[],ratings=new Map();[...A.teams.keys()].forEach(id=>ratings.set(id,1500));
    for(const m of ordered){
      const hm=past.filter(x=>x.homeId===m.homeId||x.awayId===m.homeId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);
      const am=past.filter(x=>x.homeId===m.awayId||x.awayId===m.awayId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);
      if(hm.length>=min&&am.length>=min){
        const y=m.hs>m.as?0:m.hs===m.as?1:2;
        for(const v of variants){
          let p;
          if(v.id==='baseline') p=baselineProb(past);
          else {
            const hs=weightedStats(hm,m.homeId,v.decay),as=weightedStats(am,m.awayId,v.decay);
            const hv=weightedStats(hm.filter(x=>x.homeId===m.homeId),m.homeId,v.decay),av=weightedStats(am.filter(x=>x.awayId===m.awayId),m.awayId,v.decay);
            const h2=past.filter(x=>(x.homeId===m.homeId&&x.awayId===m.awayId)||(x.homeId===m.awayId&&x.awayId===m.homeId)).slice(-5);
            let hw=0,aw=0;h2.forEach(x=>{if(x.hs===x.as)return;if((x.homeId===m.homeId&&x.hs>x.as)||(x.awayId===m.homeId&&x.as>x.hs))hw++;else aw++});
            p=modelProb({hs,as,hv,av,rh:ratings.get(m.homeId)||1500,ra:ratings.get(m.awayId)||1500,h2hHome:h2.length?hw/h2.length:.5,h2hAway:h2.length?aw/h2.length:.5,decay:v.decay,useElo:v.useElo!==false,useVenue:v.useVenue!==false,useH2H:v.useH2H!==false});
          }
          addMetric(out.get(v.id),p,y,m.season);
        }
      }
      eloUpdate(ratings,m);past.push(m);
    }
    return variants.map(v=>({v,...finish(out.get(v.id))}));
  }

  function renderMatrix(c){
    const labels=['1','X','2'];let html='<div class="matrix"><div></div>'+labels.map(x=>`<div class="mh">Prognoza ${x}</div>`).join('');
    for(let y=0;y<3;y++){html+=`<div class="ml">Faktycznie ${labels[y]}</div>`;for(let p=0;p<3;p++)html+=`<div>${c[y][p]}</div>`;}return html+'</div>';
  }

  function runLab(){
    const r=evaluateAll(),box=$('btResult');if(!r){box.innerHTML='<div class="card"><div class="notice warning">Najpierw pobierz dane.</div></div>';return}
    const full=r.find(x=>x.v.id==='full'),base=r.find(x=>x.v.id==='baseline');
    const best=[...r].filter(x=>x.v.id!=='baseline').sort((a,b)=>a.brier-b.brier)[0];
    const rows=r.map(x=>{
      const db=(x.brier-base.brier),dl=(x.log-base.log),bestCls=x.v.id===best.v.id?' bestrow':'',baseCls=x.v.id==='baseline'?' baseline':'';
      const cls=v=>v<-.0005?'deltaGood':v>.0005?'deltaBad':'deltaNeutral';
      return `<tr class="${bestCls}${baseCls}"><td>${esc(x.v.name)}${x.v.id===best.v.id?' ★':''}</td><td>${x.n}</td><td>${(x.acc*100).toFixed(1)}%</td><td>${x.brier.toFixed(3)}</td><td>${x.log.toFixed(3)}</td><td class="${cls(db)}">${db>=0?'+':''}${db.toFixed(3)}</td><td class="${cls(dl)}">${dl>=0?'+':''}${dl.toFixed(3)}</td></tr>`;
    }).join('');
    const seasons=[...full.seasons.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(([season,s])=>`<div class="seasonBox"><strong>${esc(season)}</strong><small>${s.n} meczów • trafność ${(s.ok/s.n*100).toFixed(1)}% • Brier ${(s.brier/s.n).toFixed(3)} • log ${(s.log/s.n).toFixed(3)}</small></div>`).join('');
    const improvement=base.brier-full.brier;
    box.innerHTML=`
      <div class="card"><h3>Laboratorium modelu 0.8</h3><div class="notice ${improvement>0?'good':'warning'}"><b>Pełny model vs baseline:</b> Brier ${full.brier.toFixed(3)} vs ${base.brier.toFixed(3)} (${improvement>0?'lepiej o '+improvement.toFixed(3):'brak przewagi'}). Najlepszy wariant na tej próbce: <b>${esc(best.v.name)}</b>.</div>
      <div class="labscroll" style="margin-top:12px"><table class="labtable"><thead><tr><th>Wariant</th><th>Mecze</th><th>1/X/2</th><th>Brier ↓</th><th>Log loss ↓</th><th>Δ Brier vs base</th><th>Δ log vs base</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="card"><h3>Macierz pomyłek — pełny model</h3><p class="muted">Wiersze to rzeczywisty wynik meczu, kolumny — najwyższe prawdopodobieństwo modelu.</p>${renderMatrix(full.conf)}</div>
      <div class="card"><h3>Stabilność między sezonami — pełny model</h3><div class="seasonGrid">${seasons||'<div class="muted">Brak oznaczeń sezonu.</div>'}</div></div>
      <div class="card"><div class="notice warning"><b>Jak czytać wynik:</b> nie wybieramy wariantu tylko po trafności. Pierwszeństwo mają Brier i log loss, a zmiana powinna być powtarzalna między sezonami. Różnice rzędu kilku tysięcznych traktujemy jako małe, dopóki nie potwierdzą się na większej próbce.</div></div>`;
  }

  function upgradeBacktest(){
    const btn=$('runBacktest');if(!btn)return;
    const host=btn.closest('.card');
    const title=host?.querySelector('h3');if(title)title.textContent='Backtest i laboratorium modelu';
    const p=host?.querySelector('.muted');if(p)p.textContent='Porównuje kilka wariantów na identycznych meczach, zawsze bez podglądania przyszłości.';
    btn.textContent='Uruchom porównanie modeli';btn.onclick=runLab;
  }

  installStyle();
  const ver=document.querySelector('.top h1 .muted');if(ver)ver.textContent=VERSION;
  const sub=document.querySelector('.top .sub');if(sub)sub.textContent='Model Lab — backtest wariantów, baseline, macierz pomyłek i stabilność między sezonami.';
  upgradeBacktest();
})();
