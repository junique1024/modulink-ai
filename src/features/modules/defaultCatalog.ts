import type { RobotModule } from "./types";

/**
 * 기본 모듈 카탈로그 (시연용 예시 값)
 * - Supabase가 연결되지 않았거나 modules 테이블이 비어 있을 때 사용합니다.
 * - 실제 ModuLink 모듈 사양은 Supabase `modules` 테이블에서 관리하세요.
 */
export const DEFAULT_MODULES: RobotModule[] = [
  { category: "base", name: "ML-B100 경량 주행 베이스", payload_kg: 100, self_kg: 0, price: 1800, mount: "A", spec: "최대 100kg · 1.2m/s · 라이다 자율주행" },
  { category: "base", name: "ML-B300 중형 주행 베이스", payload_kg: 300, self_kg: 0, price: 3200, mount: "A,B", spec: "최대 300kg · 1.0m/s · 라이다+3D 카메라" },
  { category: "base", name: "ML-B600 대형 주행 베이스", payload_kg: 600, self_kg: 0, price: 5500, mount: "B", spec: "최대 600kg · 0.8m/s · 안전 스캐너 2식" },
  { category: "arm", name: "ML-A5 협동 로봇팔", payload_kg: 5, self_kg: 20, price: 1500, mount: "A", spec: "가반 5kg · 도달 850mm" },
  { category: "arm", name: "ML-A15 협동 로봇팔", payload_kg: 15, self_kg: 40, price: 2600, mount: "A", spec: "가반 15kg · 도달 1,300mm" },
  { category: "arm", name: "ML-A30 산업용 로봇팔", payload_kg: 30, self_kg: 70, price: 4200, mount: "B", spec: "가반 30kg · 도달 1,700mm" },
  { category: "sensor", name: "ML-V1 2D 비전 검사 모듈", payload_kg: 0, self_kg: 3, price: 450, mount: "A,B", spec: "기본 외관 검사 · 찍힘/오염", level: "basic" },
  { category: "sensor", name: "ML-V3 3D 비전 검사 모듈", payload_kg: 0, self_kg: 6, price: 1200, mount: "A,B", spec: "정밀 검사 · 치수/미세 결함", level: "precise" },
];
