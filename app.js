/* Sofia's build: on iPhone in Safari, first ask to put the owl on the Home Screen (Safari and the Home Screen app keep separate data) */
window.SOVA_KEY='sova-sofia-v1'; // her own storage, apart from the prototype
(function(){
  try{
    const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const app=navigator.standalone||matchMedia('(display-mode: standalone)').matches;
    if(ios&&!app&&!sessionStorage.getItem('sova-browser')){
      document.addEventListener('DOMContentLoaded',()=>{
        const g=document.getElementById('install');if(!g)return;g.hidden=false;
        g.querySelector('[data-skip]').onclick=()=>{sessionStorage.setItem('sova-browser','1');g.hidden=true};
      });
    }
  }catch(e){}
  if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();

(function(){
  // Hunger per hour by time of day: 8–18 loses 2/3 of a full belly, 18–24 the last third, 0–8 slower (an evening meal is half gone by morning)
  const HUNGER_DAY=20/3, HUNGER_EVE=50/9, HUNGER_NIGHT=3.5;
  const KEY=window.SOVA_KEY||'sova-proto-v7', H=3600e3, M=60e3, D=24*H, CLOSE=23, EVE=20, MORNING_END=18;
  const $=id=>document.getElementById(id);
  const uid=()=>Math.random().toString(36).slice(2,9);
  const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ic=(id,cls='')=>`<svg class="${cls}"><use href="#${id}"/></svg>`;
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  function plural(n,a,b,c){n=Math.abs(Math.round(n));const m10=n%10,m100=n%100;if(m10===1&&m100!==11)return a;if(m10>=2&&m10<=4&&(m100<10||m100>=20))return b;return c}
  const cnt=(n,a,b,c)=>n+' '+plural(n,a,b,c);
  const lv=n=>cnt(n,'лист','листа','листьев'); // the currency: leaves (the state field is still called feathers)
  const pad=n=>String(n).padStart(2,'0');
  const dayKey=t=>{const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
  const keyToTime=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).getTime()};
  const fmtTime=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  const hourOf=t=>new Date(t).getHours();
  const at=(t,h,add)=>{const d=new Date(t);d.setDate(d.getDate()+(add||0));d.setHours(h,0,0,0);return d.getTime()};
  const dayDiff=(k,t)=>Math.round((keyToTime(k)-keyToTime(dayKey(t)))/D);
  function dueLabel(k,t){
    const d=dayDiff(k,t);
    if(d<0)return {txt:'срок прошёл '+new Date(keyToTime(k)).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}),cls:'past'};
    if(d===0)return {txt:'срок сегодня',cls:'soon'};
    if(d===1)return {txt:'срок завтра',cls:'soon'};
    return {txt:'до '+new Date(keyToTime(k)).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}),cls:''};
  }
  const LIST_COLORS=['var(--calm)','var(--accent)','var(--ok)','var(--red)','var(--owl)'];

  /* ---------- state ---------- */
  function fresh(){
    const n=Date.now();
    return {v:7,offset:0,lastTick:n,day:dayKey(n),feathers:0,streak:0,streakDay:null,hunger:80,lastFed:n,pantry:{},sick:null,scarf:false,gone:null,goals:[],lists:[],tasks:[],wins:[],missed:[],
      today:{energy:null,minimal:false,plan:null},energy:{},letters:[],onboarded:false,owlName:null,
      week:{due:at(n,19,((7-new Date(n).getDay())%7)||7),postponed:0,score:[]}};
  }
  let S;
  // build hooks: the demo file fills them in the dev build, 97-sofia.js (backup) in Sofia's build
  const DEMO={actions:{}};
  function load(){
    try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&s.v===7){S=s;return}}catch(e){}
    S=fresh();
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
  const now=()=>Date.now()+S.offset;
  const today=()=>dayKey(now());
  const closed=()=>hourOf(now())>=CLOSE;
  const planDay=()=>closed()?dayKey(now()+D):today();
  const listName=id=>id==='goals'?'Цели':id==='inbox'?'Входящие':((S.lists.find(l=>l.id===id)||{}).name||'Без списка');
  const listColor=id=>{const i=S.lists.findIndex(l=>l.id===id),l=S.lists[i];return l&&l.color?l.color:LIST_COLORS[Math.max(0,i)%LIST_COLORS.length]};
  // a list's own colour, chosen in the list's «⋯» menu
  const PALETTE=[['#6E8E9D','Синий'],['#5E8C8A','Бирюзовый'],['#7FA36A','Зелёный'],['#C98A3E','Медовый'],['#C0654A','Терракотовый'],['#D48A9A','Розовый'],['#8C6A8E','Сливовый'],['#9A7B5B','Ореховый']];
  // repeating tasks: every day, or on chosen weekdays (x.days holds getDay() numbers, Sunday is 0)
  const WD=['вс','пн','вт','ср','чт','пт','сб'],WEEK_ORDER=[1,2,3,4,5,6,0];
  const repeatsOn=(x,k)=>!!x.repeat&&(!x.days||!x.days.length||x.days.includes(new Date(keyToTime(k)).getDay()));
  function repeatLabel(x){const d=x.days&&x.days.length?[...x.days].sort((a,b)=>WEEK_ORDER.indexOf(a)-WEEK_ORDER.indexOf(b)):null;
    if(!d||d.length===7)return 'каждый день';const k=d.join();if(k==='1,2,3,4,5')return 'по будням';if(k==='6,0')return 'по выходным';return d.map(i=>WD[i]).join(', ')}
  const letter=kind=>S.letters.find(l=>l.kind===kind&&!l.read);
  const unreadLetters=()=>S.letters.filter(l=>!l.read);

  /* ---------- time passing ---------- */
  let pending=[];
  function hungerLoss(a,b){let loss=0;for(let day=at(a,0);day<b;day=at(day,0,1)){[[0,8,HUNGER_NIGHT],[8,18,HUNGER_DAY],[18,24,HUNGER_EVE]].forEach(([h1,h2,r])=>{const s1=Math.max(a,day+h1*H),e1=Math.min(b,day+h2*H);if(e1>s1)loss+=r*(e1-s1)/H})}return loss}
  function tick(){
    const t=now();if(t<S.lastTick)S.lastTick=t;
    S.hunger=Math.max(0,S.hunger-hungerLoss(S.lastTick,t));S.lastTick=t;
    const tk=dayKey(t);
    if(S.day!==tk){
      const prev=S.day;
      const active=S.streakDay===prev; // the lantern counted yesterday (see streakCheck)
      const gap=Math.max(1,Math.round((keyToTime(tk)-keyToTime(prev))/D));
      if((!active&&!restDay(prev))||gap>1){if(S.streak>=2)S.lanternOut=tk;S.streak=0}
      // Duolingo effect: count days in a row with nothing done (chosen tasks left undone, or no visit at all)
      if(S.onboarded&&restDay(prev)&&gap===1){} // a day off neither adds to the missed days nor wipes them
      else if(S.onboarded&&prev!==S.startDay){
        const bad=!S.tasks.some(x=>x.done&&x.planned===prev);
        S.missStreak=bad?(S.missStreak||0)+gap:gap-1;
      }else S.missStreak=0;
      const skipped=!S.evenings.some(e=>e.day===prev&&!e.soft),tails=[];
      S.tasks.forEach(x=>{
        if(x.repeat){if(x.planned!==tk&&x.planned!==dayKey(t+D)){x.planned=null;x.done=false;x.doneAt=null}return}
        if(!x.done&&x.planned&&x.planned!==tk&&x.planned!==dayKey(t+D)){S.missed.push({id:uid(),title:x.title});if(skipped&&x.planned===prev)tails.push(x.id);x.planned=null}
      });
      S.tails=gap===1&&tails.length?{day:tk,ids:tails}:null;
      S.today={energy:null,minimal:false,plan:null};S.lightsOff=false;
      S.letters=S.letters.filter(l=>l.kind==='week'&&!l.read);
      if(S.rest)Object.keys(S.rest).forEach(k=>{if(keyToTime(k)<t-14*D)delete S.rest[k]});
      S.day=tk;
    }
    // repeating tasks show up in today on their own
    if(!closed())S.tasks.forEach(x=>{if(x.repeat&&!x.planned&&repeatsOn(x,tk))x.planned=tk});
    if(!S.onboarded)return;
    // health: the second evening in a row with nothing done — the owl falls ill
    if(!S.gone&&!tourOn){
      const m=S.missStreak||0;
      if(!S.sick&&!restDay(tk)&&(m>=2||(m>=1&&doneToday()===0&&hourOf(t)>=19))){S.sick={since:t};pending.push('Сова заболела. Дела её не вылечат, нужно лекарство из лавки.')}
      if(S.sick&&t>S.sick.since+(S.scarf?5:3)*D)S.gone='sick';
      else if(t-S.lastFed>3*D)S.gone='hungry';
      if(S.gone)return;
    }
    // the owl's morning letter: 6:00–18:00 only. Later in the day choosing tasks makes no sense — the evening letter (20:00) plans tomorrow;
    // an unread morning letter is retired at 18:00, so the first evening never brings two letters (Ilya, 18.11)
    if(hourOf(t)>=6&&hourOf(t)<MORNING_END&&!S.letters.some(l=>l.kind==='morning'&&l.day===tk)){S.letters.push({id:uid(),kind:'morning',day:tk,read:false});0}
    if(hourOf(t)>=MORNING_END&&S.letters.some(l=>l.kind==='morning'&&!l.read))S.letters=S.letters.filter(l=>!(l.kind==='morning'&&!l.read));
    if(S.week.due<=t&&!S.letters.some(l=>l.kind==='week'&&!l.read)){S.letters.push({id:uid(),kind:'week',day:tk,read:false});0}
    // the owl's evening letter: from 20:00, once a day; on a week-review evening the review takes its place; an unread morning letter is retired
    if(hourOf(t)>=EVE&&!S.letters.some(l=>l.kind==='evening'&&l.day===tk)&&!letter('week')&&S.week.lastDay!==tk){
      S.letters=S.letters.filter(l=>!(l.kind==='morning'&&!l.read));S.letters.push({id:uid(),kind:'evening',day:tk,read:false})}
    // reminders
    S.tasks.forEach(x=>{if(x.reminder&&!x.reminded&&!x.done&&x.reminder<=t){x.reminded=true;pending.push(`Напоминание: «${x.title}»`)}});
  }
  const todayTasks=()=>S.tasks.filter(x=>x.planned===planDay());
  // a declared day off («Сегодня без дел» in the morning talk): the owl is not sad or ill, the lantern waits; hunger still runs (Ilya, 18.11)
  const restDay=k=>!!(S.rest&&S.rest[k]);
  const doneToday=()=>S.tasks.filter(x=>x.done&&x.planned===today()).length;
  /* ---------- the streak (the lantern by the owl) ----------
     A day counts when at least one task is done and every other task of the day has a fate:
     done, moved to tomorrow, back to the calendar or removed. Repeating tasks count as done but never block.
     The morning talk alone no longer counts. Unchecking the last done task takes the day back.
     «Full»: everything that was ever planned for the day is done — nothing moved (removing with × while planning is fine). */
  const dayPending=()=>{const tk=today();return S.tasks.filter(x=>x.planned===tk&&!x.done&&!x.repeat)};
  function streakCheck(){
    const tk=today(),done=doneToday();S.today=S.today||{};
    const seen=S.today.seen=S.today.seen||[];S.tasks.forEach(x=>{if(x.planned===tk&&!x.repeat&&!seen.includes(x.id))seen.push(x.id)});
    if(S.streakDay===tk){if(!done){S.streak=Math.max(0,S.streak-1);S.streakDay=S.streakPrev||null;S.today.full=false}}
    else if(done&&!dayPending().length){S.streakPrev=S.streakDay;S.streak++;S.streakDay=tk;S.today.litAt=now()}
    S.today.full=S.streakDay===tk&&seen.every(id=>{const x=S.tasks.find(y=>y.id===id);return !x||x.done})&&S.tasks.every(x=>!(x.repeat&&x.planned===tk&&!x.done));
  }
  // a task leaves today by planning (the × or the star in its card): it was never really «today», so it does not stop the golden flame
  const unseeToday=x=>{if(S.today&&S.today.seen)S.today.seen=S.today.seen.filter(id=>id!==x.id)};
  const lanternState=()=>S.streakDay===today()?(S.today&&S.today.full?'full':'on'):S.streak?'wait':'off';

  /* ---------- mood ---------- */
  function status(){
    const t=now(),h=hourOf(t),items=todayTasks(),cl=closed(),done=doneToday();
    const first=S.startDay===today();
    const morningLate=!!letter('morning')&&h>=12&&!cl&&!first;
    const weekLate=!!letter('week')&&S.week.due<t-6*H&&done===0;
    const allDone=items.length>0&&items.every(x=>x.done)&&!cl;
    // Duolingo effect inside the day: chosen tasks with nothing done — waits, then grieves, then sulks
    const noneDone=!cl&&items.length>0&&done===0;
    const waitLvl=noneDone?(h>=19?2:h>=14?1:0):0;
    const emptyLvl=!cl&&!first&&S.onboarded&&items.length===0?(h>=19?2:h>=13?1:0):0;
    // after 23:00: chosen for today and nothing done
    const todays=S.tasks.filter(x=>x.planned===today());
    const failed=cl&&!first&&S.onboarded&&todays.length>0&&done===0;
    const miss=done>0||restDay(today())?0:(S.missStreak||0);
    const base=Math.max(waitLvl,emptyLvl,failed?2:0,Math.min(miss,2));
    const level=base||(morningLate?1:0);
    const partial=!cl&&items.length>0&&done>0&&!allDone&&h>=20;
    const hz=S.hunger<100/3?'red':S.hunger<200/3?'yellow':'green';
    let mood='ok';
    if(S.sick)mood='sick';else if(hz==='red')mood='angry';else if(level>=2)mood='sulky';else if(level===1)mood='sad';else if(hz==='yellow')mood='hungry';else if(cl)mood='sleep';else if(allDone||done>0)mood='happy';
    return {t,h,hz,items,morningLate,weekLate,waitLvl,emptyLvl,failed,miss,partial,allDone,mood,idle:waitLvl>0};
  }
  const MOOD={ok:'спокойна',happy:'счастлива',sad:'грустит',hungry:'хочет есть',angry:'злится',sulky:'нахохлилась',sick:'болеет',sleep:'спит'};
  /* v32: mood and hunger tags — the same shape: icon, word, five pips */
  const MOOD_LV={happy:5,ok:4,sleep:4,hungry:3,sad:2,sulky:2,angry:1,sick:1};
  const FACE={ // little owl faces for the mood tag, drawn with the tag's colour
    happy:'<path d="M6 11q2-3 4 0M14 11q2-3 4 0"/><path d="M9 15q3 3 6 0"/>',
    ok:'<circle cx="8" cy="10.500" r="1.400" fill="currentColor" stroke="none"/><circle cx="16" cy="10.500" r="1.400" fill="currentColor" stroke="none"/><path d="M10 15.500q2 1.200 4 0"/>',
    sleep:'<path d="M6 11q2 2 4 0M14 11q2 2 4 0"/><path d="M11 16h2"/>',
    hungry:'<circle cx="8" cy="10.500" r="1.400" fill="currentColor" stroke="none"/><circle cx="16" cy="10.500" r="1.400" fill="currentColor" stroke="none"/><ellipse cx="12" cy="16" rx="1.800" ry="1.400"/>',
    sad:'<path d="M6 11l3-1.500M18 11l-3-1.500"/><path d="M9.500 16.500q2.500-2 5 0"/>',
    sulky:'<path d="M6 10h4M14 10h4"/><path d="M10 16h4"/>',
    angry:'<path d="M6 8.500l4 2M18 8.500l-4 2"/><path d="M9.500 16.500q2.500-2.200 5 0"/>',
    sick:'<path d="M6.500 9l3 3M9.500 9l-3 3M14.500 9l3 3M17.500 9l-3 3"/><path d="M9.500 16q1.200-1 2.500 0t2.500 0"/>'};
  const pipsHtml=(n,icon)=>Array.from({length:5},(_,i)=>`<svg class="${i<n?'on':''}"><use href="#${icon}"/></svg>`).join('');
  function renderTags(mood){
    const ml=MOOD_LV[mood]||4,hl=Math.max(0,Math.min(5,Math.ceil(S.hunger/20)));
    const name=MOOD[mood]||'';$('moodName').textContent=name.charAt(0).toUpperCase()+name.slice(1);
    $('moodTag').dataset.lv=ml;$('moodIco').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FACE[mood]||FACE.ok}</svg>`;
    $('moodPips').innerHTML=pipsHtml(ml,'i-heart');$('moodTag').setAttribute('aria-label',`Настроение: ${name}, ${ml} из 5`);
    $('hungerTxt').textContent=hungerWord();$('hungerTag').dataset.lv=hl;
    $('hungerPips').innerHTML=pipsHtml(hl,'i-fishpip');$('hungerTag').setAttribute('aria-label',`Сытость: ${hungerWord().toLowerCase()}, ${hl} из 5`);
  }
  const PREVIEW={}; // texts for the demo mood preview
  function phrase(st){
    const next=st.items.find(x=>!x.done);
    if(st.mood==='sick')return pick(['Апчхи… Я заболела. Мне нужно лекарство из лавки.','Мне плохо… Лекарство продаётся в лавке.']);
    if(st.mood==='angry')return pick(['Я голодная и злая! Покорми меня, пожалуйста.','Ух! Я так проголодалась, что уже злюсь.']);
    if(st.mood==='sulky'){
      if(st.failed)return 'Из выбранного ничего не сделано. Я нахохлилась…';
      if(st.miss>=2&&!st.waitLvl&&!st.emptyLvl)return pick([`Уже ${cnt(st.miss,'день','дня','дней')} без дел. Я нахохлилась.`,`${cnt(st.miss,'день','дня','дней')} подряд без дел… Одно дело, и я оттаю.`]);
      if(st.waitLvl&&next)return `Вечер, а «${short(next.title,22)}» всё ждёт. Я нахохлилась.`;
      if(st.emptyLvl)return 'Вечер, а дел на сегодня нет. Я нахохлилась.';
      return 'Я нахохлилась. Сделай хоть одно дело, и я оттаю.';
    }
    if(closed()){
      if(st.mood==='hungry')return 'Хочу кушать, не могу уснуть… Покормишь?';
      if(st.mood==='sad')return 'Сегодня мы ничего не сделали. Я грущу.';
      return doneToday()?pick(['Я сплю. Ты сегодня молодец, отдыхай.','Сплю и вижу сны про мышек. Ты сегодня молодец.']):'Я сплю. Если хочешь, выбери в календаре дела на завтра.';
    }
    if(st.allDone)return pick(['Всё сделано! Я самая счастливая сова в лесу.','Ух-ху! План на день выполнен. Отдыхай.']);
    if(st.mood==='hungry')return pick(['Хочу кушать… Покормишь?','Животик урчит. Покормишь меня?']);
    if(S.lanternOut===today()&&!doneToday()&&!st.waitLvl)return pick(['Ночью мой фонарик погас. Зажжём его снова?','У меня погас фонарик, и стало темновато. Поможешь?']);
    if(st.miss===1&&!st.waitLvl)return 'Вчера мы ничего не сделали. Давай сегодня одно?';
    if(st.waitLvl===1&&next)return pick([`Я жду, когда мы начнём. Может, «${short(next.title,24)}»?`,`Мы ещё не начали. Может, «${short(next.title,26)}»?`]);
    if(st.morningLate)return 'Я ждала тебя утром… Письмо всё ещё ждёт.';
    if(st.weekLate)return 'Пора обсудить неделю. На почте письмо.';
    if(letter('evening'))return pick(['Добрый вечер! На почте письмо: подведём день.','Я написала тебе вечернее письмо. Заглянешь?']);
    if(letter('morning'))return pick(['Доброе утро! На почте письмо от меня.','Привет! Я оставила тебе письмо на почте.']);
    if(letter('week'))return 'На почте письмо: пора оглянуться на неделю.';
    const gstep=nextGoalStep();
    const wg=!closed()&&sillGoals().find(g=>wiltOf(g)&&!todayTasks().some(x=>x.goal===g.id&&!x.done));
    if(wg)return wiltOf(wg)===2?`Росток «${short(wg.title,18)}» чахнет. Возьмёмся за его дело?`:`Росток «${short(wg.title,18)}» подвял. Сделаем дело для него?`;
    if(!st.items.length)return gstep?`День пока пустой. Возьмём «${short(gstep[1].title,22)}» для цели?`:S.tasks.some(x=>!x.done&&!x.repeat)?'День пока пустой. Выберем дела в календаре?':'Запишем первое дело? Нажми «+» внизу.';
    if(st.partial&&next)return `Осталось «${next.title}». Успеем до 23:00?`;
    if(doneToday())return next?`Ух-ху! Дальше «${next.title}».`:'Горжусь тобой!';
    return next?`Начнём с «${next.title}»? Я рядом.`:'Я рядом.';
  }

  /* ---------- effects ---------- */
  function gain(n){
    S.feathers=Math.max(0,S.feathers+n);
    if(n>0&&view==='home'){const g=document.createElement('div');g.className='gain';g.textContent='+'+n;$('scene').appendChild(g);setTimeout(()=>g.remove(),1500)}
    if(n>0){const c=$('walletChip');c.classList.remove('pulse');void c.offsetWidth;c.classList.add('pulse')}
  }
  function cheer(){
    if(view!=='home')return;
    const sc=$('scene');sc.classList.remove('cheer');void sc.offsetWidth;sc.classList.add('cheer');setTimeout(()=>sc.classList.remove('cheer'),950);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const r=sc.getBoundingClientRect();
    for(let i=0;i<7;i++){const f=document.createElement('div');f.className='feather';f.innerHTML='<svg width="18" height="18"><use href="#i-leaf"/></svg>';
      f.style.left=(r.width/2-7+(Math.random()*80-40))+'px';f.style.top=(r.height*.28)+'px';f.style.setProperty('--dx',(Math.random()*160-80)+'px');f.style.setProperty('--rot',(Math.random()*360-180)+'deg');f.style.animationDelay=(i*40)+'ms';sc.appendChild(f);setTimeout(()=>f.remove(),1600)}
  }
  let peekTimer;
  function closeCareSafe(){const c=$('care');if(c){c.hidden=true;careFeedOpen=false}}
  function roomVisible(){const r=$('scene').getBoundingClientRect();return view==='home'&&!pane&&r.bottom>140&&r.top<innerHeight-120}
  function peekSay(text,gainTxt,acts){
    if(tourOn)return;
    $('peekTxt').textContent=text;$('peekGain').textContent=gainTxt||'';
    const p=$('peek'),a=$('peekActs');a.innerHTML='';
    (acts||[]).forEach(([label,fn,main])=>{const b=document.createElement('button');b.type='button';b.className=main?'pk-main':'';b.textContent=label;b.onclick=e=>{e.stopPropagation();p.classList.remove('on');fn&&fn()};a.appendChild(b)});
    p.classList.toggle('act',!!(acts&&acts.length));
    p.classList.remove('on');void p.offsetWidth;p.classList.add('on');
    clearTimeout(peekTimer);peekTimer=setTimeout(()=>p.classList.remove('on'),acts&&acts.length?9000:Math.min(7000,2200+text.length*45));
  }
  // nothing in stock: the owl peeks out and offers to go to Mars's shop
  function offerShop(text){closeCareSafe();peekSay(text,'',[['В лавку',()=>go('shop'),true],['Не сейчас']])}
  function owlReact(allDone){
    const rv=roomVisible();
    if(allDone){
      sayOverride=null;
      if(!rv){window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});setTimeout(cheer,650)}else cheer();
      return;
    }
    if(rv){cheer();return}
    peekSay(pick(['Ух-ху! Молодец!','Одно есть! Так держать.','Отлично! Я тобой горжусь.','Есть! Ещё на шаг ближе.']),'+4 листа');
  }
  let pushTimer;
  function push(text){
    document.querySelectorAll('.push').forEach(p=>p.remove());
    const p=document.createElement('div');p.className='push';p.setAttribute('role','status');
    p.innerHTML=`<svg aria-hidden="true"><use href="#i-owl"/></svg><div><b>Сова · уведомление</b><p>${esc(text)}</p></div>`;
    p.onclick=()=>{p.remove();if(/письм/.test(text))go('mail')};
    document.body.appendChild(p);clearTimeout(pushTimer);pushTimer=setTimeout(()=>p.remove(),5000);
  }

  // tapping the lantern: first where the day stands, then the owl's advice about planning, one tip per tap
  const LANTERN_TIPS=['Главное дело может быть одно. Этого хватит.','Не бери больше трёх дел. Лучше меньше, но сделать.',
    'Не успела — перенеси на завтра. Это тоже честно.','Большое дело разбей на шаги. Первый — совсем маленький.',
    'Сил мало? Возьми одно дело — моему фонарику хватит.','Трудное дело — с утра, пока силы свежие.',
    'Утром выбери дела, вечером подведи день.','Сделаешь всё, что выбрала, — огонёк станет золотым.'];
  let lanternN=0,lanternTip=0,lanternWas='';
  function lanternTalk(){
    const st=lanternState(),n=S.streak,days=cnt(n,'день','дня','дней'),left=dayPending().length,done=doneToday();
    if(st!==lanternWas){lanternWas=st;lanternN=0}
    if(lanternN++)return LANTERN_TIPS[lanternTip++%LANTERN_TIPS.length];
    if(st==='full')return `Всё сделано! Мой фонарик горит золотом уже ${days}. Спасибо!`;
    if(st==='on')return `Мой фонарик горит ${days} подряд. Сегодня он не погаснет — спасибо тебе!`;
    if(!done&&restDay(today()))return 'Сегодня мы отдыхаем. Фонарик подождёт до завтра.';
    if(done&&left)return `Почти зажгли! Ещё ${cnt(left,'дело','дела','дел')}: сделай или перенеси на завтра.`;
    if(st==='wait')return `Мой фонарик горит ${days} подряд. Поможешь ему сегодня? Без него мне темно.`;
    return 'Мой фонарик погас, и мне немножко темно. Поможешь зажечь? Нужно одно дело, а остальные — перенести.';
  }
  // sheets and the talk window slide in and out smoothly; with «reduce motion» they simply appear
  const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function sheetShow(el){
    if(!el.hidden&&!el.classList.contains('closing'))return;
    clearTimeout(el._t);el.classList.remove('closing');el.hidden=false;if(calm())return;
    el.classList.remove('opening');void el.offsetWidth;el.classList.add('opening');el._t=setTimeout(()=>el.classList.remove('opening'),480);
  }
  function sheetHide(el){
    if(el.hidden)return;clearTimeout(el._t);el.classList.remove('opening');
    if(calm()){el.hidden=true;return}
    el.classList.add('closing');el._t=setTimeout(()=>{el.hidden=true;el.classList.remove('closing')},260);
  }

  /* ---------- render ---------- */
  let view='home',openList=null,showDone=false,sayOverride=null,lastKey='',preview=null;
  const hungerWord=()=>S.hunger>=200/3?'Сытая':S.hunger>=100/3?'Хочет есть':'Голодная';
  function go(v,arg){if(v==='shop'){closeCareSafe();const ms=marsSay,was=view;if(view!=='home'){view='home';render()}marsSay=ms;window.scrollTo(0,0);return showPane(2,was==='home')}
    if(v===view&&v!=='home'&&!arg)v='home';closeCareSafe();$('peek').classList.remove('on');const wasHome=view==='home';view=v;if(arg)openList=arg;listMenu=false;confirmDel=null;showListDone=false;window.scrollTo(0,0);render();if(v==='home'&&!wasHome)showPane(0)}
  function taskRow(x,t,opts){
    const o=opts||{};const dl=x.due?dueLabel(x.due,t):null;if(dl&&o.soft&&dl.cls==='past')dl.cls='muted-past';
    const g=x.goal&&S.goals?S.goals.find(y=>y.id===x.goal):null;
    const steps=x.steps.length?`<span>${ic('i-steps','mi')}${x.steps.filter(s=>s.done).length}/${x.steps.length}</span>`:'';
    const meta=[o.showList&&x.list!=='inbox'?`<span><i class="ldot" style="width:8px;height:8px;background:${listColor(x.list)}"></i>${esc(listName(x.list))}</span>`:'',dl&&!x.done?`<span class="${dl.cls}">${ic('i-flag','mi')}${dl.txt}</span>`:'',steps,x.reminder&&!x.done?`<span>${ic('i-bell','mi')}${fmtTime(x.reminder)}</span>`:'',x.repeat?`<span>${ic('i-repeat','mi')}${repeatLabel(x)}</span>`:'',g?`<span>${ic('i-sprout','mi')}${esc(g.title)}</span>`:''].join('');
    const right=o.plus?`<button class="plus ${x.planned===planDay()?'on':''}" type="button" data-act="togglePlan" data-id="${x.id}" aria-label="${x.planned===planDay()?'Убрать из':'Добавить в'} ${closed()?'завтра':'сегодня'}: ${esc(x.title)}">${x.planned===planDay()?'✓':'+'}</button>`
      :(o.unplan&&!x.done&&!x.repeat?`<button class="del" type="button" data-act="unplan" data-id="${x.id}" aria-label="Убрать из ${closed()?'завтра':'сегодня'}">${ic('i-x')}</button>`:'<span></span>');
    const inner=`
      <button class="check" type="button" data-act="done" data-id="${x.id}" ${o.lock?'disabled':''} aria-label="${x.done?'Вернуть':'Отметить'}: ${esc(x.title)}">${ic('i-check')}</button>
      <button class="rbody" type="button" data-act="edit" data-id="${x.id}"><div class="rtitle">${esc(x.title)}</div>${meta?`<div class="rmeta">${meta}</div>`:''}</button>
      ${right}`;
    if(o.swipe)return `<li class="swipe" data-id="${x.id}"><div class="swipe-bg" aria-hidden="true"><span class="l">✓ Сделано</span><span class="r">На завтра →</span></div><div class="row">${inner}</div></li>`;
    return `<li class="row ${x.done?'done':''}">${inner}</li>`;
  }
  function render(){
    tick();
    streakCheck();
    const st=status(),t=st.t,isClosed=closed(),said=sayOverride;
    ['home','calendar','mail','lists','list'].forEach(v=>$('v-'+v).hidden=view!==v);
    $('feathers').textContent=Math.round(S.feathers);
    {const gt=$('goalsThing');if(gt){view==='home'&&pane===1?gt.setAttribute('aria-current','page'):gt.removeAttribute('aria-current')}}
    document.querySelectorAll('.dk[data-view]').forEach(d=>{if(d.dataset.view===view||(view==='list'&&d.dataset.view==='lists'))d.setAttribute('aria-current','page');else d.removeAttribute('aria-current')});
    if(view==='home')renderHome(st,t,isClosed);
    if(view==='calendar')renderCalendar(t,isClosed);
    if(view==='mail')renderMail(t);
    if(view==='lists')renderLists();
    if(view==='list')renderList(t);
    renderGone();
    if(DEMO.after)DEMO.after(); // build hook: the backup reminder in Sofia's build
    save();
    // the owl speaks where Sofia is looking: in the room, or peeking from the side
    if(said&&!roomVisible()&&!(view==='home'&&pane!==0)){peekSay(said);if(view!=='home')sayOverride=null}
    if(pending.length){const p=pending.pop();pending=[];if(!tourOn&&S.toured)push(p)}
  }
  function renderHome(st,t,isClosed){
    $('date').textContent=new Date(t).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
    if(DEMO.render)DEMO.render(t);
    renderWindow();
    const sc=$('scene');const mood=tourOn?(tourI===0?'happy':'ok'):(preview||st.mood);sc.dataset.mood=mood;sc.dataset.night=(st.h>=21||st.h<6)?'1':'0';sc.dataset.all=st.allDone&&!tourOn?'1':'0';
    if(!$('care').hidden)renderTags(mood);
    sc.dataset.scarf=S.scarf?'1':'0';sc.dataset.lights=S.lightsOff?'0':'1';sc.dataset.bed=S.decor&&S.decor.bed?'1':'0';sc.dataset.yarn=S.decor&&S.decor.yarn?'1':'0';sc.dataset.shelf=S.decor&&S.decor.shelf?'1':'0';sc.dataset.shelf2=S.decor&&S.decor.shelf2?'1':'0';renderShelf();
    // the lantern by the owl is the streak: lit today, waiting for today's first task, or out
    const ls=lanternState();if(sc.dataset.streak&&sc.dataset.streak!=='on'&&sc.dataset.streak!=='full'&&(ls==='on'||ls==='full')){sc.classList.add('lantern-lit');setTimeout(()=>sc.classList.remove('lantern-lit'),1300)}
    sc.dataset.streak=ls;$('streak').textContent=S.streak||'';
    $('lantern').setAttribute('aria-label',(S.streak?`Фонарик серии: ${cnt(S.streak,'день','дня','дней')} подряд`:'Фонарик серии не горит')+(ls==='full'?', сегодня всё сделано':'')+'. Нажми — сова подскажет');

    $('owlName').textContent=S.owlName||'Сова';
    const hh=$('hudHunger');hh.hidden=!(S.sick||st.hz!=='green');hh.classList.toggle('mid',!S.sick&&st.hz==='yellow');$('hudHungerTxt').textContent=S.sick?'Болеет':st.hz==='red'?'Голодная':'Хочет есть';
    if(!$('care').hidden)renderCare();
    const key=[mood,st.items.length,doneToday(),unreadLetters().length,isClosed,st.morningLate,st.allDone].join('|');
    $('bubble').hidden=tourOn&&tourI===0;
    if(tourOn){$('say').textContent='Нажми на мои слова — и мы поговорим.';lastKey=''}
    else if(pane===2){if(key!==lastKey)$('say').textContent=(preview&&PREVIEW[preview])||phrase(st)}
    else if(sayOverride||key!==lastKey)$('say').textContent=sayOverride||(preview&&PREVIEW[preview])||phrase(st);
    lastKey=key;if(pane!==2||tourOn)sayOverride=null; // in the shop Mars does the talking; the owl's words wait for her room
    paneUI();
    // calendar art
    const d=new Date(t);$('calMonth').textContent=d.toLocaleDateString('ru-RU',{month:'short'}).replace('.','').toUpperCase();$('calDay').textContent=d.getDate();
    const ml=$('mailThing');ml.dataset.letter=unreadLetters().length?'1':'0';
    const inboxN=S.tasks.filter(x=>x.list==='inbox'&&!x.done&&!x.planned).length;
    {const late=S.tasks.filter(x=>!x.done&&x.due&&dayDiff(x.due,t)<0).length,cb=$('calBadge');cb.hidden=!late;cb.textContent=late;
     $('calThing').setAttribute('aria-label','Календарь: все дела по срокам'+(late?`, просрочено ${cnt(late,'дело','дела','дел')}`:''));
     const wl=sillGoals().filter(g=>wiltOf(g)).length,gb=$('goalsBadge');gb.hidden=!wl;gb.textContent=wl;
     $('goalsThing').setAttribute('aria-label','Цели'+(wl?`: подвяло ${cnt(wl,'растение','растения','растений')}`:''))}
    const badge=$('mailBadge');badge.hidden=!unreadLetters().length;badge.textContent=unreadLetters().length;
    ml.setAttribute('aria-label',`Почта${unreadLetters().length?': есть письмо от совы':''}, во «Входящих» ${cnt(inboxN,'запись','записи','записей')}`);
    // today
    $('todayH').textContent=isClosed?'Завтра':'Сегодня';
    const items=st.items;
    $('todayCount').textContent=items.length&&!st.allDone?`${items.filter(x=>x.done).length} из ${items.length}`:'';
    let h='';
    if(isClosed){
      h=items.length?`<ul class="list">${items.map(x=>taskRow(x,t,{lock:true,unplan:true})).join('')}</ul><p class="note" style="margin-top:8px">День закрыт. Это дела, которые ты выбрала на завтра.</p>`
        :`<div class="empty">День закрыт. Хочешь заранее выбрать дела на завтра?<button class="secondary" type="button" data-act="go" data-view="calendar">Открыть календарь</button></div>`;
    }else if(st.allDone){
      h=`<div class="celebrate"><b>Всё на сегодня сделано!</b><span class="muted" style="font-weight:700">${cnt(items.length,'дело','дела','дел')} из ${items.length}. Можно отдыхать.</span>
        <button class="link" type="button" data-act="toggleDone">${showDone?'Скрыть сделанное':'Показать сделанное'}</button></div>
        ${showDone?`<ul class="list done-list">${items.map(x=>taskRow(x,t,{})).join('')}</ul>`:''}`;
    }else if(items.length){
      h=`<ul class="list">${items.sort((a,b)=>a.done-b.done).map(x=>taskRow(x,t,{showList:true,soft:true,swipe:!x.done})).join('')}</ul>`;
      if(!S.swiped)h+=`<p class="swipe-hint">Смахни дело вправо — сделано, влево — на завтра.</p>`;
    }else{
      h=letter('morning')?`<div class="empty">День пока пустой. Сова оставила письмо, давай вместе выберем дела.<button class="primary" type="button" data-act="openLetter" data-kind="morning">Открыть письмо</button></div>`
        :`<div class="empty">День пока пустой. Выбери в календаре, что сделать сегодня.<button class="secondary" type="button" data-act="go" data-view="calendar">Открыть календарь</button></div>`;
    }
    $('todayBody').innerHTML=h;
  }
  function renderCalendar(t,isClosed){
    $('calNote').textContent=isClosed?'День закрыт. Плюсиком выбирай дела на завтра.':'Все дела по срокам. Плюсиком бери то, что хочешь сделать сегодня.';
    const open=S.tasks.filter(x=>!x.done&&x.list!=='inbox'&&!x.repeat);
    const g={past:[],today:[],tomorrow:[],week:[],later:[],none:[]};
    open.forEach(x=>{if(!x.due)return g.none.push(x);const d=dayDiff(x.due,t);if(d<0)g.past.push(x);else if(d===0)g.today.push(x);else if(d===1)g.tomorrow.push(x);else if(d<=7)g.week.push(x);else g.later.push(x)});
    const by=(a,b)=>(a.due||'9').localeCompare(b.due||'9');
    const sec=(title,arr)=>arr.length?`<div class="group"><h3>${title}</h3><ul class="list">${arr.sort(by).map(x=>taskRow(x,t,{plus:true,showList:true,lock:isClosed})).join('')}</ul></div>`:'';
    const out=sec('Срок прошёл',g.past)+sec('Срок сегодня',g.today)+sec('Срок завтра',g.tomorrow)+sec('На этой неделе',g.week)+sec('Позже',g.later)+sec('Без срока',g.none);
    $('calBody').innerHTML=out||'<div class="empty">Дел пока нет. Добавь первое кнопкой «+».</div>';
  }
  const LETTER_NAME={morning:['Письмо от совы','Поговорим про сегодня'],evening:['Вечернее письмо','Как прошёл день и что завтра'],week:['Письмо: обзор недели','Оглянемся на неделю']};
  function renderMail(t){
    const lt=unreadLetters();
    $('letterBox').innerHTML=lt.length?lt.map(l=>`<div class="letter"><svg aria-hidden="true"><use href="#i-env"/></svg><div><b>${LETTER_NAME[l.kind][0]}</b><p>${LETTER_NAME[l.kind][1]}</p></div>
        <button class="primary" type="button" data-act="openLetter" data-kind="${l.kind}">Прочитать</button></div>`).join('')
      :`<div class="letter read"><svg aria-hidden="true"><use href="#i-env"/></svg><div><b>Писем нет</b><p>${hourOf(t)<EVE&&!closed()&&!S.letters.some(l=>l.kind==='evening'&&l.day===today())?'Вечером придёт письмо: подведём день.':'Новое письмо от совы придёт завтра утром.'}</p></div></div>`;
    const inbox=S.tasks.filter(x=>x.list==='inbox'&&!x.done&&!x.planned);
    $('inboxCount').textContent=inbox.length?cnt(inbox.length,'запись','записи','записей'):'';
    $('inboxList').innerHTML=inbox.length?inbox.map(x=>`<li class="row" style="grid-template-columns:1fr auto"><button class="rbody" type="button" data-act="edit" data-id="${x.id}"><div class="rtitle">${esc(x.title)}</div></button>
        <button class="plus" type="button" data-act="togglePlan" data-id="${x.id}" aria-label="В ${closed()?'завтра':'сегодня'}: ${esc(x.title)}">+</button></li>`).join('')
      :'<li class="note">Пусто. Кнопка «+» внизу добавляет сюда новые записи.</li>';
  }
  function renderLists(){
    const rows=S.lists.map(l=>{const n=S.tasks.filter(x=>x.list===l.id&&!x.done).length;
      return `<li><button class="lrow" type="button" data-act="go" data-view="list" data-list="${l.id}"><i class="lic" style="background:${listColor(l.id)}">${ic('i-list')}</i><b>${esc(l.name)}</b><span>${n||''}</span>${ic('i-chev','chev')}</button></li>`}).join('');
    $('listCards').innerHTML=(rows||'<li class="note" style="padding:14px">Списков пока нет. Придумай первый: например, «Дом» или «Учёба».</li>')
      +`<li><button class="lrow add" type="button" data-act="addList"><i class="lic">${ic('i-plus')}</i>Новый список</button></li>`;
  }

  const FOOD={bug:{name:'Жучок',kind:'Перекус: сытость чуть-чуть подрастёт',price:2,fill:20,say:'Хрум! Вкусный жучок, спасибо.'},
    mouse:{name:'Мышка',kind:'Обед: сытость вырастет наполовину',price:5,fill:50,say:'Мышка! Ням-ням, спасибо.'},
    fish:{name:'Рыбка',kind:'Сытный ужин: наестся досыта',price:8,fill:100,say:'Рыбка! Вот это ужин. Теперь я совсем сытая.'}};
  const PILL={name:'Лекарство',kind:'Банка таблеток. Вылечит сову сразу',price:15};
  const SCARF={name:'Шарф',kind:'Тёплый. Если сова заболеет, даст ей ещё два дня',price:20};
  const DECOR={yarn:{name:'Клубок',kind:'Играть, когда скучно. Будет лежать в комнате',price:15},bed:{name:'Вязаная лежанка',kind:'Мягкое место для совы',price:30},
    shelf:{name:'Книжная полочка',kind:'Повесим на стену рядом с совой. На неё встанут книги',price:25},
    shelf2:{name:'Вторая полочка',kind:'Висит над первой, ещё на восемь книг',price:25,needs:'shelf'}};
  // Sofia's classics, one at a time; each has its own spine (colour, height). Eight on a shelf, two shelves at most.
  const BOOKS=[
    ['tolstoy-diary','Дневники','Лев Толстой','#6B4E3A',27],['east-eden','К востоку от Эдема','Джон Стейнбек','#4F7A6A',26],
    ['gone-wind','Унесённые ветром','Маргарет Митчелл','#B5462E',28],['thorn-birds','Поющие в терновнике','Колин Маккалоу','#8C6A8E',25],
    ['catcher','Над пропастью во ржи','Джером Сэлинджер','#C9A24A',22],['mockingbird','Убить пересмешника','Харпер Ли','#6E8E9D',24],
    ['captains-daughter','Капитанская дочка','Александр Пушкин','#9A3B3B',21],['pride','Гордость и предубеждение','Джейн Остин','#D48A9A',24],
    ['jane-eyre','Джейн Эйр','Шарлотта Бронте','#5E6B8C',25],['karenina','Анна Каренина','Лев Толстой','#7A2E3A',28],
    ['master','Мастер и Маргарита','Михаил Булгаков','#3E3A4E',26],['three-comrades','Три товарища','Эрих Мария Ремарк','#7FA36A',23],
    ['little-prince','Маленький принц','Антуан де Сент-Экзюпери','#E0B04A',19],['solitude','Сто лет одиночества','Габриэль Гарсиа Маркес','#C0654A',26],
    ['dorian','Портрет Дориана Грея','Оскар Уайльд','#5E8C8A',23],['crime','Преступление и наказание','Фёдор Достоевский','#4E4E4E',27]
  ].map(([id,title,author,color,h])=>({id,title,author,color,h}));
  const BOOK={name:'Книга',price:6,perShelf:8};
  const myBooks=()=>(S.bookIds||[]).map(id=>BOOKS.find(b=>b.id===id)).filter(Boolean);
  const shelfRoom=()=>((S.decor&&S.decor.shelf)?BOOK.perShelf:0)+((S.decor&&S.decor.shelf2)?BOOK.perShelf:0);
  const books=()=>myBooks().length;
  let booksOpen=false;
  function renderShelf(){
    const bs=myBooks(),draw=(list,base)=>{let x=14;return list.map(b=>{const r=`<g><title>«${esc(b.title)}», ${esc(b.author)}</title><rect x="${x}" y="${base-b.h}" width="6.600" height="${b.h}" rx="1.400" fill="${b.color}"/><rect x="${x+1.400}" y="${base-b.h+5}" width="3.800" height="1.600" rx=".8" fill="#FFFBF2" opacity=".75"/><rect x="${x+1.400}" y="${base-6}" width="3.800" height="1" fill="#FFFBF2" opacity=".5"/></g>`;x+=7.6;return r}).join('')};
    $('shelfBooks').innerHTML=draw(bs.slice(0,BOOK.perShelf),150);
    $('shelfBooks2').innerHTML=draw(bs.slice(BOOK.perShelf,2*BOOK.perShelf),110);
  }
  const stock=k=>(S.pantry&&S.pantry[k])||0;
  function renderShop(){
    const st=status();
    $('shopHunger').innerHTML=`<span>${S.sick?'Сова болеет':'Сова '+hungerWord().toLowerCase()}</span><span class="bar ${st.hz==='red'?'low':st.hz==='yellow'?'mid':''}"><b style="width:${Math.round(S.hunger)}%"></b></span>`;
    // a price the purse cannot cover stays tappable: Mars answers politely instead of a dead button
    const row=(k,icon,it,extra)=>{const lack=Math.max(0,it.price-Math.floor(S.feathers));
      return `<li class="food"><svg class="fi" aria-hidden="true"><use href="#${icon}"/></svg><div><b>${it.name}</b><small>${it.kind}</small>${extra||''}${lack?`<small>Не хватает ${cnt(lack,'листа','листьев','листьев')}</small>`:''}</div>
        <button class="buy ${lack?'lack':''}" type="button" data-act="buy" data-food="${k}" aria-label="Купить: ${it.name}, ${lv(it.price)}${lack?'. Листьев пока не хватает':''}">${it.price}${ic('i-leaf','fea')}</button></li>`};
    const got=(icon,it,tag)=>`<li class="food"><svg class="fi" aria-hidden="true"><use href="#${icon}"/></svg><div><b>${it.name}</b><small>${it.kind}</small></div><span class="soon-tag">${tag}</span></li>`;
    $('shopFood').innerHTML=Object.entries(FOOD).map(([k,f])=>row(k,'f-'+k,f,stock(k)?`<small class="stock">В запасах: ${stock(k)}</small>`:'')).join('');
    $('seedNote').textContent=sillGoals().length>=POTS?'На подоконнике уже три цели. Семечко пригодится, когда место освободится.':seedKinds().length?'Семечко есть. Чтобы посадить цель, нажми «+» и выбери «Цель».':'Из семечка на подоконнике вырастет твоя большая цель.';
    $('shopSeeds').innerHTML=Object.entries(SEEDS).map(([k,sd])=>row('seed_'+k,'f-seed',Object.assign({},sd,{name:sd.hard?sd.name+' · для трудной цели':sd.name}),stock('seed_'+k)?`<small class="stock">В запасах: ${stock('seed_'+k)}</small>`:'')).join('');
    $('shopCare').innerHTML=row('pill','f-pill',PILL,stock('pill')?`<small class="stock">В запасах: ${stock('pill')}</small>`:'')
      +(S.scarf?got('f-scarf',SCARF,'куплен'):row('scarf','f-scarf',SCARF));
    S.decor=S.decor||{};
    $('shopSoon').innerHTML=Object.entries(DECOR).map(([k,d])=>S.decor[k]?got('f-'+(k==='shelf2'?'shelf':k),d,k.startsWith('shelf')?'куплена':'куплен'):d.needs&&!S.decor[d.needs]?'':row(k,'f-'+(k==='shelf2'?'shelf':k),d)).join('');
    // books: a chooser of titles; a title on the shelf is marked, a full shelf asks for the second one
    const room=shelfRoom(),n=books(),mine=new Set(S.bookIds||[]);
    $('shopBooks').innerHTML=!room?`<li class="note">Сначала нужна книжная полочка: книгам надо где-то стоять.</li>`
      :`<li class="food"><svg class="fi" aria-hidden="true"><use href="#f-book"/></svg><div><b>Книги</b><small>На полочке ${n} из ${room}. Каждая — ${lv(BOOK.price)}.</small></div><button class="buy" type="button" data-act="booksOpen" aria-expanded="${booksOpen}">${booksOpen?'Скрыть':'Выбрать'}</button></li>`
      +(booksOpen?BOOKS.map(b=>`<li class="food book"><i class="spine" style="background:${b.color}" aria-hidden="true"></i><div><b>${esc(b.title)}</b><small>${esc(b.author)}</small></div>${mine.has(b.id)?'<span class="soon-tag">на полке</span>':n>=room?'<span class="soon-tag">нет места</span>':`<button class="buy ${S.feathers<BOOK.price?'lack':''}" type="button" data-act="buy" data-food="book" data-book="${b.id}" aria-label="Купить «${esc(b.title)}», ${lv(BOOK.price)}">${BOOK.price}${ic('i-leaf','fea')}</button>`}</li>`).join(''):'');
  }
  let bookPick=null;
  function buy(k){
    const seed=k.startsWith('seed_')?k.slice(5):null;
    const it=FOOD[k]||(k==='pill'?PILL:k==='scarf'?SCARF:k==='book'?BOOK:seed&&SEEDS[seed]?{price:seedPrice(seed)}:DECOR[k]||null);if(!it)return;
    if(k==='book'&&(!bookPick||books()>=shelfRoom()||(S.bookIds||[]).includes(bookPick)))return;
    if(DECOR[k]&&DECOR[k].needs&&!(S.decor&&S.decor[DECOR[k].needs]))return;
    if(marsAway)marsBack();
    if(S.feathers<it.price){marsSay=marsLine('lack');return marsShrug()}
    S.feathers-=it.price;marsSay=marsLine(seed?'seed':k==='book'?'book':k==='pill'&&S.sick?'cure':'buy');marsPurr();
    if(seed){S.pantry[k]=stock(k)+1;sayOverride=sillGoals().length>=POTS?'Семечко в запасах. Посадим, когда на подоконнике будет место.':waitingGoals().length?'Семечко есть! Посадим ждущую цель у окна?':'Семечко есть! Нажми «+» и выбери «Цель».';return}
    if(k==='book'){const b=BOOKS.find(y=>y.id===bookPick);S.bookIds=(S.bookIds||[]).concat(b.id);sayOverride=pick([`«${short(b.title,26)}»! Почитаю перед сном.`,`Ух-ху, «${short(b.title,26)}»! Обожаю.`,`«${short(b.title,24)}» — на полочку. Спасибо!`]);return}
    if(DECOR[k]){S.decor=S.decor||{};S.decor[k]=true;sayOverride=k==='yarn'?'Клубок! Буду гонять его по комнате.':k==='shelf'?'Полочка! Осталось поставить на неё книги.':k==='shelf2'?'Вторая полочка! Места хватит на целую библиотеку.':'Лежанка! Какая мягкая, спасибо.';return}
    if(k==='scarf'){S.scarf=true;sayOverride='Какой тёплый шарф! Спасибо, теперь мне ничего не страшно.';return}
    if(k==='pill'&&S.sick){S.sick=null;S.missStreak=0;sayOverride='Ой, сразу полегчало! Спасибо, что вылечила меня.';return}
    S.pantry[k]=stock(k)+1;
    sayOverride=k==='pill'?'Лекарство в запасах. Пригодится, если я заболею.':`${it.name} в запасах. Покормишь меня, когда захочешь.`;
  }
  function feedWith(k){
    if(!stock(k))return;S.pantry[k]--;
    if(k==='pill'){S.sick=null;S.missStreak=0;sayOverride='Ой, сразу полегчало! Спасибо, что вылечила меня.'}
    else{S.hunger=Math.min(100,S.hunger+FOOD[k].fill);S.lastFed=now();sayOverride=FOOD[k].say}
    preview=null;careFeedOpen=false;closeCareSafe();if(view!=='home')go('home');else render();
    setTimeout(()=>k==='pill'?owlHeal():owlEat(k),150);
  }
  // the owl flew away or did not recover — offer a new one, on a promise
  let goneShown=null;
  function renderGone(){
    const g=$('gone');g.hidden=!S.gone;if(!S.gone){goneShown=null;return}
    if(goneShown===S.gone)return;goneShown=S.gone;
    const nm=S.owlName?`«${S.owlName}»`:'Сова';
    $('goneTitle').textContent=S.gone==='hungry'?'Сова улетела':'Сова не выздоровела';
    $('goneText').textContent=S.gone==='hungry'?`${nm} три дня ничего не ела и улетела в лес искать еду. Твои дела и списки на месте.`:`${nm} долго болела, а лекарства так и не было. Её больше нет с нами. Твои дела и списки на месте.`;
    $('gonePromise').textContent=S.gone==='hungry'?'Обещаю кормить новую сову каждый день':'Обещаю заботиться о новой сове и лечить её';
    $('goneOk').checked=false;$('goneBtn').disabled=true;$('goneName').value='';
  }
  $('goneOk').addEventListener('change',e=>{$('goneBtn').disabled=!e.target.checked});
  $('goneForm').addEventListener('submit',e=>{e.preventDefault();if(!$('goneOk').checked)return;
    const v=$('goneName').value.trim();S.owlName=v?v.slice(0,24):null;
    Object.assign(S,{gone:null,sick:null,scarf:false,hunger:100,lastFed:now(),streak:0,missStreak:0});
    preview=null;view='home';sayOverride=(S.owlName?`Привет! Я ${S.owlName}.`:'Привет! Я новая сова.')+' Буду жить здесь, рядом с тобой.';render();setTimeout(cheer,300)});

  // ---------- goals: a pot on the windowsill for a goal, a star in the sky for every goal reached ----------
  // Plants for the sill. Sold: Sofia's favourite fruits (mandarin, avocado, mango — all grow from a seed or a pit at home),
  // and two «prickly» seeds for hard goals, the ones you do not want to start (eat the frog): cactus and lemon.
  // Geranium and amaryllis are no longer sold, but goals planted with them keep growing.
  const PLANTS={mandarin:'Мандарин',avocado:'Авокадо',mango:'Манго',cactus:'Кактус',lemon:'Лимон',geranium:'Герань',amaryllis:'Амариллис'};
  const SEEDS={mandarin:{name:'Косточка мандарина',kind:'Деревце с оранжевыми мандаринами',price:10},
    avocado:{name:'Косточка авокадо',kind:'Деревце с крупными листьями и плодами авокадо',price:10},
    mango:{name:'Косточка манго',kind:'Деревце с длинными листьями и сладкими манго',price:10},
    cactus:{name:'Семена кактуса',kind:'Для колючей цели, за которую не хочется браться',price:15,hard:true},
    lemon:{name:'Косточка лимона',kind:'Для кислой цели: трудной, но полезной',price:15,hard:true}};
  const HARD_BONUS=10; // a star from a hard goal brings Mars's extra leaves
  const SEED_PRICE=10,POTS=3; // SEED_PRICE — the cheapest seed, for the owl's words
  const seedPrice=k=>(SEEDS[k]&&SEEDS[k].price)||SEED_PRICE;
  const BLOOM={geranium:'герань расцвела',cactus:'кактус зацвёл',lemon:'лимоны созрели',amaryllis:'амариллис расцвёл',mandarin:'мандарины созрели',avocado:'авокадо созрели',mango:'манго созрели'};
  const PLANT_OLD={sunflower:'amaryllis',pumpkin:'cactus',strawberry:'geranium',apple:'lemon'}; // garden beds of v14–v22
  const STAGE=['Только посажено','Росток','Подрастает','Набирает силу','Все дела сделаны!'];
  const STAR_D='M0.0 -9.0 L2.2 -3.1 L8.6 -2.8 L3.6 1.2 L5.3 7.3 L0.0 3.8 L-5.3 7.3 L-3.6 1.2 L-8.6 -2.8 L-2.2 -3.1Z';
  const WIN_STARS=[[130,72],[230,62],[156,44],[112,112],[250,112],[204,92],[142,104],[224,134]];
  /* A goal is a group of real tasks (each may have its own steps), with a deadline.
     Tasks join a goal through x.goal. Up to three goals grow on the windowsill (they need a seed);
     the rest wait for a place. A plant wilts when the goal falls behind, but never dies. */
  const activeGoals=()=>S.goals.filter(g=>!g.doneAt);
  const sillGoals=()=>activeGoals().filter(g=>g.plant).slice(0,POTS);
  const waitingGoals=()=>activeGoals().filter(g=>!g.plant);
  const goalTasks=g=>S.tasks.filter(x=>x.goal===g.id);
  const short=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
  const seedKinds=()=>Object.keys(SEEDS).filter(k=>stock('seed_'+k));
  // a plant grows from done tasks only: steps would fill its five stages too fast (Илья, 17 ноября)
  function goalProg(g){const ts=goalTasks(g);return ts.length?ts.filter(x=>x.done).length/ts.length:0}
  const goalDone=g=>{const ts=goalTasks(g);return ts.length>0&&ts.every(x=>x.done)};
  function stageOf(g){if(goalDone(g))return 4;const p=goalProg(g);return p<=0?0:1+Math.min(2,Math.floor(3*p))}
  // 0 — fine, 1 — droops (a task is overdue or the goal is behind its pace), 2 — wilts (badly behind or past the deadline)
  function wiltOf(g){
    if(!g||g.doneAt||!g.plant||potDemo||goalDone(g))return 0;const t=now(),ts=goalTasks(g);
    const late=ts.filter(x=>!x.done&&x.due&&dayDiff(x.due,t)<0),worst=late.reduce((m,x)=>Math.max(m,-dayDiff(x.due,t)),0);
    let behind=0;if(g.due){const total=keyToTime(g.due)-g.created,el=t-g.created;if(total>0)behind=Math.min(1,el/total)-goalProg(g)}
    if((g.due&&dayDiff(g.due,t)<0)||behind>.5||worst>=3)return 2;
    return late.length||behind>.25?1:0;
  }
  const wiltWord=(g,l)=>l===2?'чахнет':g.plant==='geranium'?'подвяла':g.plant==='avocado'||g.plant==='mango'?'подвяло':'подвял';
  const lateTask=g=>goalTasks(g).filter(x=>!x.done&&x.due&&dayDiff(x.due,now())<0).sort((a,b)=>a.due.localeCompare(b.due))[0]||goalTasks(g).find(x=>!x.done);
  const fmtDay=k=>new Date(keyToTime(k)).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  const dueLeft=k=>{const d=dayDiff(k,now());return d<0?'срок прошёл':d===0?'срок сегодня':d<14?'осталось '+cnt(d,'день','дня','дней'):'осталось '+cnt(Math.round(d/7),'неделя','недели','недель')};
  // old goals (v23–v26) kept their «steps» inside the goal: they become real tasks in the «Цели» list
  function migrateGoals(st){
    (st.goals||[]).forEach(g=>{
      delete g.plantOff; // v29: a goal taken off the sill no longer keeps its plant
      if(Array.isArray(g.steps)){g.steps.forEach(s=>{let x=st.tasks.find(y=>y.goal===g.id&&y.step===s.id);
          if(!x){x={id:uid(),title:s.title,list:'goals',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:null,done:false,doneAt:null,created:g.created||Date.now(),goal:g.id};st.tasks.push(x)}
          if(s.done&&!x.done){x.done=true;x.doneAt=g.doneAt||g.created||Date.now()}});
        delete g.steps}
      if(!g.due)g.due=dayKey((g.created||Date.now())+84*D);
    });
    st.tasks.forEach(x=>{delete x.step});
  }
  // a plant at one of five stages; the origin is the middle of the soil, up is negative
  function plantSVG(k,s){
    const G='#6FA35A',GD='#4F8443';
    const leaf=(x,y,r,rot,c)=>`<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${(r*0.5).toFixed(1)}" fill="${c||G}" transform="rotate(${rot} ${x} ${y})"/>`;
    if(s===0)return k==='amaryllis'?`<path d="M-9 1 Q-9 -10 0 -11 Q9 -10 9 1Z" fill="#B98A5E"/><path d="M0 -10 q-2 -6 0 -9 q2 3 0 9Z" fill="${G}"/>`
      :`<path d="M-11 1 Q0 -7 11 1Z" fill="#6B4A33"/><path d="M0 -4 v-6" stroke="${GD}" stroke-width="2" stroke-linecap="round"/><ellipse cx="2.5" cy="-10.5" rx="3.2" ry="1.9" fill="${G}"/>`;
    if(k==='cactus'){
      const h=[0,9,20,28,28][s],w=[0,7,11,13,13][s];
      let o=`<ellipse cx="0" cy="${-h}" rx="${w}" ry="${h}" fill="#6E9F6B"/><path d="M0 ${-2*h+3} V-2 M${-w*0.5} ${-2*h+7} Q${-w*0.62} ${-h} ${-w*0.5} -3 M${w*0.5} ${-2*h+7} Q${w*0.62} ${-h} ${w*0.5} -3" stroke="#4F7F52" stroke-width="1.3" fill="none"/>`;
      o+=`<g fill="#F4EBD5">${[...Array(s+2)].map((_,i)=>{const y=-3-i*(2*h-8)/(s+1);return `<circle cx="${-w*0.78}" cy="${y.toFixed(1)}" r="1.1"/><circle cx="${w*0.78}" cy="${(y-2).toFixed(1)}" r="1.1"/>`}).join('')}</g>`;
      if(s>=3)o=`<path d="M11 -22 q13 0 12 -15" stroke="#6E9F6B" stroke-width="11" fill="none" stroke-linecap="round"/>`+o;
      if(s===3)o+=`<ellipse cx="0" cy="-58" rx="3.6" ry="5" fill="#E889A8"/><ellipse cx="23" cy="-41" rx="2.6" ry="3.6" fill="#E889A8"/>`;
      if(s===4){const fl=(x,y,r)=>`<g transform="translate(${x} ${y})">${[...Array(7)].map((_,i)=>`<ellipse cx="0" cy="${-r*0.62}" rx="${r*0.34}" ry="${r*0.62}" fill="#EE7FA6" transform="rotate(${i*51.4})"/>`).join('')}<circle r="${r*0.3}" fill="#F7D35A"/></g>`;o+=fl(0,-61,11)+fl(24,-43,7)}
      return o}
    if(s===1)return `<path d="M0 0 V-12" stroke="${GD}" stroke-width="2.4" stroke-linecap="round"/>${leaf(-5,-13,5.5,-30)}${leaf(5,-13,5.5,30)}`;
    if(k==='geranium'){
      const top=[0,0,34,46,48][s],r=s===2?9:10.5;
      const st=[[-13,-top*0.7],[1,-top],[14,-top*0.62]],lf=(x,y)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${G}"/><circle cx="${x}" cy="${y}" r="${(r*0.5).toFixed(1)}" fill="none" stroke="${GD}" stroke-width="1.6" opacity=".7"/>`;
      let o=st.map(([x,y])=>`<path d="M0 0 Q${x*0.3} ${y*0.6} ${x} ${y}" stroke="${GD}" stroke-width="2.6" fill="none"/>`).join('')+lf(-13,-top*0.7)+lf(14,-top*0.62)+lf(1,-top);
      if(s>=3)o+=lf(-6,-top*0.36)+lf(8,-top*0.3);
      const heads=[[-9,-top-22],[11,-top-14],[1,-top-34]];
      if(s===3)o+=heads.slice(0,2).map(([x,y])=>`<path d="M${x*0.4} ${-top+4} L${x} ${y+12}" stroke="${GD}" stroke-width="1.8"/><g fill="#C96A5A"><circle cx="${x-2.5}" cy="${y+10}" r="2.6"/><circle cx="${x+2.5}" cy="${y+10}" r="2.6"/><circle cx="${x}" cy="${y+6.5}" r="2.6"/></g>`).join('');
      if(s===4)o+=heads.map(([x,y])=>`<path d="M${x*0.4} ${-top+4} L${x} ${y+6}" stroke="${GD}" stroke-width="1.8"/><g transform="translate(${x} ${y})">${[...Array(6)].map((_,i)=>`<circle cx="${(6.5*Math.cos(i*1.047)).toFixed(1)}" cy="${(6.5*Math.sin(i*1.047)).toFixed(1)}" r="4.6" fill="${i%2?'#D9463E':'#E8655A'}"/>`).join('')}<circle r="4.6" fill="#EE7B6C"/></g>`).join('');
      return o}
    if(k==='avocado'){
      const h=[0,0,28,44,52][s],L=(x,y,rot,r)=>`<ellipse cx="${x}" cy="${y}" rx="${r||12}" ry="${((r||12)*.42).toFixed(1)}" fill="${G}" transform="rotate(${rot} ${x} ${y})"/><path d="M${x} ${y} l${(Math.cos(rot*Math.PI/180)*(r||12)*.8).toFixed(1)} ${(Math.sin(rot*Math.PI/180)*(r||12)*.8).toFixed(1)}" stroke="${GD}" stroke-width=".9"/>`;
      let o=`<ellipse cx="0" cy="-2" rx="6" ry="5" fill="#7A4E2E"/><path d="M0 -3 Q1.500 ${-h*0.5} 0 ${-h}" stroke="#6E8A4A" stroke-width="${s===2?2.400:3.200}" fill="none" stroke-linecap="round"/>`;
      if(s===2)return o+L(-9,-h+4,-150,11)+L(9,-h+2,-30,11)+L(0,-h-6,-90,8);
      o+=L(-11,-h*0.55,-160)+L(11,-h*0.6,-20)+L(-11,-h+2,-145,13)+L(11,-h,-35,13)+L(-4,-h-9,-110,11)+L(5,-h-10,-70,11);
      if(s===4)o+=[[-12,-h*0.55+8],[12,-h*0.6+9]].map(([x,y])=>`<path d="M${x} ${y-6} v3" stroke="${GD}" stroke-width="1.200"/><path d="M${x} ${y-3} c-4 0 -6 5 -6 9 a6 6 0 0 0 12 0 c0 -4 -2 -9 -6 -9Z" fill="#3F6B2E"/><ellipse cx="${x-2}" cy="${y+3}" rx="1.600" ry="2.600" fill="#6E9A4E"/>`).join('');
      return o}
    if(k==='mango'){
      const h=[0,0,26,42,50][s],R='#B5533C',L=(x,y,rot,c,r)=>`<ellipse cx="${x}" cy="${y}" rx="${r||13}" ry="${((r||13)*.26).toFixed(1)}" fill="${c||GD}" transform="rotate(${rot} ${x} ${y})"/>`;
      let o=`<path d="M0 0 Q-1.500 ${-h*0.5} 0 ${-h}" stroke="#7A5A3E" stroke-width="${s===2?2.600:3.800}" fill="none" stroke-linecap="round"/>`;
      if(s===2)return o+L(-8,-h+2,-150,R,10)+L(8,-h+1,-30,R,10)+L(-3,-h-6,-105,'#C9744E',8)+L(4,-h-6,-75,'#C9744E',8);
      o+=L(-12,-h+4,-165)+L(12,-h+3,-15)+L(-10,-h-4,-140)+L(10,-h-5,-40)+L(-4,-h-10,-110,G)+L(5,-h-10,-70,G)+L(-12,-h*0.55,-160,G,11)+L(12,-h*0.58,-20,G,11);
      if(s===3)o+=L(0,-h-14,-90,R,8);
      if(s===4)o+=`<defs><radialGradient id="mgB" cx=".72" cy=".18" r=".95"><stop offset="0" stop-color="#E4553A"/><stop offset=".4" stop-color="#F0913A"/><stop offset=".72" stop-color="#F6BF46"/><stop offset="1" stop-color="#B9C255"/></radialGradient></defs>`+[[-10,-h+13,-12],[11,-h+15,10]].map(([x,y,r])=>`<g transform="rotate(${r} ${x} ${y})"><path d="M${x} ${y-14} V${y-7}" stroke="#7A5A3E" stroke-width="1.100"/><path d="M${x} ${y-8} c4.500 0 6.500 4 6 9 c-.500 5 -3.500 7.500 -6.500 7.500 c-3.500 0 -5.500 -3 -5 -8 c.400 -4.500 2 -8.500 5.500 -8.500Z" fill="url(#mgB)"/><ellipse cx="${x-2}" cy="${y-2}" rx="1.200" ry="2.400" fill="#FFE7A0" opacity=".8"/></g>`).join('');
      return o}
    if(k==='lemon'||k==='mandarin'){
      const md=k==='mandarin',LG=md?'#4A7A3A':G,LD=md?'#3A6330':GD;
      const h=[0,0,30,46,52][s],cr=[0,0,0,17,21][s];
      let o=`<path d="M0 0 Q2 ${-h*0.5} 0 ${-h}" stroke="#7A5A3E" stroke-width="${s===2?3:4.2}" fill="none" stroke-linecap="round"/>`;
      if(s===2)return o+leaf(-8,-14,7,-25,GD)+leaf(8,-20,7,25,GD)+leaf(-7,-27,7,-35,G)+leaf(6,-33,7,35,G)+leaf(0,-36,6,-90,G);
      o+=`<circle cx="${-cr*0.55}" cy="${-h-cr*0.35}" r="${cr*0.72}" fill="${LD}"/><circle cx="${cr*0.6}" cy="${-h-cr*0.3}" r="${cr*0.7}" fill="${LD}"/><circle cx="0" cy="${-h-cr*0.75}" r="${cr}" fill="${LG}"/>`;
      if(s===3)o+=[[-9,-h-8],[8,-h-18],[1,-h-4],[-3,-h-24],[12,-h-4]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.6" fill="#FFFDF5"/><circle cx="${x}" cy="${y}" r="1" fill="#F2CE3A"/>`).join('');
      if(s===4)o+=[[-13,-h-4],[10,-h-22],[2,-h-2],[-5,-h-27],[16,-h-5]].map(([x,y])=>md?`<circle cx="${x}" cy="${y}" r="5.400" fill="#F08A24"/><ellipse cx="${x-1.600}" cy="${y-1.800}" rx="1.600" ry="1.200" fill="#FFC27A"/><circle cx="${x}" cy="${y-5}" r=".9" fill="${LD}"/>`:`<path d="M${x} ${y-8} q1.400 1 1.300 1.800 c3 1.200 4 3.500 4 6.200 s-1 5 -4 6.200 q.100 .800 -1.300 1.800 q-1.400 -1 -1.300 -1.800 c-3 -1.200 -4 -3.500 -4 -6.200 s1 -5 4 -6.200 q-.100 -.800 1.300 -1.800Z" fill="#F4D23C"/><ellipse cx="${x-1.600}" cy="${y-2}" rx="1.400" ry="2.600" fill="#FCEB94"/>`).join('');
      return o}
    // amaryllis
    const strap=(x,y,bend)=>`<path d="M0 0 Q${bend} ${y*0.55} ${x} ${y}" stroke="${G}" stroke-width="6.5" fill="none" stroke-linecap="round"/>`;
    let o=`<path d="M-8 1 Q-8 -8 0 -9 Q8 -8 8 1Z" fill="#B98A5E"/>`;
    if(s===2)return o+strap(-19,-38,-2)+strap(20,-34,3)+strap(3,-46,-3);
    o+=strap(-23,-40,-3)+strap(24,-36,4)+`<path d="M0 -6 V${s===3?-66:-70}" stroke="${GD}" stroke-width="5" stroke-linecap="round"/>`;
    if(s===3)return o+`<path d="M0 -62 q-7 -10 0 -24 q7 14 0 24Z" fill="#C9584A"/><path d="M0 -62 q-3 -6 -5 -8 M0 -62 q3 -6 5 -8" stroke="${GD}" stroke-width="2" fill="none"/>`;
    const fl=(x,y,rot)=>`<g transform="translate(${x} ${y}) rotate(${rot})">${[...Array(6)].map((_,i)=>`<path d="M0 0 Q-6.5 -9 0 -17 Q6.5 -9 0 0Z" fill="${i%2?'#C8322F':'#DE4A40'}" transform="rotate(${i*60})"/>`).join('')}<circle r="3.2" fill="#F7D35A"/></g>`;
    return o+fl(-13,-76,-20)+fl(13,-76,20)+fl(0,-90,0);
  }
  // the goal list shows the fruit (or flower) a goal grows toward: a tasty reason to open it
  const FRUIT_BG={mandarin:'#FCE3C6',lemon:'#FBF0B8',mango:'#FDE2C4',avocado:'#E2EDC8',cactus:'#FADDE6',geranium:'#E4EED8',amaryllis:'#F9D9D3'};
  function fruitSVG(k){
    const lf=(x,y,rot)=>`<path d="M${x} ${y} c3 -6 9 -8 14 -7 c-2 5 -8 8 -14 7Z" fill="#5E9150" transform="rotate(${rot} ${x} ${y})"/><path d="M${x} ${y} l11 -5.500" stroke="#43703A" stroke-width=".9" transform="rotate(${rot} ${x} ${y})"/>`;
    if(k==='mandarin')return `<circle cx="0" cy="3" r="13" fill="#F28A24"/><circle cx="0" cy="3" r="13" fill="none" stroke="#D96E14" stroke-width="1"/><ellipse cx="-5" cy="-2" rx="4" ry="2.600" fill="#FFC27A" transform="rotate(-30 -5 -2)"/><g fill="#E0791A">${[[4,6],[7,1],[-2,10],[5,11],[-7,6]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r=".7"/>`).join('')}</g><circle cx="0" cy="-10" r="1.600" fill="#6B4A2E"/>${lf(0,-10,-10)}`;
    if(k==='lemon')return `<g transform="rotate(-28 -3 -2)"><ellipse cx="-3" cy="-2" rx="12.500" ry="9.500" fill="#F4D23C"/><ellipse cx="-16" cy="-2" rx="2.400" ry="2" fill="#F4D23C"/><ellipse cx="10" cy="-2" rx="2.400" ry="2" fill="#F4D23C"/><ellipse cx="-6" cy="-6" rx="5" ry="2" fill="#FCEB94"/></g><g transform="translate(9 9)"><circle r="8.500" fill="#E9BE2A"/><circle r="7.300" fill="#FBF3C4"/><circle r="6.300" fill="#F7DE5C"/><g stroke="#FBF3C4" stroke-width="1">${[...Array(8)].map((_,i)=>`<path d="M0 0 L${(6.300*Math.cos(i*.785)).toFixed(1)} ${(6.300*Math.sin(i*.785)).toFixed(1)}"/>`).join('')}</g><circle r="1.200" fill="#FBF3C4"/></g>${lf(-4,-11,-40)}`;
    if(k==='mango')return `<defs><radialGradient id="mgB" cx=".72" cy=".18" r=".95"><stop offset="0" stop-color="#E4553A"/><stop offset=".4" stop-color="#F0913A"/><stop offset=".72" stop-color="#F6BF46"/><stop offset="1" stop-color="#B9C255"/></radialGradient></defs><path d="M-1 -12 c9 0 14 7 13 16 c-1 9 -7 13 -13 13 c-7 0 -11 -6 -10 -14 c1 -9 4 -15 10 -15Z" fill="url(#mgB)"/><ellipse cx="-4" cy="-3" rx="2.200" ry="4.500" fill="#FFE7A0" opacity=".8" transform="rotate(15 -4 -3)"/><path d="M-1 -12 v-3" stroke="#6B4A2E" stroke-width="1.600" stroke-linecap="round"/>${lf(-1,-14,-20)}`;
    if(k==='avocado')return `<path d="M0 -14 c5 0 7 6 8 10 c3 3 6 7 6 11 c0 7 -6 11 -14 11 s-14 -4 -14 -11 c0 -4 3 -8 6 -11 c1 -4 3 -10 8 -10Z" fill="#3F6B2E"/><path d="M0 -11.500 c3.500 0 5 5 6 8.500 c2.500 2.500 5.500 6 5.500 9.500 c0 5.500 -5 9 -11.500 9 s-11.500 -3.500 -11.500 -9 c0 -3.500 3 -7 5.500 -9.500 c1 -3.500 2.500 -8.500 6 -8.500Z" fill="#DDE7A0"/><path d="M0 -8 c2.500 0 3.500 4 4.500 7 c2 2 4.500 5 4.500 8 c0 4 -4 7 -9 7 s-9 -3 -9 -7 c0 -3 2.500 -6 4.500 -8 c1 -3 2 -7 4.500 -7Z" fill="#C3D77A"/><circle cx="0" cy="7" r="6" fill="#8A5530"/><ellipse cx="-2" cy="5" rx="1.800" ry="1.200" fill="#B07A50"/>`;
    // geranium: a cap of small five-petal florets above a round scalloped leaf (v32: no longer a red copy of the cactus flower)
    if(k==='geranium'){const fl=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})">${[...Array(5)].map((_,i)=>`<circle cx="0" cy="-3.200" r="3" fill="${i%2?'#E3504A':'#F0675C'}" transform="rotate(${i*72})"/>`).join('')}<circle r="1.500" fill="#FBE3A0"/></g>`;
      return `<path d="M0 6 C-5 2 -13 4 -14 10 C-15 16 -9 20 -4 18 C-2 21 2 21 4 18 C9 20 15 16 14 10 C13 4 5 2 0 6Z" fill="#5E9150"/><path d="M0 7 C-4 5 -10 7 -10 11 C-10 15 -6 17 -2 15 Q0 17 2 15 C6 17 10 15 10 11 C10 7 4 5 0 7Z" fill="none" stroke="#8DB872" stroke-width="1.300"/><path d="M0 6 V-4" stroke="#4E7D42" stroke-width="1.600"/>${fl(-6,-8,1)}${fl(6,-8,1)}${fl(0,-13,1.05)}${fl(-1,-4,.95)}${fl(8,-14,.8)}${fl(-8,-15,.8)}`}
    // amaryllis: one big six-pointed trumpet flower on a thick stem
    if(k==='amaryllis')return `<path d="M3 21 Q2 10 -1 2" stroke="#5E9150" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M5 21 q8 -10 12 -14 q-4 9 -9 14Z" fill="#6E9F6B"/><g transform="translate(-2 -4) rotate(-15)">${[...Array(6)].map((_,i)=>`<path d="M0 0 C-4 -5 -3 -13 0 -16 C3 -13 4 -5 0 0Z" fill="${i%2?'#B8242C':'#D33A3A'}" transform="rotate(${i*60})"/>`).join('')}${[...Array(6)].map((_,i)=>`<path d="M0 -2 L0 -10" stroke="#F6C9C2" stroke-width=".9" stroke-linecap="round" transform="rotate(${i*60+30})"/>`).join('')}<circle r="3.300" fill="#7FA35A"/><g fill="#F4D23C">${[...Array(5)].map((_,i)=>`<circle cx="${(6*Math.cos(i*1.26)).toFixed(1)}" cy="${(6*Math.sin(i*1.26)).toFixed(1)}" r="1"/>`).join('')}</g></g>`;
    const pet=['#EE7FA6','#F59BBB'];
    return `${k==='cactus'?'<path d="M-9 18 q0 -12 9 -12 q9 0 9 12Z" fill="#6E9F6B"/><g fill="#F4EBD5"><circle cx="-5" cy="13" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="0" cy="16" r="1"/></g>':lf(-2,14,-60)}<g transform="translate(0 -2)">${[...Array(8)].map((_,i)=>`<ellipse cx="0" cy="-7.500" rx="4" ry="7.500" fill="${pet[i%2]}" transform="rotate(${i*45})"/>`).join('')}<circle r="4" fill="#F7D35A"/><g fill="#E8A92E"><circle cx="-1.500" cy="-1" r=".8"/><circle cx="1.500" cy=".5" r=".8"/><circle cx="0" cy="1.800" r=".8"/></g></g>`;
  }
  const starsSVG=(pos,glow)=>S.goals.filter(g=>g.doneAt).map((g,i)=>{const p=pos[i%pos.length];
    return `<g class="goal-star" data-act="star" data-id="${g.id}" role="button" aria-label="Достигнутая цель: ${esc(g.title)}" transform="translate(${p[0]} ${p[1]})"><circle class="sglow" r="18" fill="url(#${glow})"/><path d="${STAR_D}" fill="#FFE29A" stroke="#F0B43C" stroke-width="1.2"/></g>`}).join('');
  // the windowsill: a pot per goal, up to three; a pot appears when a goal is planted (through «+» → «Цель»)
  function renderWindow(){
    const act=potDemo?Object.keys(SEEDS).map(k=>({id:'',title:PLANTS[k],plant:k,demo:true})):sillGoals();
    const slots=act,n=slots.length,xs=n===1?[140]:n===2?[122,238]:n===3?[98,180,262]:n===4?[88,150,212,274]:n===5?[66,123,180,237,294]:[],sc=n===1?1.15:n===2?1:n===3?.86:n===4?.8:.68,tw=n===3?90:n===4?66:n===5?56:104; // a single pot stands left of the window bar, so stems do not merge with it
    $('pots').innerHTML=xs.map((cx,i)=>{const g=slots[i],st=g?(g.demo?4:stageOf(g)):0,wl=g&&!g.demo?wiltOf(g):0,have=seedKinds().length;
      return `<g class="pot" data-act="${g?'goal':'plant'}"${g?` data-id="${g.id}"`:''} role="button" aria-label="${g?'Цель: '+esc(g.title)+'. '+PLANTS[g.plant]+', '+(wl?wiltWord(g,wl):STAGE[st].toLowerCase()):'Пустой горшок: посадить цель'}" transform="translate(${cx} 227) scale(${sc})">
        <rect x="-46" y="-150" width="92" height="192" fill="transparent"/>
        <ellipse cx="0" cy="1" rx="30" ry="4" fill="#000" opacity=".16"/>
        <path d="M-21 -34 L-17 -2 Q0 3 17 -2 L21 -34Z" fill="#BF6F4D"/><path d="M-21 -34 L-17 -2 Q-12 0 -8 .6 L-11 -34Z" fill="#fff" opacity=".12"/>
        <rect x="-25" y="-43" width="50" height="11" rx="3.5" fill="#CF8160"/><ellipse cx="0" cy="-42" rx="21" ry="3.2" fill="#4E3626"/>
        ${g?`<g transform="translate(0 -42) scale(1.13)"><g class="wilt${wl}"${wl?` filter="url(#wilt${wl})" transform="rotate(${wl===1?5:9}) skewX(${wl===1?-5:-10})"`:''}>${plantSVG(g.plant,st)}</g></g>${wl===2?'<g fill="#B08A4E" opacity=".9"><ellipse cx="-30" cy="-1" rx="5" ry="2.200" transform="rotate(-18 -30 -1)"/><ellipse cx="31" cy="0" rx="4.500" ry="2" transform="rotate(22 31 0)"/></g>':''}${wl?'<g class="droop"><circle cx="-36" cy="-58" r="10" fill="#E9F1F5" stroke="#7FA4B8"/><path d="M-36 -64 q-5 6 -5 8 a5 5 0 0 0 10 0 q0 -2 -5 -8Z" fill="#7FA4B8"/></g>':''}`:''}
        <g transform="translate(0 30)"><rect x="${-tw/2}" y="-10" width="${tw}" height="20" rx="5" fill="#FFFBF2" stroke="#C49A6C"/><text x="0" y="5" text-anchor="middle" font-family="Caveat,cursive" font-weight="700" font-size="14" fill="#5A4130"${(g?g.title.length:14)>(n===3?10:n===4?7:13)?` textLength="${tw-10}" lengthAdjust="spacingAndGlyphs"`:''}>${g?esc(short(g.title,n===3?14:17)):have?'+ Посадить цель':'Нужно семечко'}</text></g>
        ${st===4?'<g class="ripe"><circle cx="40" cy="-58" r="10" fill="#FFE29A" stroke="#F5C24A"/><text x="40" y="-53.5" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="13" fill="#7A4E2A">!</text></g>':''}
      </g>`}).join('');
    $('winStars').innerHTML=starsSVG(WIN_STARS,'starR');
    renderGoalsSec();
  }
  // under the window: every goal — growing on the sill, waiting for a place, reached
  function renderGoalsSec(){
    const t=now(),gs=activeGoals(),stars=S.goals.filter(g=>g.doneAt).length;
    const row=g=>{const ts=goalTasks(g),d=ts.filter(x=>x.done).length,wl=wiltOf(g),st=stageOf(g);
      return `<li><button class="grow" type="button" data-act="goal" data-id="${g.id}"><svg class="gi${g.plant?'':' gseed'}" viewBox="-22 -22 44 44" aria-hidden="true"${g.plant?` style="background:${FRUIT_BG[g.plant]||'var(--paper)'}"`:''}>${g.plant?`<g${wl?` filter="url(#wilt${wl})"`:''}>${fruitSVG(g.plant)}</g>`:'<use href="#f-seed" x="-17" y="-17" width="34" height="34"/>'}</svg>
        <span class="gt"><b>${esc(g.title)}</b><small>${d} из ${cnt(ts.length,'дела','дел','дел')} · ${g.due?(dayDiff(g.due,t)<0?'срок прошёл':'до '+fmtDay(g.due)):''}</small>${!g.plant?`<small class="gw">${sillGoals().length>=POTS?'Ждёт места на подоконнике':'Ждёт семечка'}</small>`:wl?`<small class="gw">${wl===2?'Растение чахнет':'Растение подвяло'}</small>`:''}</span>${ic('i-chev','chev')}</button></li>`};
    $('goalsList').innerHTML=gs.length?gs.map(row).join(''):'<li class="note">Целей пока нет. Цель — несколько дел к одному сроку, ради чего-то большого.</li>';
    $('goalsStars').textContent=stars?`Звёзд за окном: ${stars}`:'';
  }
  // a new goal starts from «+» → «Цель»: a seed is needed first, and it costs feathers; what was typed becomes the goal's name
  let goalPre=null,potDemo=false; // potDemo: the demo panel shows every plant in bloom
  function startPlant(title,taskIds){goalPre={title:title||null,tasks:taskIds||[]};openTalk('goal')}
  // plant a goal that waits: a seed and a free place on the sill are needed
  // a goal taken off the sill loses its plant: to come back it needs a new seed (Ilya, 17 Nov).
  // On a full sill a goal can take the place of another one (swap); that one's plant is gone too.
  function plantGoal(g,kind,swapWith){
    const sw=swapWith&&S.goals.find(y=>y.id===swapWith);
    if(sillGoals().length>=POTS&&!sw){sayOverride='На подоконнике уже три цели. Выбери, вместо какой.';return false}
    const ks=seedKinds();kind=kind||(ks.length===1?ks[0]:null);if(!kind||!stock('seed_'+kind))return false;S.pantry['seed_'+kind]=Math.max(0,stock('seed_'+kind)-1);
    if(sw)unpot(sw);
    g.plant=kind;g.planted=now();return true;
  }
  function unpot(g){g.plant=null;delete g.plantOff;delete g.planted}
  const canPlant=g=>seedKinds().length>0;
  // the room has three screens side by side: Mars's shop, the owl, the window; a swipe moves between them.
  // pane: 0 — the owl (home), 1 — the window, 2 — the shop; on screen the order is shop · owl · window
  let pane=0,paneEnter=false;const PANE_ORDER=[2,0,1],panePos=i=>PANE_ORDER.indexOf(i);
  // what lives under the room depends on the screen: today's tasks, or the goods under Mars
  function paneUI(){
    const shop=pane===2&&view==='home';
    const win=pane===1&&view==='home';
    $('shopSec').hidden=!shop;$('goalsSec').hidden=!win;$('todaySec').hidden=shop||win;
    $('say').hidden=shop;$('marsSay').hidden=!shop;$('owlName').textContent=shop?'Марс':(S.owlName||'Сова');
    if(shop){renderShop();if(paneEnter)marsMaybeAway();if(marsAway){$('owlName').textContent='Лавка';$('marsSay').textContent='В лавке никого. На прилавке звонок.'}else{if(!marsSay)marsSay=marsHello();$('marsSay').textContent=marsSay}}
    else{marsSay=null;if(pane===0&&sayOverride&&!tourOn){$('say').textContent=sayOverride;sayOverride=null}}
    paneEnter=false;
  }
  function setDots(){document.querySelectorAll('.rdot').forEach(d=>{const on=+d.dataset.pane===pane;d.classList.toggle('on',on);on?d.setAttribute('aria-current','true'):d.removeAttribute('aria-current')});const gt=$('goalsThing');if(gt){view==='home'&&pane===1?gt.setAttribute('aria-current','page'):gt.removeAttribute('aria-current')}}
  let paneLock=0;
  function showPane(i,smooth){const p=$('pager'),was=pane;pane=i;if(was!==i&&i===2)paneEnter=true;paneLock=Date.now()+700;setDots();if(i)closeCareSafe();if(was!==i||i===2)paneUI();
    p.scrollTo({left:panePos(i)*p.clientWidth,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'auto'})}
  // follow the swipe at once; while showPane() is scrolling by itself, wait until the room has settled
  let paneT;
  function paneSync(){const p=$('pager');if(!p.clientWidth||view!=='home')return;const i=PANE_ORDER[Math.round(p.scrollLeft/p.clientWidth)];if(i!==undefined&&i!==pane){if(i===2)paneEnter=true;pane=i;setDots();if(i)closeCareSafe();paneUI()}}
  $('pager').addEventListener('scroll',()=>{if(Date.now()>paneLock)paneSync();clearTimeout(paneT);paneT=setTimeout(paneSync,160)},{passive:true});
  $('roomDots').addEventListener('click',e=>{const b=e.target.closest('.rdot');if(b)showPane(+b.dataset.pane,true)});
  addEventListener('resize',()=>{if(view==='home')showPane(pane)});
  // the next task of a goal on the sill that is not in a plan yet (late ones first)
  const nextGoalStep=()=>sillGoals().map(g=>[g,goalTasks(g).filter(x=>!x.done&&!x.planned).sort((a,b)=>(a.due||'9').localeCompare(b.due||'9'))[0]]).find(p=>p[1]);
  function stepToToday(g,x){x.planned=planDay()}
  let openGoalId=null,goalDel=null,goalPick=null,goalSeed=false,goalSwap=false,goalDist=false,goalUnpot=false;
  function openGoal(id){
    const g=S.goals.find(x=>x.id===id);if(!g)return closeGoal();if(openGoalId!==id){goalPick=null;goalSeed=false;goalDel=null;goalSwap=false;goalDist=false;goalUnpot=false}openGoalId=id;
    const st=stageOf(g),ts=goalTasks(g).sort((a,b)=>a.done-b.done||(a.due||'9').localeCompare(b.due||'9')),d=ts.filter(x=>x.done).length,wl=wiltOf(g),t=now(),lt=wl?lateTask(g):null;
    const taskRowG=x=>`<li class="gstep ${x.done?'done':''}"><button class="box" type="button" data-g="done" data-v="${x.id}" aria-label="${x.done?'Вернуть':'Отметить'}: ${esc(x.title)}">${ic('i-check')}</button>
      <button class="gtitle" type="button" data-g="edit" data-v="${x.id}"><span>${esc(x.title)}</span>${(x.steps.length||x.due)&&!x.done?`<small>${x.steps.length?`${ic('i-steps','mi')}${x.steps.filter(y=>y.done).length}/${x.steps.length} `:''}${x.due?`${ic('i-flag','mi')}${dueLabel(x.due,t).txt}`:''}</small>`:''}</button>
      ${x.done?'':x.planned===planDay()?`<span class="gtag">в плане</span>`:`<button class="gtoday" type="button" data-g="today" data-v="${x.id}">${closed()?'На завтра':'В сегодня'}</button>`}</li>`;
    const pickable=S.tasks.filter(x=>!x.done&&!x.goal&&!x.repeat);
    const full=sillGoals().length>=POTS;
    const sill=g.plant?(goalUnpot?`<div class="gnote"><span>Убрать «${esc(short(g.title,24))}» с подоконника? Растение не сохранится. Чтобы посадить цель снова, понадобится новое семечко.</span><div class="actions"><button class="secondary" type="button" data-g="unpot">Да, убрать</button><button class="secondary" type="button" data-g="unpotno">Оставить</button></div></div>`:`<p class="gmeta water">Росток растёт, когда ты делаешь дела этой цели.</p>`)
      :!canPlant(g)?`<div class="gnote"><span>${full?'На подоконнике три цели. ':''}Чтобы цель росла на подоконнике, нужно семечко.</span><button class="secondary" type="button" data-g="shop">В лавку</button></div>`
      :goalSeed?`<div class="gnote"><span>Какое семечко посадим?</span><div class="actions">${seedKinds().map(k=>`<button class="secondary" type="button" data-g="seed" data-v="${k}">${PLANTS[k]}</button>`).join('')}</div></div>`
      :goalSwap?`<div class="gnote"><span>Вместо какой цели? Она останется в целях, а её растение уйдёт с подоконника. Посадить её снова можно будет новым семечком.</span><div class="actions">${sillGoals().map(y=>`<button class="secondary" type="button" data-g="swap" data-v="${y.id}">${esc(short(y.title,22))}</button>`).join('')}<button class="secondary" type="button" data-g="swapno">Отмена</button></div></div>`
      :full?`<div class="gnote"><span>На подоконнике уже три цели.</span><button class="primary" type="button" data-g="swapstart">Посадить вместо другой</button></div>`
      :`<button class="primary" type="button" data-g="plant">Посадить на подоконник</button>`;
    const lists=[{id:'inbox',name:'Входящие'},...S.lists];
    const distRow=x=>`<li class="gstep"><span class="gtitle"><span>${esc(x.title)}</span></span><select data-dist="${x.id}" aria-label="Куда перенести «${esc(x.title)}»"><option value="">в цели</option>${lists.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></li>`;
    $('goalSheet').innerHTML=`<div class="sheet goal-sheet" role="dialog" aria-modal="true" aria-label="Цель: ${esc(g.title)}">
      <div class="ed-top"><span></span><span class="grab"></span><span></span></div>
      <div class="goal-head"><svg class="gi${g.plant?'':' gseed'}" viewBox="-22 -22 44 44" aria-hidden="true"${g.plant?` style="background:${FRUIT_BG[g.plant]||'var(--paper)'}"`:''}>${g.plant?`<g${wl?` filter="url(#wilt${wl})"`:''}>${fruitSVG(g.plant)}</g>`:'<use href="#f-seed" x="-17" y="-17" width="34" height="34"/>'}</svg><div><small>${g.plant?PLANTS[g.plant]+' · '+(wl?wiltWord(g,wl):STAGE[st]):'Не на подоконнике'}</small><h2>${esc(g.title)}</h2></div></div>
      <label class="gdue">${ic('i-flag','mi')}<span>Срок: <b>${g.due?fmtDay(g.due):'не задан'}</b>${g.due?` · ${dueLeft(g.due)}`:''}</span><input type="date" id="gDue" value="${g.due||''}" aria-label="Срок цели"></label>
      ${wl&&lt?`<div class="gnote warn"><span>${wl===2?'Растение чахнет':'Растение подвяло'}: «${esc(short(lt.title,40))}» ${lt.due&&dayDiff(lt.due,t)<0?'ждёт с '+fmtDay(lt.due):'ждёт своей очереди'}.</span>${lt.planned===planDay()?'':`<button class="secondary" type="button" data-g="today" data-v="${lt.id}">${closed()?'На завтра':'В сегодня'}</button>`}</div>`:''}
      ${g.why?`<p class="gmeta"><b>Зачем:</b> ${esc(g.why)}</p>`:''}${g.doneWhen?`<p class="gmeta"><b>Как пойму:</b> ${esc(g.doneWhen)}</p>`:''}
      <div class="sec-head"><h3>Дела</h3><span class="count">${d} из ${ts.length}</span></div>
      ${goalDist?`<p class="gmeta">Куда перенести каждое дело? Перенесённое уходит из цели.</p><ul class="lgroup">${ts.filter(x=>!x.done).map(distRow).join('')}</ul><button class="secondary" type="button" data-g="distno">Готово</button>`:`<ul class="lgroup">${ts.map(taskRowG).join('')}</ul>`}
      ${goalDist?'':goalPick?`<div class="gpick"><p class="gmeta">Какие дела добавить в цель?</p><ul class="lgroup">${pickable.map(x=>`<li><button class="pick" type="button" data-g="pick" data-v="${x.id}" aria-pressed="${goalPick.includes(x.id)}"><span class="box">${ic('i-check')}</span><span>${esc(x.title)}</span><span class="src">${esc(listName(x.list))}</span></button></li>`).join('')}</ul>
        <div class="actions"><button class="primary" type="button" data-g="pickdone" ${goalPick.length?'':'disabled'}>Добавить${goalPick.length?' · '+goalPick.length:''}</button><button class="secondary" type="button" data-g="pickno">Отмена</button></div></div>`
       :`<form class="inline" id="gAdd"><input id="gAddIn" placeholder="Новое дело для цели" aria-label="Новое дело цели" autocomplete="off"><button type="submit">Добавить</button></form>
      <div class="glinks">${pickable.length?'<button class="link" type="button" data-g="pickstart">+ Взять дела из списков</button>':''}${ts.some(x=>!x.done)?'<button class="link" type="button" data-g="dist">Разложить дела по спискам</button>':''}</div>`}
      ${sill}
      ${st===4?'<button class="primary" type="button" data-g="harvest">Зажечь звезду</button>':'<button class="secondary" type="button" data-g="talk">Поговорить о цели</button>'}
      ${g.plant&&!goalUnpot?'<button class="link" type="button" data-g="unpotask" style="align-self:flex-start">Убрать с подоконника</button>':''}
      ${goalDel===g.id?`<div class="empty" style="text-align:left;align-items:flex-start">Удалить цель? Её дела останутся в списках.<div class="actions"><button class="secondary" type="button" data-g="del">Да, удалить</button><button class="secondary" type="button" data-g="keep">Оставить</button></div></div>`:'<button class="danger" type="button" data-g="askdel" style="align-self:flex-start">Удалить цель</button>'}
    </div>`;
    sheetShow($('goalSheet'));document.body.style.overflow='hidden';
    if($('gAdd'))$('gAdd').onsubmit=e=>{e.preventDefault();const v=$('gAddIn').value.trim();if(!v)return;S.tasks.push({id:uid(),title:v,list:'goals',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:null,done:false,doneAt:null,created:now(),goal:g.id});save();openGoal(id);render();setTimeout(()=>{const i=$('gAddIn');if(i)i.focus()},30)};
    $('goalSheet').querySelectorAll('select[data-dist]').forEach(sel=>sel.onchange=()=>{const y=S.tasks.find(z=>z.id===sel.dataset.dist);if(!y||!sel.value)return;y.list=sel.value;delete y.goal;save();openGoal(id);render()});
    $('gDue').onchange=e=>{if(e.target.value){g.due=e.target.value;save();openGoal(id);render()}};
  }
  function closeGoal(){sheetHide($('goalSheet'));document.body.style.overflow='';openGoalId=null;goalDel=null;goalPick=null;goalSeed=false;goalSwap=false;goalDist=false;goalUnpot=false}
  function dropGoal(g){S.tasks.forEach(x=>{if(x.goal===g.id){delete x.goal;if(x.list==='goals')x.list='inbox'}});S.goals=S.goals.filter(x=>x!==g)}
  $('goalSheet').addEventListener('click',e=>{
    if(e.target===$('goalSheet'))return closeGoal();
    const b=e.target.closest('[data-g]');if(!b||b.tagName==='LABEL')return;const g=S.goals.find(x=>x.id===openGoalId);if(!g)return;const a=b.dataset.g,x=S.tasks.find(y=>y.id===b.dataset.v);
    if(a==='done'&&x){toggleDone(x,null);return openGoal(g.id)}
    else if(a==='edit'&&x){closeGoal();return openEditor(x.id)}
    else if(a==='today'&&x){stepToToday(g,x);sayOverride=closed()?'Добавила это дело на завтра.':'Добавила это дело на сегодня.'}
    else if(a==='pickstart')goalPick=[];else if(a==='pickno')goalPick=null;
    else if(a==='pick'){const v=b.dataset.v;goalPick=goalPick.includes(v)?goalPick.filter(y=>y!==v):goalPick.concat(v)}
    else if(a==='pickdone'){goalPick.forEach(v=>{const y=S.tasks.find(z=>z.id===v);if(y)y.goal=g.id});goalPick=null}
    else if(a==='dist')goalDist=true;else if(a==='distno')goalDist=false;
    else if(a==='swapstart')goalSwap=true;else if(a==='swapno')goalSwap=false;
    else if(a==='swap'){const was=S.goals.find(y=>y.id===b.dataset.v);if(seedKinds().length>1){goalSwap=b.dataset.v;goalSeed=true}
      else if(plantGoal(g,null,b.dataset.v)){closeGoal();sayOverride=`Посадила «${short(g.title,20)}» вместо «${short(was.title,16)}».`;save();render();return showPane(1,true)}}
    else if(a==='unpotask')goalUnpot=true;else if(a==='unpotno')goalUnpot=false;
    else if(a==='unpot'){unpot(g);closeGoal();sayOverride=`Убрала «${short(g.title,24)}» с подоконника. Цель осталась в списке целей.`;save();render();return}
    else if(a==='plant'){if(seedKinds().length>1)goalSeed=true;else if(plantGoal(g)){closeGoal();sayOverride=`Посадила! ${PLANTS[g.plant]} «${short(g.title,24)}» на подоконнике.`;save();render();return showPane(1,true)}}
    else if(a==='seed'){const swId=typeof goalSwap==='string'?goalSwap:null,was=swId&&S.goals.find(z=>z.id===swId);if(plantGoal(g,b.dataset.v,swId)){closeGoal();sayOverride=was?`Посадила ${PLANTS[g.plant].toLowerCase()} «${short(g.title,20)}» вместо «${short(was.title,16)}».`:`Посадила! ${PLANTS[g.plant]} «${short(g.title,24)}» на подоконнике.`;save();render();return showPane(1,true)}}
    else if(a==='shop'){closeGoal();marsSay='Семечко для цели? Прошу, выбирайте, сударыня.';return go('shop')}
    else if(a==='harvest'){closeGoal();return openTalk('harvest',g)}
    else if(a==='talk'){closeGoal();return openTalk('goalcheck',g)}
    else if(a==='askdel')goalDel=g.id;else if(a==='keep')goalDel=null;
    else if(a==='del'){dropGoal(g);closeGoal();sayOverride='Убрала цель. Её дела остались в списках.';save();return render()}
    save();openGoal(g.id);render();
  });
  function munch(k){
    const room=document.querySelector('.room');if(!room||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const r=room.getBoundingClientRect(),sc=$('scene').getBoundingClientRect();
    const m=document.createElement('div');m.className='munch';m.innerHTML=`<svg width="42" height="42"><use href="#f-${k}"/></svg>`;
    m.style.left=(r.left-sc.left+r.width*.5-21)+'px';m.style.top=(r.top-sc.top+r.height*.56-21)+'px';
    $('scene').appendChild(m);setTimeout(()=>m.remove(),1200);
  }

  let listMenu=false,showListDone=false,gatherSel=[];
  function renderList(t){
    const l=S.lists.find(x=>x.id===openList);if(!l){go('lists');return}
    $('listTitle').innerHTML=`<i class="ldot" style="background:${listColor(l.id)}" aria-hidden="true"></i>${esc(l.name)}`;
    const open=S.tasks.filter(x=>x.list===l.id&&!x.done).sort((a,b)=>(a.due||'9').localeCompare(b.due||'9'));
    const done=S.tasks.filter(x=>x.list===l.id&&x.done);
    $('listTasks').innerHTML=open.length?open.map(x=>taskRow(x,t,{plus:!x.repeat,lock:closed()})).join(''):'<li class="note">В списке пока ничего нет. Добавь дело кнопкой «+».</li>';
    $('listDone').innerHTML=done.length?`<button class="link" type="button" data-act="toggleListDone">${showListDone?'Скрыть сделанные':'Показать сделанные'} (${done.length})</button>${showListDone?`<ul class="list" style="margin-top:10px">${done.map(x=>taskRow(x,t,{})).join('')}</ul>`:''}`:'';
    $('listDanger').innerHTML=confirmDel===l.id?`<div class="empty" style="text-align:left;align-items:flex-start">Удалить список «${esc(l.name)}»? Его дела переедут во «Входящие».<div class="actions"><button class="secondary" type="button" data-act="delList" data-list="${l.id}">Да, удалить</button><button class="secondary" type="button" data-act="cancelDel">Оставить</button></div></div>`
      :listMenu==='rename'?`<form class="inline" id="renameForm"><input id="renameInput" value="${esc(l.name)}" aria-label="Новое название списка" autocomplete="off"><button type="submit">Сохранить</button></form>`
      :listMenu==='gather'?(()=>{const free=open.filter(x=>!x.goal&&!x.repeat);return `<div class="gpick menu"><p class="gmeta">Отметь дела, которые станут одной целью.</p><ul class="lgroup">${free.map(x=>`<li><button class="pick" type="button" data-act="gatherPick" data-id="${x.id}" aria-pressed="${gatherSel.includes(x.id)}"><span class="box">${ic('i-check')}</span><span>${esc(x.title)}</span></button></li>`).join('')||'<li class="note">Свободных дел нет: все уже в целях.</li>'}</ul>
        <div class="actions"><button class="primary" type="button" data-act="gatherGo" ${gatherSel.length?'':'disabled'}>Собрать в цель${gatherSel.length?' · '+gatherSel.length:''}</button><button class="secondary" type="button" data-act="listMenu">Отмена</button></div></div>`})()
      :listMenu==='color'?`<div class="menu"><div class="swatches" role="group" aria-label="Цвет списка">${PALETTE.map(([c,n])=>`<button class="sw" type="button" data-act="listColor" data-c="${c}" style="background:${c}" aria-label="${n}" aria-pressed="${listColor(l.id)===c}"></button>`).join('')}</div></div>`
      :listMenu?`<div class="menu"><button class="po" type="button" data-act="renameList">Переименовать</button><button class="po" type="button" data-act="gatherList">Собрать дела в цель</button><button class="po" type="button" data-act="colorList"><span>Цвет</span><i class="ldot" style="background:${listColor(l.id)}"></i></button><button class="po dangerous" type="button" data-act="askDel" data-list="${l.id}">Удалить список</button></div>`:'';
    const rf=$('renameForm');if(rf){const i=$('renameInput');i.focus();i.select();rf.onsubmit=e=>{e.preventDefault();const v=i.value.trim();if(v)l.name=v;listMenu=false;render()}}
  }
  let confirmDel=null;

  /* ---------- editor ---------- */
  let E=null; // {id|null, draft}
  function openEditor(id,preset){
    const x=id?S.tasks.find(y=>y.id===id):null;
    E={id,draft:x?JSON.parse(JSON.stringify(x)):Object.assign({id:uid(),title:'',list:view==='list'&&openList?openList:'inbox',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:null,done:false,doneAt:null,created:now()},preset||{})};
    E.anim=true;drawEditor();sheetShow($('editor'));document.body.style.overflow='hidden';
    setTimeout(()=>{const i=$('edTitle');if(i&&!id)i.focus()},60);
  }
  function closeEditor(){sheetHide($('editor'));document.body.style.overflow='';E=null;render()}
  const fmtDue=k=>{const d=dayDiff(k,now());if(d===0)return 'сегодня';if(d===1)return 'завтра';if(d===-1)return 'вчера';return new Date(keyToTime(k)).toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'long'})};
  const fmtRem=ms=>{const k=dayKey(ms),d=dayDiff(k,now());const day=d===0?'сегодня':d===1?'завтра':new Date(ms).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});return day+' в '+fmtTime(ms)};
  const toLocal=ms=>{const r=new Date(ms);return `${r.getFullYear()}-${pad(r.getMonth()+1)}-${pad(r.getDate())}T${pad(r.getHours())}:${pad(r.getMinutes())}`};
  function drawEditor(){
    const d=E.draft,isNew=!E.id,t=now(),pd=planDay(),cl=closed(),P=E.pop;
    const attr=(icon,text,key,cls)=>`<div class="attr ${cls||''}"><button type="button" data-ed="open" data-v="${key}">${ic(icon,'mi')}<span>${text}</span></button><button class="x" type="button" data-ed="clear" data-v="${key}" aria-label="Убрать">${ic('i-x')}</button></div>`;
    const attrs=[
      d.planned===pd&&!d.repeat?attr('i-starf',cl?'На завтра':'На сегодня','plan'):'',
      d.due?attr('i-flag','Срок: '+fmtDue(d.due),'due',dayDiff(d.due,t)<0?'warn':''):'',
      d.repeat?attr('i-repeat','Повтор: '+repeatLabel(d),'repeat'):'',
      d.reminder?attr('i-bell','Напомню '+fmtRem(d.reminder),'rem'):''].join('');
    const showSteps=d.steps.length||E.steps;
    const steps=showSteps?`<div class="steps">${d.steps.map(s=>`<div class="stepr ${s.done?'done':''}"><button class="box" type="button" data-ed="step" data-v="${s.id}" aria-label="Отметить шаг">${ic('i-check')}</button><span>${esc(s.title)}</span><button class="del" type="button" data-ed="delstep" data-v="${s.id}" aria-label="Удалить шаг">${ic('i-x')}</button></div>`).join('')}
        <form class="inline" id="edStepForm"><input id="edStep" placeholder="${d.steps.length?'Следующий шаг':'Первый шаг'}" aria-label="Новый шаг" autocomplete="off"><button type="submit">+</button></form></div>`:'';
    const po=(key,label,pressed,extra)=>`<button class="po" type="button" data-ed="${key}" ${extra||''} aria-pressed="${!!pressed}"><span>${label}</span></button>`;
    let pop='';const popNew=P!==E.popWas;E.popWas=P;
    if(P==='due'){
      const sat=(()=>{const x=new Date(t);return dayKey(t+(((6-x.getDay()+7)%7)||7)*D)})();
      const opts=[['0','Сегодня',dayKey(t)],['1','Завтра',dayKey(t+D)],['sat','В субботу',sat],['7','Через неделю',dayKey(t+7*D)]];
      pop=`<div class="pop${popNew?' fresh':''}"><h3>Крайний срок</h3>${opts.map(([v,l,k])=>`<button class="po" type="button" data-ed="dueset" data-v="${k}" aria-pressed="${d.due===k}"><span>${l}</span><small>${new Date(keyToTime(k)).toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'})}</small></button>`).join('')}
        <label class="po"><span>Другая дата</span><input type="date" id="edDue" value="${d.due||''}"></label>
        <button class="po" type="button" data-ed="open" data-v="repeat" aria-pressed="${d.repeat}"><span>Повторять…</span>${d.repeat?`<small>${repeatLabel(d)}</small>`:''}</button>
        ${d.due?'<button class="po dangerous" type="button" data-ed="clear" data-v="due"><span>Без срока</span></button>':''}</div>`;
    }else if(P==='rep'){
      const ds=d.repeat?(d.days&&d.days.length?d.days:[0,1,2,3,4,5,6]):[],same=a=>d.repeat&&a.length===ds.length&&a.every(i=>ds.includes(i));
      pop=`<div class="pop${popNew?' fresh':''}"><h3>Повторять</h3>
        <button class="po" type="button" data-ed="repset" data-v="all" aria-pressed="${same([0,1,2,3,4,5,6])}"><span>Каждый день</span></button>
        <button class="po" type="button" data-ed="repset" data-v="1,2,3,4,5" aria-pressed="${same([1,2,3,4,5])}"><span>По будням</span></button>
        <button class="po" type="button" data-ed="repset" data-v="6,0" aria-pressed="${same([6,0])}"><span>По выходным</span></button>
        <div class="wdays" role="group" aria-label="Дни недели">${WEEK_ORDER.map(i=>`<button class="wd" type="button" data-ed="repday" data-v="${i}" aria-pressed="${d.repeat&&ds.includes(i)}">${WD[i]}</button>`).join('')}</div>
        ${d.repeat?'<button class="po dangerous" type="button" data-ed="clear" data-v="repeat"><span>Не повторять</span></button>':''}</div>`;
    }else if(P==='goal'){
      pop=`<div class="pop${popNew?' fresh':''}"><h3>Цель</h3>${activeGoals().map(g=>`<button class="po" type="button" data-ed="goalset" data-v="${g.id}" aria-pressed="${d.goal===g.id}"><span>${esc(g.title)}</span></button>`).join('')}
        ${d.goal?'<button class="po dangerous" type="button" data-ed="goalset" data-v=""><span>Не в цели</span></button>':''}</div>`;
    }else if(P==='rem'){
      const h=hourOf(t),eve=at(t,19),morn=at(t,9,1);
      pop=`<div class="pop${popNew?' fresh':''}"><h3>Напомнить</h3>
        ${h<19?`<button class="po" type="button" data-ed="remset" data-v="${eve}" aria-pressed="${d.reminder===eve}"><span>Сегодня вечером</span><small>19:00</small></button>`:''}
        <button class="po" type="button" data-ed="remset" data-v="${morn}" aria-pressed="${d.reminder===morn}"><span>Завтра утром</span><small>9:00</small></button>
        <label class="po"><span>Другое время</span><input type="datetime-local" id="edRem" value="${d.reminder?toLocal(d.reminder):''}"></label>
        ${d.reminder?'<button class="po dangerous" type="button" data-ed="clear" data-v="rem"><span>Не напоминать</span></button>':''}</div>`;
    }else if(P==='list'){
      const lists=[{id:'inbox',name:'Входящие'},...S.lists];
      pop=`<div class="pop${popNew?' fresh':''}"><h3>Список</h3>${lists.map(l=>`<button class="po" type="button" data-ed="list" data-v="${l.id}" aria-pressed="${d.list===l.id}"><span style="display:flex;gap:10px;align-items:center"><i class="ldot" style="background:${l.id==='inbox'?'var(--muted)':listColor(l.id)}"></i>${esc(l.name)}</span></button>`).join('')}
        ${E.newList?'<form class="inline" id="edListForm"><input id="edListName" placeholder="Название списка" aria-label="Название нового списка" autocomplete="off"><button type="submit">Создать</button></form>':'<button class="po" type="button" data-ed="newlist" style="color:var(--accent-ink)"><span>+ Новый список</span></button>'}</div>`;
    }
    const tb=(key,icon,label,on)=>`<button class="tb" type="button" data-ed="${key}" aria-pressed="${!!on}">${ic(icon)}<span>${label}</span></button>`;
    $('editor').innerHTML=`<div class="sheet ed ${E.anim?'anim':''}" role="dialog" aria-modal="true" aria-label="${isNew?'Новое дело':'Дело'}">
      <div class="ed-top"><span></span><span class="grab"></span><button class="primary ed-save" type="button" data-ed="save">${isNew?'Добавить':'Готово'}</button></div>
      ${isNew?'<div class="seg" role="group" aria-label="Что добавляем"><button class="segb on" type="button" aria-pressed="true">Дело</button><button class="segb" type="button" data-ed="asgoal" aria-pressed="false">Цель</button></div>':''}
      <input type="text" class="ed-title" id="edTitle" placeholder="Новое дело" aria-label="Название" value="${esc(d.title)}" autocomplete="off" enterkeyhint="done">
      ${attrs?`<div class="attrs">${attrs}</div>`:''}
      ${steps}
      <button class="listrow" type="button" data-ed="open" data-v="list"><i class="ldot" style="background:${d.list==='inbox'?'var(--muted)':listColor(d.list)}"></i><span class="lbl">Список</span><b>${esc(listName(d.list))}</b>${ic('i-chev','chev')}</button>
      ${activeGoals().length||d.goal?`<button class="listrow" type="button" data-ed="open" data-v="goal">${ic('i-sprout','mi')}<span class="lbl">Цель</span><b>${d.goal?esc(short((S.goals.find(g=>g.id===d.goal)||{title:'—'}).title,26)):'нет'}</b>${ic('i-chev','chev')}</button>`:''}
      ${pop}
      ${isNew?'':'<button class="ed-del" type="button" data-ed="delete">Удалить дело</button>'}
      <div class="edbar">
        ${d.repeat?'':tb('plan',d.planned===pd?'i-starf':'i-star',cl?'Завтра':'Сегодня',d.planned===pd)}
        ${tb('open-due','i-flag','Срок',P==='due'||d.due)}
        ${tb('open-rem','i-bell','Напомнить',P==='rem'||d.reminder)}
        ${tb('open-steps','i-steps','Шаги',showSteps)}
      </div>
    </div>`;
    E.anim=false;
    const ti=$('edTitle');ti.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commit()}};
    if($('edListForm')){$('edListName').focus();$('edListForm').onsubmit=e=>{e.preventDefault();syncFields();const v=$('edListName').value.trim();if(!v)return;const l={id:uid(),name:v};S.lists.push(l);E.draft.list=l.id;E.newList=false;E.pop=null;drawEditor()}}
    if($('edStepForm'))$('edStepForm').onsubmit=e=>{e.preventDefault();syncFields();const v=$('edStep').value.trim();if(!v)return;E.draft.steps.push({id:uid(),title:v,done:false});drawEditor();$('edStep').focus()};
    if($('edDue'))$('edDue').onchange=e=>{syncFields();E.draft.due=e.target.value||null;E.pop=null;drawEditor()};
    if($('edRem'))$('edRem').onchange=e=>{syncFields();const v=e.target.value;E.draft.reminder=v?new Date(v).getTime():null;E.draft.reminded=false;E.pop=null;drawEditor()};
    if(E.focusStep&&$('edStep')){$('edStep').focus();E.focusStep=false}
  }
  function syncFields(){if($('edTitle'))E.draft.title=$('edTitle').value.trim()}
  $('editor').addEventListener('click',e=>{
    if(e.target===$('editor'))return closeEditor();
    const b=e.target.closest('[data-ed]');if(!b)return;
    if(b.tagName==='LABEL')return;
    const a=b.dataset.ed,v=b.dataset.v,d=E.draft;
    if(a==='close')return closeEditor();
    syncFields();
    if(a==='asgoal'){const t=E.draft.title;closeEditor();return startPlant(t)}
    if(a==='save')return commit();
    if(a==='delete'){S.tasks=S.tasks.filter(y=>y.id!==E.id);return closeEditor()}
    if(a==='open'){if(v==='plan'){d.planned=null}else if(v==='repeat'){E.pop='rep'}else E.pop=E.pop===v?null:v}
    else if(a.startsWith('open-')){const k=a.slice(5);if(k==='steps'){E.steps=true;E.focusStep=true;E.pop=null}else E.pop=E.pop===k?null:k}
    else if(a==='clear'){if(v==='due')d.due=null;else if(v==='rem'){d.reminder=null;d.reminded=false}else if(v==='repeat'){d.repeat=false;delete d.days}else if(v==='plan')d.planned=null;E.pop=null}
    else if(a==='plan'){d.planned=d.planned===planDay()?null:planDay()}
    else if(a==='dueset'){d.due=v;E.pop=null}
    else if(a==='repeat'){d.repeat=!d.repeat;if(d.repeat)E.pop=null}
    else if(a==='repset'){d.repeat=true;if(v==='all')delete d.days;else d.days=v.split(',').map(Number);E.pop=null}
    else if(a==='repday'){const i=+v;let ds=d.repeat?(d.days&&d.days.length?[...d.days]:[0,1,2,3,4,5,6]):[];ds=ds.includes(i)?ds.filter(y=>y!==i):ds.concat(i);
      if(!ds.length){d.repeat=false;delete d.days}else{d.repeat=true;if(ds.length===7)delete d.days;else d.days=ds}}
    else if(a==='remset'){d.reminder=Number(v);d.reminded=false;E.pop=null}
    else if(a==='list'){d.list=v;E.pop=null}
    else if(a==='goalset'){if(v)d.goal=v;else{delete d.goal;if(d.list==='goals')d.list='inbox'}E.pop=null}
    else if(a==='newlist')E.newList=true;
    else if(a==='step'){const s=d.steps.find(y=>y.id===v);if(s){s.done=!s.done;if(E.id)gain(s.done?2:-2)}}
    else if(a==='delstep')d.steps=d.steps.filter(y=>y.id!==v);
    drawEditor();
  });
  function commit(){
    syncFields();const d=E.draft;if(!d.title){$('edTitle').focus();$('edTitle').placeholder='Сначала напиши, что нужно сделать';return}
    if(d.repeat&&d.list==='inbox')d.list=S.lists[0]?S.lists[0].id:'inbox';
    if(d.repeat&&d.planned===today()&&!d.done&&!repeatsOn(d,today()))d.planned=null;
    if(E.id){const i=S.tasks.findIndex(y=>y.id===E.id);if(i>=0){if(S.tasks[i].planned===today()&&d.planned!==today()&&!S.tasks[i].done)unseeToday(d);S.tasks[i]=d}}else{S.tasks.push(d);sayOverride=d.planned===planDay()?'Добавила в план на '+(closed()?'завтра.':'сегодня.'):d.list==='inbox'?'Записала во «Входящие». Разберём потом.':`Добавила в список «${listName(d.list)}».`}
    closeEditor();
  }

  /* ---------- actions ---------- */
  function toggleDone(x,row){
    x.done=!x.done;x.doneAt=x.done?now():null;
    const g=x.goal&&S.goals.find(y=>y.id===x.goal);
    if(x.done){if(!x.planned)x.planned=today();gain(4);
      if((S.missStreak||0)>0){S.missStreak=0;sayOverride=pick(['Ты вернулась! Я больше не дуюсь.','Ух-ху! Я оттаяла. Так держать!'])}
      else if(g)sayOverride=goalDone(g)?`«${short(g.title,22)}»: все дела сделаны! Загляни к окну.`:g.plant?`Ух-ху! Росток «${short(g.title,26)}» подрос.`:`Ух-ху! Цель «${short(g.title,24)}» стала ближе.`;
      if(row)row.classList.add('done','leaving');
      const all=view==='home'&&status().allDone;
      save();owlReact(all);setTimeout(render,750);return}
    gain(-4);render();
  }
  // swipe a today row: right — done, left — tomorrow
  let sw=null,swClick=false;
  document.addEventListener('pointerdown',e=>{const r=e.target.closest('.swipe .row');if(!r||e.button>0)return;sw={el:r,li:r.parentElement,x:e.clientX,y:e.clientY,dx:0,on:false}});
  document.addEventListener('pointermove',e=>{if(!sw)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y;
    if(!sw.on){if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.3){sw.on=true;sw.li.classList.add('dragging');try{sw.el.setPointerCapture(e.pointerId)}catch(_){}}else if(Math.abs(dy)>12){sw=null;return}else return}
    const x=S.tasks.find(y=>y.id===sw.li.dataset.id);sw.dx=(x&&x.repeat)?Math.max(0,dx):dx;
    sw.el.style.transform=`translateX(${sw.dx}px)`;sw.li.dataset.dir=sw.dx>=0?'r':'l';sw.li.classList.toggle('armed',Math.abs(sw.dx)>90)});
  const swEnd=()=>{if(!sw)return;const s=sw;sw=null;if(!s.on)return;swClick=true;setTimeout(()=>swClick=false,80);s.li.classList.remove('dragging');
    const x=S.tasks.find(y=>y.id===s.li.dataset.id);
    if(x&&s.dx>90){S.swiped=true;s.el.style.transform='translateX(105%)';setTimeout(()=>toggleDone(x,null),160)}
    else if(x&&s.dx<-90){S.swiped=true;s.el.style.transform='translateX(-105%)';setTimeout(()=>{x.planned=dayKey(now()+D);sayOverride=pick(['Хорошо, перенесла на завтра.','Ладно, завтра так завтра.']);render()},160)}
    else s.el.style.transform=''};
  document.addEventListener('pointerup',swEnd);document.addEventListener('pointercancel',()=>{if(sw){sw.el.style.transform='';sw.li.classList.remove('dragging');sw=null}});
  // care panel: tap the owl to see mood and hunger, feed right here
  let careFeedOpen=false;
  let careQuiet=0;
  function openCare(feed){if(view!=='home')go('home');if(pane)showPane(0);careFeedOpen=!!feed;$('care').hidden=false;renderCare();careY=scrollY;if(feed&&scrollY>0){careQuiet=Date.now()+900;careY=0;window.scrollTo({top:0,behavior:'smooth'})}}
  function closeCare(){$('care').hidden=true;careFeedOpen=false}
  function renderCare(){
    const st=status(),mood=$('scene').dataset.mood||preview||st.mood;
    renderTags(mood);
    const f=$('careFeed');
    if(!careFeedOpen){f.innerHTML=`<button class="care-btn" type="button" data-care="open"><svg aria-hidden="true"><use href="#${S.sick?'f-pill':'i-bowl'}"/></svg>${S.sick?'Вылечить':'Покормить'}</button>`;return}
    const items=[];
    if(S.sick)items.push(stock('pill')?`<button class="pan" type="button" data-care="pill" aria-label="Дать лекарство"><svg aria-hidden="true"><use href="#f-pill"/></svg>×${stock('pill')}</button>`:'');
    Object.keys(FOOD).forEach(k=>{if(stock(k))items.push(`<button class="pan" type="button" data-care="${k}" aria-label="Дать: ${FOOD[k].name}" ${S.hunger>=95?'disabled':''}><svg aria-hidden="true"><use href="#f-${k}"/></svg>×${stock(k)}</button>`)});
    const any=items.some(Boolean);
    f.innerHTML=(any?items.join(''):`<span class="care-empty">${S.sick?'Лекарства нет.':'Запасы пусты.'}</span>`)+`<button class="pan shop" type="button" data-care="shop">Лавка ›</button>`;
  }
  $('care').addEventListener('click',e=>{const b=e.target.closest('[data-care]');if(!b||b.disabled)return;e.stopPropagation();const k=b.dataset.care;
    if(k==='open'){const has=S.sick?stock('pill'):Object.keys(FOOD).some(f=>stock(f));
      if(!has)return offerShop(S.sick?'Лекарства в запасах нет. Марс продаёт его в лавке. Заглянем?':'Запасы пусты, а я бы перекусила. Заглянем к Марсу в лавку?');
      careFeedOpen=true;return renderCare()}
    if(k==='shop'){closeCare();return go('shop')}
    feedWith(k)});
  $('hudHunger').addEventListener('click',e=>{e.stopPropagation();openCare(true)});
  document.addEventListener('click',e=>{if($('care').hidden)return;if(e.target.closest('#care')||e.target.closest('#owlSvg')||e.target.closest('#hudHunger'))return;closeCare()},true);
  let careY=0;addEventListener('scroll',()=>{if(!$('care').hidden&&Date.now()>careQuiet&&Math.abs(scrollY-careY)>40)closeCare()},{passive:true});
  document.addEventListener('click',e=>{
    if(swClick){e.stopPropagation();e.preventDefault();return}
    if(e.target.closest('#editor')||e.target.closest('#chat .answers'))return;
    const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
    const a=b.dataset.act,id=b.dataset.id,x=id?S.tasks.find(y=>y.id===id):null;
    if(a==='go')return go(b.dataset.view,b.dataset.list);
    if(a==='new')return openEditor(null);
    if(a==='edit')return openEditor(id);
    if(a==='done'&&x){return toggleDone(x,b.closest('.row'))}
    else if(a==='togglePlan'&&x){if(x.planned===planDay())unseeToday(x);x.planned=x.planned===planDay()?null:planDay();const n=todayTasks().filter(y=>!y.repeat).length;if(x.planned&&!closed()){if(S.today.energy==='low'&&n>1)sayOverride=`Сил сегодня мало, а в дне уже ${cnt(n,'дело','дела','дел')}. Может, хватит одного?`;else if(n>3)sayOverride=`Уже ${cnt(n,'дело','дела','дел')} на сегодня. Может, что-то на завтра?`}}
    else if(a==='unplan'&&x){x.planned=null;unseeToday(x)}
    else if(a==='delete'){S.tasks=S.tasks.filter(y=>y.id!==id)}
    else if(a==='toggleDone'){showDone=!showDone}
    else if(a==='toggleListDone'){showListDone=!showListDone}
    else if(a==='listMenu'){listMenu=listMenu?false:true;confirmDel=null;gatherSel=[]}
    else if(a==='renameList'){listMenu='rename'}
    else if(a==='colorList'){listMenu='color'}
    else if(a==='gatherList'){listMenu='gather';gatherSel=[]}
    else if(a==='gatherPick'){gatherSel=gatherSel.includes(id)?gatherSel.filter(y=>y!==id):gatherSel.concat(id)}
    else if(a==='gatherGo'){const ids=gatherSel;listMenu=false;gatherSel=[];render();return startPlant(null,ids)}
    else if(a==='listColor'){const l=S.lists.find(y=>y.id===openList);if(l)l.color=b.dataset.c;listMenu=false}
    else if(a==='addList'){const f=$('newListForm');f.hidden=false;$('newListInput').focus();return}
    else if(a==='askDel'){confirmDel=b.dataset.list;listMenu=false}
    else if(a==='cancelDel'){confirmDel=null}
    else if(a==='delList'){const lid=b.dataset.list;S.tasks.forEach(x=>{if(x.list===lid)x.list='inbox'});S.lists=S.lists.filter(l=>l.id!==lid);confirmDel=null;view='lists'}
    else if(a==='newGoal'){startPlant();return}
    else if(a==='goals'){if(view!=='home'){go('home');showPane(1)}else showPane(1,true);window.scrollTo({top:0,behavior:'auto'});return}
    else if(a==='homeOwl'){if(view!=='home')go('home');else{window.scrollTo({top:0,behavior:calm()?'auto':'smooth'});showPane(0,true)}return}
    else if(a==='sky'){sayOverride=S.goals.some(g=>g.doneAt)?'Звёзды в небе — твои достигнутые цели.':'Здесь будут загораться звёзды — твои достигнутые цели.'}
    else if(a==='lights'){S.lightsOff=!S.lightsOff;const sl=status().mood==='sleep';
      sayOverride=S.lightsOff?(sl?'М-м… Спасибо. В темноте спится слаще.':'Гирлянда погасла. Нажми на неё ещё раз — зажжётся.'):(sl?'Ой… Кто зажёг свет? Я же сплю.':'Гирлянда горит. Так уютнее!')}
    else if(a==='buy'){bookPick=b.dataset.book||null;buy(b.dataset.food)}
    else if(a==='booksOpen'){booksOpen=!booksOpen}
    else if(a==='mars'){marsPoke();return}
    else if(a==='bell'){marsBell();return}
    else if(a==='lantern'){sayOverride=lanternTalk()}
    else if(a==='shelf'){const bs=myBooks();sayOverride=!bs.length?'Полочка пока пустая. Книги продаёт Марс в лавке.':pick([`Сейчас читаю «${short(pick(bs).title,26)}». Не оторваться!`,`На полочке ${cnt(bs.length,'книга','книги','книг')}. Читаю, пока ты занята.`,`Перечитываю «${short(pick(bs).title,24)}». Ух-ху!`])}
    else if(a==='feed'){return openCare(true)}
    else if(a==='goal'){return openGoal(id)}
    else if(a==='plant'){return startPlant()}
    else if(a==='star'){const g=S.goals.find(y=>y.id===id);if(g)sayOverride=`«${g.title}» — достигнута ${new Date(g.doneAt).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}.`}
    else if(a==='openLetter'){return openTalk(b.dataset.kind)}
    else if(a==='chatClose'){return closeTalk(false)}
    else if(DEMO.actions[a]){if(DEMO.actions[a](b)==='stop')return}
    render();
  });
  let pokeN=0,tickleN=0;
  const TICKLE=['Ой, щекотно! Хи-хи-хи!','Ух-ху-ху! Перестань, щекотно!','Хи-хи! Я же плюшевая, мне щекотно.'];
  function pokeLine(){
    const st=status(),mood=preview||st.mood,items=st.items,next=items.find(x=>!x.done),left=items.filter(x=>!x.done).length;
    const ctx=[];
    if(st.hz==='yellow'&&mood!=='sleep')ctx.push(pick(['Хочу кушать…','Хочу кушать. Может, рыбку?']));
    if(mood==='sulky')ctx.push(pick(['Хм. Я всё ещё дуюсь. Сделай одно дело, и я оттаю.','Я нахохлилась… Сделай что-нибудь, и перестану.']));
    else if(mood==='angry')ctx.push(pick(['Я голодная и злая! Покорми меня.','Есть хочу! Прямо сейчас!']));
    else if(mood==='sick')ctx.push(pick(['Апчхи… Мне нужно лекарство из лавки.','Мне плохо. Дела меня не вылечат, только лекарство.']));
    else if(mood==='sleep'&&!S.lightsOff)ctx.push('Сплю… Погаси, пожалуйста, гирлянду: нажми на неё.');
    else if(mood==='sleep')ctx.push(pick(['Сплю… Ух… Завтра поговорим.','Тс-с, я сплю. Дела на завтра можно выбрать в календаре.']));
    else if(mood==='sad')ctx.push(pick(['Мне немножко грустно. Давай начнём с самого маленького дела?','Я скучаю по сделанным делам. Возьмёмся за одно?']));
    if(letter('morning')&&mood!=='sleep')ctx.push('На почте письмо от меня. Прочитаешь?');
    if(st.allDone)ctx.push('Сегодня всё сделано. Можно гордиться собой!');
    else if(next&&mood!=='sleep')ctx.push(left===1?`Осталось одно дело: «${next.title}». Справимся!`:`Осталось ${cnt(left,'дело','дела','дел')}. Может, начнём с «${next.title}»?`);
    else if(!items.length&&!closed())ctx.push('День пока пустой. Выберем вместе, что сделать?');
    if(S.streak>=2)ctx.push(`У нас уже ${cnt(S.streak,'день','дня','дней')} подряд. Я считаю!`);
    const gs2=nextGoalStep();if(gs2&&!closed())ctx.push(`Возьмём «${short(gs2[1].title,26)}» для цели?`);
    ctx.push(pick(['Ух-ху! Просто захотелось поздороваться.','Щекотно!','А ты знала, что совы вертят головой почти по кругу?','Мы летаем бесшумно: у наших перьев мягкие края.']));
    return ctx[pokeN++%ctx.length];
  }
  $('owlSvg').addEventListener('click',e=>{e.stopPropagation();const tickled=owlPoke();
    $('say').textContent=tickled?TICKLE[tickleN++%TICKLE.length]:pokeLine();if($('care').hidden){$('care').hidden=false;careFeedOpen=false;careY=scrollY;renderCare()}});
  $('bubble').addEventListener('click',()=>pane===2?marsPoke():openTalk('chat'));
  $('bubble').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pane===2?marsPoke():openTalk('chat')}});
  $('newListForm').addEventListener('submit',e=>{e.preventDefault();const v=$('newListInput').value.trim();if(!v)return;S.lists.push({id:uid(),name:v});$('newListInput').value='';$('newListForm').hidden=true;render()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('goalSheet').hidden&&openGoalId)closeGoal();else if(E)closeEditor();else if(T)closeTalk(false)}});

  // swipe from the left edge on any other screen: back to the owl (the portrait left the shelf in v30)
  {let es=null;
   document.addEventListener('pointerdown',e=>{es=(view!=='home'&&e.clientX<28&&!document.querySelector('.sheet.open, #chat:not([hidden])'))?{x:e.clientX,y:e.clientY}:null},{passive:true});
   document.addEventListener('pointermove',e=>{if(!es)return;const dx=e.clientX-es.x,dy=Math.abs(e.clientY-es.y);if(dy>40){es=null;return}if(dx>70){es=null;go('home')}},{passive:true});
   document.addEventListener('pointerup',()=>{es=null},{passive:true})}

  /* ---------- conversations (mirror the «Сценарии» sheet) ---------- */
  const TALKS={morning:{title:'Утренний разговор',reward:3},evening:{title:'Вечерний разговор',reward:3},week:{title:'Обзор недели',reward:15},intro:{title:'Знакомство',reward:12},chat:{title:'Разговор с совой',reward:0},goal:{title:'Новая цель',reward:0},harvest:{title:'Цель достигнута',reward:20},goalcheck:{title:'Разговор о цели',reward:0}};
  let T=null;
  const box=()=>$('answers');
  /* v37: smooth talk (Илья: the screen jumped on every answer). The answers panel keeps its height while it is empty,
     then glides to the height of the new choices; messages fade in; the chat scrolls softly. */
  const toEnd=()=>{const m=$('msgs');calm()?m.scrollTop=1e9:m.scrollTo({top:m.scrollHeight,behavior:'smooth'})};
  let boxTimer=0,boxFresh=false;
  function clearBox(){const b=box();if(!b.firstChild)return;
    if(calm()){b.innerHTML='';return}
    b.style.height=b.offsetHeight+'px';b.innerHTML='';boxFresh=true;
    clearTimeout(boxTimer);boxTimer=setTimeout(()=>{if(!b.firstChild){b.style.height=b.offsetHeight+'px';void b.offsetHeight;b.style.height='0px';b.addEventListener('transitionend',()=>{if(!b.firstChild)b.style.height=''},{once:true})}},2200)}
  function boxReset(){const b=box();clearTimeout(boxTimer);b.innerHTML='';b.style.height='';boxFresh=false}
  // new choices arrived: glide from the held height to the natural one and let them fade in
  new MutationObserver(()=>{const b=box();if(!b.firstChild||!boxFresh){requestAnimationFrame(toEnd);return}
    boxFresh=false;clearTimeout(boxTimer);
    const from=b.offsetHeight;b.style.height='auto';const to=b.offsetHeight;b.style.height=from+'px';void b.offsetHeight;
    b.classList.remove('enter');void b.offsetWidth;b.classList.add('enter');b.style.height=to+'px';
    b.addEventListener('transitionend',e=>{if(e.target===b&&e.propertyName==='height')b.style.height=''},{once:true});
    setTimeout(()=>{if(b.style.height===to+'px')b.style.height=''},400);
    requestAnimationFrame(toEnd)}).observe($('answers'),{childList:true});
  new ResizeObserver(toEnd).observe($('msgs'));
  function say(text){const d=document.createElement('div');d.className='msg owl';d.textContent=text;$('msgs').appendChild(d);toEnd()}
  function me(text){const d=document.createElement('div');d.className='msg me';d.textContent=text;$('msgs').appendChild(d);toEnd()}
  function buttons(opts){
    box().innerHTML='<div class="opts">'+opts.map((o,i)=>`<button class="opt" type="button" data-i="${i}">${esc(o[0])}</button>`).join('')+'</div>';
    box().querySelectorAll('.opt').forEach(b=>b.onclick=()=>{const o=opts[+b.dataset.i];me(o[0]);clearBox();setTimeout(()=>o[1](o[0]),250)});
  }
  function textInput(ph,onDone,skip){
    box().innerHTML=`<form class="inline"><input placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off"><button type="submit">Готово</button></form>${skip?`<div class="opts"><button class="opt" type="button">${esc(skip)}</button></div>`:''}`;
    const f=box().querySelector('form'),inp=f.querySelector('input');setTimeout(()=>inp.focus(),50);
    f.onsubmit=e=>{e.preventDefault();const v=inp.value.trim();if(!v)return;me(v);clearBox();setTimeout(()=>onDone(v),250)};
    if(skip)box().querySelector('.opt').onclick=()=>{me(skip);clearBox();setTimeout(()=>onDone(null),250)};
  }
  // v38: a long list is a wall — show the seven nearest (lists are sorted by urgency) and the rest on request
  const PICK_SHOW=7;
  function pickList(items,{multi,custom,doneLabel,extra,ph,add},onDone){
    let sel=new Set(),all=items.length<=PICK_SHOW+2;
    const draw=()=>{
      const vis=items.map((it,i)=>[it,i]).filter(([it,i])=>all||i<PICK_SHOW||sel.has(i));
      box().innerHTML=`<div class="picks">${vis.map(([it,i])=>`<button type="button" class="pick" data-i="${i}" aria-pressed="${sel.has(i)}"><span class="box">${ic('i-check')}</span><span>${esc(it.title)}</span>${it.src?`<span class="src">${esc(it.src)}</span>`:''}</button>`).join('')}${all?'':`<button type="button" class="pick-more" id="pickMore">Показать все · ещё ${items.length-vis.length}</button>`}</div>
        ${custom?`<form class="inline"><input placeholder="${esc(ph||'Своё дело')}" aria-label="${esc(ph||'Своё дело')}" autocomplete="off"><button type="submit">${esc(add||'Добавить')}</button></form>`:''}
        ${multi?`<button class="primary" type="button" id="pickDone" ${sel.size?'':'disabled'}>${esc(doneLabel||'Готово')}${sel.size?' · '+sel.size:''}</button>`:''}
        ${extra?`<div class="opts"><button class="opt" type="button" id="pickExtra">${esc(extra[0])}</button></div>`:''}`;
      const pm=$('pickMore');if(pm)pm.onclick=()=>{all=true;draw()};
      box().querySelectorAll('.pick').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;
        if(!multi){me(items[i].title);clearBox();setTimeout(()=>onDone([items[i]]),250);return}
        sel.has(i)?sel.delete(i):sel.add(i);draw()});
      if(custom){const f=box().querySelector('form');f.onsubmit=e=>{e.preventDefault();const v=f.querySelector('input').value.trim();if(!v)return;items.push({key:'new',title:v,src:'новое'});
        if(!multi){me(v);clearBox();setTimeout(()=>onDone([items[items.length-1]]),250);return}sel.add(items.length-1);draw()}}
      const d=$('pickDone');if(d)d.onclick=()=>{const ch=[...sel].map(i=>items[i]);me(ch.map(c=>c.title).join(', '));clearBox();setTimeout(()=>onDone(ch),250)};
      if(extra)$('pickExtra').onclick=()=>{me(extra[0]);clearBox();setTimeout(extra[1],250)};
    };
    draw();
  }
  function scale(onDone){
    box().innerHTML='<div class="scale">'+[1,2,3,4,5].map(n=>`<button class="opt" type="button">${n}</button>`).join('')+'</div>';
    box().querySelectorAll('.opt').forEach(b=>b.onclick=()=>{me(b.textContent);clearBox();setTimeout(()=>onDone(+b.textContent),250)});
  }
  function candidates(){
    const t=now(),pd=planDay();
    return S.tasks.filter(x=>!x.done&&x.planned!==pd&&!x.repeat)
      .sort((a,b)=>(a.list==='inbox')-(b.list==='inbox')||(a.due||'9').localeCompare(b.due||'9'))
      .map(x=>({key:x.id,title:x.title,src:x.list==='inbox'?'входящие':(x.due?dueLabel(x.due,t).txt:listName(x.list))}));
  }
  function applyChoice(it){const pd=planDay();if(it.key==='new'){S.tasks.push({id:uid(),title:it.title,list:'inbox',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:pd,done:false,doneAt:null,created:now()});return}
    const x=S.tasks.find(y=>y.id===it.key);if(x)x.planned=pd}
  function openTalk(kind,goal){
    if(!letter(kind)&&kind==='morning'){S.letters.push({id:uid(),kind,day:today(),read:false})}
    T={kind,goal,free:kind==='week'&&!letter('week')};$('chatTitle').textContent=TALKS[kind].title;$('chatSub').textContent=kind==='intro'?'сова рассказывает, как тут всё устроено':(S.owlName||'');
    $('msgs').innerHTML='';boxReset();sheetShow($('chat'));document.body.style.overflow='hidden';
    kind==='morning'?U1():kind==='evening'?V1():kind==='week'?N1():kind==='goal'?G1():kind==='harvest'?H1():kind==='goalcheck'?K1():C1();
  }
  function closeTalk(finished){
    if(!T)return;
    if(finished){
      if(!T.free)gain(TALKS[T.kind].reward);
      const l=letter(T.kind);if(l)l.read=true;
      if(T.kind==='intro'){S.onboarded=true;S.startDay=today()}
      else if(T.kind==='morning'){} // the morning talk gives leaves, but no longer lights the lantern
      else if(T.kind==='week'){S.week.due=at(now(),19,7);S.week.postponed=0;S.missed=[];S.week.lastDay=today()}
      const toWin=T.kind==='goal'||T.kind==='harvest';view='home';if(toWin)setTimeout(()=>showPane(1),0);else{setTimeout(()=>showPane(0),0);if(T.kind!=='chat'&&T.kind!=='goalcheck')setTimeout(cheer,250)}
    }
    if(T&&T.kind==='intro'&&!finished){S.onboarded=true;S.startDay=today()}
    sheetHide($('chat'));document.body.style.overflow='';T=null;render();
  }
  const finishBtn=label=>{box().innerHTML=`<button class="primary" type="button">${esc(label)}</button>`;box().querySelector('button').onclick=()=>closeTalk(true)};
  const later=(fn,ms)=>setTimeout(fn,ms||450);

  // Знакомство прямо на главном экране: подсветка элемента и объяснение совы
  let tourOn=false,tourI=0,tourLists=null;
  const TOUR=[
    {t:'#scene',text:()=>'Привет! Я сова, и теперь я живу здесь, рядом с тобой. Как ты меня назовёшь?',ui:'name'},
    {t:'#scene',text:()=>(S.owlName?`${S.owlName}… Мне нравится! `:'Хорошо, я просто Сова. ')+'По мне сразу видно, как идут дела. Нажми на меня — увидишь настроение и сытость, там же можно покормить. Нажмёшь на мои слова — поговорим.'},
    {t:'.hud',text:()=>'Наверху твои листья. Я дарю их за сделанные дела, а в лавке на них покупается еда: к вечеру я проголодаюсь. А фонарик рядом — мой ночник. Он горит, когда за день сделано хоть одно дело, а остальные перенесены. Без него мне темно, так что иногда я буду просить о помощи!'},
    {t:'.today',text:()=>'Здесь дела на сегодня, и только они. Сделала — отметь кружком или смахни вправо. Не успеваешь — смахни влево, перенесу на завтра.'},
    {t:'#mailThing',text:()=>'На почту я кладу письма: утром мы собираем день, вечером подводим итог и выбираем дела на завтра. Там же «Входящие»: всё, что пришло в голову.'},
    {t:'.dk[data-view="calendar"]',text:()=>'В календаре все дела по срокам. Плюсиком оттуда выбираешь, что делать сегодня. Число на календаре — сколько дел уже просрочено.'},
    {t:'.dk[data-view="lists"]',text:()=>S.lists.length?'В списках дела по темам: дом, работа, учёба. Я уже разложила туда примеры.':'Здесь будут твои списки. Давай заведём первые: выбери подходящие или напиши свои.',ui:()=>S.lists.length?'next':'lists'},
    {t:'#goalsThing',text:()=>'А это цели: открытка с падающей звездой ведёт к окну, где они растут. Число на ней — сколько ростков подвяло.'},
    {t:'.dk-plus',round:true,text:()=>'Кнопка «+» — чтобы быстро записать дело или мысль.'},
    {t:'.room-wrap',pane:1,text:()=>'Смахни комнату в сторону — там окно. Цель — это несколько дел к одному сроку: нажми «+» и выбери «Цель». Семечко для неё продаёт Марс в лавке, и цель вырастет на подоконнике. Делай её дела — и росток растёт. Отстанешь от срока — подвянет, сделаешь все — загорится звезда.'},
    {t:'.room-wrap',pane:2,text:()=>'А с другой стороны комнаты — лавка. В ней торгует мой друг, кот Марс. У него еда для меня, семена для целей и вещи для комнаты. Всё покупается за листья.'},
    {t:null,text:()=>'И последнее. Если дела стоят, я грущу, а на второй вечер подряд могу заболеть — поможет только лекарство. Без еды я злюсь. Держи двенадцать листьев: хватит на мышку, а после утреннего разговора — и на семечко для первой цели.',ui:'final'}
  ];
  function startTour(){
    if(T)closeTalk(false);if(E)closeEditor();
    view='home';render();tourOn=true;tourI=0;tourLists=null;$('coach').hidden=false;showStep();
  }
  function placeSpot(){
    const sp=$('coachSpot'),card=$('coachCard'),st=TOUR[tourI];
    const el=st&&st.t?document.querySelector(st.t):null;
    if(!el){sp.classList.add('none');Object.assign(sp.style,{left:'50%',top:'45%',width:'0px',height:'0px'});placeCard('bottom');coachOwl();return}
    sp.classList.remove('none');
    const r=el.getBoundingClientRect(),pad=st.round?6:8;
    Object.assign(sp.style,{left:(r.left-pad)+'px',top:(r.top-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px',borderRadius:st.round?'50%':'24px'});
    placeCard((r.top+r.height/2)>innerHeight*.5?'top':'bottom');coachOwl();
  }
  /* v32: one owl, not two. The side owl joins the tour card only when the owl in the room is out of sight
     (another pane, scrolled away or under the card) — and then it is the live peeking owl (Илья). */
  let coachOwlStep=-1;
  function coachOwl(){
    const card=$('coachCard'),o=$('owlSvg').getBoundingClientRect(),c=card.getBoundingClientRect();
    const inView=!pane&&view==='home'&&o.bottom>o.height*.4&&o.top<innerHeight-o.height*.4;
    const covered=inView&&c.top<o.top+o.height*.6&&c.bottom>o.top+o.height*.4;
    const need=!inView||covered;
    card.classList.toggle('with-owl',need);
    if(need&&coachOwlStep!==tourI){coachOwlStep=tourI;card.classList.remove('on');void card.offsetWidth;card.classList.add('on')}
    if(!need)coachOwlStep=-1;
  }
  // the card is always placed in visual-viewport coordinates (iOS shifts it after the keyboard or a scroll):
  // at the top of what is visible, or just above the bottom shelf; with the keyboard open, just above the keyboard
  function placeCard(where){
    const card=$('coachCard'),vv=window.visualViewport,vh=(vv?vv.height:innerHeight)-(window.__hostCut?window.__hostCut():0),vt=vv?vv.offsetTop:0;
    const typing=document.activeElement&&document.activeElement.tagName==='INPUT'&&card.contains(document.activeElement);
    const kb=typing&&innerHeight-(vv?vv.height:innerHeight)>120,ch=card.offsetHeight;
    const safeTop=parseFloat(getComputedStyle(document.documentElement).paddingTop)||0;
    let top;
    if(kb)top=vt+vh-ch-10;
    else if(where==='top')top=vt+Math.max(14,safeTop+8);
    else{const dock=$('dock').getBoundingClientRect(),floor=Math.min(vt+vh,dock.top>0?dock.top:vt+vh);top=floor-ch-12}
    top=Math.max(vt+8,Math.min(top,vt+vh-ch-8));
    card.style.bottom='';card.style.top=top+'px';
  }
  const inFixed=el=>{for(let e=el;e&&e!==document.body;e=e.parentElement)if(getComputedStyle(e).position==='fixed')return true;return false};
  const OWL_NAMES=['Ушастик','Пушинка','Филя','Буся','Пёрышко','Луна','Звёздочка','Угуша','Тиша','Сонька','Глазастик','Ночка','Ухти','Шуршик','Нюша','Кнопка','Морошка','Ириска','Кеша','Совуня'];
  let nameI=0;
  function showStep(){
    const st=TOUR[tourI];
    render();
    if(pane!==(st.pane||0))showPane(st.pane||0);
    $('coachWho').textContent=S.owlName||'Сова';
    $('coachText').textContent=st.text();
    $('coachStep').textContent=`${tourI+1} из ${TOUR.length}`;
    const el=st.t?document.querySelector(st.t):null;
    if(el&&!inFixed(el)){
      const r=el.getBoundingClientRect(),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
      // scroll so the element sits in the half of the screen the card does not cover
      const want=r.height>innerHeight*.55?r.top+scrollY-16:r.top+scrollY+r.height/2-innerHeight*.36;
      window.scrollTo({top:Math.max(0,want),behavior:reduce?'auto':'smooth'});
    }
    placeSpot();setTimeout(placeSpot,380);setTimeout(placeSpot,700);
    const ui=typeof st.ui==='function'?st.ui():st.ui,box=$('coachUi');
    const next=()=>{tourI++;tourI<TOUR.length?showStep():endTour(true)};
    if(ui==='name'){
      box.innerHTML=`<form class="name-row" id="coachName"><input id="coachNameIn" placeholder="Имя совы" aria-label="Имя совы" autocomplete="off" maxlength="24" value="${esc(S.owlName||'')}"><button class="secondary" type="button" id="coachSuggest">Предложить</button></form><button class="primary" type="submit" form="coachName">Готово</button>`;
      const settle=()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();setTimeout(()=>{window.scrollTo(0,0);placeSpot()},250)};
      $('coachName').onsubmit=e=>{e.preventDefault();const v=$('coachNameIn').value.trim();S.owlName=v?v.slice(0,24):null;save();settle();next()};
      $('coachSuggest').onclick=()=>{$('coachNameIn').value=OWL_NAMES[nameI%OWL_NAMES.length];nameI++};
      $('coachNameIn').onfocus=()=>setTimeout(placeSpot,300);$('coachNameIn').onblur=()=>setTimeout(()=>{if(tourOn){window.scrollTo(0,0);placeSpot()}},250);
    }else if(ui==='lists'){
      tourLists=tourLists||new Set();
      const pre=['Дом','Работа','Учёба','Здоровье','Хобби','Финансы'];
      box.innerHTML=`<div class="row2">${pre.map(n=>`<button type="button" class="chipsel" data-n="${n}" aria-pressed="${tourLists.has(n)}">${n}</button>`).join('')}</div>
        <form class="row2" id="coachList"><input id="coachListIn" placeholder="Свой список" aria-label="Свой список" autocomplete="off"><button class="secondary" type="submit">Добавить</button></form>
        <div class="row2"><button class="primary" type="button" id="coachMake" ${tourLists.size?'':'disabled'}>Создать${tourLists.size?' · '+tourLists.size:''}</button><button class="secondary" type="button" id="coachLater">Потом</button></div>`;
      box.querySelectorAll('.chipsel').forEach(b=>b.onclick=()=>{const n=b.dataset.n;tourLists.has(n)?tourLists.delete(n):tourLists.add(n);showStep()});
      $('coachList').onsubmit=e=>{e.preventDefault();const v=$('coachListIn').value.trim();if(!v)return;tourLists.add(v);showStep()};
      $('coachMake').onclick=()=>{tourLists.forEach(n=>{if(!S.lists.some(l=>l.name===n))S.lists.push({id:uid(),name:n})});save();next()};
      $('coachLater').onclick=next;
    }else if(ui==='final'){
      box.innerHTML='<button class="primary" type="button" id="coachGo">Начнём!</button>';$('coachGo').onclick=()=>endTour(true);
    }else{
      box.innerHTML='<button class="primary" type="button" id="coachNext">Дальше</button>';$('coachNext').onclick=next;
    }
    $('coachSkip').hidden=ui==='final';
  }
  function endTour(finished){
    tourOn=false;$('coach').hidden=true;lastKey='';
    S.onboarded=true;S.toured=true;if(!S.startDay)S.startDay=today();
    window.scrollTo({top:0});showPane(0);
    if(finished){gain(12);setTimeout(cheer,250)}
    render();
  }
  $('coachSkip').onclick=()=>endTour(false);
  $('coach').addEventListener('click',e=>{if(!$('coachCard').contains(e.target)){const a=document.activeElement;if(a&&a.blur&&a.tagName==='INPUT')a.blur();setTimeout(placeSpot,60)}});
  addEventListener('scroll',()=>{if(tourOn)placeSpot()},{passive:true});
  addEventListener('resize',()=>{if(tourOn)placeSpot()});
  if(window.visualViewport){visualViewport.addEventListener('resize',()=>{if(tourOn)placeSpot()});visualViewport.addEventListener('scroll',()=>{if(tourOn)placeSpot()})}

  // Свободный разговор (по нажатию на реплику совы). Без ИИ — меню тем; с ИИ здесь будет живой диалог.
  const FACTS=['Совы могут повернуть голову почти на три четверти круга. Глаза у нас не двигаются, вот и вертим головой.','У нас в шее четырнадцать позвонков, вдвое больше, чем у людей. Поэтому голова и вертится так ловко.','Мы летаем почти бесшумно: края наших перьев мягкие, как бахрома.','Пучки перьев на голове — не уши. Настоящие уши спрятаны по бокам, и у многих сов одно ухо чуть выше другого: так легче понять, откуда шорох.','Перья вокруг глаз — это лицевой диск. Он собирает звуки к ушам, как тарелка-антенна.','Сипуха может поймать мышь в полной темноте, только по шороху.','Бородатая неясыть слышит мышь под снегом и ныряет за ней прямо в сугроб.','Вблизи мы видим неважно. То, что у самого клюва, мы ощупываем жёсткими пёрышками-щетинками.','Многие совы и днём видят хорошо. Белая сова вообще охотится днём: полярным летом ночи нет.','У белой совы перья даже на пальцах. Получаются тёплые тапочки.','Глаза мы не двигаем, зато у нас есть третье веко. Оно прозрачное и протирает глаз, как дворник стекло.','Моргаем мы верхним веком, как ты. А когда спим, закрываем глаза нижним.','Пальцы у нас хитрые: внешний поворачивается назад. Два пальца вперёд, два назад — так добычу не упустишь.','Мелкую добычу совы глотают целиком, а всё несъедобное потом отрыгивают аккуратным комочком. Только не за столом!','Одна сипуха за год ловит около тысячи мышей. Фермеры таким соседкам рады.','Многие совы почти не пьют: воды им хватает из еды.','В мире больше двухсот видов сов. Самая маленькая, сычик-эльф, весит около сорока граммов — как пачка жвачки.','Филин — самая большая сова Европы. Крылья у него раскрываются почти на два метра.','Самая крупная сова в мире — рыбный филин. Он живёт на Дальнем Востоке и ловит рыбу в речках.','Совы есть на всех континентах, кроме Антарктиды.','Гнёзд мы обычно не строим: селимся в дуплах, в чужих гнёздах и даже в норах.','Кроличий сыч живёт в норе. Если его потревожить, он шипит, как гремучая змея. Хитро, правда?','Птенцы вылупляются не разом, а по очереди, через день-два. Поэтому в гнезде они разного роста.','Совята часто вылезают из гнезда раньше, чем умеют летать, и лазают по веткам, цепляясь клювом и когтями.','Многие совы живут парой много лет и чистят друг другу пёрышки клювом. Это совиная нежность.','«Ух-ху» кричит неясыть. А сипуха не ухает вовсе: она шипит и пронзительно визжит.','Зимой ушастые совы собираются на деревьях компаниями, иногда по двадцать сов и больше.','Наши перья плохо держат воду. В сильный дождь мы прячемся и ждём, пока он кончится.','Домовый сыч был птицей Афины, богини мудрости. Его даже чеканили на древних монетах.','В Японии сова — к удаче. Её название звучит похоже на «без трудностей».'];
  let factN=Math.floor(Math.random()*5);
  function C1(){const mood=preview||status().mood;
    say(mood==='sulky'?'Хм. Ну давай поговорим. Хотя я немножко дуюсь.':mood==='sleep'?'Ух… Ты меня разбудила. Ладно, давай поговорим.':mood==='hungry'||mood==='angry'?'Привет! На голодный желудок говорить трудно, но я постараюсь.':mood==='sick'?'Апчхи… Привет. Говорить могу, только тихонько.':mood==='sad'?'Привет. Хорошо, что ты зашла.':pick(['Привет! О чём поговорим?','Ух-ху! Я вся внимание.']));
    later(chatMenu,500)}
  function chatMenu(){
    const o=[];
    if(letter('morning')&&!closed())o.push(['Давай соберём день',()=>openTalk('morning')]);
    if(letter('evening'))o.push(['Давай подведём день',()=>openTalk('evening')]);
    o.push([letter('week')?'Давай оглянемся на неделю':'Оглянуться на неделю',()=>openTalk('week')]);
    o.push(['Как ты?',Chow],['Наши цели',Cgoals],[closed()?'Что у меня на завтра?':'Что у меня на сегодня?',Ctoday],['Запиши мысль',Cnote],['Расскажи что-нибудь',Cfact],['Пока!',Cbye]);
    buttons(o)}
  const more=()=>later(()=>{say(pick(['Что-нибудь ещё?','О чём ещё поговорим?']));chatMenu()},700);
  function Chow(){const mood=preview||status().mood;
    const m={happy:'Отлично! Когда ты делаешь дела, у меня крылья сами хлопают.',ok:'Хорошо, спокойно. Сижу, смотрю в окно.',sad:'Немножко грустно. Но стоит тебе сделать одно дело, и мне станет лучше.',hungry:'Хочу кушать. В запасах что-нибудь осталось?',angry:'Злая и голодная! Покорми меня, тогда поговорим нормально.',sick:'Болею… Голова кружится. Мне нужно лекарство из лавки.',sulky:'Нахохлилась я. Дела стоят, и мне от этого неуютно. Одно сделанное дело, и я оттаю.',sleep:'Сонная. Вообще-то совы ночью не спят, но я домашняя.'};
    say(m[mood]||m.ok);
    if(mood==='hungry'||mood==='angry'||mood==='sick')return later(()=>buttons([[mood==='sick'?'Вылечить':'Покормить',()=>{closeTalk(false);openCare(true)}],['Потом',more]]),500);
    more()}
  function Ctoday(){const items=todayTasks(),left=items.filter(x=>!x.done),when=closed()?'На завтра':'Сегодня';
    if(!items.length){say(`${when} пока ничего не выбрано. Выберем?`);
      return buttons([['Давай',()=>{const c=candidates();say(c.length?'Отметь самое главное, лучше не больше трёх.':'Напиши, что хочешь сделать. Можно одно дело.');pickList(c,{multi:true,custom:true,doneLabel:'Готово'},ch=>{ch.forEach(applyChoice);say(`Добавила: ${ch.map(c=>'«'+c.title+'»').join(', ')}. Я в тебя верю!`);more()})}],['Не сейчас',more]])}
    say(`${when} у тебя ${cnt(items.length,'дело','дела','дел')}: ${items.map(x=>'«'+x.title+'»').join(', ')}. Сделано ${items.length-left.length} из ${items.length}.`);
    if(left.length&&!closed())later(()=>say(left.length===1?'Осталось совсем чуть-чуть. Я рядом.':'Начни с самого простого, а я буду рядом.'),600);
    more()}
  function Cnote(){say('Что записать?');textInput('Например: купить подарок маме',v=>{S.tasks.push({id:uid(),title:v,list:'inbox',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:null,done:false,doneAt:null,created:now()});save();
    say(pick(['Записала во «Входящие». Разберём, когда будет время.','Готово, мысль во «Входящих».']));more()})}
  function Cfact(){say(FACTS[factN++%FACTS.length]);later(()=>buttons([['Ещё!',Cfact],['Хватит',more]]),400)}
  function Cgoals(){const gs=activeGoals();
    if(!gs.length){say('Целей пока нет. Цель — это несколько дел к одному сроку. Придумаем?');return buttons([['Давай',()=>openTalk('goal')],['Потом',more]])}
    say(gs.map(g=>{const ts=goalTasks(g),w=wiltOf(g);return `«${g.title}»: сделано ${ts.filter(x=>x.done).length} из ${ts.length}${w?(w===2?', растение чахнет':', растение подвяло'):''}`}).join('\n'));
    const nx=nextGoalStep();
    if(!nx)return more();
    later(()=>{say(`Следующее дело — «${nx[1].title}». Возьмём ${closed()?'на завтра':'на сегодня'}?`);buttons([['Да',()=>{stepToToday(nx[0],nx[1]);say('Добавила. Росток ждёт!');more()}],['Не сейчас',more]])},600)}
  // Новая цель (Ц1–Ц7): название → зачем → как пойму → дела (из списков или новые) → срок → семечко
  const newTask=title=>({id:uid(),title,list:'goals',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:null,done:false,doneAt:null,created:now()});
  function G1(){
    const pre=goalPre||{};goalPre=null;T.g={title:null,tasks:(pre.tasks||[]).slice(),fresh:[]};
    if(pre.title){T.g.title=pre.title.slice(0,60);say(`Новая цель — «${T.g.title}»!`);return later(G2,600)}
    say(T.g.tasks.length?`Соберём ${cnt(T.g.tasks.length,'дело','дела','дел')} в цель. Как она называется?`:pick(['Новая цель! Чего ты хочешь добиться?','Новая цель! К чему хочешь прийти?']));
    textInput('Например: пробежать 5 км',v=>{T.g.title=v.slice(0,60);G2()})}
  function G2(){say('Почему это важно для тебя?');const w=v=>{T.g.why=v;G3()};
    buttons([['Чтобы гордиться собой',w],['Для здоровья',w],['Для работы или денег',w],['Для радости',w],['Своё…',()=>textInput('Почему это важно',w)]])}
  function G3(){say('Как ты поймёшь, что получилось? Чтобы потом честно сказать «да».');textInput('Например: пробегу 5 км без остановки',v=>{T.g.doneWhen=v;G3a()},'Пропустить')}
  function G3a(){say('Насколько это реально сейчас? Ответь честно, я не строгая.');
    buttons([['Вполне реально',G4],['Страшновато, но хочу',()=>{say('Это нормально. Начнём с маленького дела — дальше будет легче.');later(G4,700)}],
      ['Сложно — давай поменьше',()=>{say('Давай. Какую часть возьмём на этот раз?');textInput('Например: пробежать 2 км',v=>{T.g.title=v.slice(0,60);say('Отличная цель. Её точно можно достичь.');later(G4,700)})}]])}
  const gCount=()=>T.g.tasks.length+T.g.fresh.length;
  function G4(){
    if(gCount()>=3)return G5();
    const free=S.tasks.filter(x=>!x.done&&!x.goal&&!x.repeat&&!T.g.tasks.includes(x.id));
    if(!gCount()&&free.length){say('Цель — это несколько дел, хотя бы три. Возьмём дела из списков или придумаем новые?');
      return buttons([['Возьму из списков',()=>{say('Отметь, какие дела войдут в цель.');pickList(free.map(x=>({key:x.id,title:x.title,src:listName(x.list)})),{multi:true,custom:true,doneLabel:'Готово'},ch=>{ch.forEach(it=>it.key==='new'?T.g.fresh.push(it.title):T.g.tasks.push(it.key));G4n()})}],['Придумаем новые',G4n]])}
    G4n()}
  function G4n(){const n=gCount();
    if(n>=8)return G5();
    say(n===0?'Цель — это несколько дел, одно за другим, хотя бы три. Какое первое? Лучше маленькое, чтобы начать было легко.':n<3?pick(['Какое следующее?','А после него?']):pick(['Что дальше? Если это всё — так и скажи.','Ещё одно дело или это всё?']));
    textInput(n?'Следующее дело':'Первое дело',v=>{if(!v)return G5();T.g.fresh.push(v);G4n()},n>=3?'Это все дела':null)}
  // the deadline is required: without it the plant cannot tell whether it is on time
  function G5(){say('К какому сроку? Без срока я не пойму, успеваем ли мы.');
    const set=days=>{T.g.due=dayKey(now()+days*D);G5b()};
    buttons([['Через месяц',()=>set(30)],['Через два месяца',()=>set(60)],['Через три месяца',()=>set(91)],['Выберу дату',()=>{
      box().innerHTML=`<form class="inline"><input type="date" min="${dayKey(now()+D)}" aria-label="Срок цели"><button type="submit">Готово</button></form>`;
      const f=box().querySelector('form');f.onsubmit=e=>{e.preventDefault();const v=f.querySelector('input').value;if(!v)return;me(fmtDay(v));clearBox();T.g.due=v;setTimeout(G5b,250)}}]])}
  // the pace: more than about one task a week sounds heavy — the owl asks gently, without insisting
  function G5b(){const n=gCount(),wk=Math.max(1,Math.round(dayDiff(T.g.due,now())/7));
    if(n/wk>1.5){say(`Это ${cnt(n,'дело','дела','дел')} за ${cnt(wk,'неделю','недели','недель')} — больше одного в неделю. Посильно?`);
      return buttons([['Да, справлюсь',G6],['Дай больше времени',()=>{T.g.due=dayKey(keyToTime(T.g.due)+30*D);say(`Хорошо, срок — ${fmtDay(T.g.due)}. Так спокойнее.`);later(G6,700)}]])}
    say(n>=wk||Math.round(wk/n)<2?'Примерно по делу в неделю. Спокойный темп.':`Примерно по делу в ${cnt(Math.round(wk/n),'неделю','недели','недель')}. Можно не спешить.`);later(G6,700)}
  function G6(){
    const g={id:uid(),title:T.g.title,why:T.g.why||null,doneWhen:T.g.doneWhen||null,due:T.g.due,created:now(),doneAt:null,plant:null};S.goals.push(g);T.goal=g;
    T.g.tasks.forEach(id=>{const x=S.tasks.find(y=>y.id===id);if(x)x.goal=g.id});T.g.fresh.forEach(t=>S.tasks.push(Object.assign(newTask(t),{goal:g.id})));save();
    say(`Цель «${g.title}» есть: ${cnt(goalTasks(g).length,'дело','дела','дел')} до ${fmtDay(g.due)}.`);later(G7,700)}
  function G7(){const g=T.goal,ks=seedKinds();
    if(sillGoals().length>=POTS){say('На подоконнике три цели. Эту можно посадить вместо другой — в её карточке. А дела можно делать уже сейчас.');return later(G8,700)}
    if(!ks.length){say('Чтобы цель росла на подоконнике, нужно семечко. Его продаёт Марс в лавке. Заглянем?');
      return buttons([['В лавку',()=>{closeTalk(false);marsSay='Семечко для цели? Прошу, выбирайте, сударыня.';go('shop')}],['Потом',G8]])}
    if(ks.length===1){plantGoal(g,ks[0]);say(`Посадила! ${PLANTS[g.plant]} уже в горшке.`);return later(G8,700)}
    say('Какое семечко посадим?');buttons(ks.map(k=>[PLANTS[k],()=>{plantGoal(g,k);say(`Посадила! ${PLANTS[k]} уже в горшке.`);later(G8,600)}]))}
  function G8(){const g=T.goal,x=goalTasks(g).find(y=>!y.done&&y.planned!==planDay());
    if(!x)return G9();
    say(`Первое дело — «${x.title}». Возьмём его ${closed()?'на завтра':'на сегодня'}?`);buttons([['Да',()=>{stepToToday(g,x);G9()}],['Не сейчас',G9]])}
  function G9(){say(T.goal.plant?'Росток растёт, когда ты делаешь дела этой цели. Отстанем от срока — подвянет. Сделаешь все — за окном загорится звезда.':'Каждое сделанное дело приближает цель. Все сделаешь — загорится звезда за окном.');finishBtn('Готово')}
  // Цель достигнута (Ж1–Ж2)
  function H1(){const g=T.goal;say(`Все дела сделаны${g.plant?', '+(BLOOM[g.plant]||'росток вырос'):''}! Цель «${g.title}» достигнута. Как ты себя чувствуешь?`);
    const h=()=>H2();buttons([['Горжусь собой',h],['Рада, что получилось',h],['Хочу новую цель',h],['Своё…',()=>textInput('Как ты себя чувствуешь',h)]])}
  function H2(){const g=T.goal,bonus=5*goalTasks(g).length+(SEEDS[g.plant]&&SEEDS[g.plant].hard?HARD_BONUS:0);g.doneAt=now();gain(bonus);S.wins.push({day:today(),text:'Цель: '+g.title});save();
    say('Я запомнила. За окном зажглась звезда — она там навсегда.');finishBtn(`Посмотреть · +${lv(20+bonus)}`)}
  // Разговор о цели (К1–К3), раз в месяц или по желанию
  function K1(){const g=T.goal;say(`«${g.title}». Эта цель всё ещё твоя?`);
    buttons([['Да, иду дальше',K2],['Хочу поменять дела или срок',()=>{closeTalk(false);showPane(1);openGoal(g.id)}],['Уже неважна',K3]])}
  function K2(){const g=T.goal,s=goalTasks(g).find(y=>!y.done&&y.planned!==planDay());
    if(!s){say(goalDone(g)?'Все дела сделаны — пора зажигать звезду! Нажми на горшок у окна.':'Все дела цели уже в плане. Так держать!');return finishBtnNo('Хорошо')}
    say(`Следующее дело — «${s.title}». Возьмём ${closed()?'на завтра':'на сегодня'}?`);
    buttons([['Да',()=>{stepToToday(g,s);say('Добавила. Росток ждёт!');finishBtnNo('Закрыть')}],['Не сейчас',()=>{say('Хорошо. Цель подождёт.');finishBtnNo('Закрыть')}]])}
  function K3(){const g=T.goal;say('Бывает, цели меняются, и это нормально. Убрать её?');
    buttons([['Убрать',()=>{dropGoal(g);save();say('Убрала. Её дела остались в списках.');finishBtnNo('Закрыть')}],['Оставить',()=>{say('Оставим. Может, ещё прорастёт.');finishBtnNo('Закрыть')}]])}
  const finishBtnNo=label=>{box().innerHTML=`<button class="primary" type="button">${esc(label)}</button>`;box().querySelector('button').onclick=()=>closeTalk(false)};
  function Cbye(){say(pick(['Пока! Я рядом.','Ух-ху, до встречи!']));finishBtn('Закрыть')}

  // Утро
  function U1(){say(pick(['Доброе утро! Как сегодня с силами?','Привет! Сколько сегодня сил?','Доброе утро! Сил сегодня много или не очень?']));
    const setE=e=>{S.today.energy=e;S.energy=S.energy||{};S.energy[today()]=e};
    buttons([['Мало',()=>{setE('low');lowStreak()>=3?U2h():U2()}],['Средне',()=>{setE('mid');U4()}],['Много',()=>{setE('high');U4()}]])}
  function lowStreak(){let n=0;for(let i=0;i<14;i++){if((S.energy||{})[dayKey(now()-i*D)]==='low')n++;else break}return n}
  function healthList(){return S.lists.find(l=>/здоров/i.test(l.name))||null}
  function U2h(){const n=lowStreak();say(`Уже ${n}-й день подряд сил мало. Я за тебя переживаю.`);
    later(()=>{const hl=healthList();say(hl?`Давай заглянем в список «${hl.name}»? Может, там есть то, что вернёт силы.`:'Давай подумаем, что могло бы вернуть силы? Сон, прогулка, врач?');
      buttons([['Давай',U2h2],['Не сейчас',U2]])},700)}
  function U2h2(){const hl=healthList();const items=hl?S.tasks.filter(x=>x.list===hl.id&&!x.done&&!x.repeat).map(x=>({key:x.id,title:x.title})):[];
    say(items.length?'Что из этого возьмём сегодня? Одного хватит.':'Напиши одно маленькое дело для себя на сегодня.');
    pickList(items,{multi:false,custom:true},ch=>{const it=ch[0];if(it.key==='new'){S.tasks.push({id:uid(),title:it.title,list:hl?hl.id:'inbox',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:planDay(),done:false,doneAt:null,created:now()})}else applyChoice(it);
      S.today.minimal=true;say('Хорошо. Сегодня только это, и это уже забота о себе.');later(U9,700)})}
  function U2(){say(pick(['Понимаю. Тогда сегодня лёгкий день: одно дело, и этого достаточно.','Такое бывает. Давай возьмём одно дело. Больше сегодня и не нужно.']));
    buttons([['Давай',U3],['Нет, возьму больше',U4],['Сегодня отдохну',R1]])}
  function U3(){const c=candidates();say(c.length?'Какое одно дело возьмём?':'Напиши одно маленькое дело на сегодня.');pickList(c,{multi:false,custom:true,extra:['Сегодня без дел',R1]},ch=>{applyChoice(ch[0]);S.today.minimal=true;U9()})}
  function U4(){
    const y=dayKey(now()-D),yd=S.tasks.filter(x=>x.done&&x.planned===y);
    if(yd.length)say(pick([`Вчера ты сделала ${cnt(yd.length,'дело','дела','дел')}, в том числе «${yd[0].title}». Здорово!`,`Вчера у тебя получилось ${cnt(yd.length,'дело','дела','дел')}. Я это запомнила.`]));
    later(()=>U4t(()=>todayTasks().filter(x=>!x.repeat).length?U5():U6()),yd.length?700:0);
  }
  // the evening was skipped: yesterday's undone tasks went quietly to the calendar — offer them now
  function U4t(next){const tl=S.tails&&S.tails.day===today()?S.tails.ids.map(id=>S.tasks.find(x=>x.id===id)).filter(x=>x&&!x.done&&!x.planned):[];S.tails=null;
    if(!tl.length)return next();
    say(tl.length===1?`Вчера не успели «${tl[0].title}». Возьмём сегодня?`:`Вчера не успели: ${tl.map(x=>'«'+x.title+'»').join(', ')}. Что-то возьмём сегодня?`);
    if(tl.length===1)return buttons([['Да',()=>{tl[0].planned=planDay();next()}],['Не сегодня',next]]);
    pickList(tl.map(x=>({key:x.id,title:x.title})),{multi:true,doneLabel:'Взять',extra:['Не сегодня',next]},ch=>{ch.forEach(applyChoice);next()})
  }
  function U5(){say(`Вчера вечером ты уже выбрала на сегодня: ${todayTasks().filter(x=>!x.repeat).map(x=>'«'+x.title+'»').join(', ')}. Оставляем так?`);buttons([['Да',U7],['Поменять',U6],['Сегодня без дел',R1]])}
  function U6(){const c=candidates(),lim=dayLimit()===2?'двух':'трёх';
    say(!c.length?'Что хочешь сделать сегодня? Напиши одно дело, можно совсем маленькое.':pick([`Что берём на сегодня? Отметь самое главное, лучше не больше ${lim}.`,`Что важного сегодня? Выбери до ${lim} дел.`]));
    pickList(c,{multi:true,custom:true,doneLabel:'Готово',extra:['Сегодня без дел',R1]},ch=>{ch.forEach(applyChoice);todayTasks().filter(x=>!x.repeat).length>dayLimit()?U6a():U7()})}
  const light=()=>S.lightUntil&&now()<S.lightUntil;
  function dayLimit(){return S.today.energy==='low'?1:light()?2:3}
  function U6a(){const n=todayTasks().filter(x=>!x.repeat).length;say(S.today.energy==='low'?`Сил сегодня мало, а дел уже ${n}. Давай оставим одно, самое важное? Остальные подождут в списке.`:(dayLimit()===2?'Мы договорились на эту неделю брать по два дела. Какие два самые важные?':'Многовато для одного дня. Какие три самые важные? Остальные останутся в списке.'));
    const items=todayTasks().filter(x=>!x.repeat).map(x=>({key:x.id,title:x.title}));
    pickList(items,{multi:true,doneLabel:'Оставить эти'},ch=>{const keep=new Set(ch.map(c=>c.key));items.forEach(it=>{if(!keep.has(it.key)){const x=S.tasks.find(y=>y.id===it.key);if(x)x.planned=null}});U7()})}
  function U7(){
    const t=now(),pd=planDay();
    const soon=S.tasks.filter(x=>!x.done&&!x.repeat&&x.list!=='inbox'&&x.planned!==pd&&x.due&&dayDiff(x.due,t)<=2).sort((a,b)=>a.due.localeCompare(b.due))[0];
    if(S.today.energy!=='low'&&soon){const dd=dayDiff(soon.due,t),lg=new Date(keyToTime(soon.due)).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}),dl=dd<0?'прошёл '+lg:dd===0?'сегодня':dd===1?'завтра':'до '+lg;
      say(`У «${soon.title}» срок ${dl}. Возьмём сегодня?`);buttons([['Да',()=>{soon.planned=pd;U7g()}],['Не сегодня',U7g]])}
    else U7g();
  }
  function U7g(){const pd=planDay();
    const g=S.today.energy!=='low'&&sillGoals().find(g=>wiltOf(g)&&!goalTasks(g).some(x=>!x.done&&x.planned===pd)),x=g&&goalTasks(g).find(y=>!y.done&&y.planned!==pd);
    if(!x)return U9();
    say(`Росток «${short(g.title,24)}» ${wiltOf(g)===2?'чахнет':'подвял'}. Возьмём для него «${x.title}»?`);
    buttons([['Да',()=>{x.planned=pd;say('Ух-ху! Росток ждёт.');later(U9,600)}],['Не сегодня',U9]])
  }
  // a day off: one gentle reminder about overdue tasks, then the owl lets her rest (Ilya, 18.11)
  function R1(){const pd=planDay(),t=now();
    const x=S.tasks.filter(y=>!y.done&&!y.repeat&&y.list!=='inbox'&&y.planned!==pd&&y.due&&dayDiff(y.due,t)<=0).sort((a,b)=>a.due.localeCompare(b.due))[0];
    if(!x)return R2();
    const dd=dayDiff(x.due,t),when=dd===0?'сегодня':'прошёл '+new Date(keyToTime(x.due)).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
    say(`У «${short(x.title,28)}» срок ${when}. Может, только его?`);
    buttons([['Возьму его',()=>{x.planned=pd;S.today.minimal=true;U9()}],['Сегодня отдыхаю',R2]])}
  function R2(){S.rest=S.rest||{};S.rest[today()]=true;
    S.tasks.forEach(x=>{if(!x.repeat&&!x.done&&x.planned===today()){x.planned=null;unseeToday(x)}}); // chosen yesterday evening: back to their lists, quietly
    say(pick(['Хорошо, отдыхай. Отдых — тоже забота о себе.','Договорились: сегодня выходной. Отдыхай!']));
    later(()=>{say('Я буду ждать завтра. Одно маленькое дело — и мне будет чем перекусить.');finishBtn('Завершить · +3 листа')},800)}
  function U9(){say(S.today.minimal?'Одно дело — тоже полноценный день. Я рядом.':pick(['План готов. Я в тебя верю!','Отлично, я рядом весь день. Ух-ху!','Договорились. Удачного дня!']));finishBtn('Завершить · +3 листа')}

  // Вечер. Что спрашивать, зависит от того, как прошёл день:
  //  всё сделано или дел не было — настроение, затем завтра;
  //  сделана часть — «довольна днём?»; если нет — настроение и «что помешало», затем хвосты и завтра;
  //  ничего не сделано — сначала настроение; если устала или грустно — без расспросов, мягко к завтра; иначе «что помешало», хвосты, завтра.
  // «Всё ли успела» сова не спрашивает: она это знает и говорит сама. «Что помешало» — один вопрос за вечер.
  const BAD=['tired','sad'];
  const tomKey=()=>dayKey(now()+D);
  function eveData(){const tk=today(),items=S.tasks.filter(x=>x.planned===tk);return {items,done:items.filter(x=>x.done),undone:items.filter(x=>!x.done&&!x.repeat)}}
  const names=arr=>{const n=arr.slice(0,3).map(x=>'«'+short(x.title,40)+'»').join(', ');return arr.length>3?n+` и ещё ${arr.length-3}`:n};
  // how many evenings in a row (counting today's answer) share the same value
  function eveStreak(field,val){let n=1;for(let i=1;i<7;i++){const k=dayKey(now()-i*D),e=S.evenings.find(x=>x.day===k);if(e&&e[field]===val)n++;else break}return n}
  function V1(){
    const d=eveData(),n=d.items.length,k=d.done.length;
    T.ev={day:today(),total:n,done:k,mood:null,sat:null,why:null,note:null};T.adj=0;
    const hi=pick(['Добрый вечер!','Привет! Вот и вечер.']);
    if(!k&&restDay(today())){T.ev.rest=true;say(`${hi} Сегодня у нас был выходной. Надеюсь, ты отдохнула.`);return later(V6,700)}
    if(!n){say(`${hi} Сегодня мы не выбирали дел. Так тоже бывает.`);return later(()=>Vmood('Как ты?',V6))}
    if(k===n){say(`${hi} Сегодня сделано всё: ${k} из ${n}. ${pick(['Я тобой горжусь.','Это было здорово.'])}`);return later(()=>Vmood('Как ты сейчас?',V6),700)}
    if(k>0){say(`${hi} Сегодня сделано ${k} из ${n}: ${names(d.done)}.`);return later(Vsat,700)}
    say(`${hi} Сегодня дела так и не сдвинулись. Я не ругаюсь, просто хочу знать, как ты.`);
    later(()=>Vmood('Как ты?',m=>BAD.includes(m)?Vsoft():Vwhy(()=>Vtails(V6))),700);
  }
  function Vsat(){say('Ты довольна днём?');
    buttons([['Да',()=>{T.ev.sat='yes';say(pick(['Вот и я довольна!','Ух-ху! Хороший день.']));later(()=>Vtails(V6),600)}],
      ['Скорее да',()=>{T.ev.sat='mostly';say('Хороший день не обязан быть идеальным.');later(()=>Vtails(V6),600)}],
      ['Не очень',()=>{T.ev.sat='no';later(()=>Vmood('Понимаю. А как ты сама?',m=>BAD.includes(m)?Vtails(V6):Vwhy(()=>Vtails(V6))))}]])}
  function Vmood(q,next){say(q);
    const set=(m,reply)=>{T.ev.mood=m;say(reply);
      if(m==='sad'&&eveStreak('mood','sad')>=3)return later(()=>{say('Уже третий вечер тебе грустно. Может, расскажешь кому-то близкому? Мне кажется, это важно.');later(()=>next(m),900)},600);
      if(m==='sad')return later(()=>{say('Хочешь рассказать, что случилось? Можно и не рассказывать.');buttons([['Расскажу',()=>textInput('Что случилось',v=>{T.ev.note=v;say('Спасибо, что поделилась. Я рядом.');later(()=>next(m),700)},'Передумала')],['Не сейчас',()=>next(m)]])},600);
      later(()=>next(m),600)};
    buttons([['Хорошо',()=>set('good',pick(['Ух-ху! Это я запомню.','Как я рада!']))],['Нормально',()=>set('ok','Ровный день — тоже хороший день.')],
      ['Устала',()=>set('tired','Тогда завтра не будем перегружаться.')],['Грустно',()=>set('sad','Мне жаль. Я рядом.')]])}
  function Vwhy(next){say(pick(['Что помешало? Мне просто важно понять.','Что сегодня помешало? Хочу понять, чем помочь.']));
    const set=(w,reply,streakReply)=>{T.ev.why=w;
      if(streakReply&&eveStreak('why',w)>=3){T.adj=-1;say(streakReply)}else say(reply);later(next,800)};
    buttons([['Не хватило времени',()=>set('time','Бывает. Может, дела были крупноваты для одного дня?','Третий вечер подряд не хватает времени. Давай завтра возьмём на одно дело меньше?')],
      ['Не хватило сил',()=>set('energy','Тогда завтра начнём с самого лёгкого.','Уже третий вечер не хватает сил. Завтра возьмём поменьше, а сегодня ляг пораньше.')],
      ['Появились срочные дела',()=>set('urgent','Так бывает. Главное, ты с ними справилась.')],
      ['Не захотелось',()=>set('mood','Честно. Может, дело слишком большое? Его можно сделать поменьше.','Третий вечер не хочется браться за дела. Может, они не те? Давай завтра выберем то, что правда хочется.')],
      ['Стало неважно',()=>set('irrelevant','Тогда его можно убрать, и это нормально.')],
      ['Своё…',()=>textInput('Что помешало',v=>set('other:'+v,'Спасибо, что рассказала.'))]])}
  // undone tasks of today: tomorrow, back to the calendar, or still today (until 22:00)
  function Vtails(next){const u=eveData().undone;if(!u.length)return next();
    const one=u.length===1,tom=tomKey();
    say(one?`Остался ${names(u)}. Что с ним делаем?`:`Не успели: ${names(u)}. Что с ними делаем?`);
    const toCal=x=>{x.planned=null;S.missed.push({id:uid(),title:x.title})};
    const o=[[one?'На завтра':'Всё на завтра',()=>{u.forEach(x=>x.planned=tom);say(one?'Перенесла на завтра.':'Перенесла всё на завтра.');later(next,600)}]];
    if(!one)o.push(['Разобрать по одному',()=>{T.ui=0;T.ul=u;Vone(next)}]);
    o.push(['Вернуть в календарь',()=>{u.forEach(toCal);say('Вернула в календарь, там они не потеряются.');later(next,600)}]);
    if(!closed()&&hourOf(now())<22)o.push(['Ещё успею сегодня',()=>{say('Верю! До 23:00 ещё есть время.');later(next,600)}]);
    buttons(o)}
  function Vone(next){const x=T.ul[T.ui];if(!x)return next();const go=()=>{T.ui++;Vone(next)},tom=tomKey();
    say(`«${x.title}». Что с ним?`);
    buttons([['На завтра',()=>{x.planned=tom;go()}],['В календарь',()=>{x.planned=null;S.missed.push({id:uid(),title:x.title});go()}],
      ['Сделать поменьше',()=>textInput('Как сформулируем поменьше?',v=>{x.title=v;x.planned=tom;go()})],
      ['Убрать совсем',()=>{S.missed.push({id:uid(),title:x.title});S.tasks=S.tasks.filter(y=>y.id!==x.id);go()}]])}
  // nothing done and a hard evening: no questions, undone tasks wait for the week review
  function Vsoft(){say(pick(['Ничего. Сегодня просто такой день. Дела не убегут, утром я про них напомню.','Отдыхай. Дела подождут, утром посмотрим, что взять.']));T.adj=-1;T.ev.soft=true;later(V6,800)}
  function eveLimit(){const e=T.ev;let n=3;if(BAD.includes(e.mood)||(e.total>0&&e.done===0)||(S.lightUntil&&now()<S.lightUntil))n=2;return Math.max(1,n+(T.adj||0))}
  function V6(){
    const tom=tomKey(),lim=eveLimit(),have=()=>S.tasks.filter(x=>x.planned===tom&&!x.repeat);
    const ask=()=>{const h=have(),left=lim-h.length;
      const items=S.tasks.filter(x=>!x.done&&!x.repeat&&x.planned!==tom).sort((a,b)=>(a.list==='inbox')-(b.list==='inbox')||(a.due||'9').localeCompare(b.due||'9'))
        .map(x=>({key:x.id,title:x.title,src:x.list==='inbox'?'входящие':(x.due?dueLabel(x.due,now()).txt:listName(x.list))}));
      say(h.length?`На завтра уже: ${names(h)}. Добавим что-то?`:!items.length?'Что хочешь сделать завтра? Напиши одно дело или выбери утром.':`${pick(['Что возьмём на завтра?','Выберем дела на завтра?'])} ${lim===1?'Одного хватит.':`Лучше не больше ${lim===2?'двух':'трёх'}.`}`);
      pickList(items,{multi:true,custom:true,doneLabel:'На завтра',extra:[h.length?'Хватит':'Выберу утром',V9]},ch=>{
        ch.forEach(it=>{if(it.key==='new')S.tasks.push({id:uid(),title:it.title,list:'inbox',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:tom,done:false,doneAt:null,created:now()});else{const x=S.tasks.find(y=>y.id===it.key);if(x)x.planned=tom}});
        have().length>lim?Vtrim(lim):V9()})};
    if(have().length>lim)return Vtrim(lim);
    if(have().length===lim){say(`На завтра уже: ${names(have())}. Этого хватит, правда?`);return buttons([['Да, хватит',V9],['Добавить ещё',ask]])}
    ask();
  }
  function Vtrim(lim){const h=S.tasks.filter(x=>x.planned===tomKey()&&!x.repeat);
    say(lim===1?`Многовато на завтра: ${h.length}. Давай оставим одно, самое важное? Остальные подождут в календаре.`:`Многовато на завтра: ${h.length}. Какие оставим? Лучше до ${lim===2?'двух':'трёх'}.`);
    pickList(h.map(x=>({key:x.id,title:x.title})),{multi:true,doneLabel:'Оставить эти'},ch=>{const keep=new Set(ch.map(c=>c.key));h.forEach(x=>{if(!keep.has(x.id))x.planned=null});V9()})}
  function V9(){
    S.evenings=S.evenings.filter(e=>e.day!==T.ev.day);S.evenings.push(T.ev);if(S.evenings.length>60)S.evenings.shift();
    const m=T.ev.mood,ls=lanternState();
    if(ls==='on'||ls==='full')say(pick(['Мой фонарик сегодня горит. Спасибо — с ним спокойнее спится.','Фонарик горит, мне светло и уютно. Спасибо тебе!']));
    say(m==='sad'?'Спокойной ночи. Завтра будет новый день, я буду рядом.':m==='tired'?'Отдыхай. Спокойной ночи, ух-ху.':pick(['Спокойной ночи! До завтра.','Ух-ху, сладких снов. Увидимся утром.']));
    finishBtn('Завершить · +3 листа')}

  // Неделя
  function weekDone(){const from=now()-7*D;return S.tasks.filter(x=>x.done&&x.doneAt&&x.doneAt>=from&&!x.repeat)}
  function N1(){say(pick(['Пора оглянуться на неделю. Сейчас удобно?','Давай подведём итоги недели?']));
    if(T.free)return buttons([['Да, давай',N2],['Не сейчас',()=>closeTalk(false)]]);
    buttons([['Да, давай',N2],['Позже',()=>{S.week.postponed++;S.week.due=now()+2*H;const l=letter('week');if(l)l.read=true;closeTalk(false)}],['Завтра',()=>{S.week.postponed++;S.week.due=now()+D;const l=letter('week');if(l)l.read=true;closeTalk(false)}]])}
  /* v32: the review is about two things only — what worked (the owl praises) and what got stuck
     (overdue tasks, wilting goals). Steps of every task and the monthly «still yours?» are gone (Илья: too tiring). */
  function weekGoalWins(){const from=now()-7*D;return activeGoals().map(g=>({g,n:goalTasks(g).filter(x=>x.done&&x.doneAt>=from).length})).filter(o=>o.n).sort((a,b)=>b.n-a.n)}
  /* v36: «неделя в картинках» — seven days as little weathers (evening mood, or morning energy if the evening was skipped)
     and how many tasks were done. No axes, no percentages, no «worse than last week» (Илья: a soft picture, not a curve). */
  const WEATHER={
    sun:'<circle cx="12" cy="12" r="5" fill="#F5B63C"/><g stroke="#F5B63C" stroke-width="2" stroke-linecap="round"><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800"/></g>',
    part:'<circle cx="9" cy="9" r="4.500" fill="#F5B63C"/><g stroke="#F5B63C" stroke-width="1.800" stroke-linecap="round"><path d="M9 1.800v1.800M1.800 9h1.800M3.900 3.900l1.300 1.300M14.100 3.900l-1.300 1.300"/></g><path d="M8 20h10a4 4 0 0 0 0-8 5.500 5.500 0 0 0-10.400 1.600A3.300 3.300 0 0 0 8 20Z" fill="#C9D3DA"/>',
    cloud:'<path d="M14 9.500h5a3 3 0 0 0 0-6 4 4 0 0 0-7.600 1.200" fill="#B7C2CB"/><path d="M6.500 19.500h11a4.200 4.200 0 0 0 0-8.400 5.800 5.800 0 0 0-11 1.700 3.400 3.400 0 0 0 0 6.700Z" fill="#A9B5BF"/>',
    rain:'<path d="M6.500 15h11a4 4 0 0 0 0-8 5.500 5.500 0 0 0-10.400 1.600A3.300 3.300 0 0 0 6.500 15Z" fill="#9FB0BC"/><g stroke="#6E9AB8" stroke-width="1.800" stroke-linecap="round"><path d="M8.500 17.500l-1 3M12.500 17.500l-1 3M16.500 17.500l-1 3"/></g>',
    storm:'<path d="M6.500 14h11a4 4 0 0 0 0-8 5.500 5.500 0 0 0-10.400 1.600A3.300 3.300 0 0 0 6.500 14Z" fill="#7F8E9C"/><path d="M12.500 14l-2.500 4.200h2.600L11 22.500l4.500-5.600h-2.700l1.500-2.900Z" fill="#F5C54A"/><g stroke="#6E9AB8" stroke-width="1.600" stroke-linecap="round"><path d="M7.500 16.500l-.8 2.400M18 16.500l-.8 2.400"/></g>',
    none:'<circle cx="12" cy="12" r="7" fill="none" stroke="#CDBBA4" stroke-width="1.600" stroke-dasharray="2.500 2.500"/>'};
  const WEATHER_LBL={sun:'хорошо',part:'нормально',cloud:'устала',rain:'грустно',storm:'тяжёлый день',none:'без отметки'};
  // evening mood → weather; a sad evening with nothing done is a storm; if the evening was skipped, the morning energy decides
  function dayWeather(ev,en,done){
    if(ev&&ev.mood)return ev.mood==='good'?'sun':ev.mood==='ok'?'part':ev.mood==='tired'?'cloud':done===0?'storm':'rain';
    return en==='high'?'sun':en==='mid'?'part':en==='low'?'cloud':'none'}
  function weekPicture(){const t=now(),days=[];
    for(let i=6;i>=0;i--){const k=dayKey(t-i*D),ev=S.evenings.find(e=>e.day===k),en=(S.energy||{})[k];
      const from=keyToTime(k),done=S.tasks.filter(x=>x.done&&x.doneAt&&!x.repeat&&x.doneAt>=from&&x.doneAt<from+D).length,w=dayWeather(ev,en,done);
      days.push({k,w,done,wd:new Date(from).toLocaleDateString('ru-RU',{weekday:'short'}),today:i===0})}
    const wins=S.wins.filter(w=>keyToTime(w.day)>=t-7*D).length,total=days.reduce((s,d)=>s+d.done,0);
    const seen=['sun','part','cloud','rain','storm'].filter(w=>days.some(d=>d.w===w));
    const ic=w=>`<svg viewBox="0 0 24 24" aria-hidden="true">${WEATHER[w]}</svg>`;
    return `<div class="wk" role="img" aria-label="Настроение за неделю: ${days.map(d=>d.wd+' — '+WEATHER_LBL[d.w]+', дел '+d.done).join('; ')}">
      <div class="wk-title">Погода твоего настроения</div>
      <div class="wk-days">${days.map(d=>`<div class="wk-d${d.today?' today':''}"><small>${d.wd}</small>${ic(d.w)}<span class="wk-n">${d.done?`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.500 6.500l2.300 2.300L9.500 3.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${d.done}`:'·'}</span></div>`).join('')}</div>
      ${seen.length?`<div class="wk-key">${seen.map(w=>`<span>${ic(w)}${WEATHER_LBL[w]}</span>`).join('')}</div>`:''}
      <div class="wk-foot"><span>Дел за неделю: <b>${total}</b></span>${wins?`<span>В копилке побед: <b>${wins}</b></span>`:''}</div></div>`}
  function sayCard(html){const d=document.createElement('div');d.className='msg owl card';d.innerHTML=html;$('msgs').appendChild(d);toEnd()}
  // v37: the picture is explained, and the owl waits until Sofia has looked at it (Илья: it read as a weather forecast, and the next question came too soon)
  function N2(){say('Я нарисовала твою неделю. Это не прогноз: погода — твоё настроение по вечерам.');
    later(()=>{sayCard(weekPicture());later(()=>{say('Солнце — хороший день, гроза — тяжёлый. Галочки — сделанные дела.');buttons([['Дальше',N2a]])},700)},700)}
  function N2a(){
    const wd=weekDone(),gw=weekGoalWins();
    if(!wd.length){say('Неделя была непростая, и это нормально. Посмотрим, чем я могу помочь.');return later(()=>Nnotice(NP),700)}
    say(pick([`За неделю ты сделала ${cnt(wd.length,'дело','дела','дел')}. Я тобой горжусь!`,`${cnt(wd.length,'дело','дела','дел')} за неделю! Ух-ху, вот это да.`]));
    const top=wd.slice().sort((a,b)=>(b.goal?1:0)-(a.goal?1:0)||(b.steps.length-a.steps.length)).slice(0,3).map(x=>`«${short(x.title,34)}»`);
    if(wd.length>1)say(`Среди них — ${top.length>1?top.slice(0,-1).join(', ')+' и '+top[top.length-1]:top[0]}.`);
    gw.slice(0,2).forEach(o=>say(`Цель «${short(o.g.title,30)}» стала ближе на ${cnt(o.n,'дело','дела','дел')}.`));
    later(N3,900)}
  // what the evenings of this week told the owl: tiredness or lack of time three times or more
  function weekEves(){const from=now()-7*D;return S.evenings.filter(e=>keyToTime(e.day)>=from-D)}
  function Nnotice(next){const ev=weekEves(),low=ev.filter(e=>e.why==='energy'||e.mood==='tired').length,time=ev.filter(e=>e.why==='time').length,sad=ev.filter(e=>e.mood==='sad').length;
    if(low>=3){say(`На этой неделе ты ${low===3?'трижды':cnt(low,'раз','раза','раз')} говорила, что сил мало. Давай в новой неделе брать поменьше — по два дела в день?`);
      return buttons([['Давай',()=>{S.lightUntil=now()+7*D;say('Договорились. Неделю буду следить, чтобы дел было не больше двух.');later(next,700)}],['Справлюсь и с тремя',next]])}
    if(time>=3){say(`${time===3?'Трижды':cnt(time,'раз','раза','раз')} за неделю не хватало времени. Может, дела крупноваты? Большое дело можно разбить на шаги.`);return later(next,900)}
    if(sad>=3){say('На этой неделе тебе часто было грустно. Я рядом. И помни: можно рассказать кому-то близкому.');return later(next,900)}
    next()}
  function N3(){const wd=weekDone();if(wd.length<2)return Nnotice(NP);
    say('Что из этого для тебя самое важное?');pickList(wd.map(x=>({key:'w',title:x.title})),{multi:false,custom:true,extra:['Всё важно',()=>{say('Согласна!');later(()=>Nnotice(NP),600)}]},ch=>{S.wins.push({day:today(),text:ch[0].title});say(pick(['Положила в копилку побед.','Запомню. Это победа!']));later(()=>Nnotice(NP),600)})}
  // what got stuck: overdue tasks (not of goals — those show up as wilting plants), up to three; wilting goals, up to two
  function weekStuck(){const t=now();
    T.late=S.tasks.filter(x=>!x.done&&!x.repeat&&!x.goal&&x.due&&dayDiff(x.due,t)<0).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,3);
    T.wilt=sillGoals().filter(g=>wiltOf(g)).sort((a,b)=>wiltOf(b)-wiltOf(a)).slice(0,2)}
  function NP(){weekStuck();
    if(!T.late.length&&!T.wilt.length){say(pick(['Ни одной просрочки, и все ростки бодрые. Так держать!','Ничего не застряло. Отличная неделя!']));return later(N8,700)}
    say('Теперь о том, что застряло. Только самое важное.');
    if(!T.late.length)return later(()=>{T.wi=0;NPg()},600);
    later(()=>{say(T.late.length===1?`У дела «${short(T.late[0].title,34)}» прошёл срок.`:`Прошёл срок у ${cnt(T.late.length,'дела','дел','дел')}: ${T.late.map(x=>'«'+short(x.title,26)+'»').join(', ')}.`);N6()},600)}
  // one «why» for all of them (principle 16), then each task in turn
  function N6(){say('Что помешало? Это не упрёк, я просто хочу понять.');
    const n=w=>{S.week.why=S.week.why||[];S.week.why.push({day:today(),why:w});if(S.week.why.length>20)S.week.why.shift();T.mi=0;say('Понятно. Разберём по одному.');later(N7)};
    buttons([['Не хватило сил',()=>n('energy')],['Не хватило времени',()=>n('time')],['Не захотелось',()=>n('mood')],['Стало неважно',()=>n('irrelevant')],['Своё…',()=>textInput('Что помешало',v=>n('other:'+v))]])}
  function N7(){
    const x=T.late[T.mi];if(!x){T.wi=0;return NPg()}
    const next=()=>{T.mi++;N7()},tom=dayKey(now()+D),wk=dayKey(now()+7*D);
    say(`«${x.title}». Что с ним делаем?`);
    buttons([['На завтра',()=>{x.due=tom;x.planned=tom;say('Поставила на завтра.');later(next,500)}],['Новый срок — через неделю',()=>{x.due=wk;next()}],
      ['Сделать поменьше',()=>textInput('Как сформулируем поменьше?',v=>{if(v)x.title=v;x.due=wk;next()})],['Убрать совсем',()=>{S.tasks=S.tasks.filter(y=>y.id!==x.id);next()}]]);
  }
  function NPg(){
    const g=T.wilt[T.wi];if(!g)return N8();
    const next=()=>{T.wi++;NPg()},t=now(),w=wiltOf(g),x=lateTask(g),pd=planDay(),tom=dayKey(t+D);
    const why=g.due&&dayDiff(g.due,t)<0?'срок цели прошёл':x&&x.due&&dayDiff(x.due,t)<0?`дело «${short(x.title,28)}» просрочено`:'цель отстаёт от срока';
    say(`Росток «${short(g.title,30)}» ${wiltWord(g,w)}: ${why}.`);
    const b=[];
    if(x)b.push([closed()?'Возьму дело завтра':'Возьму дело сегодня',()=>{x.planned=closed()?tom:pd;if(x.due&&dayDiff(x.due,t)<0)x.due=x.planned;say(pick(['Ух-ху! Росток уже ждёт.','Отлично, он оживёт.']));later(next,600)}]);
    b.push(['Сдвинуть срок на месяц',()=>{const base=Math.max(t,keyToTime(g.due||today()));g.due=dayKey(base+30*D);goalTasks(g).forEach(y=>{if(!y.done&&y.due&&dayDiff(y.due,t)<0)y.due=null});say('Сдвинула. Спешить не будем.');later(next,600)}]);
    b.push(['Цель уже неважна',()=>{dropGoal(g);say('Убрала. Её дела остались в списках. Цели меняются, и это нормально.');later(next,900)}]);
    buttons(b)}
  function N8(){const inbox=S.tasks.filter(x=>x.list==='inbox'&&!x.done&&!x.planned);if(!inbox.length)return N12();
    say(`И ещё: во «Входящих» ${cnt(inbox.length,'запись','записи','записей')}. Разберём или в другой раз?`);buttons([['Разберём',()=>{T.ii=0;T.inbox=inbox;N9()}],['В другой раз',N12]])}
  function N9(){
    const e=T.inbox[T.ii];if(!e)return N12();
    say(`«${e.title}»`);const next=()=>{T.ii++;N9()};
    buttons([['В список',()=>{say('В какой? Можно завести новый.');pickList(S.lists.map(l=>({key:l.id,title:l.name})),{multi:false,custom:true,ph:'Новый список',add:'Создать'},ch=>{const c=ch[0];if(c.key==='new'){const l={id:uid(),name:c.title.slice(0,30)};S.lists.push(l);e.list=l.id}else e.list=c.key;next()})}],
      ['Шагом к делу',()=>{say('К какому делу? Если его нет, напиши новое.');pickList(S.tasks.filter(x=>!x.done&&x.list!=='inbox'&&!x.repeat).map(x=>({key:x.id,title:x.title})),{multi:false,custom:true,ph:'Новое дело',add:'Создать'},ch=>{const c=ch[0];let x=c.key==='new'?null:S.tasks.find(y=>y.id===c.key);
        if(!x){x={id:uid(),title:c.title,list:'inbox',due:null,reminder:null,reminded:false,repeat:false,steps:[],planned:null,done:false,doneAt:null,created:now()};S.tasks.push(x)}
        x.steps.push({id:uid(),title:e.title,done:false});S.tasks=S.tasks.filter(y=>y.id!==e.id);next()})}],
      ['Оставить пока',next],['Удалить',()=>{S.tasks=S.tasks.filter(y=>y.id!==e.id);next()}]]);
  }
  function N12(){say('Как тебе эта неделя в целом?');scale(n=>{S.week.score.push(n);N13()})}
  function N13(){say(pick(['Неделя разобрана! Спасибо, что нашла на это время.','Готово. Новую неделю начинаем с чистого листа.']));finishBtn(T.free?'Завершить':'Завершить · +15 листьев')}

  /* ---------- the owl's small life: things she does on her own, how she answers a tap or food ---------- */
  // Own generator: idle acts must never touch Math.random, so phrases stay predictable in tests.
  let lifeSeed=(Date.now()^0x9E3779B9)>>>0;
  const lifeRnd=()=>{lifeSeed=(Math.imul(lifeSeed,1664525)+1013904223)>>>0;return lifeSeed/4294967296};
  const calmMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  // what she may do in each mood: [class on #scene, how long it stays]
  const ACTS={ok:[['i-twitch',800],['i-shuffle',900],['i-peek',2600],['i-blink2',700]],happy:[['i-twitch',800],['i-blink2',700]],
    sad:[['i-sniff',900]],sulky:[['i-glance',2400]],hungry:[['i-bowl',2200]],sick:[['i-sneeze',900]],sleep:[['i-twitch',800],['i-snore',2400]],angry:[]};
  const ACT_CLS=['poke','tickle','eat','heal'].concat(...Object.values(ACTS).map(a=>a.map(x=>x[0])));
  let actTimer=null,actUntil=0;
  function owlAct(cls,ms){
    const sc=$('scene');sc.classList.remove(...ACT_CLS);void sc.offsetWidth;sc.classList.add(cls);
    actUntil=performance.now()+ms;clearTimeout(actTimer);actTimer=setTimeout(()=>sc.classList.remove(cls),ms);
  }
  function idleLoop(){
    setTimeout(()=>{idleLoop();
      const sc=$('scene');
      if(document.hidden||view!=='home'||pane||tourOn||T||E||!$('care').hidden||sc.classList.contains('cheer')||performance.now()<actUntil+1500||!roomVisible())return;
      const list=ACTS[sc.dataset.mood]||[];if(!list.length)return;
      const a=list[Math.floor(lifeRnd()*list.length)];owlAct(a[0],a[1]);
    },4500+lifeRnd()*6500);
  }
  if(!calmMotion())idleLoop();
  // a tap: three quick ones tickle a calm or happy owl
  let pokeTimes=[];
  function owlPoke(){
    const sc=$('scene'),mood=sc.dataset.mood,t=performance.now();
    pokeTimes=pokeTimes.filter(x=>t-x<1800);pokeTimes.push(t);
    if(pokeTimes.length>=3&&(mood==='ok'||mood==='happy')){pokeTimes=[];owlAct('tickle',950);return true}
    owlAct('poke',mood==='sleep'?1900:mood==='sad'?1200:900);return false;
  }
  function heartPop(n){
    if(calmMotion()||view!=='home')return;
    const room=document.querySelector('.room'),sc=$('scene');if(!room)return;
    const r=room.getBoundingClientRect(),s=sc.getBoundingClientRect();
    for(let i=0;i<(n||1);i++){const h=document.createElement('div');h.className='heart';h.innerHTML='<svg width="26" height="26"><use href="#i-heart"/></svg>';
      h.style.left=(r.left-s.left+r.width*(.36+.1*i)+lifeRnd()*r.width*.06)+'px';h.style.top=(r.top-s.top+r.height*.16-i*8)+'px';h.style.animationDelay=(i*180)+'ms';
      sc.appendChild(h);setTimeout(()=>h.remove(),1500+i*180)}
  }
  // food flies to the beak (munch), she watches it come, snaps and chews; then a heart
  function owlEat(k){munch(k);owlAct('eat',2300);setTimeout(()=>heartPop(k==='fish'?3:k==='mouse'?2:1),1750)}
  function owlHeal(){owlAct('heal',950);setTimeout(()=>heartPop(2),350)}

  /* ---------- Mars, the gentleman cat who keeps the shop ---------- */
  // He is a shopkeeper, not a second pet: no hunger, no mood from tasks. He speaks formally («вы»), up to ~60 characters.
  let marsSay=null,marsN=0,marsTimer;
  const MARS={
    hello:['Добрый день, сударыня. Чем могу служить?','Рад вас видеть. Выбирайте, я не тороплю.','Мышки нынче отменные, смею заверить.','К вашим услугам, сударыня.'],
    evening:['Добрый вечер, сударыня. Лавка открыта.','Вечер добрый. Сове на ужин — рыбку?'],
    late:['Поздний час, но для вас лавка открыта.','Доброй ночи, сударыня. Чем могу служить?'],
    back:['Прошу прощения! Не заметил, как вы вошли.','Ах, простите! Разбирал гербарий. Чем служить?','Виноват, сударыня! Отлучился на минутку.'],
    bell:['Динь-динь! Я здесь, сударыня, к вашим услугам.','Слышу, слышу! Чем могу служить?'],
    buy:['О, замурчательно!','Превосходный выбор, сударыня.','Мур-р. Заверну в лучшую бумагу.','Благодарю вас. Сова будет в восторге.','О, замурчательно! Заходите ещё.'],
    seed:['Семечко! У вас большие планы, сударыня.','О, замурчательно! Пусть цель растёт.'],
    book:['Книга! У вас отменный вкус, сударыня.','О, замурчательно! Сова оценит.'],
    cure:['Скорейшего выздоровления вашей сове.'],
    lack:['Отложу для вас. Загляните, как накопите листья.','Немного не хватает. Я придержу, не беспокойтесь.','Не спешите, сударыня. Товар вас дождётся.'],
    fact:['Известно ли вам, сударыня: кошки спят до шестнадцати часов в сутки. Это не лень, это служба.','Мяукаем мы в основном для людей. Между собой кошки почти не мяукают — к чему слова?','Мурлычем мы не только от удовольствия. Порой так кошка себя успокаивает. Мур-р.','Усы, сударыня, — прибор. Ими я чувствую ветерок и знаю, пролезу ли в щель.','В каждом моём ухе около тридцати мышц. Слышу, как вы подходите к лавке.','Сладкого мы не чувствуем вовсе. Пирожные, увы, не по моей части.','В темноте кошка видит в несколько раз лучше человека. Удобно для ночной торговли.','Узор на кошачьем носу неповторим, как отпечаток пальца. Мой — особенно.','Медленно моргнуть — по-кошачьи значит улыбнуться. Позвольте… Вот так.','Потеем мы лишь подушечками лап. Джентльмен не потеет, сударыня, он слегка влажен.','Когти я точу не из озорства: так снимается старый слой. Маникюр, знаете ли.','Хвост трубой означает: «Рад вас видеть». Как сейчас, например.','Ходим мы, как верблюды: сначала обе правые лапы, потом обе левые. Изящно, не правда ли?','Если кошка трётся о вас, она оставляет свой запах. Это значит: вы — свой человек.','Кошка прыгает в высоту раз в пять выше собственного роста. Цилиндр при этом держится.','Котята рождаются с голубыми глазами. Свой цвет появляется месяца через два-три.','Почти всегда приземляемся на лапы: в полёте кошка переворачивается сама. Сноровка!','Язык у кошки в крошечных крючках. Это и расчёска, и щётка. Очень практично.','Лакаем мы так изящно, что язык едва касается воды. Ни капли на манишку.','В Древнем Египте кошек почитали. Не скажу, что мы против.','В Британии и Японии чёрный кот — к удаче. Как джентльмен в чёрном, подтверждаю.','В 1963 году кошка Фелисетт летала в космос. Достойнейшая особа.','На Даунинг-стрит с 2011 года служит кот Ларри — главный мышелов премьер-министра. Коллега.','Голос хозяйки кошки узнают отлично. А откликаться или нет — дело чести.'],
    poke:['Мур-р. Благодарю, это весьма приятно.','Листья я собираю в гербарий. Слабость, знаете ли.','Моё имя Марс. К вашим услугам.','Усы — гордость джентльмена.','За ушком, если вас не затруднит… Мур-р.','Цилиндр не снимаю даже во сне. Привычка.']
  };
  const marsLine=kind=>{const a=MARS[kind];return kind==='buy'||kind==='poke'?a[marsN++%a.length]:pick(a)};
  function marsHello(){const h=hourOf(now());return pick(h>=23||h<6?MARS.late:h>=18?MARS.evening:MARS.hello)}
  function marsAct(cls,ms){const sc=$('scene');clearTimeout(marsTimer);sc.classList.remove('mars-purr','mars-shrug');void sc.offsetWidth;sc.classList.add(cls);marsTimer=setTimeout(()=>sc.classList.remove(cls),ms)}
  const marsPurr=()=>marsAct('mars-purr',1700);
  const marsShrug=()=>marsAct('mars-shrug',900);
  let marsPokes=0,marsFactN=Math.floor(Math.random()*24);
  function marsPoke(){if(pane!==2)return;marsSay=marsPokes++%2?MARS.fact[marsFactN++%MARS.fact.length]:marsLine('poke');$('marsSay').textContent=marsSay;marsPurr()}
  // sometimes, on coming into the shop, Mars is out back; the bell on the counter calls him
  let marsAway=false;
  function marsMaybeAway(){marsAway=!tourOn&&!!S.onboarded&&!marsSay&&Math.random()<.3;$('scene').dataset.mars=marsAway?'away':'here';return marsAway}
  function marsBack(){marsAway=false;$('scene').dataset.mars='here'}
  function marsBell(){
    if(pane!==2)return;const sc=$('scene');sc.classList.remove('bell-ring');void sc.offsetWidth;sc.classList.add('bell-ring');setTimeout(()=>sc.classList.remove('bell-ring'),950);
    if(marsAway){setTimeout(()=>{marsBack();marsSay=pick(MARS.back);$('owlName').textContent='Марс';$('marsSay').textContent=marsSay},380)}
    else{marsSay=pick(MARS.bell);$('marsSay').textContent=marsSay;marsPurr()}
  }

  /* ---------- Sofia's build only: backup copy and a gentle reminder. Uses the DEMO hooks, which are empty in her build ---------- */
  const BACKUP_EVERY=14*D;
  const bkDay=t=>new Date(t).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  function backupFile(){
    const d=new Date(),name=`Сова — копия ${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.json`;
    return new File([JSON.stringify({app:'sova',saved:d.toISOString(),data:S})],name,{type:'application/json'});
  }
  function backupDone(){S.backupAt=Date.now();save();renderBackup();peekSay('Копия сохранена. Теперь мне спокойнее!')}
  async function backupSave(){
    const f=backupFile();
    try{
      if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f]});backupDone();return}
    }catch(e){if(e&&e.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);backupDone();
  }
  function backupPick(){
    const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
    inp.onchange=()=>{const f=inp.files&&inp.files[0];if(!f)return;const r=new FileReader();
      r.onload=()=>{let o=null;try{o=JSON.parse(r.result)}catch(e){}
        if(!o||o.app!=='sova'||!o.data||o.data.v!==7){peekSay('Это не моя копия. Нужен файл «Сова — копия…».');return}
        peekSay(`Вернуть всё, как было ${bkDay(o.saved)}? Сегодняшнее заменится.`,'',[['Вернуть',()=>{
          const d=o.data;d.offset=0;d.backupAt=Date.now();try{localStorage.setItem(KEY,JSON.stringify(d))}catch(e){}location.reload()},true],['Не надо']]);
      };r.readAsText(f)};
    inp.click();
  }
  function renderBackup(){
    const n=$('backupNote');if(!n)return;
    n.textContent=S.backupAt?`Последняя копия — ${bkDay(S.backupAt)}.`:'Копий пока не было.';
  }
  // every two weeks the owl asks once to save a copy — only where the room is out of sight, so the side owl does the talking
  function backupDue(){const t=Date.now(),last=Math.max(S.backupAt||0,S.backupAsk||0,S.since||t);return S.onboarded&&S.tasks.length>=3&&t-last>BACKUP_EVERY}
  DEMO.after=()=>{
    if(view==='lists')renderBackup();
    if(view!=='home'&&!tourOn&&backupDue()){S.backupAsk=Date.now();save();
      setTimeout(()=>peekSay('Сохраним копию наших дел? На всякий случай.','',[['Сохранить',backupSave,true],['Потом']]),600)}
  };
  DEMO.boot=()=>{
    if(!S.since){S.since=Date.now();save()}
    try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  };
  Object.assign(DEMO.actions,{
    backupSave:()=>{backupSave();return 'stop'},
    backupLoad:()=>{backupPick();return 'stop'}
  });

  load();
  S.goals=S.goals||[];S.pantry=S.pantry||{};S.evenings=S.evenings||[];if(!S.lastFed)S.lastFed=Date.now()+(S.offset||0);if(S.sick===undefined)S.sick=null;
  // v23: garden beds became a pot on the windowsill — old plants turn into indoor ones, unsold harvest into feathers
  S.goals.forEach(g=>{if(PLANT_OLD[g.plant])g.plant=PLANT_OLD[g.plant]});
  if(typeof S.books==='number'){S.bookIds=BOOKS.slice(0,Math.min(8,S.books)).map(b=>b.id);delete S.books}
  [['geranium','mandarin'],['amaryllis','mango']].forEach(([a,b])=>{const q=S.pantry['seed_'+a];if(q){S.pantry['seed_'+b]=(S.pantry['seed_'+b]||0)+q;delete S.pantry['seed_'+a]}});
  if(S.pantry.crop){S.feathers+=5*S.pantry.crop;delete S.pantry.crop}
  migrateGoals(S); // v27: a goal's stages became real tasks, every goal has a deadline
  if(DEMO.boot)DEMO.boot();
  migrateGoals(S);
  render();
  showPane(0); // the owl is the middle screen: without this the room would open on the shop
  if(!S.toured)setTimeout(startTour,700);
  setInterval(()=>{if(!T&&!E)render()},20e3);
})();
