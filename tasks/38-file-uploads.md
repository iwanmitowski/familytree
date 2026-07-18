# Task 38: Private file uploads (photos & documents) — POST-MVP, OPTIONAL

**Depends on:** 26, 33 · **Size:** L · **Spec:** idea.md §24 Phase 6 (all bullets), §15 (privacy)

> **Note:** idea.md §25 (Definition of Done) does not require this task — build it only after the MVP (Tasks 01–37) is done and deployed.

## Goal
Admin-managed private uploads (photographs, documents) attached to people/sources, stored in private object storage, with strict validation, image metadata stripping, access control, and backup coverage.

## Requirements
1. Migration: `files` table — `id`, `person_id?`, `source_id?`, `original_filename`, `content_type`, `size_bytes`, `sha256`, `storage_key` (never user-controlled), `uploaded_by`, `created_at`, `deleted_at`; CHECK: at least one of person/source set.
2. Go endpoints (admin role only for MVP+1; public upload links are a separate future decision):
   - `POST /v1/internal/files` — multipart upload proxied through the API (decision: proxy over presigned URLs — simplest secure, one trust boundary; revisit if sizes grow; note as ADR): size limit 10MB; content-type allowlist `image/jpeg, image/png, image/webp, application/pdf` verified by **magic-byte sniffing**, not the client header (idea.md Phase 6 „content-type validation");
   - Images: re-encode server-side (decode → strip all EXIF/metadata → re-encode; „image metadata removal") before storing; PDFs stored as-is;
   - Store to a **private** OCI Object Storage bucket via S3-compatible API under `files/<uuid>`; DB row in the same flow (object first, row second; orphan-object sweeper script for failures);
   - `GET /v1/internal/files/{id}` — streams via the API with access control (admin; public **never** — files are excluded from all public views per idea.md §15 „документи"); `DELETE` — soft delete + object removal;
   - Caddy/BFF body-size limits raised **only** on the upload route.
3. BFF admin routes + UI: „Файлове" tab on the person page (upload dropzone with Bulgarian copy, thumbnail grid for images, download, delete with confirm); upload progress; clear errors for rejected types/sizes.
4. Backup: extend Task 33 scripts to `rclone sync` the files bucket to the secondary remote weekly and include a file manifest + checksums in the backup manifest (idea.md §21 „uploaded files", „file manifest").
5. Update OpenAPI, `docs/architecture.md`, env examples (bucket creds).

## Acceptance criteria
- An `.exe` renamed to `.jpg` is rejected by sniffing; an uploaded JPEG loses its EXIF (GPS) data — asserted by reading back the stored object; oversize rejected with a Bulgarian message; public tree/person JSON never references files; backup manifest lists the file.

## Verification
- Go unit tests (sniffing matrix, EXIF-strip assertion) + integration (upload→fetch→delete against MinIO or a local dir-backed S3 stub); web tests for the upload UI states; extend the backup local run.
- Standard Go + web verification.
- Commit as `task-38: file uploads`.
