export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
    cache: "no-store",
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an unexpected response. Please retry.",
    );
  }
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data as T;
}
export const percent = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n * 10) / 10}%`;
export const dateLabel = (s: string | null | undefined) =>
  s
    ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString(
        undefined,
        { month: "short", day: "numeric", year: "numeric" },
      )
    : "No date set";
export const formatLabel = (s: string) => s.replaceAll("_", " ");
