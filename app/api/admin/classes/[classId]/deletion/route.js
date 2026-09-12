export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function retiredEndpoint() {
  return Response.json(
    { error: "삭제 방식이 변경되었습니다. 페이지를 새로고침한 후 다시 시도해 주세요.", retryable: false },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

export const GET = retiredEndpoint;
export const POST = retiredEndpoint;
