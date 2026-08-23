// =============================================================
// 업로드 동시 실행 풀 — 정해진 개수만큼만 동시에, 나머지는 대기
// -------------------------------------------------------------
// 슬라이드를 한 장씩 줄 세워 올리면 왕복 시간이 장수만큼 쌓입니다.
// 몇 장을 동시에 올리되, 무한정 벌리지는 않도록 상한을 둡니다.
//
// submit()이 '슬롯이 날 때까지' 기다렸다가 반환하는 것이 핵심입니다.
// 부르는 쪽(렌더 루프)이 이걸 await 하면 자연스럽게 배압이 걸려,
// 업로드가 밀릴 때 렌더가 앞서 나가 메모리를 채우지 않습니다.
//
// 순서: 완료 순서는 뒤섞이지만 결과는 호출자가 인덱스로 넣으므로
//       슬라이드 차례는 절대 흐트러지지 않습니다.
// =============================================================

export function createUploadPool(max = 4) {
  let active = 0;
  const waiting = [];   // 슬롯을 기다리는 resolve들
  const tasks = [];     // 지금까지 시작한 작업 전부
  let firstError = null;

  function release() {
    active--;
    waiting.shift()?.();
  }

  async function acquire() {
    if (active >= max) await new Promise((resolve) => waiting.push(resolve));
    active++;
  }

  return {
    // 슬롯이 나면 fn()을 시작하고 곧바로 반환합니다(완료를 기다리지 않음).
    async submit(fn) {
      if (firstError) throw firstError; // 이미 하나 실패했으면 더 벌이지 않음
      await acquire();
      // 반드시 한 줄로 이어야 합니다. finally()는 거부를 그대로 통과시키므로
      // task.finally(...)를 따로 떼어 두면 아무도 안 받는 거부 프로미스가 하나
      // 더 생겨 unhandled rejection이 됩니다.
      const task = fn()
        .finally(release)
        .catch((e) => {
          firstError ??= e;
          throw e;
        });
      // 여기서 한 번 받아 둬야 unhandled rejection이 안 납니다.
      // 진짜 보고는 settle()에서 합니다.
      task.catch(() => {});
      tasks.push(task);
    },

    // 남은 작업이 모두 끝날 때까지 기다립니다. 하나라도 실패했으면 그 오류를 던집니다.
    async settle() {
      await Promise.allSettled(tasks);
      if (firstError) throw firstError;
    },
  };
}
