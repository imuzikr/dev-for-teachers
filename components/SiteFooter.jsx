"use client";

// =============================================================
// 사이트 푸터 — 랜딩·약관 페이지 하단 공통
// -------------------------------------------------------------
// 3열: [브랜드(로고+소개)] [정책 및 약관] [문의] + 하단 저작권 바.
// 개인정보처리방침·이용약관은 페이지 이동 없이 '모달'로 열립니다.
// (본문은 components/policies/* 를 페이지(/privacy,/terms)와 공유)
// 연락처·소속은 아래 상수에서 수정하세요.
// =============================================================
import { useState } from "react";
import { backdropClose } from "@/lib/modal";
import { IconLogo, IconBlackboard, IconWrite, IconSchool } from "./StatusIcons";
import PrivacyContent from "./policies/PrivacyContent";
import TermsContent from "./policies/TermsContent";

const CONTACT_EMAIL = "iseoul72@gmail.com"; // 문의 이메일
const AFFILIATION = "한성여자고등학교 소속"; // 소속 표기(개인정보처리방침 제8조와 일치)

export default function SiteFooter() {
  const year = new Date().getFullYear();
  const [policyOpen, setPolicyOpen] = useState(null); // null | 'privacy' | 'terms'

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        {/* 브랜드 */}
        <div className="footer-brand">
          <div className="footer-brand-head">
            <span className="footer-logo" aria-hidden="true">
              <IconLogo size={30} />
            </span>
            <strong>배움나눔</strong>
          </div>
          <p className="footer-tagline">
            함께 묻고 답하며 성장하는 우리들의 공부방
            <br />
            수업 속 질문과 배움을 실시간으로 나누는 교실 Q&amp;A
          </p>
        </div>

        {/* 정책 및 약관 — 클릭 시 모달 */}
        <div className="footer-col">
          <h4>정책 및 약관</h4>
          <button
            type="button"
            className="footer-link"
            onClick={() => setPolicyOpen("privacy")}
          >
            <IconBlackboard size={26} /> 개인정보처리방침
          </button>
          <button
            type="button"
            className="footer-link"
            onClick={() => setPolicyOpen("terms")}
          >
            <IconBlackboard size={26} /> 이용약관
          </button>
        </div>

        {/* 문의 */}
        <div className="footer-col">
          <h4>문의</h4>
          <a className="footer-link" href={`mailto:${CONTACT_EMAIL}`}>
            <IconWrite size={26} /> {CONTACT_EMAIL}
          </a>
          <span className="footer-link footer-link--static">
            {/* IconSchool은 어두운 획 색이 고정돼 있어 어두운 배경에서 잘 안 보임
                → 이 위치(소속 표기)에 한해서만 아이콘을 흰색으로 강제 변환 */}
            <span className="footer-icon-white">
              <IconSchool size={26} />
            </span>{" "}
            {AFFILIATION}
          </span>
        </div>
      </div>

      {/* 하단 저작권 바 — 정책 링크는 위 '정책 및 약관'에 이미 있어 중복 표기하지 않음 */}
      <div className="site-footer-bottom">
        <span>© {year} 배움나눔. All rights reserved.</span>
      </div>

      {/* 정책 모달 */}
      {policyOpen && (
        <div
          className="modal-backdrop policy-modal-backdrop"
          {...backdropClose(() => setPolicyOpen(null))}
        >
          <div className="modal policy-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{policyOpen === "privacy" ? "개인정보처리방침" : "이용약관"}</h3>
              <button
                className="btn-close"
                onClick={() => setPolicyOpen(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="policy-modal-scroll policy-body">
              {policyOpen === "privacy" ? <PrivacyContent /> : <TermsContent />}
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
