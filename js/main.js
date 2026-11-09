(function () {
  "use strict";
  const S = window.Shared;
  const $ = (id) => document.getElementById(id);
  const isMobile = () => window.matchMedia("(max-width: 767.98px)").matches;

  let courses = [];
  let current = null;
  let courseMap = null;
  let setActiveTab = () => {};

  async function start() {
    let data;
    try {
      const [loaded, tips, academy] = await Promise.all([
        S.loadCourses(),
        S.loadJSON("data/tips.json").catch(() => ({})),
        S.loadJSON("data/academy.json").catch(() => ({})),
      ]);
      data = Object.assign({ tips, academy }, loaded);
      courses = loaded.courses;
    } catch (err) {
      S.showError($("panel"), err);
      $("map-status").textContent = "";
      return;
    }

    renderCautionPreview(data.tips.commonCautions || []);
    renderPrep(data.tips.preparation || []);
    renderAcademy(data.academy, data.center);
    S.setBrand(data.center);
    S.setFooterDate(data.raw.updatedAt, data.tips.updatedAt, data.academy.updatedAt);

    setActiveTab = S.renderTabs($("course-tabs"), courses, selectCourse);
    courseMap = new S.CourseMap($("map"), { center: data.center, onSelect: (no) => selectCheckpoint(no, "map") });
    selectCourse(S.initialCourseId(courses), { initial: true });   // 목록 먼저 표시
    await courseMap.init();
    $("map-status").remove();
    courseMap.show(current);
  }

  function selectCourse(id, opts) {
    const c = courses.find((x) => x.id === id);
    if (!c || (c === current && !(opts && opts.initial))) return;
    current = c;
    S.applyCourseColor(c);
    setActiveTab(c.id);
    S.rememberCourse(c.id);
    renderSummary(c);
    renderCheckpoints(c);
    hideInfo();
    $("tips-link").href = "tips.html#" + encodeURIComponent(c.id);
    if (courseMap && courseMap.mode) courseMap.show(c);
  }

  function renderSummary(c) {
    const km = c.distanceKm != null ? c.distanceKm.toFixed(1) + "km" : "—";
    $("summary").innerHTML =
      '<h2 class="summary__name">' + S.esc(c.name) + "</h2>" +
      '<p class="summary__desc">' + (c.isEmpty ? "코스 좌표 준비 중입니다." : (S.esc(c.summary) || "&nbsp;")) + "</p>" +
      '<dl class="stats">' +
      '<div class="stat"><dt>총 거리</dt><dd>' + km + "</dd></div>" +
      '<div class="stat"><dt>검사점</dt><dd>' + c.checkpoints.length + "곳</dd></div>" +
      '<div class="stat"><dt>난이도</dt><dd>' + S.stars(c.difficulty) + "</dd></div>" +
      "</dl>";
  }

  function renderCheckpoints(c) {
    $("cp-title").textContent = "검사점 " + c.checkpoints.length + "곳";
    if (!c.checkpoints.length) {
      $("cp-list").innerHTML = '<li class="todo">아직 등록된 검사점이 없어요.</li>';
      return;
    }
    $("cp-list").innerHTML = c.checkpoints.map((cp) => (
      '<li><button type="button" class="cp" data-no="' + cp.no + '">' +
      '<span class="cp__no">' + cp.no + "</span>" +
      '<span><span class="cp__head">' + S.typeBadge(cp.type) + '<span class="cp__name">' + S.esc(cp.name) + "</span></span>" +
      (cp.tip ? '<span class="cp__tip">' + S.esc(cp.tip) + "</span>" : "") +
      "</span></button></li>"
    )).join("");
    $("cp-list").querySelectorAll(".cp").forEach((b) => {
      b.addEventListener("click", () => selectCheckpoint(+b.dataset.no, "list"));
    });
  }

  function selectCheckpoint(no, from) {
    const cp = current.checkpoints.find((x) => x.no === no);
    if (!cp) return;
    document.querySelectorAll(".cp").forEach((b) => b.classList.toggle("is-active", +b.dataset.no === no));
    if (courseMap) courseMap.focus(no);
    showInfo(cp);

    if (from === "list" && isMobile()) {
      const tabsH = document.querySelector(".course-tabs").offsetHeight;
      const top = $("map-wrap").getBoundingClientRect().top + window.scrollY - tabsH;
      window.scrollTo({ top, behavior: "smooth" });
    } else if (from === "map" && !isMobile()) {
      const el = document.querySelector('.cp[data-no="' + no + '"]');
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function showInfo(cp) {
    $("map-info-title").innerHTML = '<span class="cp__no">' + cp.no + "</span>" + S.typeBadge(cp.type) + S.esc(cp.name);
    $("map-info-tip").textContent = cp.tip || "";
    $("map-info").hidden = false;
  }
  function hideInfo() {
    $("map-info").hidden = true;
    document.querySelectorAll(".cp.is-active").forEach((b) => b.classList.remove("is-active"));
  }
  $("map-info-close").addEventListener("click", () => {
    hideInfo();
    if (courseMap) courseMap.focus(null);
  });

  function renderCautionPreview(list) {
    $("caution-preview").innerHTML = list.slice(0, 3).map(cautionItem).join("") ||
      '<li class="todo">등록된 주의사항이 없습니다.</li>';
  }

  function cautionItem(t) {
    const level = t.level || "참고";
    return '<li class="caution"><span class="badge badge--' + S.esc(level) + '">' + S.esc(level) + "</span>" +
      '<span class="caution__title">' + S.esc(t.title) + "</span>" +
      (t.desc ? '<span class="caution__desc">' + S.esc(t.desc) + "</span>" : "") + "</li>";
  }

  function renderPrep(list) {
    $("prep-list").innerHTML = list.map((p) => (
      '<li class="prep"><div class="prep__title">' + S.esc(p.title) + "</div>" +
      (p.desc ? '<div class="prep__desc">' + S.esc(p.desc) + "</div>" : "") + "</li>"
    )).join("") || '<li class="todo">등록된 준비물이 없습니다.</li>';
  }

  // 주소·위치는 courses.json 의 center 를 그대로 사용 (한 곳에서만 관리)
  function renderAcademy(a, center) {
    const val = (v) => v ? S.esc(v) : '<span class="todo">확인 필요</span>';
    const phone = a.phone ? '<a href="tel:' + S.esc(a.phone.replace(/[^0-9+]/g, "")) + '">' + S.esc(a.phone) + "</a>" : val("");
    let html =
      '<dl class="info-rows">' +
      "<dt>이름</dt><dd>" + val(center.name) + "</dd>" +
      "<dt>주소</dt><dd>" + val(center.address) + "</dd>" +
      "<dt>전화</dt><dd>" + phone + "</dd>" +
      (a.hours ? "<dt>운영</dt><dd>" + S.esc(a.hours) + "</dd>" : "") +
      "</dl>";
    if (center.name) {
      // 위치가 확인된 좌표면 핀으로, 아니면 이름 검색으로 연결
      const href = center.verified && center.pos
        ? "https://map.kakao.com/link/map/" + encodeURIComponent(center.name) + "," + center.pos.lat + "," + center.pos.lng
        : "https://map.kakao.com/link/search/" + encodeURIComponent(center.name);
      html += '<a class="link-btn" href="' + S.esc(href) + '" target="_blank" rel="noopener">카카오맵에서 위치 보기 ›</a>';
    }

    html += '<h3 class="info-sub">셔틀</h3>';
    if (a.shuttle && a.shuttle.length) {
      html += '<dl class="info-rows">' + a.shuttle.map((s) => (
        "<dt>" + S.esc(s.route || s.name) + "</dt><dd>" + S.esc(s.desc || s.times || "") + "</dd>"
      )).join("") + "</dl>";
    } else {
      html += '<p class="todo">' + S.esc(a.shuttleNote || "셔틀 정보 확인 필요") + "</p>";
    }

    if (a.examSteps && a.examSteps.length) {
      html += '<h3 class="info-sub">시험 절차</h3><ol class="steps">' + a.examSteps.map((s) => (
        '<li class="step"><div><div class="step__title">' + S.esc(s.title) + "</div>" +
        (s.desc ? '<div class="step__desc">' + S.esc(s.desc) + "</div>" : "") + "</div></li>"
      )).join("") + "</ol>";
      if (a.examNote) html += '<p class="note">' + S.esc(a.examNote) + "</p>";
    }
    $("academy-body").innerHTML = html;
  }

  start();
})();
