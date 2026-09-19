import { Suspense } from "react";
import { AutomationLogsAdminClient } from "@/components/admin/AutomationLogsAdminClient";

export default function AdminAutomationLogsPage() {
  return (
    <Suspense fallback={null}>
      <AutomationLogsAdminClient />
    </Suspense>
  );
}
