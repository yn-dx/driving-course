(function () {
  "use strict";
  const S = window.Shared;
  const $ = (id) => document.getElementById(id);
  const isMobile = () => window.matchMedia("(max-width: 767.98px)").matches;

  let courses = [];
  let tips = {};
  let current = null;
  let courseMap = null;
  let setActiveTab = () => {};

  const wantCommon = location.hash === "#common";   // 메인의 [전체 보기] 링크

  async function start() {
    let loaded;
    try {
      [loaded, tips] = await Promise.all([
        S.loadCourses(),
        S.loadJSON("data/tips.json").catch(() => ({})),
      ]);
      courses = loaded.courses;
    } catch (err) {
      S.showError($("panel"), err);
      $("map-status").textContent = "";
      return;
    }

    renderCautions(tips.commonCautions || []);
    S.setBrand(loaded.center);
    S.setFooterDate(loaded.raw.updatedAt, tips.updatedAt);

    setActiveTab = S.renderTabs($("course-tabs"), courses, selectCourse);
    courseMap = new S.CourseMap($("map"), { center: loaded.center, onSelect: (no) => selectPoint(no, "map") });
    selectCourse(S.initialCourseId(courses), { initial: true });
    await courseMap.init();
    $("map-status").remove();
    courseMap.show(current);

    if (wantCommon) $("common").scrollIntoView();
  }

  function selectCourse(id, opts) {
    const c = courses.find((x) => x.id === id);
    if (!c || (c === current && !(opts && opts.initial))) return;
    current = c;
    S.applyCourseColor(c);
    setActiveTab(c.id);
    S.rememberCourse(c.id);
    renderPoints(c);
    if (courseMap && courseMap.mode) courseMap.show(c);
  }

  // tips.json: coursePoints[코스ID][검사점 label] = { cautions: [...] }
  // courses.json 검사점에는 id가 없고, 새 지점을 찍으면 번호가 바뀌므로 label(지점 이름)로 연결합니다.
  function pointTips(course, cp) {
    const byCourse = (tips.coursePoints || {})[course.id] || {};
    const extra = (cp.label && byCourse[cp.label]) || {};
    return {
      cautions: extra.cautions || [],
      general: ((tips.typeCautions || {})[cp.type]) || [],
    };
  }

  function list(items, cls) {
    return "<ul" + (cls ? ' class="' + cls + '"' : "") + ">" +
      items.map((t) => "<li>" + S.esc(t) + "</li>").join("") + "</ul>";
  }

  function renderPoints(c) {
    $("points-title").textContent = c.name + " 주요 지점 " + c.checkpoints.length + "곳";
    if (!c.checkpoints.length) {
      $("point-list").innerHTML = '<li class="card todo">아직 등록된 지점이 없어요.</li>';
      return;
    }
    $("point-list").innerHTML = c.checkpoints.map((cp) => {
      const t = pointTips(c, cp);
      const label = S.typeInfo(cp.type).label;
      return '<li class="point" id="p-' + cp.no + '" data-no="' + cp.no + '">' +
        '<button type="button" class="point__head" aria-label="' + cp.no + "번 " + S.esc(cp.name) + ' 지도에서 보기">' +
        '<span class="cp__no">' + cp.no + "</span>" +
        '<span class="cp__head">' + S.typeBadge(cp.type) + '<span class="point__name">' + S.esc(cp.name) + "</span></span>" +
        "</button>" +
        '<div class="point__body">' +
        (cp.tip ? '<div class="point__tip">' + S.esc(cp.tip) + "</div>" : "") +
        (t.cautions.length ? '<div class="point__label">이 지점에서 조심할 것</div>' + list(t.cautions) : "") +
        (t.general.length ? '<div class="point__label">' + S.esc(label) + " 기본</div>" + list(t.general, "point__general") : "") +
        "</div></li>";
    }).join("");
    $("point-list").querySelectorAll(".point__head").forEach((b) => {
      b.addEventListener("click", () => selectPoint(+b.parentElement.dataset.no, "list"));
    });
  }

  function selectPoint(no, from) {
    document.querySelectorAll(".point").forEach((p) => p.classList.toggle("is-active", +p.dataset.no === no));
    if (courseMap) courseMap.focus(no);
    const el = $("p-" + no);
    if (!el) return;

    if (from === "map") {
      // 지도 번호를 누르면 해당 번호 설명으로 이동
      el.scrollIntoView({ block: isMobile() ? "start" : "nearest", behavior: "smooth" });
    } else if (isMobile()) {
      const tabsH = document.querySelector(".course-tabs").offsetHeight;
      const top = $("map-wrap").getBoundingClientRect().top + window.scrollY - tabsH;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }

  function renderCautions(items) {
    $("caution-list").innerHTML = items.map((t) => {
      const level = t.level || "참고";
      return '<li class="caution"><span class="badge badge--' + S.esc(level) + '">' + S.esc(level) + "</span>" +
        '<span class="caution__title">' + S.esc(t.title) + "</span>" +
        (t.desc ? '<span class="caution__desc">' + S.esc(t.desc) + "</span>" : "") + "</li>";
    }).join("") || '<li class="todo">등록된 주의사항이 없습니다.</li>';
  }

  start();
})();
