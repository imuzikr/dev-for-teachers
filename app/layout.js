import "./globals.css";

export const metadata = {
  title: "배움나눔 — 우리 반 질문/답변 게시판",
  description: "공부하다 막히는 내용을 서로 묻고 답하는 학습 커뮤니티",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
