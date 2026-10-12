import type { Recommendation, TaskInput } from "./types";

export interface CheckGroup {
  title: string;
  items: string[];
  auto?: boolean; // 앱이 이미 계산으로 확인한 항목 (체크된 상태로 표시)
}

/**
 * 선택된 조합에 맞는 안전·호환성 검토 항목 (참고용)
 * ※ 인증·적합성 판단을 대신하지 않으며, 최종 판단은 전문가·인증기관 확인이 필요합니다.
 */
export function buildChecklist(input: TaskInput, r: Extract<Recommendation, { ok: true }>): CheckGroup[] {
  const groups: CheckGroup[] = [];
  const margin = r.requiredKg > 0 ? `여유 ${Math.round((r.base.payload_kg / r.requiredKg - 1) * 100)}%` : "적재물 없음";

  groups.push({
    title: "호환성 (계산으로 확인 완료)",
    auto: true,
    items: [
      `적재 여유: 필요 ${Math.round(r.requiredKg)}kg ↔ 베이스 ${r.base.payload_kg}kg (${margin})`,
      ...(r.arm ? [`로봇팔 장착 규격 ${r.arm.mount} ↔ 베이스 지원 규격 ${r.base.mount}`] : []),
      ...(r.arm ? [`로봇팔 가반 ${r.arm.payload_kg}kg ≥ 집는 무게 ${input.pickKg}kg × 안전율`] : []),
    ],
  });
  groups.push({ title: "도입 전 현장 확인", items: ["모듈 간 전원(전압)·통신 인터페이스 사양 최종 확인", "설치 위치 네트워크(Wi-Fi) 환경 확인"] });

  groups.push({
    title: "자율주행 베이스 (ISO 3691-4 관련 검토)",
    items: [
      "주행 경로·작업 구역 지정 및 바닥 표시",
      "사람 혼재 구역의 감속·정지 영역(안전 스캐너 보호 필드) 설정",
      "비상정지 버튼 위치·작동 확인",
      `이동 경로(${input.distanceM}m)의 바닥 상태·경사·문턱 점검`,
      "충전 구역 위치와 배터리 운영 계획",
    ],
  });

  if (r.arm) {
    groups.push({
      title: "로봇팔 (ISO 10218 · 협동 운전 관련 검토)",
      items: [
        "로봇 설치 위험성 평가 실시",
        "작업자와 접촉 가능 시 협동 운전 조건(속도·힘 제한) 검토",
        "주행 중 로봇팔 고정 자세(접힘) 및 주행·팔 동작 동시 금지 인터록",
        "산업용 로봇 관련 국내 안전 확인 대상 여부 확인",
      ],
    });
  }

  if (r.sensor) {
    groups.push({
      title: "검사 센서",
      items: [
        "검사 위치 조명 조건 확인 (외광 차단 필요 여부)",
        "양품·불량 기준 샘플 확보 및 판정 기준 합의",
        ...(r.sensor.level === "precise" ? ["3D 측정용 광원 안전 등급 확인"] : []),
      ],
    });
  }

  if (input.loadKg >= 300) {
    groups.push({ title: "고하중 추가 항목", items: ["바닥 허용 하중 확인", "적재물 고정·낙하 방지 장치"] });
  }
  return groups;
}
