// Pinned to an exact version deliberately: the unpinned "@2" tag floats to
// whatever the CDN resolves as "latest 2.x" at request time, which caused a
// live breakage once already (see commit history) — pin, verify, then bump
// intentionally.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

export const SUPABASE_URL = "https://ghjvydcgrogkdlugwiku.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_To45dL9RNPDLVn6UY3JmAg_LKeC4NXW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
