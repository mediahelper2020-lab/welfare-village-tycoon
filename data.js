/* =========================================================
 * 복지마을 타이쿤 — 정적 데이터
 * (시설, 프로그램 키워드, 사례관리, 지역자원, 이벤트, 이름 풀)
 * ========================================================= */
'use strict';

const DATA = {};

/* ---------- 지도 / 토지 / 도로 ----------
 * 28×28 타일을 4타일짜리 구역(파셀) 7×7로 나눈다.
 * 시작은 중앙 3×3 구역(12×12 타일)만 우리 마을 소유.
 */
DATA.MAP = {
  GRID: 28,          // 한 변의 타일 수
  TILE: 4,           // 타일 한 변(3D 월드 단위)
  PARCEL: 4,         // 구역 한 변의 타일 수
  PARCELS: 7,        // 한 변의 구역 수
  INIT_MIN: 2,       // 처음 보유한 구역 범위 (인덱스)
  INIT_MAX: 4,
};

/* 토지 매입가: 이미 넓힐수록 비싸진다 */
DATA.LAND = {
  base: 2e8,         // 첫 구역 2억
  step: 8e7,         // 구역 하나 늘 때마다 +8,000만
};

/* 도로 공사비 (한 칸 기준) */
DATA.ROAD = {
  cost: 5e6,         // 500만 원
  refund: 1e6,       // 철거 시 100만 원 환급
};

/* ---------- 주민 그룹 ---------- */
DATA.GROUPS = {
  senior:   { id: 'senior',   label: '독거노인',       short: '노인', color: '#4d8fd6' },
  disabled: { id: 'disabled', label: '발달장애인',     short: '장애', color: '#c07f2b' },
  basic:    { id: 'basic',    label: '기초생활수급자', short: '수급', color: '#2fa07f' },
  general:  { id: 'general',  label: '일반 주민',      short: '일반', color: '#a96fd0' },
};
DATA.GROUP_IDS = ['senior', 'disabled', 'basic', 'general'];

/* ---------- 복지시설 ----------
 * cost/upkeep: 원 단위. size: 타일 변 길이(1 또는 2). cap: 프로그램 수용 정원.
 * host: 프로그램 운영 가능 여부. goodFor: 잘 맞는 대상 그룹.
 * passive: 매월 그룹별 만족도 소폭 상승치.
 */
