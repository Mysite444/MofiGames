import { MediaAdminClient } from "@/components/admin/MediaAdminClient";

export default function AdminMediaIconsPage() {
  return (
    <MediaAdminClient
      category="icon"
      title="Icons"
      description="Small icon assets — category icons, UI glyphs, and badges."
      accept="image/svg+xml,image/png,image/webp,image/x-icon"
    />
  );
}
