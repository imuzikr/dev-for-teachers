export function groupUsersByClass(users, classes, memberships) {
  const assigned = new Set();
  const groups = classes.map((classroom) => {
    const ids = new Set(memberships.filter((entry) => entry.classId === classroom.id).map((entry) => entry.uid));
    const members = users.filter((entry) => ids.has(entry.uid));
    members.forEach((entry) => assigned.add(entry.uid));
    return { id: classroom.id, name: classroom.name || "이름 없는 반", archived: classroom.archived, users: members };
  });
  groups.push({ id: "unassigned", name: "소속 반 없음", users: users.filter((entry) => !assigned.has(entry.uid)) });
  return groups;
}
