import { createClient } from "@supabase/supabase-js";

// Move these into environment variables before shipping anywhere public —
// e.g. Vite: import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
const SUPABASE_URL = "https://wywcpdfdbtmyarblbnfa.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SFNQWkQAaVF4U6E092huKg_PpYwRZOJ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE = "oligopoly_rooms";

/**
 * Read a room's state by code. Returns the parsed state object, or null if
 * the room doesn't exist.
 */
export async function readRoom(code) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("state")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error) {
    console.error("readRoom error:", error);
    return null;
  }
  return data ? data.state : null;
}

/**
 * Create or overwrite a room's full state (upsert on the room code).
 */
export async function writeRoom(code, state) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ code: code.toUpperCase(), state }, { onConflict: "code" });

  if (error) {
    console.error("writeRoom error:", error);
    return false;
  }
  return true;
}

/**
 * Poll a room every `intervalMs` and call `onUpdate(state)` whenever it changes.
 * Returns a cleanup function — call it on unmount.
 *
 * Usage:
 *   useEffect(() => {
 *     if (!roomCode) return;
 *     const stop = pollRoom(roomCode, (state) => setRoom(state));
 *     return stop;
 *   }, [roomCode]);
 */
export function pollRoom(code, onUpdate, intervalMs = 1500) {
  let cancelled = false;
  let lastUpdatedAt = null;

  async function tick() {
    const { data, error } = await supabase
      .from(TABLE)
      .select("state, updated_at")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (cancelled || error || !data) return;
    if (data.updated_at !== lastUpdatedAt) {
      lastUpdatedAt = data.updated_at;
      onUpdate(data.state);
    }
  }

  tick();
  const id = setInterval(tick, intervalMs);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}