DATA.BUILDINGS = [
  {
    id: 'welfare', name: '종합사회복지관', icon: '🏢',
    cost: 12e8, upkeep: 3.0e7, size: 2, cap: 120, host: true,
    goodFor: ['senior', 'disabled', 'basic', 'general'],
    passive: { senior: .5, disabled: .5, basic: .5, general: .4 },
    baseColor: 0x9fb8d8, roofColor: 0x3f6ea8, height: 4.6,
    desc: '마을 복지의 중심. 모든 대상에게 프로그램을 열 수 있는 대형 거점 시설.',
  },
  {
    id: 'seniorCenter', name: '노인복지관', icon: '🏛️',
    cost: 9e8, upkeep: 2.0e7, size: 2, cap: 90, host: true,
    goodFor: ['senior'],
    passive: { senior: 1.0 },
    baseColor: 0xd8c9a8, roofColor: 0x8a6b3c, height: 3.8,
    desc: '어르신 여가·건강·식사 지원의 거점. 독거노인 프로그램 효과가 커진다.',
  },
  {
    id: 'disabledCenter', name: '장애인복지관', icon: '🏥',
    cost: 10e8, upkeep: 2.2e7, size: 2, cap: 80, host: true,
    goodFor: ['disabled'],
    passive: { disabled: 1.2 },
    baseColor: 0xf0d9a8, roofColor: 0xb98a2e, height: 3.8,
    desc: '발달장애인 주간활동·재활·자립훈련 거점. 장애인 프로그램 효과가 커진다.',
  },
  {
    id: 'familyCenter', name: '가족센터', icon: '🏠',
    cost: 8e8, upkeep: 1.8e7, size: 2, cap: 80, host: true,
    goodFor: ['general', 'basic'],
    passive: { general: .8, basic: .5 },
    baseColor: 0xf3c8c8, roofColor: 0xb85c5c, height: 3.4,
    desc: '가족상담·돌봄·다문화 지원. 일반 주민과 수급 가구의 만족도를 올린다.',
  },
  {
    id: 'childCenter', name: '지역아동센터', icon: '🎒',
    cost: 3e8, upkeep: 0.8e7, size: 1, cap: 40, host: true,
    goodFor: ['basic', 'general'],
    passive: { basic: .7, general: .3 },
    baseColor: 0xc8e6a8, roofColor: 0x5c8a3c, height: 2.6,
    desc: '방과후 돌봄과 학습 지원. 아동이 있는 취약 가구에 큰 힘이 된다.',
  },
  {
    id: 'gyeongro', name: '경로당', icon: '🍵',
    cost: 1.5e8, upkeep: 0.3e7, size: 1, cap: 25, host: true,
    goodFor: ['senior'],
    passive: { senior: .6 },
    baseColor: 0xd9d2b8, roofColor: 0x6e6248, height: 2.2,
    desc: '작지만 가까운 어르신 사랑방. 저렴하게 지어 골목마다 둘 수 있다.',
  },
  {
    id: 'soupKitchen', name: '무료급식소', icon: '🍚',
    cost: 2e8, upkeep: 1.0e7, size: 1, cap: 0, host: false,
    goodFor: ['senior', 'basic'],
    passive: { senior: .8, basic: .8 },
    baseColor: 0xf5e3b8, roofColor: 0xc99a3c, height: 2.4,
    desc: '매일 따뜻한 한 끼 제공. 결식 어르신·수급 가구 사례 연계에도 쓰인다.',
  },
  {
    id: 'jahwal', name: '자활일자리센터', icon: '🛠️',
    cost: 5e8, upkeep: 1.2e7, size: 1, cap: 40, host: true,
    goodFor: ['basic', 'disabled'],
    passive: { basic: .9, disabled: .4 },
    baseColor: 0xb8c8d8, roofColor: 0x4a6a8a, height: 3.0,
    desc: '수급자·장애인의 일 경험과 자활을 지원. 일자리 프로그램의 거점.',
  },
  {
    id: 'healthPost', name: '보건지소', icon: '💊',
    cost: 6e8, upkeep: 1.5e7, size: 1, cap: 30, host: true,
    goodFor: ['senior', 'disabled'],
    passive: { senior: .5, disabled: .5, basic: .3, general: .3 },
    baseColor: 0xffffff, roofColor: 0x3c8a5c, height: 3.0,
    desc: '방문간호·만성질환 관리. 건강 취약 사례 연계에 필요하다.',
  },
  {
    id: 'park', name: '마을공원', icon: '🌳',
    cost: 1e8, upkeep: 0.2e7, size: 1, cap: 0, host: false,
    goodFor: ['senior', 'disabled', 'basic', 'general'],
    passive: { senior: .3, disabled: .3, basic: .3, general: .3 },
    baseColor: 0x88b868, roofColor: 0x88b868, height: 0.4, isPark: true,
    desc: '누구나 쉬어가는 초록 쉼터. 마을 전체 만족도를 조금씩 올린다.',
  },
];

