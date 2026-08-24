"use client";

import { UsersAdminClient } from "./UsersAdminClient";

/** Admin → User Management → Banned Users. Same roster/detail view as
 * Users, pre-filtered to banned accounts only — unban and everything else
 * works exactly the same from here. */
export function BannedUsersAdminClient() {
  return <UsersAdminClient initialStatus="banned" />;
}
