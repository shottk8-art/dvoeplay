/* ---------- игра по сети, общий модуль dvoeplay ---------- */
/* Один файл на все игры серии. Подключается строкой <script src="net.js"></script>
   перед скриптом самой игры.

   Что берёт на себя модуль: комната и код, лобби с приглашением по ссылке,
   опрос сервера, доставка ходов в обе стороны, согласованный реванш,
   предупреждение об обрыве связи и общий генератор случайных чисел.

   Чего модуль НЕ знает: правил игры. Очерёдность считает сама игра и
   сообщает её в NET.send(ход, комуДальше) — потому что в «Точках»,
   «Мемо-дуэли» и «Ящике» ход часто остаётся за тем же игроком.

   Разметку и стили модуль вставляет сам: у игр серии шторки устроены
   по-разному (где-то body.open и .backdrop, где-то scrim и .on), и
   опираться на них нельзя. Зато CSS-переменные у всех общие — на них
   всё и построено, поэтому лобби выглядит родным в любой игре.

   Партия синхронизируется СПИСКОМ ХОДОВ: игры детерминированные, так что
   достаточно передать сам ход, а состояние поля каждый считает у себя.
   Там, где нужна общая случайность (колода, загаданное слово, броски
   кубиков), используется NET.rng — генератор от общего зерна комнаты,
   одинаковый у обоих и свой на каждый раунд. */

