export async function downloadLessonSelection(files, { signal, onProgress } = {}) {
  for (const [index, file] of files.entries()) {
    signal?.throwIfAborted();
    const url = new URL(file.downloadUrl);
    if (!["https:", "http:", "blob:"].includes(url.protocol)) {
      throw new Error("자료의 다운로드 주소가 올바르지 않습니다.");
    }
    onProgress?.(`${index + 1}/${files.length} 내려받는 중`);
    const response = await fetch(url.href, { signal });
    if (!response.ok) throw new Error(`${file.name}: 파일을 내려받지 못했습니다.`);
    const blob = await response.blob();
    signal?.throwIfAborted();
    const downloadUrl = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
  }
}
