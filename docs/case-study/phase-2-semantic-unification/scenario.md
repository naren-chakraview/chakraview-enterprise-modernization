# Phase 2: Semantic Unification Case Study - E-Commerce Churn Analysis

## Business Context

Our subject is **TrendCart**, a mid-market e-commerce platform serving 500K+ active customers across fashion, electronics, and home goods verticals. The company operates a polyglot data infrastructure spanning 5 autonomous systems:

- **Shopify Storefront**: Customer browse, add-to-cart, purchase workflows (PostgreSQL)
- **Salesforce Commerce Cloud**: Order fulfillment, inventory management, promotions
- **Stripe Payment Gateway**: Payment transactions, refunds, subscription billing
- **Postgres Data Warehouse**: Customer profiles, order history, behavioral snapshots
- **Segment CDP**: Real-time event streaming (page views, add-to-cart, checkout, support interactions)

With 3+ years of operations, TrendCart's customer churn rate has climbed to 35% annually—significantly above the 20% industry baseline for e-commerce. Executive leadership mandates root-cause analysis and predictive intervention by Q2.

## The Problem: Schema Negotiation Overhead

The Analytics team needs to answer: **"Which customers are at high churn risk and why?"**

This seemingly simple question requires correlating signals across 5 independently operated systems:

1. **Purchase Recency** (Shopify): Last order date, order frequency, average order value
2. **Support Quality** (Salesforce): Open tickets, resolution SLA misses, customer sentiment scores
3. **Payment Friction** (Stripe): Declined payments, refund requests, failed subscription renewals
4. **Customer Lifecycle** (Postgres DW): Customer tenure, tier/segment, lifecycle stage
5. **Behavioral Engagement** (Segment): Session count, feature adoption, event recency

**Current State Issues:**
- **Schema Variance**: Customer entity is named `user_id` in Segment, `customer_id` in Shopify, `account_id` in Salesforce, `customer_uuid` in Stripe, and `cust_id` in Postgres. No canonical definition.
- **Entity Reconciliation**: Matching customers across systems requires manual SQL joins on (email, phone, name) tuples—high false positive/negative rates (~8-12% errors).
- **Query Complexity**: A single churn analysis query spans 6+ tables, 4+ databases, 10+ joins, 200+ lines of SQL. Domain logic buried in transformation code. Maintenance burden: ~40 hours/quarter.
- **Governance Gaps**: No audit trail for which source system is "source of truth" for each customer attribute. Conflicting values when upstream systems diverge.
- **Time-to-Insight**: 3-5 business days from question to analysis due to schema negotiation, deduplication validation, and SQL rewrite cycles.

## The Solution: Semantic Medallion Architecture

TrendCart adopts the **Semantic Medallion Pattern**—extending the traditional bronze/silver/gold medallion with semantic layers:

### Medallion Layers

**Bronze (Raw)**: Debezium CDC snapshots from Shopify, Salesforce, Stripe, Postgres, and Segment streams land in Delta tables. No transformation.

**Silver (Entity Consolidation)**:
- Customer entities from 5 sources are matched via probabilistic deduplication (Felleigi-Sunter on email + phone + name).
- Each unique customer receives a canonical **Internationalized Resource Identifier (IRI)**: `https://trendcart.com/customer/{uuid}`
- Cross-source attributes are merged with conflict resolution rules (Stripe is source-of-truth for payment status; Salesforce for support metrics; Shopify for purchase history).
- Output: `silver.customers` table with IRI, merged attributes, source provenance.

**RDF Gold (Semantic)**: 
- Silver customer records are transformed into RDF triples using the TrendCart e-commerce ontology.
- Related entities (orders, payments, support tickets) are linked via semantic properties.
- SPARQL endpoints expose the unified graph for exploratory and analytical queries.
- Output: RDF triples in a Semantic Data Lake (Apache Jena or Virtuoso).

### Key Benefits

1. **Single Customer View**: One IRI per customer, regardless of how many systems know about them.
2. **Declarative Queries**: SPARQL queries express "find customers with 3+ support tickets AND failed payments" without manual joins.
3. **Cross-Source Semantics**: Ontology encodes domain logic (churn signals, payment failures, support quality) so queries are self-documenting.
4. **Governance**: Each triple carries metadata (source system, timestamp, confidence score) enabling audit trails.
5. **Extensibility**: New data sources (SMS provider, loyalty platform) plug into medallion without rewriting downstream logic.

## Outcome: Accelerated Churn Prediction

With the semantic medallion in place:

- **Time-to-Insight**: Reduced from 3-5 days to 2-4 hours. Analysts write SPARQL queries instead of SQL joins.
- **Accuracy**: Entity consolidation errors drop from 8-12% to <2% via probabilistic deduplication + manual review workflow.
- **Query Velocity**: Churn analysis query shrinks from 200+ lines of SQL to 20 lines of SPARQL + 5 lines of ontology. Maintenance effort: 5 hours/quarter.
- **Data Reuse**: Same customer IRI and RDF graph used for cohort analysis, lifetime value forecasting, personalization scoring.

### Sample Findings

Running churn risk queries (see example-queries.md) on Q1 2026 data:

- **High-Risk Cohort**: 8,453 customers (1.7%) with 3+ unresolved support tickets AND ≥1 failed payment in past 90 days.
- **Intervention**: Proactive outreach (discount offer, support escalation) to 5,000 customers; 23% conversion to high-engagement tier.
- **ROI**: $180K incremental Q1-Q2 revenue from retention campaigns.

## Next Steps

With Phase 2 patterns validated, TrendCart roadmap includes:

1. **Phase 3**: Extend ontology to include product affinity, customer lifetime value, churn probability scores.
2. **Phase 4**: Deploy real-time SPARQL federation for sub-second latency on production dashboards.
3. **Phase 5**: Integrate with ML pipelines for feature engineering (entity embeddings from RDF graph).
