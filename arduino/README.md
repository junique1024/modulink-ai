# ModuLink 데모 로봇 (Arduino UNO) 연동

1. Arduino IDE → 라이브러리 매니저에서 **Adafruit NeoPixel** 설치 (Servo는 기본 포함)
2. `modulink_robot/modulink_robot.ino` 업로드 (보드: Arduino Uno)
3. 배선: `배선도.png` 참고
4. 맥북 크롬(또는 엣지)으로 https://modulink-ai.vercel.app/#robot → **[아두이노 연결]** → 포트 선택
   - 업로드에 쓴 Arduino IDE의 시리얼 모니터는 꼭 닫아 두세요 (포트를 하나만 쓸 수 있음)
5. 발표 PC에서 같은 주소 → **로봇 연동 → 모니터**에 맥북 화면의 4자리 코드 입력

- 실시간 중계: 무료 공개 MQTT 브로커(EMQX → HiveMQ 순서로 자동 시도). 두 PC 모두 인터넷 필요
- 과속 기준(기본 250°/s)은 맥북 화면 슬라이더로 조절, [경보 테스트]로 2초 경보 확인 가능
