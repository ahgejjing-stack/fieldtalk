# FIELDTALK Course Reference Strategy v1

기준 문서: `docs/PRODUCT_CHARTER_v1.0.md` Principle 8(Minimal Course). 이 문서의 모든 판단은 그 원칙 — "우리는 세계 최고의 코스 DB를 만들지 않는다. 공개 가능한 최소한의 Course Reference만 사용한다" — 을 상한선으로 삼는다. `docs/ARCHITECTURE_v1.md`(§3 Course Data), `docs/ARCHITECTURE_v1.1.md`(스냅샷 원칙), `docs/PRE_ROUND_EXPERIENCE_v1.md`(코스 감지 흐름)를 전제로 하며 세 문서 모두 수정하지 않는다.

---

## 1. Product Boundary

**FIELDTALK는 다음과 경쟁하지 않는다.**

- 레이저 거리계
- 골프 GPS 전용 기기
- 상세 코스맵 서비스
- 카트 내비게이션
- 전문 스코어/통계 앱

FIELDTALK가 Course Reference를 쓰는 이유는 하나다 — **"팀 커뮤니케이션에 필요한 최소한의 공통 기준"을 제공하는 것.** 코스 데이터 자체가 제품이 아니라, 거리 공유·PTT·스코어가 팀 안에서 같은 기준으로 통하게 만드는 배경일 뿐이다.

**하지 않는 것**:
- 정확한 핀 위치를 보장하지 않는다 — 핀은 매일 바뀌고, 그걸 실시간으로 추적하는 건 레이저/전용 GPS 기기의 영역이다.
- 상세 홀 지형을 제공하지 않는다.
- 벙커·해저드 전체를 관리하지 않는다.
- Green Center 기반 GPS는 항상 "참고값"으로만 표시한다 — Charter Principle 2("GPS는 참고값이다")와 정확히 같은 이유.
- 실측 공유와 비교할 수 있는 **기준**을 제공하는 것이 목적이다 — 실측을 대체하는 게 아니다.

---

## 2. MVP Minimum Data

Product Director 가설을 검토한 결과, 제안된 필드는 대부분 그대로 타당하다. 다만 최초 분류(Required/Useful but Optional/Not Needed)가 "좌표 없이도 Level 0~1은 완결된다"는 §5 Progressive Data Levels의 정의와 어긋나 있었다 — `greenCenterLatitude/Longitude`가 전체 MVP의 Required처럼 보였지만 실제로는 **Level 2에서만** 필요하다. 아래는 데이터 레벨 기준으로 재분류한 결과다. 표의 내용(어떤 필드가 왜 필요한가)은 그대로 두고 분류 축만 바꿨다.

### GolfClub
| 필드 | 분류 | 비고 |
|---|---|---|
| id | Core MVP Required | |
| name | Core MVP Required | GolfClub 또는 장소 이름 |
| address 또는 지역명 | Core MVP Required | 사용자가 검색/확인할 때 필요 |
| latitude, longitude | Required for Level 1 Detection | 골프장 감지(§7)의 1차 기준점 — 없어도 이름 기반 수동 선택(Level 0)은 가능 |

### Course
| 필드 | 분류 | 비고 |
|---|---|---|
| id | Core MVP Required | |
| golfClubId | Core MVP Required | |
| name | Core MVP Required | 한 클럽에 코스가 여럿인 경우(동/서코스 등) 구분 필수 |
| holeCount | Core MVP Required | 9 또는 18 |

### Hole
| 필드 | 분류 | 비고 |
|---|---|---|
| id | Core MVP Required | |
| courseId | Core MVP Required | |
| number | Core MVP Required | Hole number |
| par | Core MVP Required | Charter Principle 7("PAR 기준 스코어 입력")의 전제 조건 — 좌표 없이도(Level 0) 성립 |
| greenCenterLatitude/Longitude | Required for Level 2 Reference GPS | GPS 참고 거리(§8)의 유일한 필수 좌표. 없으면 Level 0~1로 남고 GPS 참고는 비활성 |
| greenFrontLatitude/Longitude | Useful for Level 3 | 있으면 표시 다양화 가능하지만 없어도 Level 2(Center만)로 기능 성립 |
| greenBackLatitude/Longitude | Useful for Level 3 | 위와 동일 |

### 추가 검토 항목

