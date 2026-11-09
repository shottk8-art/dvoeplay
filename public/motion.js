/* Только визуальные заставки и диалоги; игровой ход и сетевые часы не затрагиваем. */
(function(){
  'use strict';
  var root=document.documentElement;
  var reduced=matchMedia('(prefers-reduced-motion: reduce)');
  var mini=document.querySelector('#menu .mini');
  var preview=window.DPPreview;
  var app=document.getElementById('app') || document.querySelector('.app');
  var visible=true, running=true, buildingStill=false, modalOpen=false;
  function canPreview(){
    return buildingStill || (!document.hidden && !reduced.matches && !modalOpen && visible &&
      !(app && app.classList.contains('playing')));
  }
  function cancelPreview(){
    if(preview) preview.stop();
  }
  function showStill(){
    if(!mini || !preview) return;
    buildingStill=true;
    try { preview.play(); } finally { buildingStill=false; cancelPreview(); }
    preview.still();
  }
  function syncPreview(){
    if(!mini) return;
    var next=canPreview();
    mini.classList.toggle('motion-paused',!next);
    if(next===running) return;
    running=next;
    cancelPreview();
    if(next && preview) preview.play();
  }
  function syncDialog(dialog){
    var open=dialog.classList.contains('on') ||
      (dialog.classList.contains('np-sheet') ? document.body.classList.contains('np-open')
        : dialog.classList.contains('sheet') && document.body.classList.contains('open'));
    dialog.inert=!open;
    dialog.setAttribute('aria-hidden',open?'false':'true');
  }
  var dialogs=[].slice.call(document.querySelectorAll('[role="dialog"]'));
  function syncState(){
    dialogs.forEach(syncDialog);
    modalOpen=dialogs.some(function(dialog){ return dialog.getAttribute('aria-hidden')==='false'; });
    root.classList.toggle('motion-modal',modalOpen);
    syncPreview();
  }
  var stateObserver=new MutationObserver(syncState);
  // Наблюдаем контейнеры, а не каждый класс фишки: нет работы на каждом игровом кадре.
  dialogs.forEach(function(dialog){
    syncDialog(dialog);
    stateObserver.observe(dialog,{attributes:true,attributeFilter:['class']});
  });
  stateObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  if(app) stateObserver.observe(app,{attributes:true,attributeFilter:['class']});
  window.DPMotion={canPreview:canPreview,cancelPreview:cancelPreview};
  root.classList.add('motion-ready');
  root.classList.toggle('motion-sleep',document.hidden);
  function preference(){
    cancelPreview(); running=false;
    if(reduced.matches) showStill();
    syncPreview();
  }
  if(reduced.addEventListener) reduced.addEventListener('change',preference);
  else reduced.addListener(preference);
  document.addEventListener('visibilitychange',function(){
    root.classList.toggle('motion-sleep',document.hidden); syncPreview();
  });
  if('IntersectionObserver' in window){
    var previews=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        entry.target.classList.toggle('motion-paused',!entry.isIntersecting);
        if(entry.target===mini){ visible=entry.isIntersecting; syncPreview(); }
      });
    },{threshold:0});
    if(mini) previews.observe(mini);
    document.querySelectorAll('.hero,a.t').forEach(function(el){ previews.observe(el); });
  }
  if(reduced.matches){ running=false;cancelPreview();showStill(); }
  syncState();
})();

/* Шторки тянутся вниз за язычок, как в приложениях iPhone. Работает для всех
   шторок серии — каталога, итогов партии и лобби сетевой игры (net.js).
   Тянуть можно за язычок и за верхнюю полосу шторки (до заголовка); кнопки
   и поля там не перехватываются. Отпустили ниже порога или смахнули быстро —
   шторка закрывается тем же путём, что и нажатие на затемнение (у каждой
   страницы своё закрытие: «Готово», сброс турнира и т. п. остаются за ней);
   иначе возвращается на место. Пока в шторке набирают текст, жест выключен. */
(function(){
  'use strict';
  var ZONE=56, FAR=90, FAST=0.55;              /* px от верха шторки; px сдвига; px/мс */
  var drag=null;
  function sheetOf(t){
    var s=t && t.closest && t.closest('.sheet,.np-sheet');
    if(!s) return null;
    var open=s.classList.contains('on') ||
      (s.classList.contains('np-sheet') ? document.body.classList.contains('np-open')
        : document.body.classList.contains('open'));
    if(!open || s.classList.contains('typing') || s.classList.contains('np-typing')) return null;
    return s;
  }
  function backdropOf(s){
    return document.getElementById(s.classList.contains('np-sheet') ? 'npBack' : 'backdrop');
  }
  function start(x,y,t){
    var s=sheetOf(t); if(!s || !backdropOf(s)) return false;
    if(t.closest('button,a,input,textarea,select,label,[role="button"],[role="switch"]')) return false;
    var top=s.getBoundingClientRect().top;
    if(!(t.closest('.grab,.np-grab') || y-top<=ZONE)) return false;
    drag={s:s,y0:y,y:y,t0:Date.now(),t:Date.now(),v:0,moved:false};
    return true;
  }
  function move(y){
    if(!drag) return false;
    var dy=Math.max(0,y-drag.y0), now=Date.now();
    if(now>drag.t) drag.v=(y-drag.y)/(now-drag.t);
    drag.y=y; drag.t=now;
    if(!drag.moved && dy<4) return false;
    drag.moved=true;
    drag.s.style.transition='none';
    drag.s.style.transform='translateY('+dy+'px)';
    return true;
  }
  function end(){
    if(!drag) return;
    var d=drag; drag=null;
    if(!d.moved) return;
    var dy=d.y-d.y0, close=dy>FAR || (dy>24 && d.v>FAST);
    d.s.style.transition='';                    /* дальше едет своим CSS-переходом */
    d.s.style.transform='';
    if(close){
      var b=backdropOf(d.s);
      if(b) b.click();
    }
  }
  /* касание: двигаем шторку и не даём странице прокручиваться под пальцем */
  document.addEventListener('touchstart',function(e){
    if(e.touches.length!==1) return;
    start(e.touches[0].clientX,e.touches[0].clientY,e.target);
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!drag) return;
    move(e.touches[0].clientY);
    if(e.cancelable) e.preventDefault();           /* с первого же пикселя, иначе под шторкой поедет страница */
  },{passive:false});
  document.addEventListener('touchend',end,{passive:true});
  document.addEventListener('touchcancel',end,{passive:true});
  /* мышь — на компьютере тоже можно смахнуть */
  document.addEventListener('mousedown',function(e){
    if(e.button===0 && start(e.clientX,e.clientY,e.target)) e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){ if(drag) move(e.clientY); });
  document.addEventListener('mouseup',end);
})();
