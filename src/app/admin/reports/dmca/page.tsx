import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminDmcaRequestsPage() {
  return (
    <ReportsAdminClient
      title="DMCA Requests"
      description="Formal takedown notices filed under 17 U.S.C. §512"
      kind="dmca"
      categoryGroup="copyright"
      defaultScope="open"
      allowCreate
    />
  );
}
