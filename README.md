# 북부신진 도로주행 코스 조회 페이지

카카오맵 위에 A·B·C·D 코스를 선(Polyline)으로 그리고, 구간별 시험 팁을 보여주는 정적 웹페이지입니다.
GitHub Pages로 무료 배포합니다.

## 폴더 구조

```
index.html          메인: 코스 탭 · 지도 · 요약 · 검사점 · 주의사항 미리보기 · 준비물 · 학원 정보
tips.html           코스별 팁: 지도 번호 ↔ 지점 설명 연동 + 공통 주의사항 전체
function.html       기능코스 (준비 중)
css/style.css       모바일 우선 반응형 스타일 (768px 이상 PC 2단)
js/config.js        카카오 JavaScript 키 설정
js/common.js        공용 코드 (SDK 로더, 거리 계산, 검사점 종류)
js/shared.js        index·tips 공통 (courses.json 읽기, 코스 탭, 지도)
js/main.js          메인 페이지
js/tips.js          코스별 팁 페이지
data/courses.json   코스 좌표 데이터 ← picker로 만든 JSON
data/tips.json      준비물, 공통 주의사항, 종류별 기본 팁, 지점별 추가 팁
data/academy.json   전화, 셔틀, 시험 절차 (이름·주소는 courses.json center 사용)
tools/picker.html   좌표 찍기 도구 (작업자용, 검색 노출 안 함)
```

카카오맵을 못 불러오면(키 미입력, 도메인 미등록 등) 같은 좌표로 **간략 경로**를 그려서 보여줍니다.
지도 왼쪽 위에 "간략 경로" 안내가 보이면 키/도메인 설정을 확인하세요. 원인은 브라우저 콘솔에 찍힙니다.

## 1. 카카오 앱 준비
1. developers.kakao.com → 내 애플리케이션 → 앱 생성 (계정의 첫 번째 카카오맵 활성화 앱이어야 무료 쿼터 적용)
2. 카카오맵 API 활성화
3. [플랫폼 > Web] 사이트 도메인에 두 개 등록
   - `http://localhost:8000`
   - `https://<깃허브아이디>.github.io`
4. [앱 키]의 **JavaScript 키**를 `js/config.js`에 붙여넣기

## 2. 로컬에서 실행
`fetch`로 JSON을 읽기 때문에 파일을 더블클릭해서 열면 안 되고, 로컬 서버로 열어야 합니다.

```bash
python3 -m http.server 8000
```
- 조회 페이지: http://localhost:8000/
- 코스별 팁: http://localhost:8000/tips.html
- 좌표 찍기 도구: http://localhost:8000/tools/picker.html

## 3. 좌표 찍는 순서
1. 도구에서 [주소로 찾기]를 눌러 학원 위치를 정확히 저장
2. 코스 선택 → **경로 찍기** 모드에서 출발점부터 주행 순서대로 클릭
3. **검사점 찍기** 모드로 바꿔 종류·이름·팁을 입력하고 해당 지점 클릭
4. [JSON 복사] → `data/courses.json` 전체를 덮어쓰기
5. 조회 페이지 새로고침해서 확인 → commit & push

## courses.json 형식

```json
{
  "center": { "name": "...", "address": "...", "location": [위도, 경도] },
  "courses": [
    {
      "id": "A", "name": "A코스", "color": "#2563eb",
      "summary": "코스 한 줄 설명",
      "distanceKm": 5.2,
      "path": [[37.71, 127.19], [37.72, 127.19]],
      "checkpoints": [
        { "type": "left", "label": "OO사거리 좌회전", "tip": "1차로 대기", "position": [37.71, 127.19] }
      ]
    }
  ]
}
```

- 좌표 순서는 **[위도, 경도]** (37.x, 127.x). GeoJSON은 [경도, 위도]라서 반대이니 섞지 말 것
- `checkpoints[].type`: start, finish, left, right, uturn, lane, speed, crosswalk, school, caution
- 코스별 링크: `index.html#B`, `tips.html#B` 처럼 공유 가능

## 지점별 팁 추가 (data/tips.json)
`coursePoints` → 코스 ID → **검사점 label과 똑같은 이름** → `cautions` 배열.
검사점에는 id가 없고 새로 찍으면 번호가 바뀌므로 이름으로 연결합니다. 이름을 바꾸면 여기도 같이 바꾸세요.

```json
"coursePoints": {
  "A": { "OO사거리 좌회전": { "cautions": ["대향차 많음, 녹색 화살표 기다리기"] } }
}
```

## 4. GitHub Pages 배포
저장소 Settings → Pages → Source: `Deploy from a branch` → `main` / `/(root)` → Save
