import { MediaAdminClient } from "@/components/admin/MediaAdminClient";

export default function AdminMediaVideosPage() {
  return (
    <MediaAdminClient
      category="video"
      title="Videos"
      description="Trailers, previews, and other video clips used across the site."
      accept="video/*"
    />
  );
}
