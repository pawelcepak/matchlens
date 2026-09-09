(() => {
  const VERSION='0.9.1';
  const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
  const softmax=(xs)=>{const mx=Math.max(...xs),e=xs.map(x=>Math.exp(x-mx)),z=e.reduce((a,b)=>a+b,0);return e.map(x=>x/z)};

  function installStyle(){
    const s=document.createElement('style');
    s.textContent=`
      .sweepTable{width:100%;border-collapse:collapse;font-size:12px}.sweepTable th,.sweepTable td{padding:9px 7px;border-bottom:1px solid var(--line);text-align:right}.sweepTable th:first-child,.sweepTable td:first-child{text-align:left}
      .sweepBest{background:rgba(114,213,160,.09)}.sweepRef{background:rgba(115,168,255,.06)}
      .metricGood{color:var(--green);font-weight:800}.metricWarn{color:var(--yellow);font-weight:800}
      @media(max-width:800px){.sweepScroll{overflow-x:auto}.sweepTable{min-width:760px}}
    `;
    document.head.appendChild(s);
  }

  function leagueDrawRate(matches){
    const ms=(matches||[]).filter(m=>Number.isFinite(m.hs)&&Number.isFinite(m.as));
    const d=ms.filter(m=>m.hs===m.as).length;
    return (d+3)/(ms.length+12);
  }

  function modelProb({hs,as,hv,av,rh,ra,h2hHome=.5,h2hAway=.5,drawRate=.27,drawStrength=0,decay=.94}){
    const formH=hs.ppg/3,formA=as.ppg/3;
    const venueH=hv.n?hv.ppg/3:formH,venueA=av.n?av.ppg/3:formA;
    const eloDiff=(rh-ra)/400;
    const sh=1.05*formH+.35*hs.g-.28*hs.a+.22*venueH+.70*eloDiff+.07*h2hHome+.18;
    const sa=1.05*formA+.35*as.g-.28*as.a+.20*venueA-.70*eloDiff+.07*h2hAway;
    const close=1-clip(Math.abs(sh-sa)/2.2,0,1);
    const goalTempo=(hs.g+as.g+hs.a+as.a)/4;
    const lowScoring=1-clip((goalTempo-1.15)/1.25,0,1);
    const oldDraw=.56+.44*close-.08*((hs.g+as.g)/2);
    const newDraw=.60+.52*close+.65*(drawRate-.27)+.10*lowScoring-.07*((hs.g+as.g)/2);
    const drawScore=oldDraw+(newDraw-oldDraw)*drawStrength;
    return softmax([sh,drawScore,sa]);
  }

  function eloUpdate(ratings,m){
    const K=22,homeAdv=55,rh=ratings.get(m.homeId)??1500,ra=ratings.get(m.awayId)??1500;
    const eh=1/(1+Math.pow(10,(ra-(rh+homeAdv))/400)),sh=m.hs>m.as?1:m.hs===m.as?.5:0;
    const d=K*Math.log(Math.max(1,Math.abs(m.hs-m.as))+1)*1.25*(sh-eh);
    ratings.set(m.homeId,rh+d);ratings.set(m.awayId,ra-d);
  }

  function stat(){return{n:0,ok:0,brier:0,log:0,conf:[[0,0,0],[0,0,0],[0,0,0]]}}
  function add(s,p,y){
    const pred=p.indexOf(Math.max(...p)),yy=[0,0,0];yy[y]=1;
    s.n++;if(pred===y)s.ok++;
    // Multiclass Brier is averaged over the three outcome classes, matching MatchLens <=0.8.
    s.brier+=((p[0]-yy[0])**2+(p[1]-yy[1])**2+(p[2]-yy[2])**2)/3;
    s.log+=-Math.log(Math.max(1e-6,p[y]));s.conf[y][pred]++;
  }
  function finish(s){return{...s,acc:s.n?s.ok/s.n:0,brier:s.n?s.brier/s.n:NaN,log:s.n?s.log/s.n:NaN}}
  function rates(c){
    return [0,1,2].map(k=>{const tp=c[k][k],support=c[k].reduce((a,b)=>a+b,0),fn=support-tp,fp=c.reduce((sum,row,i)=>sum+(i===k?0:row[k]),0);const recall=tp/Math.max(1,tp+fn),precision=tp/Math.max(1,tp+fp),f1=precision+recall?2*precision*recall/(precision+recall):0;return{precision,recall,f1,support}});
  }
  function baselineProb(past){let h=1,d=1,a=1;past.forEach(m=>{if(m.hs>m.as)h++;else if(m.hs===m.as)d++;else a++});const z=h+d+a;return[h/z,d/z,a/z]}

  function evaluateSweep(){
    const min=+$('btMin').value,N=+$('btN').value;
    const strengths=[0,.25,.5,.75,1];
    const variants=strengths.map(x=>({id:'s'+x,name:`Draw boost ${Math.round(x*100)}%`,strength:x}));
    variants.push({id:'base',name:'Baseline ligi',base:true});
    const out=new Map(variants.map(v=>[v.id,stat()]));
    const ordered=[...A.matches].sort((a,b)=>a.date.localeCompare(b.date)),past=[],ratings=new Map();
    [...A.teams.keys()].forEach(id=>ratings.set(id,1500));
    for(const m of ordered){
      const hm=past.filter(x=>x.homeId===m.homeId||x.awayId===m.homeId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);
      const am=past.filter(x=>x.homeId===m.awayId||x.awayId===m.awayId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);
      if(hm.length>=min&&am.length>=min){
        const y=m.hs>m.as?0:m.hs===m.as?1:2;
        for(const v of variants){
          let p;
          if(v.base)p=baselineProb(past);
          else{
            const decay=.94;
            const hs=weightedStats(hm,m.homeId,decay),as=weightedStats(am,m.awayId,decay);
            const hv=weightedStats(hm.filter(x=>x.homeId===m.homeId),m.homeId,decay),av=weightedStats(am.filter(x=>x.awayId===m.awayId),m.awayId,decay);
            const h2=past.filter(x=>(x.homeId===m.homeId&&x.awayId===m.awayId)||(x.homeId===m.awayId&&x.awayId===m.homeId)).slice(-5);
            let hw=0,aw=0;h2.forEach(x=>{if(x.hs===x.as)return;if((x.homeId===m.homeId&&x.hs>x.as)||(x.awayId===m.homeId&&x.as>x.hs))hw++;else aw++});
            p=modelProb({hs,as,hv,av,rh:ratings.get(m.homeId)||1500,ra:ratings.get(m.awayId)||1500,h2hHome:h2.length?hw/h2.length:.5,h2hAway:h2.length?aw/h2.length:.5,drawRate:leagueDrawRate(past),drawStrength:v.strength});
          }
          add(out.get(v.id),p,y);
        }
      }
      eloUpdate(ratings,m);past.push(m);
    }
    return variants.map(v=>({v,...finish(out.get(v.id))}));
  }

  function renderMatrix(c){const labels=['1','X','2'];let h='<div class="matrix"><div></div>'+labels.map(x=>`<div class="mh">Prognoza ${x}</div>`).join('');for(let y=0;y<3;y++){h+=`<div class="ml">Faktycznie ${labels[y]}</div>`;for(let p=0;p<3;p++)h+=`<div>${c[y][p]}</div>`}return h+'</div>'}

  function runSweep(){
    if(!A?.matches?.length){$('btResult').innerHTML='<div class="card"><div class="notice warning">Najpierw pobierz dane.</div></div>';return}
    const r=evaluateSweep(),base=r.find(x=>x.v.base),candidates=r.filter(x=>!x.v.base);
    const best=[...candidates].sort((a,b)=>a.brier-b.brier||a.log-b.log)[0];
    const reference=candidates.find(x=>x.v.strength===0);
    const rows=r.map(x=>{
      const rr=rates(x.conf),dx=rr[1];
      const db=x.brier-base.brier,dl=x.log-base.log;
      const cls=x.v.id===best.v.id?'sweepBest':x.v.strength===0?'sweepRef':'';
      return `<tr class="${cls}"><td>${esc(x.v.name)}${x.v.id===best.v.id?' ★':''}</td><td>${x.n}</td><td>${(x.acc*100).toFixed(1)}%</td><td>${x.brier.toFixed(3)}</td><td>${x.log.toFixed(3)}</td><td>${x.v.base?'—':(dx.precision*100).toFixed(1)+'%'}</td><td>${x.v.base?'—':(dx.recall*100).toFixed(1)+'%'}</td><td>${x.v.base?'—':(dx.f1*100).toFixed(1)+'%'}</td><td>${db>=0?'+':''}${db.toFixed(3)}</td><td>${dl>=0?'+':''}${dl.toFixed(3)}</td></tr>`;
    }).join('');
    const br=rates(best.conf),refR=rates(reference.conf);
    const deltaB=best.brier-reference.brier,deltaL=best.log-reference.log;
    const safe=deltaB<=.001&&deltaL<=.005;
    $('btResult').innerHTML=`
      <div class="card"><h3>Laboratorium modelu 0.9.1 — sweep remisów</h3>
        <div class="notice ${safe?'good':'warning'}"><b>Najlepszy Brier:</b> ${esc(best.v.name)} — ${best.brier.toFixed(3)}. Model bez dodatkowego draw boost: ${reference.brier.toFixed(3)}. ${safe?'Wybrany poziom nie pogarsza istotnie głównych metryk na tej próbce.':'Lepszy recall X kosztuje zbyt dużo Brier/log loss — nie wdrażamy go automatycznie do głównego modelu.'}</div>
        <div class="sweepScroll" style="margin-top:12px"><table class="sweepTable"><thead><tr><th>Wariant</th><th>Mecze</th><th>1/X/2</th><th>Brier ↓</th><th>Log ↓</th><th>Precision X</th><th>Recall X</th><th>F1 X</th><th>Δ Brier vs base</th><th>Δ log vs base</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>
      <div class="card"><h3>Porównanie remisów</h3><div class="metrics"><div class="metric"><strong>${(refR[1].recall*100).toFixed(1)}%</strong><small>Recall X bez boost</small></div><div class="metric"><strong>${(br[1].recall*100).toFixed(1)}%</strong><small>Recall X — najlepszy Brier</small></div><div class="metric"><strong>${(br[1].precision*100).toFixed(1)}%</strong><small>Precision X — najlepszy Brier</small></div><div class="metric"><strong>${(br[1].f1*100).toFixed(1)}%</strong><small>F1 X — najlepszy Brier</small></div></div></div>
      <div class="card"><h3>Macierz pomyłek — ${esc(best.v.name)}</h3>${renderMatrix(best.conf)}</div>
      <div class="card"><div class="notice warning"><b>Brier w 0.9.1 jest znów w skali zgodnej z 0.8.</b> Wersja 0.9 raportowała sumę błędów trzech klas (~3× większą), choć ranking wariantów pozostawał poprawny. Sweep służy do strojenia; wybór na tej samej próbce może być optymistyczny, więc przed 1.0 potwierdzimy parametr na innych ligach/sezonach.</div></div>`;
  }

  function upgrade(){
    const ver=document.querySelector('.top h1 .muted');if(ver)ver.textContent=VERSION;
    const sub=document.querySelector('.top .sub');if(sub)sub.textContent='Model Lab 0.9.1 — poprawna skala Brier i automatyczny sweep siły kalibracji remisów.';
    const btn=$('runBacktest');if(btn){btn.textContent='Uruchom sweep remisów 0.9.1';btn.onclick=runSweep;}
    const title=btn?.closest('.card')?.querySelector('h3');if(title)title.textContent='Backtest i strojenie remisów 0.9.1';
    const decay=$('decay');if(decay){decay.value='0.94';}
  }

  installStyle();upgrade();
})();