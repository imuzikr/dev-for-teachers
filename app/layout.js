import "./globals.css";

export const metadata = {
  title: "교사 개발자 — 선생님들의 수업 연구 작업실",
  description: "선생님들이 수업 자료와 활동 아이디어를 함께 정리하는 협업 공간",
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
