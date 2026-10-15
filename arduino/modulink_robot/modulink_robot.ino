/*
 * ModuLink-AI 로봇 연동 데모 (Arduino UNO)
 * - 로터리 엔코더(KY-040: CLK·DT·SW)로 서보(SG90) 각도를 조종
 * - 회전 속도(°/s)가 기준값을 넘으면 과속 경보: 서보 정지 + 빨간 LED 점멸 + 버저
 * - 엔코더 버튼(SW)을 누르면 서보가 가운데(90°)로 복귀
 * - USB 시리얼(115200)로 웹(modulink-ai.vercel.app '로봇 연동' 탭)과 통신
 *
 * 배선
 *   로터리 엔코더 : CLK → D2, DT → D3, SW → D4, + → 5V, GND → GND
 *   서보 SG90     : 주황(신호) → D9, 빨강 → 5V, 갈색 → GND
 *   버저          : + → D8, − → GND
 *   RGB LED       : R → 220Ω 저항 → D6, 공통(−, 가장 긴 다리) → GND   (G·B는 연결 안 함)
 *
 * 필요한 라이브러리: Servo (Arduino IDE 기본 포함) — 추가 설치 없음
 *
 * 웹 → 아두이노 명령 (한 줄씩)
 *   T:200   과속 기준값(°/s) 변경
 *   M:1     버저 음소거 (M:0 해제)
 *   X       경보 테스트 (2초)
 * 아두이노 → 웹 (초당 20회, JSON 한 줄)
 *   {"a":각도,"v":속도,"al":경보(0/1),"t":기준값,"m":음소거}
 */
#include <Servo.h>

// ---- 부품에 맞게 바꿀 수 있는 설정 ----
const bool BUZZER_PASSIVE = false;   // 버저가 '딸깍' 소리만 나면 true 로 (수동 버저)
const bool LED_ACTIVE_LOW = false;   // RGB LED 공통 다리가 +(공통 애노드)라면 true 로, 공통 다리는 5V 에 연결
const int  DEG_PER_DETENT = 6;       // 엔코더 한 칸당 서보 각도 (6° → 30칸이면 0~180°)
const int  STEPS_PER_DETENT = 4;     // 한 칸 돌렸는데 각도가 2칸씩 움직이면 2 → 4 로, 반 칸만 움직이면 4 → 2 로
const bool REVERSE = false;          // 돌리는 방향이 반대로 느껴지면 true

const uint8_t PIN_CLK = 2, PIN_DT = 3, PIN_SW = 4;
const uint8_t PIN_SERVO = 9, PIN_BUZZER = 8, PIN_LED = 6;

Servo servo;
volatile long encSteps = 0;          // 엔코더 누적 스텝 (인터럽트에서 증가)
volatile uint8_t encState = 0;

int angle = 90;                      // 목표 각도 (엔코더로 조절)
int heldAngle = 90;                  // 경보 중 멈춰 둘 각도
float speedDps = 0;                  // 회전 속도 (°/s, 평활)
float threshold = 200;               // 과속 기준값 (°/s)
bool alarm = false, muted = false;
long lastDetent = 0;
unsigned long calmSince = 0, testUntil = 0, lastTick = 0, lastSend = 0, lastBtn = 0;
int recent[10];                      // 최근 200ms(20ms×10) 동안 움직인 각도
uint8_t ri = 0;
String rx;

