# Build photos and video

## Owner editing

Run START_WINDOWS.bat and use the local desktop window that it opens. Only that owner session shows Add photos or video and Delete. JPEG, PNG, WebP, MP4 and WebM are supported up to 50 MB per file; files live in data/project-media/ next to the robot database.

The launcher creates an owner credential. Phone links and PIN pairing return a different controller credential. Controller sessions can view the gallery, but POST and DELETE are rejected with HTTP 403. The LAN listener never grants media ownership, even if passed the desktop credential. Direct-file mode has no editor. These are roles within the local controller, not a public account/login system.

## Publish selected media

Use verified photos of Adam's build. Copy only selected public files to docs/media/ in the exported source, and link them from both READMEs. The export excludes the local media directory, database and session credentials. Keep private files and purchased CAD out of the public repository.

All four owner-supplied recordings appear in both README galleries as complete H.264 files with audio tracks removed. The WhatsApp recording is also bundled without audio under docs/media/. See [media inventory and processing](MEDIA_SOURCES.md).
