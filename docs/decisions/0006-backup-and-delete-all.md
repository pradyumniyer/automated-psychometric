# ADR 0006: Backup file and delete-all

**Status:** Accepted.
**Decision:** Phase 1 ships (1) export/import of a single project backup JSON file (schema in `DATABASE.md` §5), unencrypted with a clear warning that it contains raw data, and (2) a "Delete all my local data" control that offers a backup first.
**Why:** local-first means clearing browser data destroys work; the Privacy Policy and acceptance criteria promise a backup path; shared computers need a delete option.
**Not in v1:** encrypted backups, cloud sync.