var NET = (function(){
  "use strict";

  var opt = null;                 /* настройки от игры */
  var timer = 0, gen = 0;
  var over = false;               /* партия доиграна, ждём реванша */
  var againLabel = '';            /* родная подпись кнопки «играть снова» */
  var el = {};

  var api_ = {
    on: false, live: false, turn: 0,
    code: '', token: '', seat: 0, round: 0, seed: 0,
    rng: null, oppOnline: false, oppLeft: false,
    myName: '', oppName: ''
  };

  /* Своё имя лежит в общей памяти приложения. Читаем её напрямую, а не
     через DP: блок DP объявлен внутри замыкания игры и снаружи не виден.
     Ключ и правила обрезки те же, что в DP — если меняются, менять тут тоже. */
  var STORE = 'dvoeplay:v1';
  function clipName(v){
    return String(v == null ? '' : v).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, 12);
  }
  function myName(){
    try {
      var d = JSON.parse(localStorage.getItem(STORE));
      return clipName(d && d.names && d.names.me);
    } catch(e){ return ''; }
  }
  function saveMyName(v){
    try {
      var d = JSON.parse(localStorage.getItem(STORE));
      if (!d || typeof d !== 'object') d = { v: 1, games: {} };
      if (!d.names) d.names = { me: '', friend: '' };
      d.names.me = clipName(v);
      localStorage.setItem(STORE, JSON.stringify(d));
    } catch(e){}
  }

  /* ---------- общая случайность ---------- */
  /* mulberry32: короткий и равномерный, одинаковый у обоих игроков */
  function mulberry32(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seedRound(){ api_.rng = mulberry32((api_.seed | 0) + api_.round * 7919); }

  /* ---------- стили ---------- */
  var CSS = [
    '.np-back{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.3);opacity:0;pointer-events:none;',
      'transition:opacity .34s ease;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
    '.np-open .np-back{opacity:1;pointer-events:auto}',
    '.np-sheet{position:fixed;left:0;right:0;bottom:0;z-index:41;max-width:520px;margin:0 auto;',
      'background:var(--surface);color:var(--label);border-radius:26px 26px 0 0;',
      'padding:10px 20px calc(22px + env(safe-area-inset-bottom));text-align:center;',
      'box-shadow:0 -8px 40px rgba(0,0,0,.18);transform:translateY(101%);',
      'transition:transform .5s var(--spring,cubic-bezier(.32,.72,0,1));',
      'font:400 17px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",system-ui,sans-serif}',
    '.np-open .np-sheet{transform:translateY(0)}',
    '.np-grab{width:36px;height:5px;border-radius:3px;background:var(--fill);margin:0 auto 18px}',
    '.np-sheet h2{font-size:24px;font-weight:700;letter-spacing:-.45px;margin:0 0 5px}',
    '.np-sub{font-size:15px;color:var(--label2);margin:0 0 22px;letter-spacing:-.1px}',
    '.np-pane[hidden]{display:none}',
    '.np-code{font:700 42px/1 -apple-system,system-ui,sans-serif;letter-spacing:10px;text-indent:10px;',
      'font-variant-numeric:tabular-nums;margin:0 0 18px}',
    '.np-in{display:block;width:100%;margin:0 0 16px;padding:15px 0;border:0;border-radius:14px;',
      'background:var(--fill);color:var(--label);text-align:center;text-indent:10px;outline:none;',
      'font:700 32px/1 -apple-system,system-ui,sans-serif;letter-spacing:10px;',
      'font-variant-numeric:tabular-nums;-webkit-user-select:text;user-select:text}',
    '.np-in::placeholder{color:var(--label3);letter-spacing:10px}',
    '.np-name{display:block;width:100%;margin:0 0 12px;padding:14px 16px;border:0;border-radius:14px;',
      'background:var(--fill);color:var(--label);text-align:center;outline:none;',
      'font:500 17px/1 -apple-system,system-ui,sans-serif;letter-spacing:-.2px;',
      '-webkit-user-select:text;user-select:text}',
    '.np-name::placeholder{color:var(--label3);font-weight:400}',
    '.np-name:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--tint) 40%,transparent)}',
    '.np-in:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--tint) 40%,transparent)}',
    '.np-wait{display:flex;align-items:center;justify-content:center;gap:7px;margin:0 0 18px;',
      'font-size:14px;color:var(--label2);letter-spacing:-.1px}',
    '.np-dot{display:inline-flex;gap:3px}',
    '.np-dot i{width:4px;height:4px;border-radius:50%;background:var(--label2);opacity:.25;animation:np-blink 1.1s infinite}',
    '.np-dot i:nth-child(2){animation-delay:.15s}.np-dot i:nth-child(3){animation-delay:.3s}',
    '@keyframes np-blink{0%,60%,100%{opacity:.22}30%{opacity:.9}}',
    '.np-go{display:block;width:100%;border:0;border-radius:14px;background:var(--tint);color:#fff;cursor:pointer;',
      'font:600 17px/1 -apple-system,system-ui,sans-serif;letter-spacing:-.2px;padding:16px;',
      'transition:transform .18s var(--spring,ease),opacity .18s ease}',
    '.np-go:active{transform:scale(.97);opacity:.85}',
    '.np-go[disabled]{opacity:.5;transform:none;cursor:default}',
    '.np-alt{border:0;background:none;color:var(--tint);cursor:pointer;padding:16px 8px 2px;',
      'font:400 17px/1 -apple-system,system-ui,sans-serif}',
    '.np-msg{margin:14px 0 0;font-size:14px;line-height:1.35;color:var(--red-b,#E7362B);letter-spacing:-.1px;word-break:break-word}',
    '.np-msg:empty{display:none}',
    '.np-msg.np-ok{color:var(--label2)}',
    /* предупреждение о связи: висит только когда что-то не так */
    '.np-warn{position:fixed;left:50%;bottom:calc(10px + env(safe-area-inset-bottom));z-index:39;',
      'transform:translate(-50%,14px);opacity:0;pointer-events:none;',
      'padding:7px 14px;border-radius:999px;background:var(--red-b,#E7362B);color:#fff;',
      'font:600 13px/1 -apple-system,system-ui,sans-serif;letter-spacing:-.1px;white-space:nowrap;',
      'box-shadow:0 6px 18px -6px rgba(0,0,0,.5);transition:opacity .3s ease,transform .3s var(--spring,ease)}',
    '.np-warn.np-show{opacity:1;transform:translate(-50%,0)}'
  ].join('');

  var HTML =
    '<div class="np-back" id="npBack"></div>' +
    '<aside class="np-sheet" id="npSheet" role="dialog" aria-modal="true" aria-labelledby="npTitle">' +
      '<div class="np-grab"></div>' +
      '<h2 id="npTitle">Игра по сети</h2>' +
      '<p class="np-sub" id="npSub">Один создаёт комнату, второй входит по коду</p>' +
      '<div class="np-pane" id="npPick">' +
        '<input class="np-name" id="npName" type="text" maxlength="12" autocomplete="off" ' +
               'placeholder="Ваше имя" aria-label="Ваше имя">' +
        '<button class="np-go" id="npNew" type="button">Создать комнату</button>' +
        '<button class="np-alt" id="npHas" type="button">У меня есть код</button>' +
      '</div>' +
      '<div class="np-pane" id="npWait" hidden>' +
        '<div class="np-code" id="npCode" aria-label="Код комнаты">·····</div>' +
        '<p class="np-wait">Ждём соперника <span class="np-dot"><i></i><i></i><i></i></span></p>' +
        '<button class="np-go" id="npShare" type="button">Поделиться ссылкой</button>' +
        '<button class="np-alt" id="npCancel" type="button">Отмена</button>' +
      '</div>' +
      '<div class="np-pane" id="npEnter" hidden>' +
        '<input class="np-in" id="npInput" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" ' +
               'placeholder="00000" autocomplete="off" aria-label="Код комнаты">' +
        '<button class="np-go" id="npJoin" type="button">Войти</button>' +
        '<button class="np-alt" id="npBackBtn" type="button">Назад</button>' +
      '</div>' +
      '<div class="np-msg" id="npMsg"></div>' +
    '</aside>' +
    '<div class="np-warn" id="npWarn"></div>';

  function build(){
    if (el.sheet) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var box = document.createElement('div');
    box.innerHTML = HTML;
    while (box.firstChild) document.body.appendChild(box.firstChild);

    var id = function(n){ return document.getElementById(n); };
    el = { sheet:id('npSheet'), back:id('npBack'), sub:id('npSub'), msg:id('npMsg'),
           code:id('npCode'), input:id('npInput'), join:id('npJoin'), make:id('npNew'),
           name:id('npName'), warn:id('npWarn'),
           panes:{ pick:id('npPick'), wait:id('npWait'), enter:id('npEnter') } };

    /* имя сохраняем сразу, чтобы оно подставилось и в следующий раз, и в играх */
    el.name.value = myName();
    el.name.addEventListener('input', function(){ saveMyName(el.name.value); });
    el.name.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); try{ el.name.blur(); }catch(err){} }
    });
    el.make.addEventListener('click', create);
    id('npHas').addEventListener('click', function(){
      pane('enter');
      setTimeout(function(){ try{ el.input.focus(); }catch(e){} }, 340);
    });
    id('npBackBtn').addEventListener('click', function(){ pane('pick'); });
    id('npCancel').addEventListener('click', cancel);
    id('npShare').addEventListener('click', share);
    el.join.addEventListener('click', function(){ join(el.input.value); });
    el.input.addEventListener('input', function(){
      var v = el.input.value.replace(/\D/g, '').slice(0, 5);
      if (v !== el.input.value) el.input.value = v;
      say('');
      if (v.length === 5){
        /* код введён целиком — клавиатура телефона больше не нужна и
           иначе остаётся висеть поверх игры */
        try{ el.input.blur(); }catch(e){}
        join(v);
      }
    });
    el.input.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){
        e.preventDefault();
        try{ el.input.blur(); }catch(err){}
        join(el.input.value);
      }
    });
    el.back.addEventListener('click', cancel);
    var sy = null;
    el.sheet.addEventListener('pointerdown', function(e){ sy = e.clientY; });
    el.sheet.addEventListener('pointerup', function(e){
      if (sy !== null && e.clientY - sy > 60) cancel();
      sy = null;
    });
    /* щелчок по кнопкам лобби — тем же звуком, что и везде в игре */
    el.sheet.addEventListener('pointerdown', function(e){
      var n = e.target;
      while (n && n.nodeType === 1 && n !== el.sheet){
        if (n.classList && (n.classList.contains('np-go') || n.classList.contains('np-alt'))){
          try{ FX.fire(5, 'light'); }catch(err){}
          return;
        }
        n = n.parentNode;
      }
    }, true);
  }

  var SUB = { pick:'Один создаёт комнату, второй входит по коду',
              wait:'Назовите код сопернику или отправьте ссылку',
              enter:'Введите пять цифр из комнаты соперника' };

  function say(msg, good){
    el.msg.textContent = msg || '';
    el.msg.className = 'np-msg' + (good ? ' np-ok' : '');
  }
  function pane(name){
    for (var k in el.panes) el.panes[k].hidden = (k !== name);
    el.sub.textContent = SUB[name];
    say('');
  }
  function open(){
    build();
    el.code.textContent = '·····';
    el.name.value = myName();
    pane('pick');
    document.body.classList.add('np-open');
  }
  function close(){
    document.body.classList.remove('np-open');
    try{ if (el.input) el.input.blur(); }catch(e){}
    try{ if (el.name) el.name.blur(); }catch(e){}
  }

  function announce(t){
    var l = document.getElementById('live');
    if (l) l.textContent = t;
  }

  /* ---------- связь ---------- */
  function call(action, body){
    return fetch('/api/' + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function(r){
      return r.text().then(function(t){
        var j = null;
        try { j = JSON.parse(t); } catch(e){}
        if (!j) j = { error: 'Сетевая игра на этом адресе не работает' };
        return { status: r.status, body: j };
      });
    }, function(){ return { status: 0, body: { error: 'Нет связи с сервером' } }; });
  }

  function applied(){
    try { return opt && opt.applied ? (opt.applied() | 0) : 0; } catch(e){ return 0; }
  }

  /* опрос разряжаем, когда ждать нечего: это единственный расходуемый ресурс */
  function rate(){
    if (!api_.live) return 1500;
    if (over) return 1200;
    return 1000;
  }
  function poll(ms){
    clearTimeout(timer);
    if (!api_.on) return;
    timer = setTimeout(step, ms === undefined ? rate() : ms);
  }
  /* Каждому запросу — свой номер. Ответ, который опоздал и устарел, мы
     выбрасываем: иначе он выглядит как «мы убежали вперёд сервера» и зря
     запускает пересборку раунда. */
  function step(){
    if (!api_.on) return;
    var g = ++gen;
    call('state', { code:api_.code, token:api_.token, since:applied() }).then(function(res){
      if (g !== gen || !api_.on) return;
      apply(res);
      poll();
    });
  }

  function apply(res){
    if (!api_.on) return;
    if (res.status === 404 || res.status === 410){ fail('Комната закрылась'); return; }
    if (res.status === 403){ fail('Вас нет в этой комнате'); return; }
    if (res.status !== 200) return;          /* 409 и прочее — ждём следующего опроса */
    var v = res.body;
    if (v.seat) api_.seat = v.seat;
    api_.oppOnline = !!v.oppOnline;
    api_.oppLeft = !!v.oppLeft;
    if (v.oppName) api_.oppName = v.oppName;
    /* Очередь по мнению сервера. Игра ведёт свою, но если её местный отсчёт
       отстал — скажем, телефон погасил экран и браузер придержал таймеры —
       игра догоняет по этой цифре. */
    var wasTurn = api_.turn;
    api_.turn = v.turn | 0;

    if (!api_.live){                          /* сидим в комнате и ждём второго */
      if (v.joined){ close(); begin(); }
      return;
    }
    warn();
    if (api_.live && api_.turn && api_.turn !== wasTurn) fire('turn', api_.turn);

    if (v.round > api_.round){                /* оба согласились на реванш */
      api_.round = v.round;
      over = false;
      seedRound();
      resetAgain();
      fire('round', { seat:api_.seat, round:api_.round, seed:api_.seed, rng:api_.rng });
      return;
    }
    if (v.total < applied()){ resync(); return; }   /* мы забежали вперёд */
    if (v.moves && v.moves.length){
      var quick = v.moves.length < 2;         /* догоняем пачку — без анимации */
      for (var i = 0; i < v.moves.length; i++){
        if ((v.since + i) !== applied()) continue;
        fire('move', v.moves[i], quick);
      }
    }
    syncAgain(v);
  }

  /* поле разъехалось с сервером — собираем заново по списку ходов */
  function resync(){
    try{ console.warn('[net] пересборка раунда: у нас '+applied()+' ходов'); }catch(e){}
    var g = ++gen;
    call('state', { code:api_.code, token:api_.token, since:0 }).then(function(res){
      if (g !== gen || !api_.on || res.status !== 200) return;
      var v = res.body, i;
      /* Перепроверка: обычно тревога ложная — просто пришёл запоздавший ответ.
         Пересобирать раунд без нужды нельзя: счёт партий посчитается дважды. */
      if (v.round === api_.round && v.total >= applied()){
        apply({ status: 200, body: v });
        return;
      }
      try{ console.warn('[net] пересборка ПОДТВЕРЖДЕНА: сервер '+v.total+', раунд '+v.round); }catch(e){}
      api_.round = v.round;
      over = false;
      seedRound();
      fire('round', { seat:api_.seat, round:api_.round, seed:api_.seed, rng:api_.rng });
      for (i = 0; i < v.moves.length; i++){
        if (applied() !== i) break;
        fire('move', v.moves[i], false);
      }
      warn();
    });
  }

  function fire(name, a, b){
    if (!opt || typeof opt[name] !== 'function') return;
    try { opt[name](a, b); } catch(e){}
  }

  function begin(){
    api_.live = true;
    over = false;
    seedRound();
    document.body.classList.add('np-play');
    fire('begin', { seat:api_.seat, round:api_.round, seed:api_.seed, rng:api_.rng });
    announce('Соперник подключился');
    poll(500);
  }

  function create(){
    el.make.disabled = true; el.make.textContent = 'Создаём…';
    el.code.textContent = '·····';
    api_.myName = myName();
    call('create', { game: opt ? opt.game : 'dvoeplay', name: api_.myName }).then(function(res){
      el.make.disabled = false; el.make.textContent = 'Создать комнату';
      if (res.status !== 200){ say(res.body.error || 'Не получилось создать комнату'); return; }
      api_.code = res.body.code; api_.token = res.body.token;
      api_.seat = 1; api_.round = 0; api_.seed = res.body.seed;
      api_.on = true; api_.live = false; api_.oppLeft = false; api_.oppOnline = false;
      api_.oppName = '';
      el.code.textContent = api_.code;
      pane('wait');
      poll(800);
    });
  }

  function join(code){
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 5){ say('Нужны пять цифр'); return; }
    el.join.disabled = true; el.join.textContent = 'Входим…';
    api_.myName = myName();
    call('join', { code: code, game: opt ? opt.game : undefined, name: api_.myName }).then(function(res){
      el.join.disabled = false; el.join.textContent = 'Войти';
      if (res.status !== 200){ say(res.body.error || 'Не получилось войти'); return; }
      api_.code = code; api_.token = res.body.token;
      api_.seat = 2; api_.round = res.body.round | 0; api_.seed = res.body.seed;
      api_.on = true; api_.oppLeft = false; api_.oppOnline = true;
      api_.oppName = res.body.oppName || '';
      close();
      begin();
    });
  }

  /* ход этого игрока: next — кому переходит очередь (1 или 2) */
  function send(move, next){
    if (!api_.on) return;
    var g = ++gen;
    call('move', { code:api_.code, token:api_.token, move:move,
                   round:api_.round, next:next | 0, since:applied() }).then(function(res){
      if (g !== gen || !api_.on) return;
      if (res.status === 409){ resync(); return; }
      apply(res);
    });
    poll(900);
  }

  function result(winner){
    over = true;
    if (!api_.on) return;
    gen++;                                   /* прежние ответы уже неактуальны */
    call('result', { code:api_.code, token:api_.token, winner: winner | 0 });
    poll(700);
  }

  /* ---------- реванш ---------- */
  function againEl(){ return document.getElementById('again'); }
  function resetAgain(){
    var b = againEl();
    if (!b) return;
    b.disabled = false;
    if (againLabel) b.textContent = againLabel;
  }
  function rematch(){
    if (!api_.on) return;
    var b = againEl();
    if (b){
      if (!againLabel) againLabel = b.textContent;
      b.disabled = true; b.textContent = 'Ждём соперника…';
    }
    var g = ++gen;
    call('again', { code:api_.code, token:api_.token }).then(function(res){
      if (g !== gen || !api_.on) return;
      if (res.status !== 200){ resetAgain(); return; }
      apply(res);
    });
    poll(700);
  }
  function syncAgain(v){
    if (!over || !v.rematch) return;
    var b = againEl();
    if (!b) return;
    if (!againLabel) againLabel = b.textContent;
    if (v.rematch[api_.seat - 1]){ b.disabled = true; b.textContent = 'Ждём соперника…'; }
    else if (v.rematch[2 - api_.seat]){ b.disabled = false; b.textContent = 'Соперник готов — играем'; }
    else resetAgain();
    fire('again', !!v.rematch[api_.seat - 1], !!v.rematch[2 - api_.seat]);
  }

  /* ---------- связь с соперником ---------- */
  function warn(){
    if (!el.warn) return;
    var msg = api_.oppLeft ? 'Соперник вышел из игры'
            : !api_.oppOnline ? 'Соперник не на связи' : '';
    if (msg){ el.warn.textContent = msg; el.warn.classList.add('np-show'); }
    else el.warn.classList.remove('np-show');
    fire('peer', { online: api_.oppOnline, left: api_.oppLeft });
  }

  /* ---------- выход ---------- */
  function stop(){
    api_.on = false; api_.live = false;
    clearTimeout(timer); gen++;
    over = false;
    document.body.classList.remove('np-play');
    if (el.warn) el.warn.classList.remove('np-show');
    resetAgain();
  }
  function leave(){
    if (!api_.on) return;
    var c = api_.code, t = api_.token;
    stop();
    call('leave', { code:c, token:t });
  }
  /* «Отмена» и смахивание: из лобби выходим совсем, из партии просто прячем шторку */
  function cancel(){
    if (api_.on && !api_.live) leave();
    close();
  }
  function fail(msg){
    var wasLive = api_.live;
    stop();
    if (wasLive) fire('ended');
    open();
    say(msg);
  }

  function share(){
    var url = location.origin + location.pathname + '?room=' + api_.code;
    var name = (opt && opt.title) ? opt.title : 'dvoeplay';
    if (navigator.share){
      navigator.share({ title: 'dvoeplay — ' + name,
        text: 'Заходи в «' + name + '», код комнаты ' + api_.code, url: url })
        .catch(function(){});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ say('Ссылка скопирована', true); },
                                             function(){ say(url, true); });
    } else say(url, true);
  }

  /* ---------- подключение игры ---------- */
  function init(o){
    opt = o || {};
    build();
    /* переход по приглашению: ?room=12345 — код подставляем сами */
    var m = /[?&]room=(\d{5})/.exec(location.search);
    if (!m) return;
    try { history.replaceState(null, '', location.pathname); } catch(e){}
    open(); pane('enter'); el.input.value = m[1];
    setTimeout(function(){ join(m[1]); }, 300);
  }

  api_.init = init;
  api_.open = open;
  api_.close = close;
  api_.cancel = cancel;
  api_.send = send;
  api_.result = result;
  api_.rematch = rematch;
  api_.leave = leave;
  api_.stop = stop;
  return api_;
})();
