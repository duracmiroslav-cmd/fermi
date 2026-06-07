// Authenticates fermi's internal synchronous Edge endpoint (agent-invoke).
// The caller is the Nitro layer, which has already authenticated the user +
// verified resource ownership.
//
// The shared secret is a dedicated FERMI_INTERNAL_SECRET set identically
// on both sides — deliberately NOT a Supabase key. Supabase keys exist
// in two representations (a legacy service_role JWT vs a new `sb_secret_`
// key) and which one each side holds varies, so they can't be reliably
// string-compared. A secret we own sidesteps that entirely and keeps a
// leak's blast radius to "can call these two functions" rather than full
// DB access.
//
// It rides in a custom header: the platform gateway forwards custom
// headers intact, whereas it consumes/validates Authorization to route
// the call (Authorization still carries a Supabase key for that routing).

export const INTERNAL_SECRET_HEADER = 'x-fermi-internal-secret';

export interface InternalAuthResult {
  ok:        boolean;
  // Caller sent the header (Nitro has FERMI_INTERNAL_SECRET configured
  // and reloaded). Surfaced for non-sensitive 401 diagnostics.
  hasHeader: boolean;
  // Function has the env secret (`supabase secrets set` ran).
  hasSecret: boolean;
}

export const inspectInternalAuth = (req: Request): InternalAuthResult => {
  const expected = Deno.env.get('FERMI_INTERNAL_SECRET');
  const got = req.headers.get(INTERNAL_SECRET_HEADER);
  return { ok: !!expected && got === expected, hasHeader: !!got, hasSecret: !!expected };
};
