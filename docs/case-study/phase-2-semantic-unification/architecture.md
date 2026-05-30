# Phase 2: Semantic Unification - System Architecture

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SOURCE SYSTEMS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  Shopify (PostgreSQL)  │  Salesforce  │  Stripe API  │  Postgres DW  │  Segment  │
│   Customers, Orders    │  Support Tickets  │  Payments  │  Profiles  │  Events   │
└─────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────┘
              │              │              │              │              │
              │     CDC (Debezium) + Streaming APIs       │              │
              ▼              ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BRONZE LAYER (Raw)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  bronze.shopify_customers  │  bronze.salesforce_tickets  │  bronze.stripe_payments  │
│  bronze.shopify_orders     │  bronze.postgres_profiles   │  bronze.segment_events   │
│                                                                                     │
│  Immutable delta tables, partition by ingest_timestamp                            │
└─────────────┬───────────────────────────────────────────────────────────────────┘
              │
              │     Entity Matching (Probabilistic Deduplication)
              │     Match: (email, phone, name) across sources
              │     Similarity: Levenshtein + Phonetic
              │     Confidence Threshold: 0.85
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SILVER LAYER (Entity Consolidation)                │
├─────────────────────────────────────────────────────────────────────────┤
│  silver.customers                                                       │
│  ├─ iri (Canonical IRI: https://trendcart.com/customer/{uuid})         │
│  ├─ email, phone, name (merged, source-ranked)                          │
│  ├─ created_date, last_active_date                                     │
│  ├─ tier (gold/silver/bronze, from Shopify)                             │
│  ├─ open_support_tickets (count, from Salesforce)                       │
│  ├─ failed_payments (count, from Stripe, last 90 days)                  │
│  ├─ order_count, total_spent, last_order_date (from Shopify)            │
│  ├─ feature_engagement_score (from Segment, 0-100)                      │
│  └─ source_systems (array: [shopify, stripe, salesforce, segment])      │
│                                                                          │
│  silver.orders                                                          │
│  ├─ customer_iri (FK to silver.customers)                               │
│  ├─ order_id, order_timestamp, amount, currency                         │
│  └─ status (pending, completed, cancelled, returned)                    │
│                                                                          │
│  silver.support_tickets                                                 │
│  ├─ customer_iri (FK to silver.customers)                               │
│  ├─ ticket_id, created_date, resolved_date, status                      │
│  └─ sentiment_score, resolution_sla_met                                 │
│                                                                          │
│  silver.payments                                                        │
│  ├─ customer_iri (FK to silver.customers)                               │
│  ├─ payment_id, amount, status (succeeded, failed, declined)            │
│  └─ failure_reason (if failed)                                          │
└─────────────┬───────────────────────────────────────────────────────────┘
              │
              │     RDF Transformation (Semantic CDC)
              │     Template: Customer -> :hasOrder, :hasSupportTicket, etc.
              │     Namespace: https://trendcart.com/ontology#
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      RDF GOLD LAYER (Semantic)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  RDF Triplestore (Jena TDB2 or Virtuoso)                                │
│                                                                          │
│  Triples (example):                                                     │
│  <https://trendcart.com/customer/c001> a :Customer ;                    │
│      :hasEmail "alice@example.com" ;                                    │
│      :hasStatus :Active ;                                               │
│      :hasOrder <https://trendcart.com/order/o123> ;                     │
│      :hasSupportTicket <https://trendcart.com/ticket/t456> ;            │
│      :hasFailedPayment <https://trendcart.com/payment/p789> ;           │
│      :inTier :Gold ;                                                    │
│      :joinDate "2023-01-15"^^xsd:date ;                                 │
│      :lastActiveDate "2026-05-28"^^xsd:date .                           │
│                                                                          │
│  <https://trendcart.com/order/o123> a :Order ;                          │
│      :hasCustomer <https://trendcart.com/customer/c001> ;               │
│      :orderDate "2026-05-20"^^xsd:date ;                                │
│      :amount "99.99"^^xsd:decimal ;                                     │
│      :status :Completed .                                               │
│                                                                          │
│  Query Endpoint: /sparql (HTTP GET/POST)                                │
└─────────────┬───────────────────────────────────────────────────────────┘
              │
              ├─────────────────┬──────────────────┬─────────────────┐
              ▼                 ▼                  ▼                 ▼
         ┌─────────┐      ┌──────────┐     ┌────────────┐    ┌──────────┐
         │ SPARQL  │      │ SQL API  │     │ Dashboard  │    │   ML     │
         │ Queries │      │ (Presto) │     │ (Looker)   │    │ Pipeline │
         │         │      │          │     │            │    │          │
         │ Churn   │      │ Customer │     │  KPI       │    │ Feature  │
         │ Analysis│      │  360°    │     │  Charts    │    │ Eng.     │
         │         │      │          │     │            │    │          │
         └─────────┘      └──────────┘     └────────────┘    └──────────┘
```

## System Components

### 1. CDC Ingest Layer (Bronze)

**Debezium Connectors** pull changes from operational systems:
- **Shopify PostgreSQL**: snapshot mode, 1 connector per schema (customers, orders, order_items)
- **Salesforce**: REST API polling, delta detection via `SystemModstamp`
- **Stripe**: Webhook listener + daily snapshot reconciliation via API
- **Postgres DW**: Direct CDC (logical decoding) for existing profiles table
- **Segment**: Real-time HTTP sink + Kafka topic

**Output**: Change events land in Delta tables partitioned by `ingest_date` and `source_system`. SLA: <5min latency.

### 2. Entity Matching Service (Silver)

**Probabilistic Deduplication**:
- Input: Bronze customer records from 5 sources
- Algorithm: Felleigi-Sunter on (email, phone, name) with Levenshtein distance
- Confidence scoring: weighted attributes (email exact match: 0.9, phone fuzzy: 0.6, name phonetic: 0.4)
- Output: Match clusters with confidence ≥0.85 assigned unique UUIDs → IRIs

**Conflict Resolution Rules**:
- Email: Stripe (most validated) > Shopify > Segment
- Phone: Shopify > Stripe > Segment
- Tier: Shopify (source of truth for commerce status)
- Support Metrics: Salesforce only
- Payment Status: Stripe only
- Engagement: Segment only

**Output**: `silver.customers` table with IRI, merged attributes, source provenance flags.

### 3. Semantic CDC (RDF Transformer)

**RDF Template Engine**:
- Maps silver entity records to RDF triples using ontology templates
- Templates are Jinja2 + SPARQL CONSTRUCT statements
- Example template (Customer):
  ```
  <{{ iri }}> a :Customer ;
      :hasEmail "{{ email }}" ;
      :hasStatus :{{ status }} ;
      :inTier :{{ tier }} ;
      :joinDate "{{ created_date }}"^^xsd:date .
  ```

**Batch Scheduler**: Runs nightly, triggers on silver table updates. SLA: <1 hour transformation time.

**Output**: RDF N-Quads (quad format includes graph metadata: source system, timestamp).

### 4. Semantic Data Lake (RDF Gold)

**RDF Triplestore**: 
- Backend: Apache Jena TDB2 (for prototype) or Virtuoso (production)
- Data model: Named graphs per source system for audit trails
  - `<https://trendcart.com/graph/shopify>`: Shopify-sourced triples
  - `<https://trendcart.com/graph/stripe>`: Stripe-sourced triples
  - `<https://trendcart.com/graph/consolidated>`: Merged/inferred triples

**SPARQL Endpoint**: HTTP REST API (GET/POST /sparql)
- Query language: SPARQL 1.1
- Supported formats: JSON, XML, Turtle, CSV
- Authentication: OAuth2 (service account)
- Rate limiting: 1000 queries/hour per consumer

### 5. Query Layer

**SPARQL Endpoint** (native semantic queries):
- Direct SPARQL 1.1 queries on RDF Gold
- Sub-second latency for typical analytical queries
- Support for UNION, FILTER, GROUP BY, aggregates

**Federated Query Gateway** (SQL + SPARQL):
- Presto/Trino with SPARQL connector
- Allows SQL joins between silver tables and RDF Gold
- Useful for blended queries (SQL for dimensional data, SPARQL for entity relationships)
- Example: `SELECT * FROM silver.customers JOIN (SPARQL: CONSTRUCT WHERE {...}) AS semantic_view`

**BI Tools**: Looker, Tableau, etc., connect to federated query gateway via JDBC/ODBC

## Data Flow Timeline

| Stage | Component | Input | Output | SLA |
|-------|-----------|-------|--------|-----|
| 0h00 | Debezium CDC | Shopify, Salesforce, Stripe, Postgres, Segment updates | Bronze delta tables | <5min |
| 0h05 | Spark Entity Matching | Bronze customers (5 sources) | silver.customers with IRI + provenance | <30min |
| 0h40 | Semantic CDC | silver.customers, silver.orders, silver.payments, silver.support_tickets | RDF triples in named graphs | <1 hour |
| 1h00 | SPARQL Endpoint | RDF Gold (Jena TDB2 index) | Ready for queries | - |
| 1h+ | Analytics | SPARQL/SQL queries | Dashboards, reports, ML features | <1sec per query |

## Deployment Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     CLOUD (AWS / GCP)                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ECS/K8s Cluster:                                             │
│  ├─ Debezium Connectors (container per source)                │
│  ├─ Spark Job (Entity Matching + RDF Transform)               │
│  ├─ Jena TDB2 Server (SPARQL endpoint)                         │
│  └─ Presto Coordinator + Workers                              │
│                                                                │
│  Data Lake:                                                   │
│  ├─ S3 / GCS: Bronze (raw Debezium snapshots)                │
│  ├─ S3 / GCS: Silver (Delta lake, entity consolidated)       │
│  ├─ Persistent Volume: RDF Gold (Jena TDB2 index files)      │
│  └─ CloudSQL: Metadata catalog (ontology, schema versions)   │
│                                                                │
│  Monitoring:                                                  │
│  ├─ Prometheus (metrics: row counts, latency, errors)        │
│  ├─ ELK Stack (logs: Debezium, Spark, SPARQL query logs)     │
│  └─ Alerting: PagerDuty on SLA misses                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Semantic Layer as Gold Standard**: RDF Gold is queryable, not just cached. Enables exploratory analytics and self-service BI.
2. **Named Graphs for Provenance**: Each source system contributes triples to a named graph, enabling audit trails and source-specific filtering.
3. **Hybrid Query Support**: Both SPARQL (semantic) and SQL (dimensional) accessible via federated gateway. Analysts choose the right tool.
4. **Incremental Medallion Updates**: CDC-driven silver updates trigger incremental RDF transformation, avoiding full recompute.
5. **Confidence Metadata**: Deduplication confidence scores carried through silver → gold, allowing downstream filtering (e.g., "show only matches ≥0.95").
