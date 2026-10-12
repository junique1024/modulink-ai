# ModuLink-AI

말 한 줄로 로봇 모듈 조합 · 투자 회수 기간 · 안전 검토 항목까지 —
제조 현장 이동형 로봇 모듈 최적 구성 및 ROI 즉시 계산 노코드 툴 (프로토타입)

팀 신촌다이나믹스 · 2026 기업가정신 챌린지 최종 결과물

## 할 수 있는 일

1. **말로 요청하기** — "200kg 부품 상자를 100m 이송, 로봇팔로 25kg 꺼내고 정밀 검사, 2교대 2명"
   → 무게·거리·검사 수준·인원·인건비·대체율을 찾아 조건을 채우고 바로 추천
   - 문장에 없는 값은 **"기본값 사용"으로 따로 표시** (몰래 채우지 않음)
2. **계산 과정 표시** — 문장 해석 → 카탈로그 탐색 → 로봇팔 필터 → 적재·규격 호환 검사 → 최저가 선택 → 회수 계산을
   실제 계산 숫자("조합 6개 검토 → 적재 초과 2개 · 규격 불일치 1개 탈락")와 함께 단계별로 보여줌 (약 2초, 건너뛰기 가능)
3. **최적 조합 추천** — 하중 안전율 1.2, 장착 규격 호환을 만족하는 조합 중 가장 저렴한 조합
4. **투자 회수 계산 + 그래프** — 도입비, 연간 순절감액(대체율 반영), 본전 시점 표시
5. **안전·호환성 체크리스트** — 조합에 따라 항목이 달라짐, 인쇄·PDF 리포트
6. **검토 기록 저장·삭제** — Supabase DB 또는 브라우저

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
```

## 설정 (모두 선택 사항)

`.env.local.example` → `.env.local` 로 복사 후 입력 (Vercel은 Settings → Environment Variables)

| 변수 | 없을 때 동작 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 기록을 브라우저에 저장 |
| `ANTHROPIC_API_KEY` | 규칙 기반 해석기로 문장 해석 |

**장애에 강하게 설계:** DB가 응답하지 않거나(3초 제한) 저장에 실패하면 자동으로 브라우저 저장으로 전환하고,
Claude API가 실패·지연(6초 제한)되면 규칙 기반 해석으로 전환합니다. 어떤 경우에도 화면이 멈추지 않습니다.

Supabase 테이블은 `supabase/migrations/001_init.sql` 을 SQL Editor에서 실행해 만듭니다. (스키마 변경 없음)

## 배포 (Vercel)

1. vercel.com → Add New → Project → 이 저장소 선택 → Deploy
2. (선택) Settings → Environment Variables에 위 변수 입력 후 Redeploy
3. 시크릿 창에서 주소가 로그인 없이 열리는지 확인

## 폴더 구조

```
src/
├─ app/                          # 화면 (page.tsx, layout.tsx, globals.css)
├─ components/
│  ├─ Workspace.tsx              # 화면 전체 상태 · 저장 방식(DB/브라우저) 자동 전환
│  ├─ Planner.tsx                # 말로 요청 · 조건 입력 · 추천 결과 · 체크리스트
│  ├─ AnalysisOverlay.tsx       # 계산 단계 표시 화면
│  ├─ RoiChart.tsx               # 월별 누적 손익 그래프
│  └─ HistoryList.tsx            # 저장된 검토 기록
├─ features/
│  ├─ ai/                        # 문장 해석 (규칙 기반 parse.ts + Claude API actions.ts)
│  ├─ modules/                   # 추천·ROI(recommend.ts), 체크리스트, 카탈로그
│  └─ recommendations/           # 기록 저장·삭제 (Supabase)
└─ lib/supabase/server.ts        # Supabase 클라이언트 (키 없으면 null, 3초 제한)
docs/
├─ 데모_시나리오.md               # 발표용 시연 순서
├─ 더미데이터_모듈카탈로그.csv     # 시연용 모듈 데이터
├─ 개발이력.md                    # 회차별 성장 기록
└─ 설계계획.md                    # 3차시 설계 문서
```

※ 모듈 사양과 가격은 시연용 예시 값입니다. 안전 체크리스트는 참고용이며 인증·적합성 판단을 대신하지 않습니다.