| 항목 | 분류 | 이유 |
|---|---|---|
| 티별 거리 | Useful for Level 3 | 스코어카드형 정보로 있으면 좋지만, PAR 기반 스코어 입력(Charter 원칙)엔 필수 아님 |
| 티박스 좌표 | Useful for Level 3 | 시작 홀 감지 정확도를 높이지만(§7), Green Center만으로도(Level 2) "어느 홀에 가까운가"는 추정 가능 |
| 시작 홀 감지용 대표 티 좌표 | Useful for Level 3 | 위 항목의 특수 형태 — 있으면 감지 신뢰도 상승 |
| 코스 순서 | Core MVP Required(단, 9홀 조합 코스에 한해) | 아래 참고 |
| 9홀 조합 정보 | Useful for Level 3 | 한국 골프장에 흔한 형태(동+서 조합 18홀)라 실용적 가치는 높지만, 없어도 "18홀 단일 코스"로 취급하는 폴백이 가능해 Core MVP 필수는 아님 |
| 데이터 갱신 시각(updatedAt) | Core MVP Required | §4 Provider Adapter의 메타데이터로 필수 — 데이터 레벨과 무관하게 항상 필요 |
| 출처(source) | Core MVP Required | 위와 동일 |
| 신뢰도(confidence) | Core MVP Required | §7 감지 정책의 전제 조건 — 데이터 레벨과 무관하게 항상 필요 |

**코스 순서에 대한 판단**: "동코스 + 서코스" 같은 조합형 18홀은 실제로 시작 홀이 1번이 아닐 수 있고(예: 서코스 10번부터 시작), 이건 PAR 스코어 입력과 직결되는 정보라 완전히 Optional로 두기 어렵다. 다만 이 조합 데이터 자체가 없는 골프장은 "18홀을 그냥 순서대로"로 폴백하면 되므로, **데이터가 있으면 Core MVP Required로 쓰고 없으면 Level 1(§5)로 낮아지는 방식**을 제안한다 — 필드 존재 여부가 아니라 데이터 레벨로 다루는 문제.

### MVP에서 제외

| 항목 | 이유 |
|---|---|
| 3D 코스맵 | Charter "Things We Will Not Build" 직접 해당 |
| 홀 전체 폴리곤 | Green Center 좌표 하나로 참고 거리 목적은 충분 |
| 벙커/해저드 좌표 | §1 Product Boundary — 상세 지형 관리 안 함 |
| 일별 실제 핀 좌표 | ARCHITECTURE_v1.md §1.2에서 이미 "Pin은 Course 정적 데이터가 아니라 Round-scoped"로 분리해뒀음 — 이 문서 범위 밖 |
| 상세 고도 정보 | 제품 경쟁력 아님(Charter) |
| 정밀 그린 경사 | 위와 동일 |
| 코스 공략 정보 | "AI 스윙 분석"과 같은 범주로 Charter가 명시적으로 배제 |
| 티별 상세 야디지북 | 레이저/전용 GPS 기기의 영역(§1) |

---

## 3. Data Source Strategy

아래는 실제 조사 결과다. 계약 조건·정확한 가격을 확인할 수 없는 항목은 추정하지 않고 "공급자 문의 필요"로 명시한다.

### 3.1 공개 데이터 — 정부(공공데이터포털)

문화체육관광부 및 행정안전부가 `data.go.kr`을 통해 "전국 골프장 현황"을 CSV/오픈API(RestAPI, JSON/XML)로 제공한다(직접 확인, cc-zero 라이선스 = 재배포 자유, 비용 무료). 지방자치단체별 데이터(경기도 등)도 별도로 제공된다.

- **제공 데이터**: 업소명, 사업자명, 소재지(도로명주소·지번주소), 위도·경도, 총면적, 홀수, 회원제/비회원제 구분, 인허가일자, 영업상태.
- **PAR 제공 여부**: ❌ 없음.
- **코스 이름 제공 여부**: ❌ 없음(클럽 단위 등록일 뿐, 클럽 안의 개별 코스 이름·홀 단위 데이터 없음).
- **Green Center 좌표**: ❌ 없음.
- **좌표계 주의**: 행안부 데이터는 "보정계수 안 들어간 Bessel 중부원점TM(EPSG:5174)"로 명시돼 있음(직접 확인) — WGS84로 변환 필요, 그대로 쓰면 좌표가 어긋난다.
- **국내 커버리지**: 전국 지자체 인허가 데이터를 취합한 것이라 국내 커버리지는 사실상 전수에 가까움(등록된 사업장 기준).
- **갱신 방식**: 지자체별로 매월 병합, 출처에 따라 갱신 주기 다름.
- **결론**: **GolfClub 식별(이름·주소·좌표) 용도로는 훌륭하지만, Hole/PAR/Green 데이터는 전혀 없다.** Level 0~1(§5)의 기반 데이터로 적합.

### 3.2 공개 데이터 — OpenStreetMap

OSM은 골프 전용 태깅 체계(`leisure=golf_course`, `golf=hole`, `golf=green`, `golf=tee`, `golf=pin`, `handicap=*`)를 갖고 있고(직접 확인), 커뮤니티가 매핑한 코스는 홀별 PAR·핸디캡·그린/티 좌표까지 포함될 수 있다.

