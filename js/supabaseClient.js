import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ghjvydcgrogkdlugwiku.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_To45dL9RNPDLVn6UY3JmAg_LKeC4NXW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
