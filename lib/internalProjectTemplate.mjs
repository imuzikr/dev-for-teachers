export function createInternalProjectTemplate() {
  const sections = [
    ["나의 고민은?", [["나의 고민은?", "학교생활이나 일상에서 해결하고 싶은 문제를 적어 보세요. 누가 어떤 상황에서 불편함을 겪고 있나요?"]]],
    ["한 번 들어보세요.", [
      ["나의 아이디어", "나의 고민을 해결할 앱 아이디어를 소개해 보세요. 누구를 위한 앱이며, 어떤 도움을 줄 수 있나요?"],
      ["기능 설명", "앱에 필요한 주요 기능과 사용 방법을 설명해 보세요."],
    ]],
    ["프롬프트", [["프롬프트", "앱을 만들기 위해 AI에게 전달한 프롬프트를 기록해 보세요. 수정한 프롬프트도 함께 남겨 보세요."]]],
    ["시제품", [["시제품", "처음 만든 시제품의 캡처 이미지를 첨부하고, 구현한 기능과 개선할 점을 설명해 보세요."]]],
    ["짜잔!", [["짜잔!", "완성한 앱의 캡처 이미지를 첨부하고 결과를 소개해 보세요.</p><p>GitHub: 저장소 URL</p><p>배포 URL: 완성한 앱의 접속 주소"]]],
  ];
  return {
    title: "나의 바이브 코딩 프로젝트",
    steps: sections.map(([title, items]) => {
      const activities = items.map(([title, description]) => ({
        id: crypto.randomUUID(), title, content: `<p>${description}</p>`,
        url: "", bookUrl: "", locked: false, requiresAnswer: true,
        templateEnabled: false, images: [], imageSizes: [],
      }));
      return {
        id: crypto.randomUUID(), title, activities, resources: [],
        itemOrder: activities.map(({ id }) => ({ kind: "activity", id })),
      };
    }),
  };
}

export function initialBookProject(project, purpose) {
  return project ?? (purpose === "internal" ? createInternalProjectTemplate() : null);
}