/* ---------- 프로그램 키워드 → 대상별 호응 배수 ---------- */
DATA.KEYWORDS = [
  { id: 'health',  label: '건강',   words: ['건강', '운동', '체조', '걷기', '스트레칭', '재활', '요가'],
    interest: { senior: 1.35, disabled: 1.20, basic: 1.05, general: 1.10 } },
  { id: 'food',    label: '식생활', words: ['요리', '식사', '반찬', '급식', '영양', '밥', '먹거리'],
    interest: { senior: 1.30, disabled: 1.10, basic: 1.25, general: 1.05 } },
  { id: 'culture', label: '문화',   words: ['문화', '음악', '미술', '노래', '공연', '원예', '악기', '합창', '그림'],
    interest: { senior: 1.20, disabled: 1.25, basic: 1.10, general: 1.20 } },
  { id: 'edu',     label: '교육',   words: ['교육', '배움', '학습', '교실', '한글', '문해', '공부'],
    interest: { senior: 1.15, disabled: 1.15, basic: 1.20, general: 1.10 } },
  { id: 'counsel', label: '심리',   words: ['상담', '마음', '치유', '심리', '힐링', '우울'],
    interest: { senior: 1.20, disabled: 1.20, basic: 1.20, general: 1.10 } },
  { id: 'job',     label: '일자리', words: ['일자리', '취업', '자활', '직업', '바리스타', '창업', '근로'],
    interest: { senior: 1.05, disabled: 1.25, basic: 1.40, general: 1.10 } },
  { id: 'outing',  label: '나들이', words: ['나들이', '여행', '소풍', '체험', '캠프', '견학'],
    interest: { senior: 1.30, disabled: 1.30, basic: 1.20, general: 1.20 } },
  { id: 'digital', label: '디지털', words: ['디지털', '스마트폰', '키오스크', '컴퓨터', '인터넷', '영상통화'],
    interest: { senior: 1.40, disabled: 1.10, basic: 1.10, general: 1.05 } },
  { id: 'community', label: '공동체', words: ['공동체', '이웃', '마을', '축제', '장터', '봉사', '나눔'],
    interest: { senior: 1.10, disabled: 1.10, basic: 1.10, general: 1.30 } },
];

/* ---------- 프로그램 월 예산 선택지 ---------- */
DATA.PROGRAM_BUDGETS = [
  { value: 3e6,  label: '월 300만 원 (소규모)' },
  { value: 5e6,  label: '월 500만 원 (기본)' },
  { value: 1e7,  label: '월 1,000만 원 (충실)' },
  { value: 2e7,  label: '월 2,000만 원 (집중투자)' },
];

/* ---------- 참여자 반응 템플릿 ---------- */
DATA.COMMENTS = {
  high: [
    '매주 이 시간만 기다려져요. 이런 프로그램이 생겨서 마을 살 맛이 납니다!',
    '선생님들이 한 분 한 분 챙겨주셔서 눈물 나게 고마웠어요.',
    '친구가 생겼어요. 혼자가 아니라는 게 이렇게 좋은 건지 몰랐네요.',
    '옆 동네 사는 동생한테도 자랑했어요. 이사 오고 싶다고 하더라고요.',
    '몸도 마음도 가벼워졌어요. 계속만 해주세요!',
    '처음엔 쭈뼛쭈뼛했는데 지금은 제가 제일 먼저 와서 기다립니다.',
    '이 나이에 새로 배우는 재미가 이렇게 클 줄 몰랐어요.',
    '우리 마을이 정말 달라지고 있다는 게 느껴져요.',
  ],
  mid: [
    '재미있긴 한데 시간이 조금 짧은 것 같아요.',
    '좋았어요. 다만 자리가 좁아서 조금 불편했습니다.',
    '내용은 괜찮은데 우리 눈높이에 조금 어려운 부분도 있었어요.',
    '다음엔 간식이 좀 있으면 좋겠어요. 그래도 잘 다녀왔습니다.',
    '무난했어요. 이웃들 얼굴 보는 재미로 갑니다.',
    '선생님이 친절하셨어요. 프로그램이 더 자주 있으면 좋겠네요.',
  ],
  low: [
    '기대했는데 준비가 좀 부족해 보였어요.',
    '사람이 너무 많아서 정신이 없었어요. 예산을 더 써야 할 것 같아요.',
    '내용이 우리랑 잘 안 맞는 느낌이었어요.',
    '한 번 가보고 안 가게 되더라고요. 아쉬워요.',
    '홍보만 요란하고 실속이 없다는 얘기가 돌아요.',
  ],
  byKeyword: {
    health:  '끝나고 나면 무릎이 한결 부드러워요.',
    food:    '집에 가져간 반찬 덕에 일주일이 든든했어요.',
    culture: '무대에 서 본 게 평생 처음이었어요. 가슴이 벅찼습니다.',
    edu:     '이제 은행 서류도 제 손으로 읽을 수 있어요.',
    counsel: '속 얘기를 털어놓고 나니 잠이 잘 와요.',
    job:     '월급봉투를 받아보는 게 몇 년 만인지 몰라요.',
    outing:  '바깥바람 쐰 게 얼마 만인지… 사진도 많이 찍었어요.',
    digital: '드디어 손주랑 영상통화를 했어요!',
    community: '이웃 얼굴을 알게 되니 골목이 무섭지 않아요.',
  },
};

