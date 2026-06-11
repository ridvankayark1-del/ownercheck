import { supabase } from "@/lib/supabaseClient";

export async function checkCurrentUserIsAdmin() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { loggedIn: false, isAdmin: false };
  }

  const response = await fetch("/api/admin/check", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    return { loggedIn: true, isAdmin: false };
  }

  const result = (await response.json()) as { isAdmin?: boolean };
  return { loggedIn: true, isAdmin: result.isAdmin === true };
}
