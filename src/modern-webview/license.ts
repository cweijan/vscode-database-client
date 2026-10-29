import { ref, type Ref } from "vue";

const payState = ref(false);

/** Target `user` payloads carry the paid-license flag used by premium-only surfaces. */
export function applyUserState(content: unknown): void {
  if (!content || typeof content !== "object") {
    return;
  }
  const candidate = content as { isPay?: unknown };
  if (typeof candidate.isPay === "boolean") {
    payState.value = candidate.isPay;
  }
}

export function usePayState(): Ref<boolean> {
  return payState;
}
