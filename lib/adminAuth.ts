import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createAuthorizedSupabaseClient(authorizationHeader: string | null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authorizationHeader ? { Authorization: authorizationHeader } : {},
    },
  });
}

export async function requireDatabaseAdmin(supabase: SupabaseClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { isAdmin: false, user: null };
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

  if (adminError || isAdmin !== true) {
    return { isAdmin: false, user };
  }

  return { isAdmin: true, user };
}
