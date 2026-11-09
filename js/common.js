// 지도 페이지(index.html)와 좌표 찍기 도구(tools/picker.html)가 함께 쓰는 코드

// 검사점 종류: JSON의 checkpoints[].type 값으로 사용
window.CHECKPOINT_TYPES = {
  start:     { label: '출발',           color: '#16a34a' },
  finish:    { label: '도착',           color: '#dc2626' },
  left:      { label: '좌회전',         color: '#2563eb' },
  right:     { label: '우회전',         color: '#2563eb' },
  uturn:     { label: '유턴',           color: '#7c3aed' },
  lane:      { label: '차로 변경',      color: '#0891b2' },
  speed:     { label: '지시속도 구간',  color: '#ea580c' },
  crosswalk: { label: '횡단보도 일시정지', color: '#ca8a04' },
  school:    { label: '어린이보호구역', color: '#db2777' },
  caution:   { label: '주의 구간',      color: '#475569' }
};

// 카카오맵 SDK를 동적으로 불러옵니다. (autoload=false + kakao.maps.load)
window.loadKakaoMaps = function (key, libraries) {
  return new Promise(function (resolve, reject) {
    if (window.kakao && window.kakao.maps && window.kakao.maps.LatLng) {
      resolve(window.kakao);
      return;
    }
    if (!key || key.indexOf('YOUR_') === 0) {
      reject(new Error('js/config.js에 카카오 JavaScript 키를 넣어주세요.'));
      return;
    }
    var libs = libraries && libraries.length ? '&libraries=' + libraries.join(',') : '';
    var s = document.createElement('script');
    s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + encodeURIComponent(key) + '&autoload=false' + libs;
    s.onload = function () {
      if (!window.kakao || !window.kakao.maps) {
        reject(new Error('카카오 지도 SDK 초기화 실패: 앱 키와 [플랫폼 > Web] 도메인 등록을 확인하세요.'));
        return;
      }
      window.kakao.maps.load(function () { resolve(window.kakao); });
    };
    s.onerror = function () {
      reject(new Error('카카오 지도 SDK를 불러오지 못했습니다. 앱 키와 등록 도메인을 확인하세요.'));
    };
    document.head.appendChild(s);
  });
};

// [위도, 경도] 배열 두 점 사이 거리(m) — 하버사인 공식
window.distanceMeters = function (a, b) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (b[0] - a[0]) * toRad;
  var dLng = (b[1] - a[1]) * toRad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

// 경로 전체 길이(km)
window.pathLengthKm = function (path) {
  var m = 0;
  for (var i = 1; i < (path || []).length; i++) m += window.distanceMeters(path[i - 1], path[i]);
  return m / 1000;
};

// 경로에서 주어진 점과 가장 가까운 꼭짓점 번호 (검사점을 주행 순서대로 정렬할 때 사용)
window.nearestPathIndex = function (path, pos) {
  var best = 0, bestD = Infinity;
  for (var i = 0; i < (path || []).length; i++) {
    var d = window.distanceMeters(path[i], pos);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
};
