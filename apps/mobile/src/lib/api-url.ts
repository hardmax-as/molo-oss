/** The API origin. `EXPO_PUBLIC_*` vars are inlined at build time by Expo. */
export function apiUrl(): string {
  return process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:8787";
}
