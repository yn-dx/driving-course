/*
 * index.html · tips.html 공통 로직: 데이터 읽기, 코스 탭, 지도(CourseMap).
 * js/common.js 의 loadKakaoMaps, CHECKPOINT_TYPES, pathLengthKm 를 그대로 사용합니다.
 *
 * data/courses.json 형식 (tools/picker.html 이 만드는 형식, 구조 변경 없음)
 *   center:  { name, address, location: [위도, 경도], locationVerified }
 *   courses: [{ id, name, color, summary, distanceKm, path: [[위도, 경도]...],
 *               checkpoints: [{ type, label, tip, position: [위도, 경도] }] }]
 *   checkpoints 는 picker 가 주행 순서대로 정렬해 저장하므로 배열 순서 = 번호.
 */
(function () {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const TYPES = window.CHECKPOINT_TYPES || {};

  /* ---------- 유틸 ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  async function loadJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(url + " 을(를) 불러오지 못했습니다 (" + res.status + ")");
    return res.json();
  }

  function softColor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#eef2ff";
    const n = parseInt(m[1], 16);
    const mix = (c) => Math.round(c + (255 - c) * 0.9);
    return "rgb(" + mix(n >> 16) + "," + mix((n >> 8) & 255) + "," + mix(n & 255) + ")";
  }

  const ll = (p) => (Array.isArray(p) && p.length >= 2 ? { lat: +p[0], lng: +p[1] } : null);

  /* ---------- 검사점 종류 ---------- */
  function typeInfo(type) {
    return TYPES[type] || TYPES.caution || { label: type || "지점", color: "#475569" };
  }

  function typeBadge(type) {
    const t = typeInfo(type);
    return '<span class="badge" style="--b:' + esc(t.color) + '">' + esc(t.label) + "</span>";
  }

  /* ---------- courses.json 읽기 ---------- */
  async function loadCourses() {
    const raw = await loadJSON(cfg.DATA_URL || "data/courses.json");
    const c0 = raw.center || {};
    const center = {
      name: c0.name || "",
      address: c0.address || "",
      pos: ll(c0.location),
      verified: !!c0.locationVerified,
    };
    const courses = (raw.courses || []).map((c) => {
      const path = (c.path || []).map(ll).filter(Boolean);
      const checkpoints = (c.checkpoints || []).map((p, i) => ({
        no: i + 1,
        type: p.type || "caution",
        label: p.label || "",
        name: p.label || typeInfo(p.type).label,
        tip: p.tip || "",
        pos: ll(p.position),
      })).filter((p) => p.pos);
      const km = c.distanceKm > 0 ? +c.distanceKm : window.pathLengthKm(c.path || []);
      return {
        id: String(c.id),
        name: c.name || c.id + "코스",
        color: c.color || "#2563eb",
        summary: c.summary || "",
        distanceKm: km > 0 ? km : null,
        difficulty: c.difficulty != null ? +c.difficulty : null,   // 제안 필드 (아직 없음)
        path,
        checkpoints,
        isEmpty: path.length < 2 && checkpoints.length === 0,
      };
    });
    if (!courses.length) throw new Error("courses.json에 코스가 없습니다.");
    return { raw, center, courses };
  }

  /* ---------- 코스 선택 상태 (index.html#B 형식 공유 링크 유지) ---------- */
  function initialCourseId(courses) {
    const ids = courses.map((c) => c.id);
    const hash = decodeURIComponent(location.hash.slice(1));
    if (ids.includes(hash)) return hash;
    try {
      const saved = localStorage.getItem("lastCourse");
      if (saved && ids.includes(saved)) return saved;
    } catch (e) { /* 저장소 사용 불가 */ }
    return ids[0];
  }

  function rememberCourse(id) {
    history.replaceState(null, "", location.pathname + location.search + "#" + encodeURIComponent(id));
    try { localStorage.setItem("lastCourse", id); } catch (e) { /* 무시 */ }
  }

  function applyCourseColor(course) {
    const s = document.documentElement.style;
    s.setProperty("--course", course.color);
    s.setProperty("--course-soft", softColor(course.color));
  }

  function renderTabs(container, courses, onSelect) {
    container.setAttribute("role", "tablist");
    container.innerHTML = courses.map((c) => (
      '<button type="button" class="course-tab" role="tab" data-id="' + esc(c.id) + '" style="--c:' + esc(c.color) + '">' +
      '<span class="course-tab__dot" aria-hidden="true"></span>' + esc(c.name) + "</button>"
    )).join("");
    const buttons = Array.from(container.querySelectorAll(".course-tab"));
    buttons.forEach((b, i) => {
      b.addEventListener("click", () => onSelect(b.dataset.id));
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const next = buttons[(i + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
        next.focus(); onSelect(next.dataset.id);
      });
    });
    return function setActive(id) {
      buttons.forEach((b) => {
        const on = b.dataset.id === id;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
    };
  }

  function stars(n) {
    if (n == null || isNaN(n)) return "—";
    const v = Math.max(0, Math.min(5, Math.round(n)));
    return '<span class="stars" aria-label="5점 중 ' + v + '점">' + "★".repeat(v) +
      '<span class="off">' + "★".repeat(5 - v) + "</span></span>";
  }

  /* ---------- 지도 ----------
   * 카카오맵을 먼저 시도하고, 키/도메인 문제로 실패하면 간략 경로(SVG)로 대신 그립니다.
   */
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("카카오 지도 응답 시간 초과")), ms))]);
  }

  class CourseMap {
    constructor(el, opts) {
      this.el = el;
      this.wrap = el.parentElement;
      this.center = opts.center;
      this.onSelect = opts.onSelect || function () {};
      this.mode = null;
      this.items = [];        // { no, overlay?, el }
      this.layers = [];
      this.course = null;
      this.emptyMsg = document.createElement("div");
      this.emptyMsg.className = "map-empty";
      this.emptyMsg.hidden = true;
      this.wrap.appendChild(this.emptyMsg);
    }

    async init() {
      try {
        await withTimeout(window.loadKakaoMaps(cfg.KAKAO_JS_KEY), 8000);
        const k = window.kakao.maps;
        const c = this.center.pos || { lat: 37.718, lng: 127.19 };
        this.kakao = window.kakao;
        this.map = new k.Map(this.el, { center: new k.LatLng(c.lat, c.lng), level: 5 });
        this.map.addControl(new k.ZoomControl(), k.ControlPosition.RIGHT);
        if (this.center.pos) {
          new k.Marker({ map: this.map, position: new k.LatLng(c.lat, c.lng), title: this.center.name });
        }
        let t;
        window.addEventListener("resize", () => {
          clearTimeout(t);
          t = setTimeout(() => { this.map.relayout(); this.fit(); }, 150);
        });
        this.mode = "kakao";
      } catch (e) {
        console.warn("[지도] 카카오맵을 불러오지 못해 간략 경로로 표시합니다:", e.message);
        this.mode = "fallback";
        const notice = document.createElement("div");
        notice.className = "map-notice";
        notice.textContent = "간략 경로 (지도를 불러오지 못했어요)";
        notice.title = e.message;
        this.wrap.appendChild(notice);
        window.addEventListener("resize", () => this.course && this.show(this.course));
      }
      return this;
    }

    show(course) {
      this.course = course;
      this.active = null;
      this.emptyMsg.hidden = !course.isEmpty;
      this.emptyMsg.textContent = course.name + "는 아직 경로 좌표가 없어요.";
      if (this.mode === "kakao") this._showKakao(course);
      else this._showFallback(course);
    }

    focus(no) {
      this.active = no;
      this.items.forEach((it) => it.el.classList.toggle("is-active", it.no === no));
      const cp = this.course && this.course.checkpoints.find((c) => c.no === no);
      if (!cp || this.mode !== "kakao") return;
      const k = this.kakao.maps;
      this.items.forEach((it) => it.overlay.setZIndex(it.no === no ? 10 : 3));
      if (this.map.getLevel() > 3) this.map.setLevel(3);
      this.map.panTo(new k.LatLng(cp.pos.lat, cp.pos.lng));
    }

    fit() {
      if (this.mode !== "kakao" || !this.course) return;
      const k = this.kakao.maps;
      const pts = this.course.path.concat(this.course.checkpoints.map((c) => c.pos));
      if (!pts.length) {
        if (this.center.pos) this.map.setCenter(new k.LatLng(this.center.pos.lat, this.center.pos.lng));
        this.map.setLevel(5);
        return;
      }
      const b = new k.LatLngBounds();
      pts.forEach((p) => b.extend(new k.LatLng(p.lat, p.lng)));
      this.map.setBounds(b, 40, 40, 40, 40);
    }

    _showKakao(course) {
      const k = this.kakao.maps;
      this.layers.forEach((l) => l.setMap(null));
      this.items.forEach((it) => it.overlay.setMap(null));
      this.layers = [];
      this.items = [];

      const path = course.path.map((p) => new k.LatLng(p.lat, p.lng));
      if (path.length > 1) {
        // 흰 테두리 효과 + 진행 방향 화살표
        this.layers.push(new k.Polyline({ map: this.map, path, strokeWeight: 10, strokeColor: "#ffffff", strokeOpacity: 0.9 }));
        this.layers.push(new k.Polyline({ map: this.map, path, strokeWeight: 6, strokeColor: course.color, strokeOpacity: 0.95, endArrow: true }));
      }
      endpoints(course).forEach((ep) => {
        const div = document.createElement("div");
        div.className = "endpoint";
        div.textContent = ep.label;
        this.layers.push(new k.CustomOverlay({
          map: this.map, position: new k.LatLng(ep.pos.lat, ep.pos.lng), content: div, yAnchor: 1.6, zIndex: 2,
        }));
      });
      course.checkpoints.forEach((cp) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pin";
        btn.style.setProperty("--c", course.color);
        btn.textContent = cp.no;
        btn.setAttribute("aria-label", cp.no + "번 " + cp.name);
        btn.addEventListener("click", (e) => { e.stopPropagation(); this.onSelect(cp.no, "map"); });
        const overlay = new k.CustomOverlay({
          map: this.map, position: new k.LatLng(cp.pos.lat, cp.pos.lng), content: btn, xAnchor: 0.5, yAnchor: 0.5, zIndex: 3, clickable: true,
        });
        this.items.push({ no: cp.no, overlay, el: btn });
      });
      this.fit();
    }

    _showFallback(course) {
      const pts = course.path.concat(course.checkpoints.map((c) => c.pos));
      const W = Math.max(this.el.clientWidth, 200), H = Math.max(this.el.clientHeight, 200), pad = 40;
      const NS = "http://www.w3.org/2000/svg";
      this.el.innerHTML = "";
      this.items = [];
      if (!pts.length) return;
      const cos = Math.cos((pts[0].lat * Math.PI) / 180);
      const xs = pts.map((p) => p.lng * cos), ys = pts.map((p) => p.lat);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const s = Math.min((W - pad * 2) / ((maxX - minX) || 1e-6), (H - pad * 2) / ((maxY - minY) || 1e-6));
      const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2 - 6; // 위쪽 안내문 공간
      const proj = (p) => [ox + (p.lng * cos - minX) * s, H - (oy + (p.lat - minY) * s)];

      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "fallback-svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", course.name + " 간략 경로");
      const line = course.path.map((p) => proj(p).map((v) => v.toFixed(1)).join(",")).join(" ");
      svg.innerHTML =
        '<polyline points="' + line + '" fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<polyline points="' + line + '" fill="none" stroke="' + esc(course.color) + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>';
      endpoints(course).forEach((ep) => {
        const w = ep.label.length * 13 + 16;
        const [px, y] = proj(ep.pos);
        const x = Math.min(Math.max(px, w / 2 + 4), W - w / 2 - 4);   // 가장자리에서 잘리지 않게
        svg.insertAdjacentHTML("beforeend",
          '<g transform="translate(' + x + "," + (y - 26) + ')"><rect x="' + (-w / 2) + '" y="-12" width="' + w +
          '" height="22" rx="11" fill="#111827"/><text y="4" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">' +
          esc(ep.label) + "</text></g>");
      });
      course.checkpoints.forEach((cp) => {
        const [x, y] = proj(cp.pos);
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "fb-pin");
        g.setAttribute("transform", "translate(" + x + "," + y + ")");
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", cp.no + "번 " + cp.name);
        g.innerHTML = '<circle r="15" fill="' + esc(course.color) + '" stroke="#fff" stroke-width="3"/>' +
          '<text y="5" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">' + cp.no + "</text>";
        const go = () => this.onSelect(cp.no, "map");
        g.addEventListener("click", go);
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        svg.appendChild(g);
        this.items.push({ no: cp.no, el: g });
      });
      this.el.appendChild(svg);
      if (this.active) this.focus(this.active);
    }
  }

  function endpoints(course) {
    if (course.path.length < 2) return [];
    const s = course.path[0], e = course.path[course.path.length - 1];
    const same = Math.abs(s.lat - e.lat) < 1e-4 && Math.abs(s.lng - e.lng) < 1e-4;
    return same ? [{ label: "출발·도착", pos: s }] : [{ label: "출발", pos: s }, { label: "도착", pos: e }];
  }

  function setBrand(center) {
    if (!center.name) return;
    document.querySelectorAll(".brand__sub").forEach((el) => { el.textContent = center.name; });
  }

  function setFooterDate(...dates) {
    const el = document.getElementById("updated-at");
    const d = dates.filter(Boolean).sort().pop();
    if (el && d) el.textContent = d;
  }

  function showError(el, err) {
    console.error(err);
    el.innerHTML = '<div class="error">데이터를 불러오지 못했습니다. ' + esc(err.message) +
      "<br>로컬에서는 <code>python3 -m http.server 8000</code>으로 실행해 주세요.</div>";
  }

  window.Shared = {
    esc, loadJSON, loadCourses, typeInfo, typeBadge, stars,
    initialCourseId, rememberCourse, applyCourseColor, renderTabs,
    CourseMap, setBrand, setFooterDate, showError,
  };
})();
