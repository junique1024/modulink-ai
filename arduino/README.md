# ModuLink 데모 로봇 (Arduino UNO) 연동

1. 추가 라이브러리 설치 없음 (Servo는 Arduino IDE 기본 포함)
2. `modulink_robot/modulink_robot.ino` 업로드 (보드: Arduino Uno)
3. 배선: `배선도.png` 참고
4. 맥북 크롬(또는 엣지)으로 https://modulink-ai.vercel.app/#robot → **[아두이노 연결]** → 포트 선택
   - 업로드에 쓴 Arduino IDE의 시리얼 모니터는 꼭 닫아 두세요 (포트를 하나만 쓸 수 있음)
5. 발표 PC에서 같은 주소 → **로봇 연동 → 모니터**에 맥북 화면의 4자리 코드 입력

- 실시간 중계: 무료 공개 MQTT 브로커(EMQX → HiveMQ 순서로 자동 시도). 두 PC 모두 인터넷 필요
- 엔코더를 돌리면 한 칸에 6°씩 서보가 움직이고, 버튼을 누르면 90°로 복귀
- 과속 기준(기본 200°/s)은 맥북 화면 슬라이더로 조절, [경보 테스트]로 2초 경보 확인 가능

## 부품에 따라 바꿀 설정 (스케치 맨 위)
- 버저에서 '딸깍' 소리만 나면 → `BUZZER_PASSIVE = true`
- LED가 반대로(평소에 켜짐) 동작하면 → 공통 다리를 5V로 옮기고 `LED_ACTIVE_LOW = true`
- 엔코더 한 칸에 각도가 두 번 움직이거나 반만 움직이면 → `STEPS_PER_DETENT` 를 2 또는 4로
- 돌리는 방향이 반대면 → `REVERSE = true`