/* ---------- 사례관리: 욕구(취약점) 분류 ---------- */
DATA.NEEDS = {
  health:  { id: 'health',  label: '건강 악화',     icon: '🩺', desc: '만성질환·거동 불편으로 일상생활이 어려움' },
  mental:  { id: 'mental',  label: '우울·고립',     icon: '🌧️', desc: '사회적 관계 단절, 우울감 호소' },
  housing: { id: 'housing', label: '주거 불안정',   icon: '🏚️', desc: '월세 체납, 곰팡이·누수 등 열악한 주거환경' },
  finance: { id: 'finance', label: '경제적 위기',   icon: '💸', desc: '채무·체납으로 생계가 위태로움' },
  food:    { id: 'food',    label: '결식·영양',     icon: '🍽️', desc: '끼니를 거르는 날이 많고 영양 상태가 나쁨' },
  care:    { id: 'care',    label: '돌봄 공백',     icon: '🫂', desc: '일상을 챙겨줄 사람이 없어 방임 위험' },
  edu:     { id: 'edu',     label: '학습·양육 곤란', icon: '📚', desc: '아동 학습 부진, 양육 부담 과중' },
  legal:   { id: 'legal',   label: '법률 문제',     icon: '⚖️', desc: '임대차 분쟁·서류 문제 등 법적 조력 필요' },
  job:     { id: 'job',     label: '실직·구직난',   icon: '💼', desc: '오랜 실직으로 소득이 끊긴 상태' },
};

/* ---------- 지역자원 (사례 연계용) ----------
 * treats: 해결 가능한 욕구. cost: 연계 비용(원). req: 필요한 시설 id(없으면 null)
 */