- **라이선스**: ODbL(Open Database License) — 출처 표기 조건부 재배포 가능, 비용 무료.
- **커버리지**: **코스마다 편차가 매우 큼.** 커뮤니티 자발적 매핑이라, 대중제(퍼블릭) 코스는 상대적으로 잘 매핑돼 있어도 한국의 회원제 골프장은 매핑률이 낮을 가능성이 높다(직접 검증은 못 했으나 OSM의 일반적 특성 — 대중 접근이 어려운 사유 시설일수록 커뮤니티 매핑이 뜸함).
- **정확도**: 매핑한 사람의 숙련도에 따라 편차 큼 — 검증 없이 신뢰하기 어려움.
- **결론**: **보조 데이터 소스로는 가치 있지만 국내 주력 소스로 의존하기엔 위험.** 있으면 활용하되, 없다고 가정하고 설계해야 함.

### 3.3 지도/장소 검색 API (Kakao, Naver, Google Places)

Kakao Local API, Naver 지도 API, Google Places API 전부 "키워드로 장소 검색 → 이름/주소/좌표 반환" 기능을 제공한다(직접 확인 — Kakao는 REST API로 카테고리·키워드 검색을, Naver는 Geocoder로 주소↔좌표 변환을, Google Places는 텍스트/카테고리 검색과 상세 정보를 지원).

- **제공 범위**: 일반 장소 정보(이름, 주소, 좌표, 전화번호, 리뷰 등) — **골프 특화 데이터(PAR·홀·그린)는 전혀 없다.**
- **비용**: Kakao/Naver는 일 허용량 내 무료, 초과 시 과금(정확한 단가는 콘솔에서 실시간 확인 필요 — "공급자 문의 필요"). Google Places는 호출당 과금.
- **용도**: **GolfClub 이름 검색·주소 확인·좌표 지오코딩**에는 적합. Hole/PAR 데이터 소스로는 부적합.
- **부가 발견**: Google Places 데이터를 골프장 전용으로 재포장한 소규모 서드파티 API(예: GolfAmbit/Zyla "Golf Course Finder")도 존재하나, 이것도 결국 Google Places 원본 그대로라 골프 특화 필드는 없음(직접 확인).

### 3.4 상용 골프 코스 데이터 공급자

`golfapi.io`를 조사한 결과(직접 확인): 100개국 이상, 42,000개 이상의 코스 데이터베이스를 REST API 또는 CSV(clubs/courses/tees/coordinates 4개 파일) 형태로 제공한다.

- **제공 데이터**: 골프클럽 정보, 전체 스코어카드, PAR·스트로크 인덱스, 티별 거리, 슬로프·코스 레이팅, 그린 및 주요 지점 좌표.
- **API 구조**: `/clubs`, `/clubs/{id}`, `/courses/{id}` 엔드포인트.
- **가격/한국 커버리지**: 사이트에 공개돼 있지 않음 — **"공급자 문의 필요"**(직접 확인, 사이트 자체가 "Contact us for pricing"로 안내).
- **결론**: MVP가 요구하는 필드(§2)와 구조적으로 가장 잘 맞는 상용 후보다. 다만 한국 커버리지·정확한 비용을 이번 조사로는 확정할 수 없어, 실제 도입 전 공급자 문의가 반드시 필요하다.

### 3.5 골프장 공식 홈페이지 공개 정보

다수의 국내 골프장이 홈페이지에 스코어카드(PAR표)를 이미지/PDF로 공개하고 있는 것은 일반적으로 알려진 사실이나, **구조화된 API가 아니라 수동 등록 또는 OCR 같은 별도 파이프라인이 필요**하다. 골프장마다 형식이 달라 자동화 난이도가 높고, 저작권/이용약관 확인이 골프장별로 필요하다.

- **결론**: 자동 연동 대상이 아니라 **§6 Manual Fallback의 "Room Host가 스코어카드를 등록하는 흐름"의 데이터 출처**로 보는 것이 현실적이다.

### 3.6 사용자/운영자 수동 등록 & 사용자 검증 기반 보완

비용이 들지 않고 커버리지가 이론적으로 무제한이지만, 정확도는 등록자에게 의존한다. §6/§11에서 상세히 다룬다.

### 3.7 종합 비교표

| 출처 | GolfClub | Course명 | PAR | Green 좌표 | API | 라이선스/재배포 | 비용 | 한국 커버리지 |
|---|---|---|---|---|---|---|---|---|
| 정부 공공데이터 | ✅ | ❌ | ❌ | ❌ | ✅(오픈API) | CC-Zero(자유) | 무료 | 전수에 가까움(클럽 단위) |
| OpenStreetMap | ✅(편차) | ✅(편차) | ✅(편차) | ✅(편차) | ✅(Overpass 등) | ODbL(출처표기) | 무료 | 코스별 편차 큼, 검증 필요 |
| Kakao/Naver/Google Places | ✅ | ❌ | ❌ | ❌ | ✅ | 약관별 상이 | 사용량 기반(공급자 문의 필요) | 우수(일반 장소 검색 기준) |
| 상용 공급자(golfapi.io 등) | ✅ | ✅ | ✅ | ✅ | ✅ | 계약 필요(공급자 문의) | 공급자 문의 필요 | 공급자 문의 필요 |
| 골프장 공식 홈페이지 | - | ✅ | ✅(비정형) | ❌ | ❌(수동/OCR) | 골프장별 확인 필요 | 무료(수집 비용은 별도) | 코스별 편차 |
| 사용자/운영자 등록 | ✅ | ✅ | ✅ | ✅(가능) | 해당없음(내부 데이터) | FIELDTALK 소유 | 무료(검증 비용은 운영 비용) | 사용량에 비례 |

