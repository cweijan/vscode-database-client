import { reactive } from "vue";

export interface ConnectResultState {
  loading: boolean;
  success: boolean;
  successMessage: string;
  error: boolean;
  errorMessage: string;
}

/** Mirrors the target `connect` store slice that the connection surfaces share. */
export const connectResult = reactive<ConnectResultState>({
  loading: false,
  success: false,
  successMessage: "",
  error: false,
  errorMessage: "",
});

export function resetConnectResult(): void {
  connectResult.loading = false;
  connectResult.success = false;
  connectResult.successMessage = "";
  connectResult.error = false;
  connectResult.errorMessage = "";
}

export function markConnectLoading(): void {
  connectResult.error = false;
  connectResult.loading = true;
}

export function markConnectError(message: string): void {
  connectResult.loading = false;
  connectResult.success = false;
  connectResult.error = true;
  connectResult.errorMessage = message;
}

export function markConnectSuccess(message: string): void {
  connectResult.loading = false;
  connectResult.error = false;
  connectResult.success = true;
  connectResult.successMessage = message;
}
