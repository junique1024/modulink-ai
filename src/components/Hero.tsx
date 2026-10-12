"use client";

/** 첫 화면: 한 줄 소개 + 바로 체험 버튼 + 3단계 흐름 */
export default function Hero({ onTry, onStart }: { onTry: () => void; onStart: () => void }) {
  return (
    <section id="home" className="hero">
      <div className="hero-copy">
        <span className="eyebrow">제조 현장 로봇 도입 검토 도구 · 프로토타입</span>
        <h1>말 한 줄로,<br />로봇 도입 검토를<br /><em>몇 분 만에</em></h1>
        <p className="lead">
          현장에서 하고 싶은 일을 평소 말투로 적으면, 조건에 맞는 <b>로봇 모듈 조합</b>과
          <b> 투자 회수 기간</b>, <b>안전 검토 항목</b>까지 한 번에 보여드립니다.
        </p>
        <div className="hero-cta">
          <button type="button" className="btn" onClick={onTry}>예시로 30초 체험하기</button>
          <button type="button" className="btn gray" onClick={onStart}>직접 입력하기</button>
        </div>
        <p className="hero-note">로그인 없이 바로 사용 · 입력한 내용은 이 브라우저에만 저장됩니다</p>
      </div>

      <div className="hero-art">
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 이미지 1장, 최적화 서버 없이도 동작하도록 */}
        <img src="/modulink-robot.webp" width={900} height={909} alt="자율주행 베이스 위에 협동 로봇팔을 결합한 ModuLink 모듈형 로봇" className="robot" fetchPriority="high" />
        <div className="tags" aria-hidden>
          <span className="t1">주행 베이스</span><span className="t2">로봇팔</span><span className="t3">검사 센서</span>
        </div>
      </div>

      <ol className="flow3">
        <li><span>1</span><div><b>말하기</b><small>“50kg 옮기고 외관 검사까지”</small></div></li>
        <li><span>2</span><div><b>조합 · 호환 검사</b><small>적재 용량 · 장착 규격 자동 확인</small></div></li>
        <li><span>3</span><div><b>회수 기간 · 안전 항목</b><small>그래프 · 체크리스트 · PDF</small></div></li>
      </ol>
    </section>
  );
}