**결론**: 어느 한 출처도 단독으로 MVP 요구사항(§2)을 충족하지 못한다. **정부 공공데이터로 GolfClub을 식별하고, Course/Hole/Green은 사용자 등록 + 상용 공급자(도입 시) + OSM 보조**로 채우는 다층 전략이 필요하다 — 이게 §5 Progressive Data Levels의 근거다.

---

## 4. Provider Independence

```
External Provider (정부 공공데이터 / 상용 공급자 / OSM / 사용자 등록)
        │
        ▼
Provider Adapter  ← 공급자별 필드명·좌표계·단위를 정규화
        │
        ▼
FIELDTALK Course Reference Model  ← 이 문서 §2의 필드만 사용
        │
        ▼
Local Cache  (§10)
        │
        ▼
Room Selection  (사용자가 Room에서 코스 확인/선택 — PRE_ROUND_EXPERIENCE_v1.md §1.7)
        │
        ▼
Round Snapshot  (START 시점 복사 — ARCHITECTURE_v1.md §3.4 스냅샷 원칙)
```

**원칙**: 외부 공급자의 필드명(`green_lat`, `greenCenter.lat`, `hole_par` 등 공급자마다 제각각)을 Round에 직접 저장하지 않는다. Provider Adapter가 이 문서 §2에서 정의한 정규화된 필드로 변환한 뒤에만 상위 계층으로 전달한다 — 공급자가 바뀌어도 Adapter 하나만 새로 작성하면 되고, Round Engine·UI는 전혀 몰라도 된다.

### 메타데이터 (모든 Course Reference 레코드에 부착)

| 필드 | 역할 |
|---|---|
| `source` | 어느 공급자에서 왔는지("gov_public", "osm", "commercial_provider_x", "user_submitted") |
| `sourceCourseId` | 원본 공급자 쪽 식별자(디버깅·재조회용) |
| `dataVersion` | 이 레코드의 버전(정정 발생 시 증가 — §11) |
| `updatedAt` | 마지막 갱신 시각 |
| `confidence` | §5 데이터 레벨과 결합해 감지 신뢰도(§7) 계산에 사용 |
| `verifiedAt` | 운영자 또는 다수 사용자 검증을 통과한 시각(없으면 미검증) |

Round는 Provider를 전혀 모른다 — START 시 정규화된 Course Reference Snapshot(§2 필드 + 위 메타데이터)만 받는다. 이 원칙은 이미 `ARCHITECTURE_v1.md` §1.2/§3.4에서 세운 "Round는 스냅샷을 복사한다"는 원칙의 자연스러운 연장이다.

---

## 5. Progressive Data Levels

모든 골프장이 같은 수준의 데이터를 가질 수 없다는 전제 — §3의 조사 결과가 그 전제를 뒷받침한다(정부 데이터는 클럽 단위, 상용 공급자는 문의 필요, OSM은 편차 큼).

| 레벨 | 데이터 | 활성화되는 기능 |
|---|---|---|
| **Level 0 — Manual** | 골프장 이름, 코스 이름, 현재 홀, PAR (좌표 없음) | PAR 기준 스코어 입력 가능, 코스/홀 수동 선택, **GPS 거리·상대 바람 불가** |
| **Level 1 — Basic** | 골프장/코스/18홀 PAR, 대표 골프장 좌표 | Level 0 전부 + 골프장 단위 위치 감지(어느 클럽에 있는지는 추정 가능, 홀 단위는 아직 불가) |
| **Level 2 — Reference GPS** | 홀별 Green Center 좌표 | Green Center 기준 GPS 참고 거리 가능, 플레이 방향 기반 바람 계산 가능(§9) |
| **Level 3 — Enhanced Reference** | Green Front/Center/Back, 티잉그라운드 또는 시작 홀 감지용 좌표 | Level 2 전부 + 코스/홀 감지 신뢰도 상승(§7), 그린 앞/뒤 참고 표시 |

**원칙**: 데이터가 부족하다고 라운드 시작 자체를 막지 않는다. Level 0으로도 완결된 라운드 진행이 가능해야 하고, 레벨이 올라갈수록 기능이 "추가"되는 것이지 "필수가 되는" 게 아니다. §3.7의 결론(정부 데이터=클럽 식별만, 상용 데이터=문의 필요)을 감안하면, **MVP 출시 시점 대부분의 국내 골프장은 Level 0~1에서 시작할 가능성이 높다** — 이 문서의 설계는 그 현실을 전제로 한다.