DATA.RESOURCES = [
  { id: 'visitNurse',  name: '보건지소 방문간호팀',        treats: ['health'], cost: 0,     req: 'healthPost',
    desc: '간호사가 정기 방문해 혈압·복약을 관리한다. (보건지소 필요)' },
  { id: 'hospital',    name: '지역 종합병원 의료후원',      treats: ['health'], cost: 1e6,   req: null,
    desc: '협약 병원이 진료비를 후원한다.' },
  { id: 'mindCenter',  name: '정신건강복지센터 상담 연계',  treats: ['mental'], cost: 0,     req: null,
    desc: '전문 상담사가 주 1회 심리상담을 진행한다.' },
  { id: 'malbut',      name: '말벗 자원봉사단',            treats: ['mental'], cost: 0,     req: null,
    desc: '이웃 봉사자가 주 2회 안부 방문과 말벗이 되어준다.' },
  { id: 'lhCenter',    name: 'LH 주거복지센터',            treats: ['housing'], cost: 0,    req: null,
    desc: '임대주택 이주·주거급여 신청을 돕는다.' },
  { id: 'houseRepair', name: '사랑의 집수리 봉사단',        treats: ['housing'], cost: 5e5,  req: null,
    desc: '도배·장판·보일러를 고쳐준다. (자재비 소요)' },
  { id: 'finCenter',   name: '서민금융통합지원센터',        treats: ['finance'], cost: 0,    req: null,
    desc: '채무조정과 긴급 소액대출을 연계한다.' },
  { id: 'moggum',      name: '사회복지공동모금회 긴급지원', treats: ['finance'], cost: 2e6,  req: null,
    desc: '긴급 생계비를 매칭 지원한다. (매칭금 소요)' },
  { id: 'sideDish',    name: '무료급식소 반찬배달',        treats: ['food'],   cost: 0,     req: 'soupKitchen',
    desc: '주 3회 밑반찬을 배달한다. (무료급식소 필요)' },
  { id: 'foodBank',    name: '푸드뱅크·푸드마켓',          treats: ['food'],   cost: 3e5,   req: null,
    desc: '기부 식품 꾸러미를 정기 전달한다.' },
  { id: 'eldercare',   name: '노인맞춤돌봄서비스',          treats: ['care'],   cost: 8e5,  req: null,
    desc: '생활지원사가 주기적으로 가사·안부를 돌본다.' },
  { id: 'actAssist',   name: '장애인활동지원사 연계',      treats: ['care'],   cost: 8e5,   req: null,
    desc: '활동지원사가 이동·일상생활을 지원한다.' },
  { id: 'afterSchool', name: '지역아동센터 방과후 돌봄',    treats: ['edu'],    cost: 0,    req: 'childCenter',
    desc: '방과후 학습·저녁 돌봄을 제공한다. (지역아동센터 필요)' },
  { id: 'mentoring',   name: '대학생 멘토링 봉사단',        treats: ['edu'],    cost: 0,    req: null,
    desc: '대학생이 주 1회 학습 멘토링을 한다.' },
  { id: 'legalAid',    name: '대한법률구조공단',            treats: ['legal'],  cost: 0,    req: null,
    desc: '무료 법률상담과 소송 구조를 지원한다.' },
  { id: 'jobCenter',   name: '고용센터 취업성공패키지',      treats: ['job'],   cost: 0,    req: null,
    desc: '직업훈련과 구직활동을 단계별로 지원한다.' },
  { id: 'jahwalTeam',  name: '자활근로사업단 참여',        treats: ['job'],    cost: 0,     req: 'jahwal',
    desc: '자활사업단에서 일 경험과 급여를 얻는다. (자활일자리센터 필요)' },
];

/* ---------- 사례 생성 템플릿 ---------- */
DATA.CASE_TEMPLATES = {
  senior: {
    ageRange: [68, 89],
    needPool: ['health', 'mental', 'food', 'care', 'housing'],
    stories: [
      '홀로 지내신 지 {yrs}년. 최근 낙상 이후 바깥출입이 부쩍 줄었다.',
      '배우자와 사별 후 식사를 자주 거르신다. 집 안에 약봉지가 쌓여 있다.',
      '자녀와 연락이 끊긴 지 오래다. 겨울이면 보일러를 아껴 켠다.',
      '경로당에도 나오지 않아 이웃이 걱정 끝에 복지관에 알려왔다.',
    ],
  },
  disabled: {
    ageRange: [19, 52],
    needPool: ['care', 'job', 'mental', 'health', 'edu'],
    stories: [
      '고령의 어머니가 홀로 돌보고 있다. 어머니 건강이 나빠지며 돌봄 공백이 우려된다.',
      '특수학교 졸업 후 갈 곳이 없어 집에만 머문 지 {yrs}년째다.',
      '반복 업무는 잘 해내지만 일자리를 구하지 못해 자신감을 잃었다.',
      '낮 시간을 보낼 곳이 없어 생활 리듬이 무너지고 있다.',
    ],
  },
  basic: {
    ageRange: [24, 63],
    needPool: ['finance', 'job', 'housing', 'food', 'edu', 'legal', 'mental'],
    stories: [
      '실직 후 월세가 {yrs}개월째 밀려 있다. 아이는 학원 대신 빈집에서 저녁을 보낸다.',
      '지병으로 일을 쉬는 사이 카드빚이 불어났다. 독촉 전화에 잠을 설친다.',
      '반지하 집에 곰팡이가 번져 아이가 기침을 달고 산다.',
      '한부모 가정. 야간 일을 하는 동안 아이를 맡길 곳이 없다.',
    ],
  },
};

