(() => {
  const VERSION = '0.6';

  function installStyle() {
    const s = document.createElement('style');
    s.textContent = `
      .explain{display:grid;gap:8px}.factor{display:grid;grid-template-columns:180px 1fr 90px;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
      .factor:last-child{border-bottom:0}.factorbar{height:8px;background:#263246;border-radius:999px;overflow:hidden}.factorfill{height:100%;background:var(--blue)}
      .factorval{text-align:right;font-weight:800}.btgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.btmetric{background:var(--p2);border:1px solid var(--line);border-radius:13px;padding:14px}
      .btmetric strong{font-size:24px}.btmetric small{display:block;color:var(--muted);margin-top:4px}.calrow{display:grid;grid-template-columns:100px 1fr 70px 70px;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);font-size:12px}
      @media(max-width:800px){.btgrid{grid-template-columns:repeat(2,1fr)}.factor{grid-template-columns:120px 1fr 70px}}
    `;
    document.head.appendChild(s);
  }

  function core({hs,as,hv,av,rh,ra,h2hHome=.5,h2hAway=.5,ha=0,aa=0}) {
    const formH=hs.ppg/3, formA=as.ppg/3;
    const venueH=hv.n?hv.ppg/3:formH, venueA=av.n?av.ppg/3:formA;
    const eloDiff=(rh-ra)/400;
    const factors={
      'Forma':1.05*(formH-formA),
      'Atak i obrona':.35*(hs.g-as.g)-.28*(hs.a-as.a),
      'Dom / wyjazd':.22*venueH-.20*venueA,
      'Rating siły':1.40*eloDiff,
      'H2H':.07*(h2hHome-h2hAway),
      'Absencje':-.045*ha+.045*aa,
      'Przewaga gospodarza':.18
    };
    const sh=1.05*formH+.35*hs.g-.28*hs.a+.22*venueH+.70*eloDiff+.07*h2hHome-.045*ha+.18;
    const sa=1.05*formA+.35*as.g-.28*as.a+.20*venueA-.70*eloDiff+.07*h2hAway-.045*aa;
    const close=1-clamp(Math.abs(sh-sa)/2.2,0,1);
    const probs=soft([sh,.56+.44*close-.08*((hs.g+as.g)/2),sa]);
    return {probs,factors};
  }

  function explainCard(factors,homeName,awayName) {
    const max=Math.max(...Object.values(factors).map(v=>Math.abs(v)),.001);
    const card=document.createElement('div');
    card.className='card';
    card.id='ml06-explain';
    card.innerHTML=`<h3>Dlaczego model tak uważa?</h3>
      <p class="muted">Dodatnia wartość przesuwa ocenę w stronę ${esc(homeName)}, ujemna w stronę ${esc(awayName)}. To wkład do przewagi modelu, nie punkty procentowe.</p>
      <div class="explain">${Object.entries(factors).map(([name,v])=>`
        <div class="factor"><div>${esc(name)}</div><div class="factorbar"><div class="factorfill" style="width:${Math.abs(v)/max*100}%"></div></div>
        <div class="factorval ${v>=0?'pos':'neg'}">${v>=0?'+':''}${v.toFixed(3)}</div></div>`).join('')}</div>`;
    return card;
  }

  function addExplainability() {
    const old = $('analyze').onclick;
    $('analyze').onclick = () => {
      old();
      document.getElementById('ml06-explain')?.remove();
      const hi=$('home').value, ai=$('away').value;
      if(!A.teams.has(hi)||!A.teams.has(ai)||hi===ai) return;
      const N=+$('n').value, decay=+$('decay').value;
      const H=tm(hi).slice(0,N), B=tm(ai).slice(0,N);
      if(!H.length||!B.length) return;
      const hs=weightedStats(H,hi,decay), as=weightedStats(B,ai,decay);
      const hv=weightedStats(H.filter(m=>m.homeId===hi),hi,decay);
      const av=weightedStats(B.filter(m=>m.awayId===ai),ai,decay);
      const h2=A.matches.filter(m=>(m.homeId===hi&&m.awayId===ai)||(m.homeId===ai&&m.awayId===hi)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,+$('hn').value);
      let hw=0,aw=0; h2.forEach(m=>{if(m.hs===m.as)return;if((m.homeId===hi&&m.hs>m.as)||(m.awayId===hi&&m.as>m.hs))hw++;else aw++});
      const c=core({hs,as,hv,av,rh:A.ratings.get(hi)||1500,ra:A.ratings.get(ai)||1500,h2hHome:h2.length?hw/h2.length:.5,h2hAway:h2.length?aw/h2.length:.5,ha:+$('ha').value||0,aa:+$('aa').value||0});
      const result=$('result');
      const cards=[...result.children];
      const target=cards.find(x=>x.textContent.includes('Najbardziej prawdopodobne wyniki'));
      const card=explainCard(c.factors,A.teams.get(hi),A.teams.get(ai));
      target ? result.insertBefore(card,target) : result.appendChild(card);
    };
  }

  function updateElo(ratings,m){
    const K=22,homeAdv=55;
    let rh=ratings.get(m.homeId)??1500,ra=ratings.get(m.awayId)??1500;
    const eh=1/(1+Math.pow(10,(ra-(rh+homeAdv))/400));
    const sh=m.hs>m.as?1:m.hs===m.as?.5:0;
    const margin=Math.max(1,Math.abs(m.hs-m.as)),mult=Math.log(margin+1)*1.25;
    const delta=K*mult*(sh-eh);
    ratings.set(m.homeId,rh+delta);ratings.set(m.awayId,ra-delta);
  }

  function runBacktest(){
    if(!A.matches.length){$('btResult').innerHTML='<div class="card"><div class="notice warning">Najpierw w Analizatorze kliknij „Pobierz dane”.</div></div>';return}
    const min=+$('btMin').value,N=+$('btN').value,decay=+$('btDecay').value;
    const ordered=[...A.matches].sort((a,b)=>a.date.localeCompare(b.date));
    const past=[],ratings=new Map(); [...A.teams.keys()].forEach(id=>ratings.set(id,1500));
    let tested=0,correct=0,brier=0,logloss=0;
    const bins=Array.from({length:5},()=>({n:0,p:0,c:0}));
    for(const m of ordered){
      const hm=past.filter(x=>x.homeId===m.homeId||x.awayId===m.homeId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);
      const am=past.filter(x=>x.homeId===m.awayId||x.awayId===m.awayId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,N);
      if(hm.length>=min&&am.length>=min){
        const hs=weightedStats(hm,m.homeId,decay),as=weightedStats(am,m.awayId,decay);
        const hv=weightedStats(hm.filter(x=>x.homeId===m.homeId),m.homeId,decay),av=weightedStats(am.filter(x=>x.awayId===m.awayId),m.awayId,decay);
        const h2=past.filter(x=>(x.homeId===m.homeId&&x.awayId===m.awayId)||(x.homeId===m.awayId&&x.awayId===m.homeId)).slice(-5);
        let hw=0,aw=0; h2.forEach(x=>{if(x.hs===x.as)return;if((x.homeId===m.homeId&&x.hs>x.as)||(x.awayId===m.homeId&&x.as>x.hs))hw++;else aw++});
        const p=core({hs,as,hv,av,rh:ratings.get(m.homeId)||1500,ra:ratings.get(m.awayId)||1500,h2hHome:h2.length?hw/h2.length:.5,h2hAway:h2.length?aw/h2.length:.5}).probs;
        const y=m.hs>m.as?0:m.hs===m.as?1:2, pred=p.indexOf(Math.max(...p));
        if(pred===y) correct++;
        const yy=[0,0,0]; yy[y]=1;
        brier+=(Math.pow(p[0]-yy[0],2)+Math.pow(p[1]-yy[1],2)+Math.pow(p[2]-yy[2],2))/3;
        logloss+=-Math.log(Math.max(.000001,p[y]));
        const conf=Math.max(...p),bi=Math.min(4,Math.floor(conf*5)); bins[bi].n++; bins[bi].p+=conf; bins[bi].c+=pred===y?1:0;
        tested++;
      }
      updateElo(ratings,m); past.push(m);
    }
    if(!tested){$('btResult').innerHTML='<div class="card"><div class="notice warning">Za mało danych do backtestu.</div></div>';return}
    const cal=bins.map((x,i)=>x.n?`<div class="calrow"><div>${i*20}–${i*20+20}%</div><div>${x.n} prognoz</div><div>śr. ${(x.p/x.n*100).toFixed(1)}%</div><div>traf. ${(x.c/x.n*100).toFixed(1)}%</div></div>`:'').join('');
    $('btResult').innerHTML=`<div class="card"><h3>Wynik backtestu</h3><div class="btgrid">
      <div class="btmetric"><strong>${tested}</strong><small>przetestowanych meczów</small></div>
      <div class="btmetric"><strong>${(correct/tested*100).toFixed(1)}%</strong><small>trafiony najwyższy wynik 1/X/2</small></div>
      <div class="btmetric"><strong>${(brier/tested).toFixed(3)}</strong><small>Brier score — mniej = lepiej</small></div>
      <div class="btmetric"><strong>${(logloss/tested).toFixed(3)}</strong><small>log loss — mniej = lepiej</small></div>
      </div><div class="notice ${tested>=100?'good':'warning'}" style="margin-top:12px"><b>${tested>=100?'Próbka nadaje się już do oceny kierunku modelu.':'Próbka jest jeszcze mała.'}</b><br>Backtest nie używa kursów ani ręcznie wpisywanych absencji i nie podgląda przyszłych wyników.</div></div>
      <div class="card"><h3>Kalibracja pewności</h3><p class="muted">Średnia pewność modelu kontra rzeczywista częstość trafienia.</p>${cal}</div>`;
  }

  function addBacktest(){
    const tabs=document.querySelector('.tabs');
    const histTab=tabs.querySelector('[data-t="h"]');
    const b=document.createElement('button'); b.className='tab'; b.dataset.t='b'; b.textContent='Backtest'; tabs.insertBefore(b,histTab);
    const sec=document.createElement('section'); sec.id='b'; sec.className='hidden';
    sec.innerHTML=`<div class="card"><h3 style="margin-top:0">Backtest modelu</h3>
      <p class="muted">Każdy mecz jest prognozowany tylko z informacji dostępnych przed jego rozpoczęciem.</p>
      <div class="grid"><div class="c4"><label>Minimum wcześniejszych meczów</label><select id="btMin"><option>5</option><option selected>8</option><option>10</option></select></div>
      <div class="c4"><label>Mecze do formy</label><select id="btN"><option>8</option><option selected>10</option><option>15</option></select></div>
      <div class="c4"><label>Waga najnowszych</label><select id="btDecay"><option value=".82">mocna</option><option value=".88" selected>normalna</option><option value=".94">łagodna</option></select></div>
      <div class="c12"><button class="btn primary" id="runBacktest">Uruchom backtest</button></div></div></div><div id="btResult"></div>`;
    document.getElementById('h').before(sec);
    document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
      if(tab.dataset.t!=='b') sec.classList.add('hidden');
    },true));
    b.onclick=()=>{
      document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); b.classList.add('active');
      ['a','h','d'].forEach(x=>$(x).classList.add('hidden')); sec.classList.remove('hidden');
    };
    $('runBacktest').onclick=runBacktest;
  }

  installStyle();
  document.querySelector('.top h1 .muted').textContent=VERSION;
  document.querySelector('.top .sub').textContent='Explainable Model — pokazuje skąd bierze prognozę i pozwala sprawdzić model na historii.';
  addBacktest();
  addExplainability();
})();