---

## 6. Manual Fallback

```
코스 정보 없음
  → 골프장 이름 직접 입력 또는 장소명 검색(Kakao/Naver 장소 검색 — §3.3, GolfClub 식별용으로만 사용)
  → 코스 이름 입력/선택
  → 시작 홀 선택
  → 현재 홀 PAR 선택(3 / 4 / 5)
  → 라운드 시작
```

### 홀마다 PAR를 매번 선택하는 방식의 문제

요청하신 대로 검토한 결과, **이 방식은 18번 반복되면 명백히 번거롭다** — Charter Principle 4(One Tap First)와 정면으로 어긋난다. 더 현실적인 대안:

1. **골프장 홈페이지의 공개 스코어카드를 한 번만 등록** — Room Host가 최초 1회 18홀 PAR을 통째로 입력(또는 §3.5의 이미지/PDF를 참고해 입력).
2. 이후 같은 골프장/코스를 다시 선택하면 **이전에 등록된 PAR 데이터가 후보로 제공**된다 — 매번 다시 입력할 필요 없음.
3. Room Host가 입력하면 **팀 전체에 즉시 적용**(Room의 다른 Member는 입력할 필요 없음 — Charter Principle 6, Team First).
4. 이 데이터는 등록 즉시 "공식"이 되지 않는다 — §11의 검증 정책을 거쳐야 다른 사용자에게도 기본값으로 노출된다.

### 사용자 입력을 즉시 공식 데이터로 승격시키지 않는 이유

한 사람이 잘못 입력한 PAR이 다른 팀의 라운드에 그대로 노출되면 신뢰도 문제가 생긴다. 그래서:
- **1단계**: 사용자가 입력한 데이터는 **그 사용자(Room)에게만** 우선 적용(`source: "user_submitted"`, `verifiedAt: null`).
- **2단계**: 같은 골프장/코스에 대해 여러 팀이 유사한 값을 등록하면 자동으로 신뢰도 상승 후보가 됨(§11).
- **3단계**: 운영자 승인 또는 다수 일치 시에만 다른 사용자에게 기본값으로 노출.

---

## 7. Course / Hole Detection

### 구조

```
현재 GPS
  → 반경 내 GolfClub 후보 조회 (§3.1 정부 데이터 기반 좌표가 1차 후보군)
  → Course/Hole 좌표가 있으면(Level 2 이상) 가장 가까운 후보 계산
  → 신뢰도 산정 (아래 표)
  → 사용자에게 "제안"으로 표시 — 자동 확정 안 함(PRE_ROUND_EXPERIENCE_v1.md §4 원칙 그대로 재확인)
  → 사용자 최종 확인
```

### 데이터 레벨에 따른 감지 정확도

| 레벨 | 감지 가능 범위 | 신뢰도 |
|---|---|---|
| Level 0 | 감지 불가(좌표 자체 없음) | 해당없음 — 수동 선택으로 바로 전환 |
| Level 1 | "이 골프장 근처에 있다"까지만 | 낮음 — 코스/홀 후보는 목록으로 제시 |
| Level 2 | 홀 단위 감지 가능(Green Center 기준 최근접 홀) | 중간 |
| Level 3 | 티잉그라운드 좌표까지 있어 홀 진입 시점(티에 도착) 감지 가능 | 높음 |

### 정책

| 상황 | 처리 |
|---|---|
| 골프장 반경 후보 | GolfClub 좌표 기준 일정 반경(예: 수백 미터~1km) 안의 클럽만 후보로 — 넓게 잡으면 오탐 증가 |
| 여러 코스가 인접 | 신뢰도 "낮음"으로 표시, 후보 목록 제시(PRE_ROUND_EXPERIENCE_v1.md §4와 동일 정책) |
| 티잉그라운드 좌표 없고 Green Center만 있음(Level 2) | 홀 감지는 가능하나 "홀에 들어섰다"는 시점 감지는 부정확 — 그린에 가까워져야 감지되므로 시작 홀 추천 타이밍이 늦을 수 있음, UI에 이 한계를 표시 |
| 인접 홀 오탐지 | 8/9번처럼 티가 가까운 레이아웃에서 발생 — 신뢰도 하향, 후보 2개 이상 제시 |
| GPS 오차가 큼 | 신뢰도 하향, 자동 제안 생략하고 수동 선택 유도 |
| 위치 권한 없음 | 감지 섹션 자체를 수동 선택 모드로 대체(에러 아님) |
| 수동 코스/홀 변경 | 언제든 가능(ARCHITECTURE_v1.1.md §4 Course Lock 정책과 연결) |
| 플레이 중 잘못된 홀 감지 경고 | ARCHITECTURE_v1.1.md §4의 B/C 정정 정책을 그대로 따름 — 이 문서에서 새로 정의하지 않음 |

---

## 8. Distance Policy

