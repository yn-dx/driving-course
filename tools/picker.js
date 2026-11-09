// 좌표 찍기 도구: 지도를 클릭해서 코스 경로/검사점 좌표를 만들고 courses.json으로 내보냅니다.
(function () {
  var cfg = window.APP_CONFIG || {};
  var TYPES = window.CHECKPOINT_TYPES;
  var DATA_URL = '../' + (cfg.DATA_URL || 'data/courses.json');
  var STORAGE_KEY = 'driving-course-picker-v1';
  var $ = function (id) { return document.getElementById(id); };

  var map = null;
  var data = null;
  var currentId = null;
  var mode = 'path';
  var history = {};   // 코스별 실행 기록 (되돌리기용): [{kind:'path'} | {kind:'cp', ref: 검사점}]
  var layers = [];
  var editing = -1;   // 수정 중인 검사점 번호 (checkpoints 배열 index, 없으면 -1)

  // 소수점 6자리 ≈ 0.1m 정밀도. 그 이상은 파일만 커집니다.
  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  function toLatLng(p) { return new kakao.maps.LatLng(p[0], p[1]); }
  function course() { return data.courses.filter(function (c) { return c.id === currentId; })[0]; }

  function msg(text) { $('msg').textContent = text || ''; $('msg').hidden = !text; }

  // ---------- 저장 ----------
  function saveDraft() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 환경이면 무시 */ }
  }
  function loadDraft() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // 내보낼 JSON: 검사점을 주행 순서대로 정렬하고 거리 계산
  function buildExport() {
    var out = JSON.parse(JSON.stringify(data));
    out.updatedAt = new Date().toISOString().slice(0, 10);
    out.courses.forEach(function (c) {
      c.checkpoints.sort(function (a, b) {
        return window.nearestPathIndex(c.path, a.position) - window.nearestPathIndex(c.path, b.position);
      });
      c.distanceKm = Math.round(window.pathLengthKm(c.path) * 100) / 100;
    });
    return JSON.stringify(out, null, 2);
  }

  function refreshOutput() {
    $('output').value = buildExport();
    var c = course();
    $('stats').textContent = c.name + ' · 경로 점 ' + c.path.length + '개 · ' +
      window.pathLengthKm(c.path).toFixed(2) + 'km · 검사점 ' + c.checkpoints.length + '개';
    saveDraft();
  }

  // ---------- 지도 그리기 ----------
  function clearLayers() { layers.forEach(function (l) { l.setMap(null); }); layers = []; }

  function redraw() {
    if (!map) return;
    clearLayers();
    var cur = course();

    // 다른 코스는 참고용으로 흐리게
    data.courses.forEach(function (c) {
      if (c.id === cur.id || c.path.length < 2) return;
      layers.push(new kakao.maps.Polyline({
        map: map, path: c.path.map(toLatLng),
        strokeWeight: 3, strokeColor: c.color, strokeOpacity: 0.3, strokeStyle: 'shortdash'
      }));
    });

    if (cur.path.length >= 2) {
      layers.push(new kakao.maps.Polyline({
        map: map, path: cur.path.map(toLatLng),
        strokeWeight: 5, strokeColor: cur.color, strokeOpacity: 0.9, strokeStyle: 'solid', endArrow: true
      }));
    }

    // 찍은 점 표시 (첫 점은 초록, 마지막 점은 빨강)
    cur.path.forEach(function (p, i) {
      var el = document.createElement('div');
      el.className = 'pt-dot';
      if (i === 0) el.style.background = '#16a34a';
      if (i === cur.path.length - 1 && i > 0) el.style.background = '#dc2626';
      layers.push(new kakao.maps.CustomOverlay({ map: map, position: toLatLng(p), content: el, xAnchor: 0.5, yAnchor: 0.5 }));
    });

    cur.checkpoints.forEach(function (cp, i) {
      var t = TYPES[cp.type] || TYPES.caution;
      var el = document.createElement('div');
      el.className = 'cp-dot' + (i === editing ? ' editing' : '');
      el.style.background = t.color;
      el.textContent = String(i + 1);
      el.title = (cp.label || '(이름 없음)') + ' — 눌러서 수정';
      // 지도 위 번호를 누르면 목록에서 해당 검사점 수정 열기 (clickable: 지도 클릭으로 새 점이 찍히지 않게)
      el.addEventListener('click', function (e) { e.stopPropagation(); startEdit(i); });
      layers.push(new kakao.maps.CustomOverlay({
        map: map, position: toLatLng(cp.position), content: el, xAnchor: 0.5, yAnchor: 0.5, clickable: true, zIndex: i === editing ? 5 : 3
      }));
    });
  }

  // ---------- 검사점 목록 (보기 / 수정 / 삭제) ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(text, cls, onClick) {
    var b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function startEdit(i) {
    editing = i;
    redraw();
    renderCpList();
    var input = document.querySelector('.cp-item.editing .edit-label');
    if (input) {
      input.closest('li').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      input.focus();
    }
  }

  function cancelEdit() {
    editing = -1;
    redraw();
    renderCpList();
  }

  function deleteCheckpoint(i) {
    var c = course();
    var cp = c.checkpoints[i];
    if (!window.confirm((i + 1) + '번 검사점 "' + (cp.label || '이름 없음') + '"을(를) 삭제할까요?')) return;
    c.checkpoints.splice(i, 1);
    // 되돌리기 기록에서도 빼서, Ctrl+Z가 다른 검사점을 지우지 않게 함
    history[c.id] = (history[c.id] || []).filter(function (h) { return h.ref !== cp; });
    if (editing === i) editing = -1;
    else if (editing > i) editing -= 1;
    update();
    msg((i + 1) + '번 검사점을 삭제했어요.');
  }

  function viewRow(cp, i) {
    var t = TYPES[cp.type] || TYPES.caution;
    var box = el('div', 'cp-view');
    var head = el('div', 'cp-head');
    var kind = el('span', 'cp-kind', t.label);
    kind.style.color = t.color;
    kind.style.borderColor = t.color;
    head.appendChild(kind);
    head.appendChild(el('strong', cp.label ? '' : 'empty', cp.label || '(이름 없음)'));
    box.appendChild(head);
    if (cp.tip) box.appendChild(el('p', 'cp-tip', cp.tip));
    var actions = el('div', 'cp-actions');
    actions.appendChild(button('수정', '', function () { startEdit(i); }));
    actions.appendChild(button('삭제', 'danger', function () { deleteCheckpoint(i); }));
    box.appendChild(actions);
    return box;
  }

  function editForm(cp, i) {
    var form = el('form', 'cp-edit');
    var typeSel = el('select', 'edit-type');
    Object.keys(TYPES).forEach(function (k) {
      var o = el('option', null, TYPES[k].label);
      o.value = k;
      typeSel.appendChild(o);
    });
    typeSel.value = TYPES[cp.type] ? cp.type : 'caution';
    var label = el('input', 'edit-label');
    label.type = 'text';
    label.value = cp.label || '';
    label.placeholder = '이름';
    var tip = el('textarea', 'edit-tip');
    tip.rows = 3;
    tip.value = cp.tip || '';
    tip.placeholder = '팁';

    var l1 = el('label', null, '종류 '); l1.appendChild(typeSel);
    var l2 = el('label', null, '이름 '); l2.appendChild(label);
    var l3 = el('label', null, '팁 '); l3.appendChild(tip);
    form.appendChild(l1); form.appendChild(l2); form.appendChild(l3);

    var actions = el('div', 'cp-actions');
    var save = el('button', 'primary', '저장');
    save.type = 'submit';
    actions.appendChild(save);
    actions.appendChild(button('취소', '', cancelEdit));
    actions.appendChild(button('삭제', 'danger', function () { deleteCheckpoint(i); }));
    form.appendChild(actions);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      cp.type = typeSel.value;
      cp.label = label.value.trim();
      cp.tip = tip.value.trim();
      editing = -1;
      update();
      msg((i + 1) + '번 검사점을 수정했어요.');
    });
    form.addEventListener('keydown', function (e) { if (e.key === 'Escape') cancelEdit(); });
    return form;
  }

  function renderCpList() {
    var list = $('cp-list');
    var cps = course().checkpoints;
    list.innerHTML = '';
    $('cp-count').textContent = cps.length
      ? '찍은 검사점 ' + cps.length + '개 · 수정/삭제하려면 [수정]이나 지도 위 번호를 누르세요'
      : '아직 찍은 검사점이 없어요.';
    cps.forEach(function (cp, i) {
      var li = el('li', 'cp-item' + (i === editing ? ' editing' : ''));
      li.appendChild(i === editing ? editForm(cp, i) : viewRow(cp, i));
      list.appendChild(li);
    });
  }

  function update() {
    redraw();
    renderCpList();
    refreshOutput();
  }

  // ---------- 조작 ----------
  function onMapClick(mouseEvent) {
    var ll = mouseEvent.latLng;
    var pos = [round6(ll.getLat()), round6(ll.getLng())];
    var c = course();
    history[c.id] = history[c.id] || [];

    if (mode === 'path') {
      c.path.push(pos);
      history[c.id].push({ kind: 'path' });
    } else {
      var cp = {
        type: $('cp-type').value,
        label: $('cp-label').value.trim(),
        tip: $('cp-tip').value.trim(),
        position: pos
      };
      c.checkpoints.push(cp);
      history[c.id].push({ kind: 'cp', ref: cp });
      $('cp-label').value = '';
      $('cp-tip').value = '';
    }
    update();
  }

  function undo() {
    var c = course();
    var stack = history[c.id] || [];
    var last = stack.pop();
    editing = -1;
    if (last && last.kind === 'cp') {
      // 방금 찍은 그 검사점을 지움 (중간에 다른 점을 삭제했어도 엉뚱한 점이 지워지지 않게)
      var idx = c.checkpoints.indexOf(last.ref);
      if (idx >= 0) c.checkpoints.splice(idx, 1);
    }
    else if (last && last.kind === 'path') c.path.pop();
    else if (mode === 'path') c.path.pop();     // 불러온 데이터는 기록이 없으니 현재 모드 기준으로 제거
    else c.checkpoints.pop();
    update();
  }

  function setMode(m) {
    mode = m;
    $('mode-badge').textContent = m === 'path' ? '경로 찍기' : '검사점 찍기';
    $('mode-badge').classList.toggle('cp', m === 'checkpoint');
    $('cp-form').classList.toggle('on', m === 'checkpoint');
  }

  function selectCourse(id) {
    currentId = id;
    editing = -1;
    $('summary').value = course().summary || '';
    update();
    fit();
  }

  function fit() {
    if (!map) return;
    var c = course();
    var pts = c.path.concat(c.checkpoints.map(function (x) { return x.position; }));
    if (pts.length === 0) { map.setCenter(toLatLng(data.center.location)); map.setLevel(4); return; }
    var b = new kakao.maps.LatLngBounds();
    pts.forEach(function (p) { b.extend(toLatLng(p)); });
    map.setBounds(b);
  }

  function fillControls() {
    var sel = $('course');
    sel.innerHTML = '';
    data.courses.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    var typeSel = $('cp-type');
    typeSel.innerHTML = '';
    Object.keys(TYPES).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = TYPES[k].label;
      typeSel.appendChild(o);
    });
    $('address').value = data.center.address;
  }

  function bindEvents() {
    $('course').addEventListener('change', function (e) { selectCourse(e.target.value); });
    document.querySelectorAll('input[name=mode]').forEach(function (r) {
      r.addEventListener('change', function (e) { setMode(e.target.value); });
    });
    $('undo').addEventListener('click', undo);
    document.addEventListener('keydown', function (e) {
      var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    });
    $('clear-path').addEventListener('click', function () {
      var c = course();
      if (c.path.length && window.confirm(c.name + ' 경로 점 ' + c.path.length + '개를 모두 지울까요?')) {
        c.path = [];
        history[c.id] = [];
        update();
      }
    });
    $('summary').addEventListener('input', function (e) { course().summary = e.target.value; refreshOutput(); });
    $('copy').addEventListener('click', function () {
      var text = buildExport();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { msg('복사했어요. data/courses.json에 붙여넣으세요.'); },
          function () { $('output').select(); msg('자동 복사가 막혀서 아래 텍스트를 선택해 두었어요. Ctrl+C로 복사하세요.'); });
      } else { $('output').select(); }
    });
    $('download').addEventListener('click', function () {
      var blob = new Blob([buildExport()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'courses.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    $('reload').addEventListener('click', function () {
      if (!window.confirm('임시저장한 작업을 버리고 원본 파일을 다시 불러올까요?')) return;
      fetchOriginal().then(function (json) { data = json; history = {}; fillControls(); selectCourse(data.courses[0].id); msg('원본을 불러왔어요.'); });
    });
    $('geocode').addEventListener('click', function () {
      if (!map || !kakao.maps.services) return;
      var geocoder = new kakao.maps.services.Geocoder();
      geocoder.addressSearch($('address').value, function (result, status) {
        if (status !== kakao.maps.services.Status.OK) { msg('주소를 찾지 못했어요.'); return; }
        // 카카오 응답은 x=경도, y=위도 (순서 주의)
        var lat = round6(parseFloat(result[0].y));
        var lng = round6(parseFloat(result[0].x));
        data.center.location = [lat, lng];
        data.center.locationVerified = true;
        map.setCenter(toLatLng(data.center.location));
        map.setLevel(4);
        refreshOutput();
        msg('학원 위치를 ' + lat + ', ' + lng + '(으)로 저장했어요.');
      });
    });
  }

  function fetchOriginal() {
    return fetch(DATA_URL, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('data/courses.json을 불러오지 못했습니다 (' + r.status + ')');
      return r.json();
    });
  }

  // ---------- 시작 ----------
  var draft = loadDraft();
  (draft ? Promise.resolve(draft) : fetchOriginal())
    .then(function (json) {
      data = json;
      if (draft) msg('임시저장된 작업을 이어서 불러왔어요.');
      fillControls();
      bindEvents();
      setMode('path');
      currentId = data.courses[0].id;
      refreshOutput();
      return window.loadKakaoMaps(cfg.KAKAO_JS_KEY, ['services']);
    })
    .then(function () {
      map = new kakao.maps.Map($('map'), { center: toLatLng(data.center.location), level: 4 });
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT); // 스카이뷰 전환
      kakao.maps.event.addListener(map, 'click', onMapClick);
      selectCourse(currentId);
    })
    .catch(function (err) {
      msg(err.message + ' (tools/picker.html은 로컬 서버로 열어야 합니다)');
    });
})();
