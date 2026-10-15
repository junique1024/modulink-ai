/*
 * ModuLink-AI 로봇 연동 데모 (Arduino UNO)
 * - 가변저항(A0)으로 서보(D9) 각도를 조종
 * - 회전 속도(°/s)가 기준값을 넘으면 과속 경보: 서보 정지 + 네오픽셀 빨강 점멸 + 버저
 * - USB 시리얼(115200)로 웹(modulink-ai.vercel.app '로봇 연동' 탭)과 통신
 *
 * 배선
 *   가변저항 : 가운데 → A0, 양 끝 → 5V / GND
 *   서보     : 신호 → D9, 빨강 → 5V, 갈색 → GND
 *   버저     : + → D8, − → GND
 *   네오픽셀 : DIN → (330Ω) → D6, 5V / GND
 *
 * 필요한 라이브러리: Servo(기본 포함), Adafruit NeoPixel (라이브러리 매니저에서 설치)
 *
 * 웹 → 아두이노 명령 (한 줄씩)
 *   T:250   과속 기준값(°/s) 변경
 *   M:1     버저 음소거 (M:0 해제)
 *   X       경보 테스트 (2초)
 * 아두이노 → 웹 (초당 20회, JSON 한 줄)
 *   {"a":각도,"v":속도,"al":경보(0/1),"t":기준값,"m":음소거}
 */
#include <Servo.h>
#include <Adafruit_NeoPixel.h>

const uint8_t PIN_POT = A0;
const uint8_t PIN_SERVO = 9;
const uint8_t PIN_BUZZER = 8;
const uint8_t PIN_PIXEL = 6;
const uint8_t NUM_PIXELS = 1;      // 네오픽셀 개수
const uint8_t BRIGHTNESS = 40;     // 0~255 (전류 절약을 위해 낮게)

Servo servo;
Adafruit_NeoPixel pixel(NUM_PIXELS, PIN_PIXEL, NEO_GRB + NEO_KHZ800);

float angle = 90;          // 필터링된 가변저항 각도
float speedDps = 0;        // 회전 속도 (°/s, 평활)
float threshold = 250;     // 과속 기준값 (°/s)
bool alarm = false;
bool muted = false;
int heldAngle = 90;        // 경보 중 서보를 멈춰 둘 각도
unsigned long calmSince = 0;
unsigned long testUntil = 0;
unsigned long lastTick = 0, lastSend = 0;
String rx;

void setPixel(uint8_t r, uint8_t g, uint8_t b) {
  for (uint8_t i = 0; i < NUM_PIXELS; i++) pixel.setPixelColor(i, pixel.Color(r, g, b));
  pixel.show();
}

void handleCommand(const String &cmd) {
  if (cmd.startsWith("T:")) {
    float t = cmd.substring(2).toFloat();
    if (t >= 30 && t <= 2000) threshold = t;
  } else if (cmd.startsWith("M:")) {
    muted = cmd.substring(2).toInt() == 1;
    if (muted) noTone(PIN_BUZZER);
  } else if (cmd == "X") {
    testUntil = millis() + 2000;
  }
}

void setup() {
  Serial.begin(115200);
  servo.attach(PIN_SERVO);
  pixel.begin();
  pixel.setBrightness(BRIGHTNESS);
  angle = analogRead(PIN_POT) * 180.0 / 1023.0;
  heldAngle = (int)angle;
  servo.write(heldAngle);
  setPixel(0, 120, 40);
  lastTick = millis();
}

void loop() {
  unsigned long now = millis();

  // 1) 웹에서 온 명령 읽기
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (rx.length()) { handleCommand(rx); rx = ""; } }
    else if (rx.length() < 32) rx += c;
  }

  // 2) 20ms마다 각도·속도 계산
  if (now - lastTick >= 20) {
    float dt = (now - lastTick) / 1000.0;
    lastTick = now;
    float raw = analogRead(PIN_POT) * 180.0 / 1023.0;
    float prev = angle;
    angle = angle * 0.6 + raw * 0.4;                       // 잡음 제거
    float inst = fabs(angle - prev) / dt;                  // 순간 속도
    speedDps = speedDps * 0.7 + inst * 0.3;                // 평활

    // 3) 과속 판단 (해제는 기준의 60% 아래로 0.8초 유지)
    bool testing = now < testUntil;
    if (!alarm && (speedDps > threshold || testing)) {
      alarm = true;
      heldAngle = servo.read();                            // 현재 위치에서 정지
    } else if (alarm && !testing) {
      if (speedDps < threshold * 0.6) {
        if (!calmSince) calmSince = now;
        if (now - calmSince > 800) { alarm = false; calmSince = 0; }
      } else calmSince = 0;
    }

    // 4) 출력: 정상 = 서보 추종 + 초록, 경보 = 서보 정지 + 빨강 점멸 + 버저
    if (alarm) {
      servo.write(heldAngle);
      bool on = (now / 150) % 2 == 0;
      setPixel(on ? 255 : 0, 0, 0);
      if (!muted) { if (on) tone(PIN_BUZZER, 2200); else noTone(PIN_BUZZER); }
    } else {
      servo.write((int)angle);
      noTone(PIN_BUZZER);
      setPixel(0, 120, 40);
    }
  }

  // 5) 50ms마다 웹으로 상태 전송
  if (now - lastSend >= 50) {
    lastSend = now;
    Serial.print("{\"a\":"); Serial.print((int)angle);
    Serial.print(",\"v\":"); Serial.print((int)speedDps);
    Serial.print(",\"al\":"); Serial.print(alarm ? 1 : 0);
    Serial.print(",\"t\":"); Serial.print((int)threshold);
    Serial.print(",\"m\":"); Serial.print(muted ? 1 : 0);
    Serial.println("}");
  }
}