Charter Principle 7의 정보 우선순위를 그대로 유지한다: **① 내 실측 → ② 팀 실측 기반 보정 → ③ 내 GPS → ④ 코스 참고 정보 → ⑤ 감.**

Course Reference가 새로 제공하는 건 **③(내 GPS)의 기준점**이다 — Green Center 좌표가 없으면 GPS 거리 자체를 계산할 근거가 없었는데, 이제 그 근거가 생긴다. 그렇다고 우선순위가 바뀌지는 않는다 — Course Reference 기반 GPS는 여전히 실측보다 아래다.

### 표시 원칙

- "GPS(참고)"로 표시하고, Green Center 기준임을 명시한다.
- 공유 실측과 원래 GPS를 함께 비교할 수 있어야 한다 — 이미 완성된 "거리 표시 정책 보완"(주 거리 + 보조 GPS 패턴)을 그대로 재사용하면 된다. 새 UI 패턴이 필요 없다.
- 실제 핀 거리로 오해할 표현을 쓰지 않는다("그린 중심 기준 참고 거리"이지 "핀까지 거리"가 아님).
- Green Center 좌표만 있고 Front/Back이 없으면(Level 2), Front/Back 값을 임의로 추정하지 않는다 — 없는 데이터는 없는 대로 둔다(§2에서 Front/Back을 Optional로 분류한 이유와 같은 논리).

### 기존 팀 실측 보정 공식과의 결합

**기존 계산 공식은 변경하지 않는다.** GPS Delta Correction 작업에서 이미 확립한 공식을 그대로 쓴다:

```
delta = 팀원 실측 거리 - 팀원 공유 시점 GPS
동반자 보정 거리 = 동반자 현재 GPS + delta
```

Course Reference가 하는 일은 이 공식의 입력값인 "GPS"가 **어디서 오는가**를 바꾸는 것뿐이다:
- Course Reference 없음(Level 0/1) → GPS 자체가 없음 → 이 공식 자체가 작동 불가, 실측만으로 팀 공유(기존 `shared_reference` 경로 — 이미 있는 로직).
- Level 2 이상 → Green Center 기준 GPS가 생김 → 기존 공식이 그대로 작동.

즉 **Course Reference는 기존 거리 계산 로직 위에 "GPS 값의 출처"를 하나 추가하는 것이지, 계산 로직 자체를 바꾸는 게 아니다.**

---

## 9. Wind Dependency

바람은 Course Reference에 종속적이다 — 목표점(Green Center)이 없으면 "상대 풍향"이라는 개념 자체가 성립하지 않는다.

### 필요 데이터
- 사용자 현재 위치(§1.6 골프장 감지에서 이미 확보)
- Green Center 또는 목표점(§2 Hole 데이터)
- Weather API 풍향/풍속(외부 연동 — `docs/CORE_INFRASTRUCTURE_AUDIT.md` §4에서 이미 "구현 시 위험 요소"로 짚은 영역, 이 문서에서 새로 다루지 않음)

### 계산

사용자 개인 기준(본인 위치 → Green Center 방향)으로 계산한다 — **다른 플레이어 기준 방향은 표시하지 않는다.** 요청하신 그대로다. 같은 홀에 있어도 티 위치가 조금씩 다르면 체감 풍향이 달라질 수 있어서, 이건 "정확성을 위해서"가 아니라 **"팀원마다 다른 숫자를 보여주면 혼란만 커진다"는 걸 피하기 위해서도 아니라 오히려 각자 정확한 개인화가 원칙**이다 — Charter Principle 5(Player First)와 일치.

- 예상 맞바람 / 뒷바람 / 좌→우 횡풍 / 우→좌 횡풍 / 복합 방향

### Green 좌표가 없는 경우(Level 0/1) 정책 제안

두 선택지 중 **"절대 풍향만 표시"를 제안**한다("바람 기능을 완전히 숨기는" 대신):
- 이유 1: 절대 풍향(예: "북서풍 3m/s")도 골퍼에게 실질적 참고가 된다 — 상대 방향 계산만 못 할 뿐, 정보 자체가 무가치하진 않다.
- 이유 2: Charter Principle 3("샷 준비를 방해하지 않는다")과 연결 — 기능이 사라졌다 나타났다 하는 것보다, 항상 같은 자리에 있되 데이터 레벨에 따라 표현이 달라지는 게 더 예측 가능한 경험이다.
- 조건: 반드시 **"예상" 또는 "참고" 성격**을 유지한다 — Level 2 이상에서도(상대 풍향 계산 가능해도) "예상 맞바람"이지 "맞바람입니다"라고 단정하지 않는다.

---

## 10. Cache and Offline

### 원칙: `roundStorage.js`와 완전히 분리

코스 데이터는 자주 안 바뀌는 참조 데이터이고, Round는 그 순간의 스냅샷이다(§4) — 이 둘을 같은 저장소에 섞으면 "코스 데이터가 갱신됐는데 지난 Round 기록도 같이 바뀌는" 사고가 날 수 있다. **`roundStorage.js`는 Round(및 그 스냅샷)만 다루고, Course Reference Cache는 별도 저장소로 완전히 분리한다** — 요청하신 원칙 그대로 확정.

