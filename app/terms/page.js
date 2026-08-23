import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import TermsContent from "@/components/policies/TermsContent";

export const metadata = { title: "이용약관 — 배움나눔" };

// =============================================================
// 이용약관 — 앱뜰(App-Tteul) 약관 체계를 배움나눔 실정에 맞게 조정한 문서.
// 본문은 components/policies/TermsContent.jsx (푸터 모달과 공유).
// =============================================================
export default function TermsPage() {
  return (
    <div className="policy-shell">
      <header className="policy-top">
        <Link href="/" className="policy-home">📚 배움나눔</Link>
      </header>
      <main className="policy-body">
        <TermsContent />
      </main>
      <SiteFooter />
    </div>
  );
}
