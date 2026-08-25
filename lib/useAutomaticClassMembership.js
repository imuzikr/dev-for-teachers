"use client";

import { useEffect, useRef } from "react";
import { joinClass } from "./store";
import { setSelectedClassId } from "./classroom";

export function useAutomaticClassMembership({ user, isOperator, classes, memberships }) {
  const joiningRef = useRef(null);

  useEffect(() => {
    if (!user?.uid || isOperator) return;
    const activeClasses = classes.filter((item) => !item.archived);
    const activeMembership = memberships.find((membership) =>
      activeClasses.some((item) => item.id === membership.classId)
    );
    if (activeMembership) {
      setSelectedClassId(activeMembership.classId);
      return;
    }

    const target = activeClasses[0];
    if (!target || joiningRef.current === target.id) return;
    joiningRef.current = target.id;
    joinClass(target.id, user)
      .then(() => setSelectedClassId(target.id))
      .catch((error) => console.warn("[class-membership] 자동 참여 실패:", error));
  }, [classes, isOperator, memberships, user]);
}
