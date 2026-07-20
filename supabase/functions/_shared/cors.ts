// Shared CORS headers and a small JSON response helper for the little-lexicon-* Edge
// Functions. The app is universal (native + web), so the web build issues
// cross-origin requests and needs these on every response, including the
// preflight OPTIONS.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