/* ---------- 랜덤 이벤트 ---------- */
DATA.EVENTS = [
  { id: 'coldwave', months: [12, 1, 2], text: '한파가 닥쳤습니다. 독거 어르신들의 난방비 부담이 커졌습니다.',
    effect: { sat: { senior: -3 } } },
  { id: 'heatwave', months: [7, 8], text: '폭염이 이어집니다. 쪽방·반지하 가구가 힘겨운 여름을 보내고 있습니다.',
    effect: { sat: { basic: -2, senior: -2 } } },
  { id: 'donation', months: null, text: '지역 기업이 복지기금 3,000만 원을 기탁했습니다!',
    effect: { budget: 3e7 } },
  { id: 'volunteers', months: null, text: '자원봉사 동아리가 마을 대청소와 반찬 나눔을 진행했습니다.',
    effect: { sat: { senior: 2, basic: 1 } } },
  { id: 'press', months: null, text: '지역 신문에 우리 마을 복지 사례가 크게 보도되었습니다!',
    effect: { rep: 4 }, cond: 'rep50' },
  { id: 'award', months: null, text: '도지사 표창! 복지행정 우수 지자체로 선정되었습니다.',
    effect: { rep: 6, budget: 5e7 }, cond: 'rep70' },
  { id: 'flu', months: [11, 12, 1], text: '독감이 유행합니다. 어르신 건강관리에 비상이 걸렸습니다.',
    effect: { sat: { senior: -2, disabled: -1 } } },
  { id: 'festival', months: [5, 10], text: '마을 골목축제가 열려 주민들이 오랜만에 한자리에 모였습니다.',
    effect: { sat: { general: 3, senior: 1 } } },
];

/* ---------- 이주(전입) 소식 문구 ---------- */
DATA.MIGRATION_LINES = [
  '"복지가 좋다더라"는 소문을 듣고 {n}명이 우리 마을로 이사왔습니다!',
  '옆 도시에서 {n}명이 전입했습니다. "여기는 어르신을 진짜 챙겨준대요."',
  '{n}명이 새 주민이 되었습니다. 부동산에 복지시설 문의가 늘고 있습니다.',
  '아이 키우기 좋다는 입소문에 {n}명의 가족이 이주해왔습니다.',
];

/* ---------- 이름 풀 ---------- */
DATA.NAMES = {
  family: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍'],
  seniorGiven: ['영자', '순덕', '말순', '병철', '기수', '옥분', '점례', '만복', '금례', '춘식', '복순', '판술', '정례', '두식', '옥례', '용팔'],
  adultGiven: ['민수', '지영', '성호', '은정', '태윤', '수진', '현우', '미경', '동혁', '세라', '준호', '가은', '상철', '유나', '재만', '하늘'],
  youngGiven: ['도윤', '서연', '하준', '지우', '시우', '아린', '준서', '다은'],
};

/* ---------- 프로그램 작성 예시(placeholder) ---------- */
DATA.PROGRAM_EXAMPLES = [
  { t: '어르신 스마트폰 교실', d: '키오스크 주문, 손주와 영상통화, 기차표 예매까지. 8주 과정 디지털 문해 교육.' },
  { t: '반찬 나눔 요리단', d: '주민 봉사단과 함께 밑반찬을 만들어 독거 어르신 가정에 배달합니다.' },
  { t: '느린 학습자 바리스타 훈련', d: '발달장애 청년이 카페 실습으로 취업을 준비하는 12주 직업훈련.' },
];
