"use client";

// 첨부 업로드 진행률 표시 — pct: null(대기) | 0~1(진행 중)
// 압축~업로드 완료까지 얇은 막대와 퍼센트를 보여줘 "멈춘 듯한" 체감을 줄입니다.
export default function UploadProgress({ pct }) {
  if (pct == null) return null;
  const percent = Math.min(100, Math.round(pct * 100));
  return (
    <div
      className="upload-progress"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="upload-progress-bar" style={{ width: `${percent}%` }} />
      <span className="upload-progress-label">업로드 중… {percent}%</span>
    </div>
  );
}
