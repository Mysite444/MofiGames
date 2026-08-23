import type { MediaCategory } from "./supabase/admin-content";

export interface MediaDimensions {
  width: number;
  height: number;
}

const IMAGE_LIKE: readonly MediaCategory[] = ["image", "thumbnail", "icon", "gif"];

/** Reads natural pixel dimensions off a freshly-selected File, entirely in
 * the browser — this project has no server-side image-processing
 * dependency (no sharp etc.), and Media Library uploads go straight from
 * the browser to Supabase Storage, so this is the only point a dimension
 * is ever cheaply available. Resolves to `null` rather than rejecting on
 * failure (e.g. a sourceless SVG with no intrinsic size, or a corrupt
 * file) — dimensions are a nice-to-have, not something an upload should
 * ever fail over. */
export function detectFileDimensions(
  file: File,
  category: MediaCategory
): Promise<MediaDimensions | null> {
  if (!IMAGE_LIKE.includes(category) && category !== "video") {
    return Promise.resolve(null);
  }

  const objectUrl = URL.createObjectURL(file);
  const isVideo = category === "video";

  return new Promise((resolve) => {
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    if (isVideo) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const { videoWidth, videoHeight } = video;
        cleanup();
        resolve(videoWidth && videoHeight ? { width: videoWidth, height: videoHeight } : null);
      };
      video.onerror = () => {
        cleanup();
        resolve(null);
      };
      video.src = objectUrl;
      return;
    }

    const img = new Image();
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      cleanup();
      resolve(naturalWidth && naturalHeight ? { width: naturalWidth, height: naturalHeight } : null);
    };
    img.onerror = () => {
      cleanup();
      resolve(null);
    };
    img.src = objectUrl;
  });
}

/** Same detection, but from an already-uploaded asset's public URL — used
 * by the "Detect" action in the Edit Media panel to backfill dimensions
 * for assets uploaded before the `width`/`height` columns existed. */
export function detectUrlDimensions(
  url: string,
  category: MediaCategory
): Promise<MediaDimensions | null> {
  if (!IMAGE_LIKE.includes(category) && category !== "video") {
    return Promise.resolve(null);
  }

  const isVideo = category === "video";

  return new Promise((resolve) => {
    if (isVideo) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.crossOrigin = "anonymous";
      video.onloadedmetadata = () => {
        const { videoWidth, videoHeight } = video;
        resolve(videoWidth && videoHeight ? { width: videoWidth, height: videoHeight } : null);
      };
      video.onerror = () => resolve(null);
      video.src = url;
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      resolve(naturalWidth && naturalHeight ? { width: naturalWidth, height: naturalHeight } : null);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
