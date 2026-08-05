-- Validate the joint-alliance checks in a separate transaction after the
-- legacy evidence backfill has committed and its deferred trigger queue is
-- empty.

alter table public.public_zvz_entity_engagement_evidence
  validate constraint public_zvz_alliance_evidence_requires_joint_sortie;

alter table public.public_zvz_v2_season_evidence
  validate constraint public_zvz_season_alliance_evidence_requires_joint_sortie;
