(() => {
  const VERSION='0.9';
  const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
  const sm=(xs)=>{const mx=Math.max(...xs),e=xs.map(x=>Math.exp(x-mx)),z=e.reduce((a,b)=>a+b,0);return e.map(x=>x/z)};

  function leagueDrawRate(matches){
    const ms=(matches||[]).filter(m=>Number.isFinite(m.hs)&&Number.isFinite(m.as));
    const d=ms.filter(m=>m.hs===m.as).length;
    return (d+3)/(ms.length+12);
  }

  function model09({hs,as,hv,av,rh,ra,h2hHome=.5,h2hAway=.5,ha=0,aa=0,drawRate=.27}){
    const formH=hs.ppg/3,formA=as.ppg/3;
    const venueH=hv.n?hv.ppg/3:formH,venueA=av.n?av.ppg/3:formA;
    const eloDiff=(rh-ra)/400;
    const sh=1.05*formH+.35*hs.g-.28*hs.a+.22*venueH+.70*eloDiff+.07*h2hHome-.045*ha+.18;
    const sa=1.05*formA+.35*as.g-.28*as.a+.20*venueA-.70*eloDiff+.07*h2hAway-.045*aa;
    const close=1-clip(Math.abs(sh-sa)/2.2,0,1);
    const goalTempo=(hs.g+as.g+hs.a+as.a)/4;
    const lowScoring=1-clip((goalTempo-1.15)/1.25,0,1);
    const drawScore=.60+.52*close+.65*(drawRate-.27)+.10*lowScoring-.07*((hs.g+as.g)/2);
    return {p:sm([sh,drawScore,sa]),meta:{sh,sa,close,goalTempo,lowScoring,drawRate,drawScore}};
  }

  function installStyle(){
    const s=document.createElement('style');
    s.textContent=`
      .prtable{width:100%;border-collapse:collapse;font-size:12px}.prtable th,.prtable td{padding:9px 7px;border-bottom:1px solid var(--line);text-align:right}.prtable th:first-child,.prtable td:first-child{text-align:left}
      .drawnote{margin-top:10px}.miniPill{display:inline-block;padding:5px 8px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px;margin:3px 4px 0 0}
      @media(max-width:800px){.prscroll{overflow-x:auto}.prtable{min-width:620px}}
    `;
    document.head.appendChild(s);
  }

  function analyze09(){
    const hi=$('home').value,ai=$('away').value;
    if(!A.teams.has(hi)||!A.teams.has(ai))return alert('Najpierw pobierz dane.');
    if(hi===ai)return alert('Wybierz różne drużyny.');
    const hn=A.teams.get(hi),an=A.teams.get(ai),N=+$('n').value,min=+$('minimum').value,decay=+$('decay').value;
    const H=tm(hi).slice(0,N),B=tm(ai).slice(0,N);
    const hs=weightedStats(H,hi,decay),as=weightedStats(B,ai,decay),hv=weightedStats(H.filter(m=>m.homeId===hi),hi,decay),av=weightedStats(B.filter(m=>m.awayId===ai),ai,decay);
    const h2=A.matches.filter(m=>(m.homeId===hi&&m.awayId===ai)||(m.homeId===ai&&m.awayId===hi)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,+$('hn').value);
    const q=Math.round(clamp(15+Math.min(H.length,B.length)/Math.max(1,N)*50+Math.min(hv.n,av.n)/Math.max(1,Math.ceil(N/2))*20+Math.min(h2.length,5)*3,0,100));
    const enough=H.length>=min&&B.length>=min;
    let body=`<div class="card"><div class="match"><h2>${esc(hn)}</h2><div class="vs">VS</div><h2>${esc(an)}</h2></div></div>
      <div class="card"><div class="quality"><div><div class="muted">Jakość danych</div><div class="qnum">${q}/100</div></div><div><div class="qbar"><div class="qfill" style="width:${q}%"></div></div><p class="muted">${esc(hn)}: ${H.length} • ${esc(an)}: ${B.length} • dom/wyjazd: ${hv.n}/${av.n} • H2H: ${h2.length}</p></div></div></div>`;
    if(!enough){
      body+=`<div class="card"><div class="notice danger"><b>PROGNOZA ZABLOKOWANA</b><br>Za mało danych: minimum ${min} zakończonych meczów każdej drużyny.</div></div>`;
    }else{
      const ha=+$('ha').value||0,aa=+$('aa').value||0;let h2hW=0,a2hW=0;
      h2.forEach(m=>{if(m.hs===m.as)return;if((m.homeId===hi&&m.hs>m.as)||(m.awayId===hi&&m.as>m.hs))h2hW++;else a2hW++});
      const rh=A.ratings.get(hi)||1500,ra=A.ratings.get(ai)||1500,eloDiff=(rh-ra)/400;
      const dr=leagueDrawRate(A.matches);
      const m09=model09({hs,as,hv,av,rh,ra,h2hHome:h2.length?h2hW/h2.length:.5,h2hAway:h2.length?a2hW/h2.length:.5,ha,aa,drawRate:dr});
      const [p1,px,p2]=m09.p;
      const eloGoalAdj=clamp(eloDiff*.22,-.35,.35);
      const xh=clamp((hs.g+as.a)/2+.15+eloGoalAdj-.03*ha,.15,4),xa=clamp((as.g+hs.a)/2-.05-eloGoalAdj-.03*aa,.15,4);
      const ov=over25(xh+xa),bt=clamp(1-Math.exp(-xh)-Math.exp(-xa)+Math.exp(-(xh+xa)),0,1);
      body+=`<div class="card"><h3>Ocena 1X2 — model 0.9</h3><div class="probs"><div class="prob"><b>${pct(p1)}</b><small>1 • ${esc(hn)}</small></div><div class="prob"><b>${pct(px)}</b><small>X • remis</small></div><div class="prob"><b>${pct(p2)}</b><small>2 • ${esc(an)}</small></div></div>${bar('Over 2.5',ov)}${bar('BTTS',bt)}<div class="drawnote"><span class="miniPill">bazowy remis ligi ${(dr*100).toFixed(1)}%</span><span class="miniPill">podobieństwo siły ${(m09.meta.close*100).toFixed(0)}%</span><span class="miniPill">waga formy ${decay.toFixed(2)}</span></div></div>`;
      body+=`<div class="card"><h3>Siła i forma</h3><div class="metrics">
        <div class="metric"><strong>${Math.round(rh)}</strong><small>rating ${esc(hn)}</small></div><div class="metric"><strong>${Math.round(ra)}</strong><small>rating ${esc(an)}</small></div>
        <div class="metric"><strong>${hs.w}W ${hs.d}D ${hs.l}L</strong><small>forma ${esc(hn)}</small></div><div class="metric"><strong>${as.w}W ${as.d}D ${as.l}L</strong><small>forma ${esc(an)}</small></div>
        <div class="metric"><strong>${hs.g.toFixed(2)} / ${hs.a.toFixed(2)}</strong><small>ważone gole ${esc(hn)}</small></div><div class="metric"><strong>${as.g.toFixed(2)} / ${as.a.toFixed(2)}</strong><small>ważone gole ${esc(an)}</small></div>
        <div class="metric"><strong>${xh.toFixed(2)} : ${xa.toFixed(2)}</strong><small>prognoza goli</small></div><div class="metric"><strong>${hv.n} / ${av.n}</strong><small>próbka dom/wyjazd</small></div></div></div>`;
      const factors={
        'Forma':1.05*((hs.ppg-as.ppg)/3),
        'Atak i obrona':.35*(hs.g-as.g)-.28*(hs.a-as.a),
        'Dom / wyjazd':.22*(hv.n?hv.ppg/3:hs.ppg/3)-.20*(av.n?av.ppg/3:as.ppg/3),
        'Rating siły':1.40*eloDiff,
        'H2H':.07*((h2.length?h2hW/h2.length:.5)-(h2.length?a2hW/h2.length:.5)),
        'Absencje':-.045*ha+.045*aa,
        'Przewaga gospodarza':.18
      };
      const max=Math.max(...Object.values(factors).map(v=>Math.abs(v)),.001);
      body+=`<div class="card"><h3>Dlaczego model tak uważa?</h3><p class="muted">Dodatnie wartości przesuwają ocenę w stronę gospodarzy, ujemne w stronę gości. Remis 0.9 ma dodatkową kalibrację opartą o podobieństwo siły, tempo bramek i częstość remisów w lidze.</p><div class="explain">${Object.entries(factors).map(([name,v])=>`<div class="factor"><div>${esc(name)}</div><div class="factorbar"><div class="factorfill" style="width:${Math.abs(v)/max*100}%"></div></div><div class="factorval ${v>=0?'pos':'neg'}">${v>=0?'+':''}${v.toFixed(3)}</div></div>`).join('')}</div></div>`;
      const scores=topScores(xh,xa);
      body+=`<div class="card"><h3>Najbardziej prawdopodobne wyniki</h3><div class="scores">${scores.map(s=>`<div class="scorebox"><b>${s.s}</b><small>${pct(s.p)}</small></div>`).join('')}</div></div>`;
      const market=marketProb();
      if(market){
        const d1=p1-market.p1,dx=px-market.px,d2=p2-market.p2,maxD=Math.max(Math.abs(d1),Math.abs(dx),Math.abs(d2));
        body+=`<div class="card"><h3>Model vs rynek</h3><div class="market"><div class="head"></div><div class="head">MODEL</div><div class="head">RYNEK</div><div class="head">RÓŻNICA</div>
          <div>${esc(hn)}</div><div>${pct(p1)}</div><div>${pct(market.p1)}</div><div class="${diffClass(d1)}">${d1>=0?'+':''}${(d1*100).toFixed(1)} pp</div>
          <div>Remis</div><div>${pct(px)}</div><div>${pct(market.px)}</div><div class="${diffClass(dx)}">${dx>=0?'+':''}${(dx*100).toFixed(1)} pp</div>
          <div>${esc(an)}</div><div>${pct(p2)}</div><div>${pct(market.p2)}</div><div class="${diffClass(d2)}">${d2>=0?'+':''}${(d2*100).toFixed(1)} pp</div></div>
          <p class="muted">Marża wynikająca z podanych kursów: ${(market.margin*100).toFixed(1)}%. Prawdopodobieństwa rynku znormalizowano po usunięciu marży.</p>${maxD>=.12?'<div class="notice warning"><b>DUŻA ROZBIEŻNOŚĆ MODEL–RYNEK</b><br>Różnica przekracza 12 punktów procentowych. To sygnał do dodatkowej weryfikacji, nie automatyczna rekomendacja.</div>':''}</div>`;
      }
      A.last={at:new Date().toISOString(),version:'0.9',home:hn,away:an,p1,px,p2,ov,bt,q,rh,ra,xh,xa,market,drawRate:dr,decay};
      body+=`<div class="card"><button class="btn" onclick="savePrediction()">Zapisz prognozę</button></div>`;
    }
    body+=`<div class="grid"><div class="card c6"><h3>${esc(hn)} — ostatnie mecze</h3>${table(H)}</div><div class="card c6"><h3>${esc(an)} — ostatnie mecze</h3>${table(B)}</div><div class="card c12"><h3>H2H</h3>${h2.length?table(h2):'<span class="muted">Brak H2H w pobranym zakresie.</span>'}</div></div>`;
    $('result').innerHTML=body;$('result').classList.remove('hidden');$('result').scrollIntoView({behavior:'smooth'});
  }

  function eloUpdate(ratings,m){
    const K=22,homeAdv=55,rh=ratings.get(m.homeId)??1500,ra=ratings.get(m.awayId)??1500;
    const eh=1/(1+Math.pow(10,(ra-(rh+homeAdv))/400)),sh=m.hs>m.as?1:m.hs===m.as?.5:0;
    const d=K*Math.log(Math.max(1,Math.abs(m.hs-m.as))+1)*1.25*(sh-eh);ratings.set(m.homeId,rh+d);ratings.set(m.awayId,ra-d);
  }
  function stat(){return{n:0,ok:0,brier:0,log:0,conf:[[0,0,0],[0,0,0],[0,0,0]]}}
  function add(s,p,y){const pred=p.indexOf(Math.max(...p)),yy=[0,0,0];yy[y]=1;s.n++;if(pred===y)s.ok++;s.brier+=(p[0]-yy[0])**2+(p[1]-yy[1])**2+(p[2]-yy[2])**2;s.brier/=1;s.log+=-Math.log(Math.max(1e-6,p[y]));s.conf[y][pred]++}
  function rates(c){
    return [0,1,2].map(k=>{const tp=c[k][k],fn=c[k].reduce((a,b)=>a+b,0)-tp,fp=c.reduce((a,row,i)=>a+(i===k?0:row[k]),0);const recall=tp/Math.max(1,tp+fn),precision=tp/Math.max(1,tp+fp),f1=precision+recall?2*precision*recall/(precision+recall):0;return{precision,recall,f1,support:tp+fn}});
  }

  function runLab09(){
    if(!A?.matches?.length){$('btResult').innerHTML='<div class="card"><div class="notice warning">Najpierw pobierz dane.</div></div>';return}
    const min=+$('btMin').value,N=+$('btN').value;
    const variants=[{id:'old',name:'Model 0.8',decay:.88,draw09:false},{id:'d94',name:'0.8 + forma 0.94',decay:.94,draw09:false},{id:'m09',name:'Model 0.9 — draw-aware',decay:.94,draw09:true},{id:'base',name:'Baseline ligi',base:true}];
    const out=new Map(variants.map(v=>[v.id,stat()])),ordered=[...A.matches].sort((a,b)=>a.date.localeCompare(b.date)),past=[],ratings=new Map();[...A.teams.keys()].forEach(id=>ratings.set(id,1500));
    for(const m of ordered){
      const hm=past.filter(x=>x.homeId===m.homeId||x.awayId===m.homeId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N),am=past.filter(x=>x.homeId===m.awayId||x.awayId===m.awayId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);
      if(hm.length>=min&&am.length>=min){
        const y=m.hs>m.as?0:m.hs===m.as?1:2,dr=leagueDrawRate(past);
        for(const v of variants){
          let p;
          if(v.base){let h=1,d=1,a=1;past.forEach(x=>{if(x.hs>x.as)h++;else if(x.hs===x.as)d++;else a++});const z=h+d+a;p=[h/z,d/z,a/z];}
          else{
            const hs=weightedStats(hm,m.homeId,v.decay),as=weightedStats(am,m.awayId,v.decay),hv=weightedStats(hm.filter(x=>x.homeId===m.homeId),m.homeId,v.decay),av=weightedStats(am.filter(x=>x.awayId===m.awayId),m.awayId,v.decay);
            const h2=past.filter(x=>(x.homeId===m.homeId&&x.awayId===m.awayId)||(x.homeId===m.awayId&&x.awayId===m.homeId)).slice(-5);let hw=0,aw=0;h2.forEach(x=>{if(x.hs===x.as)return;if((x.homeId===m.homeId&&x.hs>x.as)||(x.awayId===m.homeId&&x.as>x.hs))hw++;else aw++});
            const hsF=hs.ppg/3,asF=as.ppg/3,vh=hv.n?hv.ppg/3:hsF,va=av.n?av.ppg/3:asF,ed=((ratings.get(m.homeId)||1500)-(ratings.get(m.awayId)||1500))/400;
            const sh=1.05*hsF+.35*hs.g-.28*hs.a+.22*vh+.70*ed+.07*(h2.length?hw/h2.length:.5)+.18,sa=1.05*asF+.35*as.g-.28*as.a+.20*va-.70*ed+.07*(h2.length?aw/h2.length:.5),close=1-clip(Math.abs(sh-sa)/2.2,0,1);
            if(v.draw09)p=model09({hs,as,hv,av,rh:ratings.get(m.homeId)||1500,ra:ratings.get(m.awayId)||1500,h2hHome:h2.length?hw/h2.length:.5,h2hAway:h2.length?aw/h2.length:.5,drawRate:dr}).p;
            else p=sm([sh,.56+.44*close-.08*((hs.g+as.g)/2),sa]);
          }
          add(out.get(v.id),p,y);
        }
      }
      eloUpdate(ratings,m);past.push(m);
    }
    const results=variants.map(v=>{const s=out.get(v.id);return{...v,...s,acc:s.ok/Math.max(1,s.n),brier:s.brier/Math.max(1,s.n),logloss:s.log/Math.max(1,s.n)}}),base=results.find(x=>x.id==='base'),best=[...results].filter(x=>x.id!=='base').sort((a,b)=>a.brier-b.brier)[0],m09=results.find(x=>x.id==='m09');
    const rows=results.map(x=>`<tr class="${x.id===best.id?'bestrow':''}${x.id==='base'?' baseline':''}"><td>${esc(x.name)}${x.id===best.id?' ★':''}</td><td>${x.n}</td><td>${(x.acc*100).toFixed(1)}%</td><td>${x.brier.toFixed(3)}</td><td>${x.logloss.toFixed(3)}</td><td class="${x.brier<base.brier?'deltaGood':'deltaNeutral'}">${(x.brier-base.brier).toFixed(3)}</td></tr>`).join('');
    const rr=rates(m09.conf),labels=['1 — gospodarze','X — remis','2 — goście'];
    const pr=rr.map((x,i)=>`<tr><td>${labels[i]}</td><td>${x.support}</td><td>${(x.precision*100).toFixed(1)}%</td><td>${(x.recall*100).toFixed(1)}%</td><td>${(x.f1*100).toFixed(1)}%</td></tr>`).join('');
    $('btResult').innerHTML=`<div class="card"><h3>Laboratorium modelu 0.9</h3><div class="notice ${m09.brier<results.find(x=>x.id==='old').brier?'good':'warning'}"><b>Cel 0.9:</b> poprawić probabilistyczne traktowanie remisów bez psucia Brier/log loss. Najlepszy wariant tej próbki: <b>${esc(best.name)}</b>.</div><div class="labscroll" style="margin-top:12px"><table class="labtable"><thead><tr><th>Wariant</th><th>Mecze</th><th>1/X/2</th><th>Brier ↓</th><th>Log loss ↓</th><th>Δ Brier vs base</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="card"><h3>Precision / Recall / F1 — model 0.9</h3><p class="muted">Recall X pokazuje, jaki odsetek rzeczywistych remisów model rozpoznaje jako najwyższe prawdopodobieństwo. Precision X mówi, jak często prognozowany remis faktycznie kończy się remisem.</p><div class="prscroll"><table class="prtable"><thead><tr><th>Klasa</th><th>Próbka</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>${pr}</tbody></table></div></div>
      <div class="card"><h3>Macierz pomyłek — model 0.9</h3>${renderMatrix09(m09.conf)}</div>`;
  }
  function renderMatrix09(c){const l=['1','X','2'];let h='<div class="matrix"><div></div>'+l.map(x=>`<div class="mh">Prognoza ${x}</div>`).join('');for(let y=0;y<3;y++){h+=`<div class="ml">Faktycznie ${l[y]}</div>`;for(let p=0;p<3;p++)h+=`<div>${c[y][p]}</div>`;}return h+'</div>'}

  installStyle();
  const ver=document.querySelector('.top h1 .muted');if(ver)ver.textContent=VERSION;
  const sub=document.querySelector('.top .sub');if(sub)sub.textContent='Draw-aware Model — łagodniejsza forma 0.94, Elo i kalibracja remisów + Model Lab 1/X/2.';
  const decay=$('decay');if(decay){decay.value='0.94';}
  const btDecay=$('btDecay');if(btDecay){btDecay.value='.94';}
  const analyze=$('analyze');if(analyze)analyze.onclick=analyze09;
  const lab=$('runBacktest');if(lab){lab.textContent='Uruchom laboratorium 0.9';lab.onclick=runLab09;}
})();