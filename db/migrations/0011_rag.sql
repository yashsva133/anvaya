-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0011
-- RAG metadata: sources, documents, chunks, retrievals, matches
-- ----------------------------------------------------------------------------
-- Purpose   : Persist enough metadata to answer "what source supported this
--             statement?" durably, while the vector index itself stays in the
--             self-hosted FAISS store.
-- Depends on: 0001, 0002
-- Fresh safe: YES
-- Contract  : rag_sources maps 1:1 onto the Source interface in
--             src/lib/data.ts:629-637 { id, title, publisher, country, url,
--             excerpt:L2, usedFor:string[] } and the five seeded ids
--             (medlineplus-hgb, cdc-a1c, aha-chol, nhlbi-tg,
--             medlineplus-creatinine) referenced by TestDef.sources and
--             Pattern.source. `code` carries those existing ids unchanged, so
--             /sources and /test/[id] keep resolving.
--
-- DELIBERATE ABSENCE: no pgvector column. The architecture specifies a
-- local/self-hosted FAISS index and nothing in the codebase performs a vector
-- search in PostgreSQL. `external_vector_id` is the join key to that index;
-- adding pgvector later is an additive change, not a migration of this schema.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- rag_sources — publisher-level catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.rag_sources (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                     -- 'medlineplus-hgb', 'cdc-a1c', ...
  title       text not null,
  publisher   text not null,
  country     text,
  url         text,
  is_clinical_authority boolean not null default true,   -- guideline body vs. general health page
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.rag_sources is
  'Publisher-level source catalogue. `code` preserves the existing Source.id strings from src/lib/data.ts so no client identifier changes.';

drop trigger if exists rag_sources_set_updated_at on public.rag_sources;
create trigger rag_sources_set_updated_at
  before update on public.rag_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rag_documents — a specific version of a source
-- ---------------------------------------------------------------------------
create table if not exists public.rag_documents (
  id            uuid primary key default gen_random_uuid(),
  rag_source_id uuid not null,
  version       text not null,
  title         text not null,
  url           text,
  language      anvaya_lang_code not null default 'en',
  retrieved_at  timestamptz not null default now(),
  content_sha256 text,
  char_count    int check (char_count is null or char_count >= 0),
  licence_note  text,
  index_version text,                                   -- which FAISS index build contains this document
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),

  constraint docs_fk_source foreign key (rag_source_id) references public.rag_sources (id) on delete cascade,
  constraint docs_version_key unique (rag_source_id, version)
);

comment on table public.rag_documents is
  'Versioned document instances. A guideline that is revised does not invalidate the citations already issued against the older version, because citations point at chunks of a specific document row.';

create index if not exists docs_source_idx on public.rag_documents (rag_source_id) where is_active;
create index if not exists docs_index_version_idx on public.rag_documents (index_version) where is_active;

-- ---------------------------------------------------------------------------
-- rag_chunks — the citable unit
-- ---------------------------------------------------------------------------
create table if not exists public.rag_chunks (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null,
  seq               int not null check (seq >= 0),
  heading           text,
  content           text not null,                      -- public guideline text; contains no patient data by construction
  token_count       int check (token_count is null or token_count >= 0),
  external_vector_id text,                              -- key in the FAISS index
  embedding_model   text,
  embedding_dim     smallint check (embedding_dim is null or embedding_dim > 0),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),

  constraint chunks_fk_document foreign key (document_id) references public.rag_documents (id) on delete cascade
);

comment on table public.rag_chunks is
  'The passage a citation points to. `content` is stored here (public clinical guideline text, never PHI) so a citation stays verifiable even if the FAISS index is rebuilt or discarded.';
comment on column public.rag_chunks.external_vector_id is
  'Primary key of the same passage inside the self-hosted FAISS index. PostgreSQL holds the metadata and the text; FAISS holds the vectors.';

create unique index if not exists chunks_doc_seq_key on public.rag_chunks (document_id, seq);
create unique index if not exists chunks_vector_id_key
  on public.rag_chunks (external_vector_id) where external_vector_id is not null;
create index if not exists chunks_active_idx on public.rag_chunks (document_id) where is_active;

-- ---------------------------------------------------------------------------
-- rag_retrievals — one retrieval event
-- ---------------------------------------------------------------------------
create table if not exists public.rag_retrievals (
  id            uuid primary key default gen_random_uuid(),
  query_text    text not null,                          -- the ANONYMISED query; never contains patient identifiers
  query_intent  text,
  language      anvaya_lang_code not null default 'en',
  engine        text not null default 'faiss',
  index_version text,
  top_k         smallint not null check (top_k > 0),
  min_score     numeric(6,5),
  match_count   smallint not null default 0 check (match_count >= 0),
  best_score    numeric(6,5) check (best_score is null or (best_score >= 0 and best_score <= 1)),
  mean_score    numeric(6,5) check (mean_score is null or (mean_score >= 0 and mean_score <= 1)),
  latency_ms    int check (latency_ms is null or latency_ms >= 0),
  created_at    timestamptz not null default now()
);

comment on table public.rag_retrievals is
  'A retrieval event. best_score/mean_score are the retrieval-similarity component of the trust score stored on ai_generations.';

create index if not exists retrievals_created_idx on public.rag_retrievals (created_at desc);
create index if not exists retrievals_lang_idx on public.rag_retrievals (language, created_at desc);

-- ---------------------------------------------------------------------------
-- rag_retrieval_matches — what a retrieval returned
-- ---------------------------------------------------------------------------
create table if not exists public.rag_retrieval_matches (
  id            uuid primary key default gen_random_uuid(),
  retrieval_id  uuid not null,
  rag_chunk_id  uuid not null,
  rank          smallint not null check (rank > 0),
  score         numeric(6,5) not null check (score >= 0 and score <= 1),
  matched_on    text check (matched_on is null or matched_on in ('vector', 'keyword', 'hybrid')),
  created_at    timestamptz not null default now(),

  constraint matches_fk_retrieval foreign key (retrieval_id) references public.rag_retrievals (id) on delete cascade,
  constraint matches_fk_chunk     foreign key (rag_chunk_id)  references public.rag_chunks (id) on delete restrict,
  constraint matches_unique_rank  unique (retrieval_id, rank)
);

comment on table public.rag_retrieval_matches is
  'Per-chunk retrieval outcome. ON DELETE RESTRICT on the chunk: a passage that has been cited must not disappear silently.';

create index if not exists matches_retrieval_idx on public.rag_retrieval_matches (retrieval_id, rank);
create index if not exists matches_chunk_idx on public.rag_retrieval_matches (rag_chunk_id);
