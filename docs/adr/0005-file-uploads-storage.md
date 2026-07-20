# ADR 0005: File uploads — proxy through the API, local-dir storage behind an interface

- **Status:** Accepted
- **Date:** 2026-07-20
- **Context ref:** idea.md §24 Phase 6, §21, §15; Task 38

## Context

Phase 6 adds private uploaded files (photos, documents) attached to people/sources.
Two decisions needed pinning: (1) how bytes travel from the browser to storage, and
(2) where they are stored.

## Decision

**Upload path — proxy through the API, not presigned URLs.** The browser sends a
multipart upload to the BFF; the BFF reads it, enforces the 10MB cap, and forwards it
to the Oracle API as a **signed JSON+base64** request over the existing HMAC channel.
The API sniffs the content type from magic bytes (not the client header), strips image
metadata, and stores the object. One trust boundary, one auth mechanism, no public
storage credentials or presigned-URL surface. Base64 inflates the body ~33% — a
non-issue at a 10MB cap. Revisit presigned uploads only if file sizes grow materially.

**Storage — a `FileStorage` interface with a local-directory implementation.** Objects
live under a private volume (`FILE_STORAGE_DIR`, bind-mounted into the read-only API
container) and are mirrored off-box by the backup script (`rclone sync`, idea.md §21).
The interface (`put`/`get`/`delete`, server-generated `files/<uuid>` keys) lets an
S3-compatible implementation (OCI Object Storage) drop in later without touching the
service layer. A dir-backed store keeps the MVP+1 dependency-free and fully testable.

**Metadata stripping — pure JS, no native dependency.** `sharp` would force the
runtime image away from its dist-only design and add native-binary risk on ARM64. We
strip EXIF/GPS/XMP and textual chunks by rewriting the container (JPEG APPn/COM, PNG
text/eXIf chunks, WebP EXIF/XMP chunks). Pixels are preserved; location/camera data
is removed. Full re-encode via an image library can replace this if richer
transforms (thumbnails, resizing) are ever needed.

## Consequences

- Files are **admin-only** and streamed through the API; they never appear in any
  public view or projection (idea.md §15).
- Object first, DB row second; a row failure best-effort removes the orphan, and an
  orphan-sweeper can reconcile the rest.
- Swapping to S3 is an implementation change behind `FileStorage`, plus pointing the
  backup at the bucket instead of `rclone sync` of the local dir.