// 쿼드러처 디코딩 (잡음·튐에 강한 상태표 방식)
const int8_t QDEC[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
void onEncoder() {
  encState = ((encState << 2) | (digitalRead(PIN_CLK) << 1) | digitalRead(PIN_DT)) & 0x0F;
  encSteps += QDEC[encState];
}

void ledOn(bool on) { digitalWrite(PIN_LED, (on != LED_ACTIVE_LOW) ? HIGH : LOW); }
void buzz(bool on) {
  if (muted || !on) { if (BUZZER_PASSIVE) noTone(PIN_BUZZER); digitalWrite(PIN_BUZZER, LOW); return; }
  if (BUZZER_PASSIVE) tone(PIN_BUZZER, 2200); else digitalWrite(PIN_BUZZER, HIGH);
}

void handleCommand(const String &cmd) {
  if (cmd.startsWith("T:")) {
    float t = cmd.substring(2).toFloat();
    if (t >= 30 && t <= 2000) threshold = t;
  } else if (cmd.startsWith("M:")) {
    muted = cmd.substring(2).toInt() == 1;
    if (muted) buzz(false);
  } else if (cmd == "X") {
    testUntil = millis() + 2000;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_CLK, INPUT_PULLUP);
  pinMode(PIN_DT, INPUT_PULLUP);
  pinMode(PIN_SW, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  encState = (digitalRead(PIN_CLK) << 1) | digitalRead(PIN_DT);
  attachInterrupt(digitalPinToInterrupt(PIN_CLK), onEncoder, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_DT), onEncoder, CHANGE);
  servo.attach(PIN_SERVO);
  servo.write(angle);
  ledOn(false);
  buzz(false);
  lastTick = millis();
}

void loop() {
  unsigned long now = millis();

  // 1) 웹에서 온 명령
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (rx.length()) { handleCommand(rx); rx = ""; } }
    else if (rx.length() < 32) rx += c;
  }

  // 2) 엔코더 버튼: 가운데(90°)로 복귀
  if (digitalRead(PIN_SW) == LOW && now - lastBtn > 400) {
    lastBtn = now;
    if (!alarm) angle = 90;
  }

  // 3) 20ms마다 각도·속도 계산
  if (now - lastTick >= 20) {
    lastTick = now;
    noInterrupts();
    long steps = encSteps;
    interrupts();
    long detent = steps / STEPS_PER_DETENT;
    long diff = detent - lastDetent;
    lastDetent = detent;
    if (REVERSE) diff = -diff;

    int moved = 0;
    if (!alarm && diff != 0) {               // 경보 중에는 조작 무시 (정지 유지)
      int before = angle;
      angle = constrain(angle + (int)diff * DEG_PER_DETENT, 0, 180);
      moved = abs(angle - before);
    }
    // 끝(0°·180°)에 닿아도 빨리 돌리면 과속으로 보도록, 실제 돌린 양으로 속도 계산
    int turned = abs((int)diff) * DEG_PER_DETENT;
    recent[ri] = max(moved, turned);
    ri = (ri + 1) % 10;
    int sum = 0;
    for (uint8_t i = 0; i < 10; i++) sum += recent[i];
    float inst = sum / 0.2;                  // 최근 0.2초 동안의 °/s
    speedDps = speedDps * 0.5 + inst * 0.5;

    // 4) 과속 판단 (해제: 기준의 60% 아래로 0.8초 유지)
    bool testing = now < testUntil;
    if (!alarm && (speedDps > threshold || testing)) {
      alarm = true;
      heldAngle = servo.read();
    } else if (alarm && !testing) {
      if (speedDps < threshold * 0.6) {
        if (!calmSince) calmSince = now;
        if (now - calmSince > 800) { alarm = false; calmSince = 0; angle = heldAngle; }
      } else calmSince = 0;
    }

    // 5) 출력: 정상 = 서보 추종, LED 꺼짐 / 경보 = 서보 정지 + LED·버저 점멸
    if (alarm) {
      servo.write(heldAngle);
      bool on = (now / 150) % 2 == 0;
      ledOn(on);
      buzz(on);
    } else {
      servo.write(angle);
      ledOn(false);
      buzz(false);
    }
  }

  // 6) 50ms마다 웹으로 상태 전송
  if (now - lastSend >= 50) {
    lastSend = now;
    Serial.print("{\"a\":"); Serial.print(alarm ? heldAngle : angle);
    Serial.print(",\"v\":"); Serial.print((int)speedDps);
    Serial.print(",\"al\":"); Serial.print(alarm ? 1 : 0);
    Serial.print(",\"t\":"); Serial.print((int)threshold);
    Serial.print(",\"m\":"); Serial.print(muted ? 1 : 0);
    Serial.println("}");
  }
}
