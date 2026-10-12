/** 모듈 종류: 주행 베이스 / 로봇팔 / 검사 센서 */
export type ModuleCategory = "base" | "arm" | "sensor";

/** 검사 수준 */
export type InspectionLevel = "none" | "basic" | "precise";

/** DB `modules` 테이블 한 행 */
export interface RobotModule {
  id?: number;
  category: ModuleCategory;
  name: string;
  payload_kg: number; // 베이스: 적재 용량 / 로봇팔: 가반 하중
  self_kg: number; // 모듈 자체 무게
  price: number; // 단가 (만원)
  mount: string; // 장착 규격 (예: "A,B")
  spec: string;
  level?: InspectionLevel | null; // 센서 검사 수준
}

/** 사용자가 입력하는 작업 조건 */
export interface TaskInput {
  taskName: string;
  loadKg: number;
  distanceM: number;
  inspection: InspectionLevel;
  pickKg: number;
  workers: number;
  laborCost: number; // 1인당 연 인건비 (만원)
  replaceRate: number; // 대체 인원의 업무 중 로봇이 실제로 대신하는 비율 (%)
}

/** 추천 결과 */
export type Recommendation =
  | { ok: false; reason: string }
  | {
      ok: true;
      base: RobotModule;
      arm: RobotModule | null;
      sensor: RobotModule | null;
      requiredKg: number;
      moduleSum: number;
      capex: number;
      laborSaving: number;
      annualSaving: number;
      paybackMonths: number | null;
    };
