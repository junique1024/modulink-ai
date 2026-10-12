import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ModuLink-AI · 로봇 모듈 추천",
  description: "말 한 줄로 로봇 모듈 조합 · 투자 회수 기간 · 안전 검토 항목까지",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
