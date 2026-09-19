import { MediaAdminClient } from "@/components/admin/MediaAdminClient";

export default function AdminMediaThumbnailsPage() {
  return (
    <MediaAdminClient
      category="thumbnail"
      title="Thumbnails"
      description="Thumbnail images for games, posts, and other listings across the site."
      accept="image/*"
    />
  );
}