### 검토 항목

| 항목 | 제안 |
|---|---|
| 저장 방식 | IndexedDB(용량이 localStorage보다 크고, 코스 데이터가 늘어나면 localStorage 용량 제약에 먼저 부딪힘) |
| 캐시 우선순위 | 최근 사용 골프장 우선(§Architecture v1.1의 RecentCompanion과 같은 "최근 사용" 패턴 재사용 — 새 패턴 아님) |
| 데이터 버전 | §4의 `dataVersion` 메타데이터를 캐시 무효화 기준으로 사용 |
| TTL | 코스 물리 정보(홀 배치, PAR)는 TTL을 길게(예: 수개월) — 거의 안 바뀜. 반대로 이 캐시엔 Pin(일별)이나 Wind(실시간)는 애초에 넣지 않는다(§1.2 ARCHITECTURE_v1.md에서 이미 Round-scoped로 분리해둔 것과 일관) |
| 서버 데이터 갱신 | `dataVersion` 증가 시 다음 접속에서 캐시 갱신, 강제 푸시 불필요(코스 정보가 그렇게 긴급하게 바뀌지 않음) |
| 오프라인 라운드 시작 | 이미 캐시된 코스라면 가능 — `ARCHITECTURE_v1.md` §7 Offline 전략의 "Course Data 조회(캐시된 경우) 가능" 원칙과 정확히 일치 |
| 데이터가 오래됐을 때 표시 | 캐시 사용 중임을 은근히 표시(예: 작은 인디케이터) — 사용자가 오프라인인지 몰라도 되게(Charter Vision, "앱을 의식하지 않아야 한다") 강한 경고는 지양 |
| Round Snapshot과 Cache의 분리 | Snapshot은 Round 안에 복사되어 영구 보존(Permanent, Charter Principle 10), Cache는 Session/Temporary 성격 — 이 구분 자체가 Charter Principle 10(Information Lifetime)의 실제 적용 사례다 |

---

## 11. Data Correction / Verification

```
사용자: "이 홀은 PAR4가 아니라 PAR5입니다."
  → 수정 제안 (§4 메타데이터로 dataVersion 후보 생성, 기존 레코드는 아직 안 바뀜)
  → 출처/증거 선택(선택 사항 — 스코어카드 사진 등)
  → 운영자 또는 다수 사용자 검증
  → Course Reference 새 버전 발행(dataVersion 증가, verifiedAt 기록)
```

### 검토 항목별 판단

| 항목 | MVP 범위 | 이유 |
|---|---|---|
| 사용자 제안 | ✅ MVP | §6 Manual Fallback과 사실상 같은 입력 경로 재사용 |
| 운영자 승인 | ⚠️ MVP는 최소 수준만 | 본격적인 운영 도구·워크플로는 범위 밖(ARCHITECTURE_v1.md 부록에서 이미 "관리자 도구는 별도 설계 필요"로 명시) — MVP는 "운영자가 수동으로 승인 플래그를 켠다" 정도의 최소 기능으로 충분 |
| 다수 사용자 일치 | ✅ MVP(단순 규칙으로) | 예: 서로 다른 Room에서 3회 이상 동일 값 제안 시 자동 신뢰도 상승 — 복잡한 알고리즘 불필요 |
| 골프장 공식 정보 우선 | 후순위 | 골프장과의 공식 제휴/확인 절차는 이 문서 범위 밖, 운영 정책으로 남김 |
| 수정 이력 | ✅ MVP | `dataVersion` 자체가 이력 — 새 구조 불필요 |
| 이전 Round Snapshot 영향 없음 | ✅ MVP(원칙만 확정, 구현은 자동) | §4에서 이미 확정한 스냅샷 원칙의 당연한 귀결 — Course Reference가 수정돼도 과거 Round의 `courseSnapshot`은 절대 안 바뀐다 |
| 잘못된 정보 롤백 | ⚠️ MVP는 "이전 dataVersion으로 되돌리기" 수준 | 복잡한 브랜치/머지 없이 버전 번호를 이전 것으로 되돌리는 정도로 충분 |

**요약**: 검증 인프라 자체(제안 접수, 버전 관리, 스냅샷 불변성)는 MVP에 포함하되, 그 인프라를 운영하는 **사람의 절차**(운영자 승인 워크플로, 골프장과의 공식 협의)는 이 Sprint의 설계 범위 밖으로 명확히 남긴다.

---

## 12. Implementation Scope

