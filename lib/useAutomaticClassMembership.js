"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSelectedClassId, setSelectedClassId } from "./classroom";
import { subscribeMyMemberships } from "./store";

export function useVisibleClassMemberships({ user, isOperator, activeClassIds, enabled = true, subscribe = subscribeMyMemberships }) {
  const [snapshot, setSnapshot] = useState(null);
  const listeners = useRef({ key: null, subscribe: null, entries: new Map() });
  const authKey = JSON.stringify([user?.uid, user?.role]);
  const canSubscribe = enabled && Boolean(user?.uid) && !isOperator;
  const memberships = useMemo(() => canSubscribe && snapshot?.key === authKey
    ? snapshot.items.filter((item) => activeClassIds.includes(item.classId)) : [],
  [canSubscribe, snapshot, authKey, activeClassIds]);

  useEffect(() => {
    const current = listeners.current;
    if (current.key !== authKey || current.subscribe !== subscribe || !canSubscribe) {
      for (const entry of current.entries.values()) {
        entry.active = false;
        entry.stop();
      }
      current.entries.clear();
      current.key = authKey;
      current.subscribe = subscribe;
      setSnapshot({ key: authKey, items: [], resolvedClassIds: [] });
    }
    if (!canSubscribe) return;
    for (const [classId, entry] of current.entries) {
      if (activeClassIds.includes(classId)) continue;
      entry.active = false;
      entry.stop();
      current.entries.delete(classId);
    }
    setSnapshot((previous) => previous?.key === authKey ? {
      ...previous,
      items: previous.items.filter((item) => activeClassIds.includes(item.classId)),
      resolvedClassIds: previous.resolvedClassIds.filter((id) => activeClassIds.includes(id)),
    } : previous);
    for (const classId of activeClassIds) {
      if (current.entries.has(classId)) continue;
      const entry = { active: true, stop: () => {} };
      current.entries.set(classId, entry);
      let initialEmission = true;
      entry.stop = subscribe(user.uid, (items) => {
        if (!entry.active || current.key !== authKey) return;
        const resolved = !initialEmission || items.length > 0;
        initialEmission = false;
        setSnapshot((previous) => {
          const prior = previous?.key === authKey ? previous : { items: [], resolvedClassIds: [] };
          return {
            key: authKey,
            items: [...prior.items.filter((item) => item.classId !== classId),
              ...items.filter((item) => item.classId === classId)],
            resolvedClassIds: resolved ? [...new Set([...prior.resolvedClassIds, classId])] : prior.resolvedClassIds,
          };
        });
      }, [classId]);
    }
  }, [canSubscribe, user?.uid, authKey, activeClassIds, subscribe]);

  useEffect(() => () => {
    for (const entry of listeners.current.entries.values()) {
      entry.active = false;
      entry.stop();
    }
    listeners.current.entries.clear();
  }, []);

  return {
    memberships,
    resolvedClassIds: snapshot?.key === authKey ? snapshot.resolvedClassIds : [],
    ready: canSubscribe && snapshot?.key === authKey,
  };
}

export function useAutomaticClassMembership({ user, isOperator, classes, memberships, ready = true, resolvedClassIds = [] }) {
  const remembered = useRef(null);
  useEffect(() => {
    if (remembered.current?.uid !== user?.uid || remembered.current?.role !== user?.role) {
      remembered.current = { uid: user?.uid, role: user?.role, classId: getSelectedClassId() };
    }
    if (!ready || !user?.uid || isOperator) return;
    const activeClasses = classes.filter((item) => item.archived === false && item.accessVersion === 2);
    const selectedId = getSelectedClassId();
    const isActiveMember = (id) => activeClasses.some((item) => item.id === id)
      && memberships.some((membership) => membership.classId === id);
    if (isActiveMember(selectedId)) {
      remembered.current.classId = selectedId;
      return;
    }
    if (isActiveMember(remembered.current.classId)) {
      setSelectedClassId(remembered.current.classId);
      return;
    }
    if (selectedId) setSelectedClassId(null);
    // Direct membership listeners may resolve in a different order after the initial empty result.
    if (activeClasses.some((item) => item.id === remembered.current.classId)
      && !resolvedClassIds.includes(remembered.current.classId)) return;
    const activeMembership = memberships.find((membership) =>
      activeClasses.some((item) => item.id === membership.classId)
    );
    if (activeMembership) {
      setSelectedClassId(activeMembership.classId);
      return;
    }
  }, [classes, isOperator, memberships, ready, resolvedClassIds, user?.uid, user?.role]);
}
