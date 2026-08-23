import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import PrivacyContent from "@/components/policies/PrivacyContent";

export const metadata = { title: "개인정보처리방침 — 배움나눔" };

// =============================================================
// 개인정보처리방침 — 운영자 제공 공식 전문(2026. 7. 16. 시행)을 골격으로,
// 서비스의 실제 데이터 취급 방식(익명 닉네임 표시, 열람 권한, 탈퇴 시
// 파기 등)을 각 조에 보강해 종합한 문서입니다.
// =============================================================
export default function PrivacyPage() {
  return (
    <div className="policy-shell">
      <header className="policy-top">
        <Link href="/" className="policy-home">📚 배움나눔</Link>
      </header>
      <main className="policy-body">
        <PrivacyContent />
      </main>
      <SiteFooter />
    </div>
  );
}
