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
