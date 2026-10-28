# ADR 0012: Independently Anchored Audit Chain Head

## STATUS

PROPOSED — 2026-10-26. The founder directed: `use recomendation`, interpreted in context as retaining the full tamper-evidence bar and designing a trusted anchor. The anchor design is specified here; no storage provider, retention duration, account, credentials, dependency, or infrastructure spend has been authorized or selected.

## DECISION

SamJuniorsOS must retain its existing hash-chained audit ledger and add an independent, append-only anchor for each committed audit-chain head. The anchor is an integrity witness only; it contains no audit payload and is not an alternate company-state store.

The provider-neutral contract is:

1. Publish one immutable checkpoint per audit sequence, keyed by a zero-padded sequence number. Each checkpoint contains the ledger identifier, format version, sequence, record hash, and previous record hash. It contains no actor names, payloads, targets, reasons, or other business data.
2. Require create-if-absent semantics. The runtime identity may create, read, and list checkpoint objects; it cannot overwrite, delete, change retention, or administer the bucket/container. A separately governed administrator configures and verifies the retention lock.
3. Before returning a successful append, persist the sealed row in the authoritative database, publish the matching WORM checkpoint, and read it back to confirm exact equality. If checkpoint publication is unavailable, return failure and preserve the sealed row as a pending tail; do not accept later appends until the pending head is anchored. A retry for the same sequence is idempotent only when the existing checkpoint has the exact expected content.
4. On every audit read and append, verify the complete internal chain and require its head sequence and hash to equal the latest trusted checkpoint. A checkpoint ahead of the database, a database head ahead of the checkpoint outside the explicit single pending-append recovery path, a mismatch, a missing retained checkpoint, or a checkpoint gap fails closed. Never reseal, skip, or silently roll back an anchor.
5. Retain checkpoints at least as long as the corresponding audit history. The current product behavior retains audit rows indefinitely, so an implementation that promises full-history tail-truncation detection needs an indefinite hold or an explicitly approved retention-policy change. Expiring checkpoints may only claim protection for the interval during which the checkpoints remain protected.
6. Existing unanchored history cannot be made trusted by hashing it. Keep reads and appends closed until a founder-reviewed byte-for-byte export is independently checked and a one-time genesis checkpoint is explicitly approved.

The verifier's threat model is an actor able to alter or roll back the primary database or its file-backed copy, but unable to use the separately administered anchor-retention controls or compromise the application runtime identity. Compromise of the application process plus its anchor-write identity, cloud-account ownership, or storage-provider control plane remains outside what this design alone proves and must be disclosed.

## WHY

The current chain begins at a public zero hash and validates only rows found in the primary ledger. Removing the final valid rows leaves a valid prefix, so the current reader has no evidence that a later head existed. A digest stored only with the ledger has the same rollback boundary. A separately protected, content-free head checkpoint lets the reader compare the database's current head to a commitment that the primary-ledger writer cannot rewrite or delete.

The repository currently contains Prisma and durable-file audit stores, but no configured object-lock provider, trusted external checkpoint store, or verified deployment account. Adding a provider without a founder's choice would invent infrastructure and require credentials and spend.

## ALTERNATIVES CONSIDERED

1. **Store the head in another row in the same database.** Rejected for the full requirement: it can detect application-level deletion of audit rows if code preserves the head row, but an actor able to roll back or rewrite the database can change both rows together. It does not independently anchor the head.
2. **Write a sidecar file beside the durable audit JSON.** Rejected: it shares the same host, filesystem permissions, backup and rollback boundary; tail truncation can remove or replace both files.
3. **Sign the head with a KMS key and store the signature beside the ledger.** Insufficient alone: a signature authenticates a head but does not establish that the stored signed head is the latest one if both the ledger and signature can be rolled back. It would still need an independently protected monotonic checkpoint or immutable log.
4. **Use a managed WORM object store for hash-only checkpoints.** Recommended design. It gives the checkpoint a separately administered retention boundary while preserving the existing database as the sole authoritative company-state store. The specific service is deferred pending founder selection and account/retention authorization.
5. **Amazon S3 Object Lock.** Official documentation states that Compliance-mode object versions cannot be overwritten or deleted by account users, including root, during the configured retention period; retention still expires unless the service is operated under a suitable hold/renewal policy. [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [configure retention](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-configure.html).
6. **Azure Blob immutable storage.** Official documentation describes locked time-based WORM retention and legal holds. Locked time-based policies cannot be shortened or deleted; the documented maximum is 400 years. [Azure immutable storage overview](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview).
7. **Google Cloud Storage Bucket Lock.** Official documentation describes a locked retention policy that cannot be reduced or removed, with a 100-year maximum and an irreversible project lien. [Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock).

No provider is selected by this ADR because the current repository does not establish an existing cloud-storage account or provider. The official vendor features above are candidates, not an account, cost, license, deployment, or compatibility verification.

## BOUNDARIES

- The Prisma audit ledger remains the sole authoritative audit content store in authoritative mode; the external object contains only a cryptographic head checkpoint.
- Local/test modes may use an in-memory test double only. They must not silently claim trusted anchoring or allow authoritative production operation without a configured anchor.
- Checkpoints are per append, not periodic batches; batching would leave a truncatable unanchored tail window.
- No provider SDK, credentials, account, bucket/container, schema migration, deployment, retention setting, or paid resource is introduced by this proposal.
- Existing append authorization, founder approval, idempotency, and audit payload semantics remain unchanged.

## RISKS

- Every audit append now depends on an external service and adds latency. Provider unavailability must fail closed and may block audited side effects until the pending tail is reconciled.
- A database commit followed by a failed checkpoint write creates a durable pending tail. Recovery must be idempotent and must refuse any mismatch; the cross-service write cannot be atomic.
- Checkpoint count grows with audit volume. Exact ongoing cost is NOT VERIFIED and depends on the selected account, request volume, storage tier, and retention policy.
- Indefinite immutable retention is operationally costly and can be irreversible. A finite retention period weakens the claim to protection within the retained interval.
- The design does not protect against a compromised application process that can legitimately publish arbitrary checkpoints, an anchor-account owner who can change governance before locking, or the storage provider's control plane.
- `updateSpendCap` currently persists settings before writing audit and swallows audit-write errors; that caller must propagate failure or use an explicit pending/compensation design before Q-SEC-7 can pass. Personal Mind deletion checks also need to run without requiring Prisma so the durable-file assertion is independently exercised.

## MIGRATION / REVERSIBILITY

- This proposal itself adds no runtime changes, dependencies, schema changes, credentials, or infrastructure.
- Introducing the selected provider will require a separate implementation checkpoint, a reviewed credential scope, an approved retention setting, provider-specific tests, and an explicit migration for existing audit history. No historical chain may be auto-anchored.
- The external witness is content-free and can be stopped or replaced by a founder-approved, independently witnessed final checkpoint. Removing a locked retention configuration or deleting retained checkpoints may be impossible until expiry; reversibility depends on the selected provider and retention decision.

## NEXT ACTION

Founder selection and authorization are required before implementation: choose an existing provider/account (AWS S3 Object Lock, Azure Blob immutable storage, Google Cloud Storage Bucket Lock, or another approved WORM service), specify retention that matches the audit-retention policy, and authorize any account credentials, SDK dependency, infrastructure setup, and recurring cost. Until then, do not claim complete tail-truncation detection or mark G3.6 done.
