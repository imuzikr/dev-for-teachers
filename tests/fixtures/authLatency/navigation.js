import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => ({ ...router, prefetch(href, options) {
    window.__routePrefetches = [...(window.__routePrefetches || []), href];
    return router.prefetch(href, options);
  } }), [router]);
}