### Phase 1 — Local Reference Prototype
- **Deliverable**: 내부 정규화 모델(§2) 구현, 테스트 코스 1~2개를 JSON으로 직접 작성, 코스/홀 수동 선택 UI, PAR 적용, Green Center 기반 실제 GPS 계산(현재는 `GPS_BASE_M` 상수 기반 목업이었던 것을 좌표 기반으로 전환), Provider Adapter 인터페이스(구현체는 아직 "Local JSON"뿐).
- **위험 요소**: 낮음 — 외부 의존성 없음.
- **Round Engine 영향도**: 중간 — `distanceCalculator.js`의 GPS 계산 부분이 상수 기반에서 좌표 기반(하버사인 등)으로 바뀌어야 함. 팀 실측 보정 공식(§8) 자체는 안 바뀜.

### Phase 2 — Search and Cache
- **Deliverable**: 골프장 검색(§3.1 정부 데이터 + §3.3 장소 검색 API 결합), 위치 기반 후보 추천(§7), Course Reference 캐시(§10), 데이터 레벨 표시(§5) UI.
- **위험 요소**: 중간 — 정부 데이터 좌표계 변환(§3.1의 EPSG:5174 주의사항) 처리 필요, 캐시 무효화 로직의 첫 실전 검증.
- **Round Engine 영향도**: 낮음 — Room 단계 작업이 대부분, Round Snapshot 구조 자체는 안 바뀜.

### Phase 3 — External Provider
- **Deliverable**: 실제 데이터 공급자(§3.4, 문의 후 확정) 연결, 서버 프록시(API 키 보호), 라이선스 준수, 데이터 업데이트 파이프라인.
- **위험 요소**: 높음 — 공급자 계약·비용·한국 커버리지가 전부 "문의 필요" 상태라 이 Phase의 실제 착수 가능 여부 자체가 불확실. Phase 3 시작 전 공급자 확정이 선행 조건.
- **Round Engine 영향도**: 낮음 — Provider Adapter가 이미 Phase 1에서 인터페이스로 분리돼 있어, 새 공급자는 Adapter 구현체 하나 추가하는 정도.

### Phase 4 — User Correction
- **Deliverable**: 데이터 오류 제안 UI(§11), 최소 검증·버전 관리.
- **위험 요소**: 낮음~중간 — 기술적으로는 단순하지만, 악의적/반복적 오류 제안에 대한 최소한의 어뷰징 방지는 필요(이 문서에서 상세 설계는 안 함).
- **Round Engine 영향도**: 없음 — Course Reference 레이어에서만 발생, Round는 여전히 스냅샷만 받음.

---

## 13. Founder가 결정해야 할 사항

- **상용 공급자 도입 여부와 시점** — §3.4에서 가격·한국 커버리지를 확인하지 못했다. Phase 3 착수 전 `golfapi.io` 등 후보에 실제 문의가 필요하다.
- **정부 공공데이터의 좌표계 변환 처리 주체** — EPSG:5174 → WGS84 변환은 기술적으로 간단하지만, 이 변환을 Provider Adapter 안에 넣을지 별도 배치 작업으로 뺄지는 구현 단계에서 정할 문제.
- **OSM 데이터를 공식 소스로 채택할지** — 커버리지 편차가 커서(§3.2), "있으면 보조로 쓰는" 정도로 제안했지만 이걸 정식 Provider로 등록해 자동 수집할지, 아니면 수동 참고용으로만 둘지는 제품 방향 판단이 필요.
- **9홀 조합 코스(§2) 데이터를 누가, 어떻게 최초 등록할지** — 사용자 등록에 맡길지 운영자가 선제적으로 국내 주요 골프장을 등록해둘지.
- **운영자 검증 인력·프로세스** — §11에서 인프라는 MVP 범위로 뒀지만, 실제로 누가 승인 버튼을 누를지는 운영 조직의 문제.
- **골프장과의 공식 제휴 여부** — §3.5(공식 홈페이지 정보)를 넘어 골프장이 직접 데이터를 제공하는 파트너십을 추진할지는 이 문서의 기술적 판단 범위를 넘어선다.

---

## Final Criteria 검증

- 팀 플레이를 더 자연스럽게 만드는가 → §8(기존 거리 공식 유지), §6(반복 입력 최소화)에서 직접 다룸.
- 샷 준비를 방해하지 않는가 → §9(예상/참고 표현 유지), §10(오프라인에서도 캐시된 코스는 계속 작동).
- 레이저/GPS 전문기기와 불필요하게 경쟁하지 않는가 → §1 Product Boundary에서 명시적으로 확정.
- 상세 코스 데이터 없이도 라운드를 진행할 수 있는가 → §5(Level 0도 완결된 라운드 가능), §6(Manual Fallback).
- 데이터 공급자가 바뀌어도 Round Engine이 유지되는가 → §4 Provider Adapter 구조로 확정.

이번 Sprint는 설계 문서 작성까지이며, 코드나 새 컴포넌트는 만들지 않았습니다. `ARCHITECTURE_v1.md`, `ARCHITECTURE_v1.1.md`, `PRE_ROUND_EXPERIENCE_v1.md`는 수정하지 않았습니다.
