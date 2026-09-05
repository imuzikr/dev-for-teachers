"use client";

// =============================================================
// 공통 상단 내비게이션
// -------------------------------------------------------------
// 오른쪽: 역할 전환(개발용) ｜ 사용자 프로필 ｜ 로그아웃
// =============================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAdmin, isTeacher } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";
import { signOutUser } from "@/lib/auth";
import {
  subscribeUserDirectory,
  subscribeClasses,
  subscribeMyMemberships,
  subscribeBroadcast,
  stopBroadcast,
  reportPresence,
  PRESENCE_BEAT_MS,
} from "@/lib/store";
import { getSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import UserProfile from "./UserProfile";
import RoleSwitcher from "./RoleSwitcher";
import RoleManagerModal from "./RoleManagerModal";
import PresentationOverlay from "./PresentationOverlay";
import QuestionSignalButton from "./QuestionSignalButton";
import { IconDeveloperRoom } from "./IconDeveloperRoom";
import { IconLogo, IconLogout, IconPeople } from "./StatusIcons";

export default function TopNav({ active }) {
  const router = useRouter();
  const user = useCurrentUser();
  const admin = user ? isTeacher(user) : false;      // 교사+관리자
  const isStrictAdmin = user ? isAdmin(user) : false; // 최고 관리자만 (역할 관리)
  const [roleMgrOpen, setRoleMgrOpen] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [sessionClassId, setSessionClassId] = useState(null);

  // 관리자만 사용자 디렉터리를 구독(역할 관리·승인 대기 표시용)
  useEffect(() => {
    if (!isFirebaseConfigured || !isStrictAdmin) return;
    return subscribeUserDirectory(setDirectory);
  }, [isStrictAdmin]);

  useEffect(() => {
    if (!isFirebaseConfigured || !admin) {
      setClasses([]);
      return;
    }
    return subscribeClasses(setClasses);
  }, [admin]);

  useEffect(() => {
    if (!isFirebaseConfigured || admin || !user?.uid) {
      setMemberships([]);
      return;
    }
    return subscribeMyMemberships(user.uid, setMemberships);
  }, [admin, user?.uid]);

  // 뱃지 숫자와 교사가 관리하는 화면의 숫자가 항상 일치합니다.
  useEffect(() => {
    function sync() { setSessionClassId(getSelectedClassId()); }
    sync();
    window.addEventListener("class-change", sync);
    return () => window.removeEventListener("class-change", sync);
  }, []);

  const membershipIds = memberships.map((m) => m.classId);
  const activeClassId =
    sessionClassId && membershipIds.includes(sessionClassId)
      ? sessionClassId
      : membershipIds[0] ?? null;
  const teacherClasses = classes.filter((item) => item.createdBy === user?.uid && !item.archived);
  const signalClassId = admin
    ? teacherClasses.some((item) => item.id === sessionClassId)
      ? sessionClassId
      : teacherClasses[0]?.id ?? null
    : activeClassId;

  // 발표 강제 전환(방송) 구독 — 학생은 "지금 보고 있는 반", 교사는 자신이
  // 상단바가 항상 떠 있으므로 여기서 구독하면 앱 전체에 적용됩니다.
  const [broadcast, setBroadcast] = useState(null);
  const broadcastClassId = admin ? sessionClassId : activeClassId;
  useEffect(() => {
    if (!isFirebaseConfigured || !broadcastClassId) { setBroadcast(null); return; }
    return subscribeBroadcast(broadcastClassId, setBroadcast);
  }, [broadcastClassId]);

  // 발표 중에는 학생 화면이 실제로 보이는지 교사에게 알립니다(전광판용).
  //
  // [무엇을 '보고 있음'으로 볼 것인가]
  // 브라우저에는 '창이 몇 % 가려졌는지' 알려 주는 수단이 없습니다.
  // 그래서 두 가지를 함께 봅니다.
  //   · visibilityState — 탭을 옮기거나 창을 최소화하면 hidden
  //   · hasFocus()      — 다른 프로그램을 클릭하면 false
  // 창이 일부만 가려져 있어도 학생이 그쪽을 쓰고 있으면 포커스가 넘어가므로,
  // 실제 수업에서 문제가 되는 '딴짓'은 이 조합으로 잡힙니다.
  // (브라우저는 보이는데 아무것도 안 누르고 있는 경우까지는 알 수 없습니다)
  const broadcasting = !!broadcast;
  useEffect(() => {
    if (!isFirebaseConfigured || admin || !broadcasting || !broadcastClassId || !user?.uid) return;
    const send = () =>
      reportPresence(
        user,
        broadcastClassId,
        document.visibilityState === "visible" && document.hasFocus()
      );
    send();
    document.addEventListener("visibilitychange", send);
    window.addEventListener("focus", send);
    window.addEventListener("blur", send);
    const beat = setInterval(send, PRESENCE_BEAT_MS);
    return () => {
      document.removeEventListener("visibilitychange", send);
      window.removeEventListener("focus", send);
      window.removeEventListener("blur", send);
      clearInterval(beat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, broadcasting, broadcastClassId, user?.uid]);

  const pendingTeacherCount = directory.filter(
    (u) => u.requestedRole === "teacher" && u.role !== "teacher" && u.role !== "admin"
  ).length;

  // 이동 가능성이 높은 라우트를 미리 프리페치 → 클릭 시 즉시 전환
  useEffect(() => {
    router.prefetch("/books");
    if (isStrictAdmin) router.prefetch("/admin");
  }, [isStrictAdmin, router]);

  function go(path) {
    router.push(path);
  }

  async function handleLogout() {
    if (isFirebaseConfigured) {
      try {
        await signOutUser();
      } catch {
        /* 무시하고 랜딩으로 */
      }
    }
    router.push("/");
  }

  return (
    <>
    <header className="topbar">
      {/* 왼쪽: 로고 + 주요 메뉴 */}
      <div className="topbar-left">
        <button className="logo logo-button" onClick={() => go("/books")}>
          <IconLogo size={30} /> 교사 개발자
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        <nav className="topnav-menu">

          <button
            className={`btn-ghost ${active === "books" ? "nav-active" : ""}`}
            onClick={() => go("/books")}
            title="개발자실"
          >
            <IconDeveloperRoom size={20} /> <span className="nav-label">개발자실</span>
          </button>
          {isStrictAdmin && (
            <button
              className={`btn-ghost ${active === "admin" ? "nav-active" : ""}`}
              onClick={() => go("/admin")}
              title="사용자 관리"
            >
              <IconPeople size={20} /> <span className="nav-label">사용자 관리</span>
            </button>
          )}

          {/* 역할 관리는 프로필 메뉴의 '관리자 설정'으로 이동 */}
        </nav>
      </div>

      {roleMgrOpen && (
        <RoleManagerModal
          directory={directory}
          onClose={() => setRoleMgrOpen(false)}
        />
      )}

      {/* 오른쪽: 역할 전환(데모 전용) + 프로필 + 로그아웃 */}
      <div className="user-area">
        {!isFirebaseConfigured && <RoleSwitcher />}
        {user && signalClassId && (
          <QuestionSignalButton classId={signalClassId} user={user} isTeacher={admin} />
        )}
        <UserProfile
          pendingCount={isStrictAdmin ? pendingTeacherCount : 0}
          onOpenRoleMgr={isStrictAdmin ? () => setRoleMgrOpen(true) : null}
        />
        <button className="btn-ghost btn-logout" onClick={handleLogout} title="로그아웃">
          <IconLogout size={18} /> <span className="nav-label">로그아웃</span>
        </button>
      </div>
    </header>

    {/* 학생 화면 — 교사가 방송 중이면 화면 전체를 강제로 덮습니다(학생은 닫을 수 없음) */}
    {!admin && broadcast && <PresentationOverlay broadcast={broadcast} />}

    {/* 교사 화면 — 자기 반에 방송이 켜져 있으면 어디서든 바로 끌 수 있는 안전장치 */}
    {admin && broadcast && (
      <button
        type="button"
        className="broadcast-stop-pill"
        onClick={() => stopBroadcast(broadcastClassId)}
        title="학생 화면 강제 전환을 종료합니다"
      >
        <span className="broadcast-live-dot" aria-hidden="true" />
        학생 화면 강제 전환 중 · 방송 종료
      </button>
    )}
    </>
  );
}
