export async function downloadLessonSelection(files, { signal, onProgress } = {}) {
  for (const [index, file] of files.entries()) {
    signal?.throwIfAborted();
    const url = new URL(file.downloadUrl);
    if (!["https:", "http:", "blob:"].includes(url.protocol)) {
      throw new Error("자료의 다운로드 주소가 올바르지 않습니다.");
    }
    onProgress?.(`${index + 1}/${files.length} 다운로드 요청 중`);
    // Storage uploads already set Content-Disposition: attachment with the original
    // filename. Navigate directly: reading the bytes with fetch requires CORS.
    if (files.length > 1 && url.protocol !== "blob:") {
      // Separate frames avoid both popup blocking and one navigation cancelling
      // the previous file. Sandbox prevents active content from running inline.
      const frame = document.createElement("iframe");
      frame.hidden = true;
      frame.title = `${file.name} 다운로드`;
      frame.setAttribute("sandbox", "allow-downloads");
      frame.referrerPolicy = "no-referrer";
      frame.src = url.href;
      document.body.append(frame);
      setTimeout(() => frame.remove(), 60000);
      continue;
    }
    const anchor = document.createElement("a");
    anchor.href = url.href;
    anchor.download = file.name;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.append(anchor);
    try { anchor.click(); }
    finally { anchor.remove(); }
  }
}
