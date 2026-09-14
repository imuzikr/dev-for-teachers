import { getFirebaseAdminServices } from "../../../../lib/server/firebaseAdmin";
import { handlePinAuthPost } from "../../../../lib/server/pinAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  return handlePinAuthPost(request, {
    getServices: () => getFirebaseAdminServices(),
    now: () => Date.now(),
  });
}
