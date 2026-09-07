"use client";

import { useEffect, useRef } from "react";
import { classAcceptsJoin, joinClass } from "./store";
import { getSelectedClassId, setSelectedClassId } from "./classroom";

export function useAutomaticClassMembership({ user, isOperator, classes, memberships }) {
  const joiningRef = useRef(null);

  useEffect(() => {
    if (!user?.uid || isOperator) return;
    const activeClasses = classes.filter((item) => !item.archived);
    const activeMembership = memberships.find((membership) =>
      activeClasses.some((item) => item.id === membership.classId)
    );
    if (activeMembership) {
      const selectedId = getSelectedClassId();
      const selectedMembership = memberships.some((membership) =>
        membership.classId === selectedId && activeClasses.some((item) => item.id === selectedId)
      );
      if (!selectedMembership) setSelectedClassId(activeMembership.classId);
      return;
    }

    const joinableClasses = activeClasses.filter(classAcceptsJoin);
    const target = joinableClasses.length === 1 ? joinableClasses[0] : null;
    if (!target || joiningRef.current === target.id) return;
    joiningRef.current = target.id;
    joinClass(target.id, user, target.joinCode)
      .then(() => setSelectedClassId(target.id))
      .catch((error) => console.warn("[class-membership] 자동 참여 실패:", error));
  }, [classes, isOperator, memberships, user]);
}
