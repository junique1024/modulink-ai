import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "ModuLink-AI · 말 한 줄로 로봇 도입 검토";
const DESC = "작업을 평소 말투로 적으면 로봇 모듈 조합 · 투자 회수 기간 · 안전 검토 항목까지. 로그인 없이 바로 체험.";

// 링크 공유 미리보기(카카오톡·슬랙 등)용 정보. 이미지는 app/opengraph-image.png 를 자동 사용
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://modulink-ai.vercel.app"),
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, siteName: "ModuLink-AI", locale: "ko_KR", type: "website", url: "/" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
