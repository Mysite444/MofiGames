"use client";

import { UsersAdminClient } from "./UsersAdminClient";

/** Admin → User Management → User Verification. Same roster/detail view
 * as Users, pre-filtered to unverified accounts — verify/unverify works
 * exactly the same from the detail drawer. */
export function UserVerificationAdminClient() {
  return <UsersAdminClient initialStatus="unverified" />;
}
