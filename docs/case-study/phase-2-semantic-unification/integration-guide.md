# Phase 2: Semantic Unification - Integration & Deployment Guide

This guide provides step-by-step instructions for deploying the semantic medallion pattern into a TrendCart e-commerce infrastructure, building on Phase 1-4 foundational patterns from chakraview-data-engineering-patterns.

## Prerequisites

- **Completed Phase 1-4 medallion**: Bronze (raw CDC), Silver (deduped entities), Gold (enriched tables)
- **CDC Connectors**: Debezium instances for Shopify, Salesforce, Stripe, Postgres DW, Segment
- **Compute Environment**: Kubernetes cluster (EKS/GKE) or Databricks workspace
- **Storage**: S3 or GCS buckets for Bronze, Silver, and RDF storage
- **Orchestration**: Airflow or Prefect for DAG scheduling
- **RDF Engine**: Apache Jena TDB2 (demo) or Virtuoso (production)
- **Access**: Service accounts with permissions to read bronze/silver tables and write to RDF store

## Step 1: Deploy Phase 1-4 Medallion Patterns

If not already in place, deploy the core medallion layers from `chakraview-data-engineering-patterns/docs/patterns/`:

1. **Phase 1 - CDC Ingest**: Deploy Debezium connectors
   ```bash
   kubectl apply -f connectors/debezium/shopify-source.yaml
   kubectl apply -f connectors/debezium/salesforce-source.yaml
   kubectl apply -f connectors/debezium/stripe-source.yaml
   kubectl apply -f connectors/debezium/postgres-source.yaml
   kubectl apply -f connectors/debezium/segment-sink.yaml
   ```

2. **Phase 2-3 - Silver**: Run entity consolidation Spark job (merge profiles from 5 sources)
   ```bash
   spark-submit \
     --master k8s://https://<cluster>:443 \
     --deploy-mode cluster \
     --conf spark.kubernetes.container.image=<registry>/semantic-medallion:v1 \
     medallion/phase-2-entity-consolidation.py
   ```

3. **Phase 4 - Gold**: Enrich with business logic (tiers, segments, aggregates)

Verify completion: Check that `silver.customers`, `silver.orders`, `silver.payments`, `silver.support_tickets` tables exist and are populated.

## Step 2: Configure Entity Rules for Deduplication

Create `config/deduplication.yaml` to define customer matching rules:

```yaml
# config/deduplication.yaml
entity_rules:
  customer:
    match_fields:
      - name: email
        source: [stripe, shopify, salesforce, postgres, segment]
        match_type: exact
        weight: 0.9
        confidence_threshold: 0.85
      
      - name: phone
        source: [stripe, shopify, segment]
        match_type: fuzzy
        fuzzy_threshold: 0.8
        weight: 0.6
        confidence_threshold: 0.85
      
      - name: name
        source: [shopify, salesforce, postgres]
        match_type: phonetic  # Soundex/Metaphone
        weight: 0.4
        confidence_threshold: 0.75
    
    # Conflict resolution (source ranking)
    conflict_resolution:
      email: [stripe, shopify, salesforce, postgres, segment]
      phone: [shopify, stripe, segment]
      name: [shopify, salesforce, postgres, segment, stripe]
      tier: [shopify]  # Source of truth for customer tier
      support_metrics: [salesforce]
      payment_status: [stripe]
      engagement: [segment]
    
    # Deduplication mode
    matching_algorithm: "levenshtein-sunter"
    confidence_min: 0.85
    manual_review_threshold: 0.80  # Rows with confidence 0.80-0.85 flagged for manual review
    
# Schema mappings (source field -> canonical silver field)
schema_mappings:
  shopify:
    customer_id: "customer_id"
    email: "email"
    first_name: "first_name"
    last_name: "last_name"
    phone: "phone"
    created_at: "created_date"
  
  stripe:
    customer_id: "customer_id"
    email: "email"
    phone: "phone"
  
  salesforce:
    account_id: "account_id"
    name: "name"
    account_email: "email"
  
  postgres_dw:
    customer_uuid: "customer_id"
    email: "email"
    full_name: "name"
  
  segment:
    anonymous_id: "anonymous_id"
    user_id: "user_id"
    email: "email"
    phone: "phone"
    name: "name"
```

Load configuration:
```bash
gsutil cp config/deduplication.yaml gs://<config-bucket>/deduplication.yaml
```

## Step 3: Deploy Semantic CDC Pattern (IRI Minter Service)

Create IRI Minting microservice (`iri-minter/app.py`) to generate and manage canonical IRIs:

```python
# iri-minter/app.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from uuid import uuid4
import redis
import json

app = FastAPI()
r = redis.Redis(host='redis', port=6379, db=0)

class CustomerMatch(BaseModel):
    email: str
    phone: str = None
    name: str = None
    sources: list  # ["shopify", "stripe", ...]

@app.post("/mint-iri")
async def mint_iri(match: CustomerMatch) -> dict:
    """Generate or retrieve canonical IRI for a customer."""
    
    # Check if customer already in graph
    key = f"iri:{match.email}"
    existing_iri = r.get(key)
    if existing_iri:
        return {"iri": existing_iri.decode(), "source": "cache"}
    
    # Generate new IRI
    customer_uuid = str(uuid4())
    iri = f"https://trendcart.com/customer/{customer_uuid}"
    
    # Store in Redis for fast lookup
    r.set(key, iri, ex=86400)  # 24h TTL
    r.set(f"iri-metadata:{iri}", json.dumps({
        "email": match.email,
        "phone": match.phone,
        "name": match.name,
        "sources": match.sources,
        "created_at": datetime.now().isoformat()
    }))
    
    return {"iri": iri, "source": "minted"}

@app.get("/iri/{customer_uuid}")
async def get_iri(customer_uuid: str) -> dict:
    """Retrieve IRI metadata."""
    key = f"iri-metadata:https://trendcart.com/customer/{customer_uuid}"
    metadata = r.get(key)
    if not metadata:
        raise HTTPException(status_code=404, detail="IRI not found")
    return json.loads(metadata)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

Deploy to Kubernetes:

```bash
# Build and push Docker image
docker build -t <registry>/iri-minter:v1 iri-minter/
docker push <registry>/iri-minter:v1

# Deploy
kubectl apply -f k8s/iri-minter-deployment.yaml
kubectl apply -f k8s/iri-minter-service.yaml

# Verify
kubectl get pods -l app=iri-minter
kubectl logs -f deploy/iri-minter
```

## Step 4: Run Entity Consolidation + IRI Minting

Create Spark job to consolidate silver entities and call IRI minter:

```python
# medallion/phase-2-semantic-unification.py
from pyspark.sql import SparkSession
import requests
from pyspark.sql.functions import col, concat_ws, udf, lit

spark = SparkSession.builder \
    .appName("SemanticUnification") \
    .getOrCreate()

# Load bronze customer tables from 5 sources
shopify = spark.read.format("delta").load("s3://bucket/bronze/shopify_customers")
stripe = spark.read.format("delta").load("s3://bucket/bronze/stripe_customers")
salesforce = spark.read.format("delta").load("s3://bucket/bronze/salesforce_accounts")
postgres = spark.read.format("delta").load("s3://bucket/bronze/postgres_profiles")
segment = spark.read.format("delta").load("s3://bucket/bronze/segment_users")

# Normalize schemas
shopify_norm = shopify.select(
    col("email").alias("email"),
    col("phone").alias("phone"),
    col("first_name").concat(" ").concat(col("last_name")).alias("name"),
    lit("shopify").alias("source")
)
# ... repeat for other sources ...

# Union all sources
all_customers = shopify_norm.union(stripe_norm).union(salesforce_norm).union(postgres_norm).union(segment_norm)

# Deduplication via entity matching
matched = run_deduplication(all_customers, config_path="gs://bucket/deduplication.yaml")

# Call IRI minter for each customer group
@udf("string")
def mint_iri(email, phone, name, sources_str):
    sources = sources_str.split(",")
    response = requests.post(
        "http://iri-minter:8000/mint-iri",
        json={"email": email, "phone": phone, "name": name, "sources": sources}
    )
    return response.json()["iri"]

# Assign IRIs
matched_with_iris = matched.withColumn(
    "iri",
    mint_iri(col("email"), col("phone"), col("name"), col("sources"))
)

# Write to silver.customers
matched_with_iris.write \
    .format("delta") \
    .mode("overwrite") \
    .option("mergeSchema", "true") \
    .save("s3://bucket/silver/customers")

spark.stop()
```

Schedule job:
```bash
# Submit to Airflow/Prefect
airflow dags trigger semantic_unification

# Or via Databricks Jobs API
databricks jobs create --json-file job-config.json
```

## Step 5: Ingest Sample Data

Load sample TrendCart customer data to validate the pipeline:

```sql
-- Cloud Shell / SQL Client
INSERT INTO bronze.shopify_customers (customer_id, email, first_name, last_name, phone, created_at)
VALUES
  ('c001', 'alice@example.com', 'Alice', 'Johnson', '+1-555-0123', '2023-01-15'),
  ('c002', 'bob@example.com', 'Bob', 'Smith', '+1-555-0124', '2023-02-20');

INSERT INTO bronze.stripe_customers (customer_id, email, phone, created_at)
VALUES
  ('cus_001', 'alice@example.com', '+1-555-0123', '2023-01-15'),
  ('cus_002', 'bob.smith@example.com', '+1-555-0124', '2023-02-20');

-- ... repeat for Salesforce, Postgres, Segment ...
```

Trigger medallion jobs (Phase 2-4) to process sample data.

Verify: Check `silver.customers` table contains IRIs and merged attributes.

## Step 6: Deploy Semantic Batch Lakehouse → RDF Gold

Deploy RDF transformation job (`medallion/phase-2-rdf-transform.py`):

```python
# medallion/phase-2-rdf-transform.py
from pyspark.sql import SparkSession
from rdflib import Graph, Namespace, Literal, URIRef
from rdflib.namespace import RDF, RDFS, XSD
import json

spark = SparkSession.builder \
    .appName("SemanticBatchLakehouse") \
    .getOrCreate()

# Load silver tables
customers = spark.read.format("delta").load("s3://bucket/silver/customers")
orders = spark.read.format("delta").load("s3://bucket/silver/orders")
payments = spark.read.format("delta").load("s3://bucket/silver/payments")
tickets = spark.read.format("delta").load("s3://bucket/silver/support_tickets")

# RDF ontology namespace
ONTO = Namespace("https://trendcart.com/ontology#")
DATA = Namespace("https://trendcart.com/data#")

# Transform customers to RDF triples
def customer_to_rdf(row):
    """Convert customer row to RDF triples."""
    g = Graph()
    customer_uri = URIRef(row.iri)
    
    g.add((customer_uri, RDF.type, ONTO.Customer))
    g.add((customer_uri, ONTO.hasEmail, Literal(row.email)))
    g.add((customer_uri, ONTO.hasPhone, Literal(row.phone)))
    g.add((customer_uri, ONTO.hasName, Literal(row.name)))
    g.add((customer_uri, ONTO.joinDate, Literal(row.created_date, datatype=XSD.date)))
    g.add((customer_uri, ONTO.lastActiveDate, Literal(row.last_active_date, datatype=XSD.date)))
    g.add((customer_uri, ONTO.inTier, ONTO[row.tier]))
    g.add((customer_uri, ONTO.customerStatus, ONTO.Active if row.status == 'active' else ONTO.Inactive))
    
    return g.serialize(format='turtle')

# Collect RDF triples
rdf_triples = customers.rdd.map(lambda row: customer_to_rdf(row.asDict()))

# Write to RDF storage (Jena TDB2 or S3)
rdf_triples.saveAsTextFile("s3://bucket/rdf-gold/customers")

# Also write orders, payments, tickets relationships...
# (similar transformation pattern)

spark.stop()
```

Schedule transformation:
```bash
# Airflow DAG
with DAG('rdf_transformation', schedule_interval='@daily') as dag:
    transform_task = SparkOperator(
        task_id='transform_to_rdf',
        application='medallion/phase-2-rdf-transform.py',
        conf={"spark.executor.memory": "4g"}
    )
```

## Step 7: Deploy Semantic Federated Query Gateway

Deploy Presto cluster with SPARQL connector:

```yaml
# presto/etc/catalog/semantic.properties
connector.name=elasticsearch
elasticsearch.host=jena-server
elasticsearch.port=3030
```

Or use native Jena TDB2 setup:

```bash
# Install Jena Fuseki (SPARQL server)
docker run -d \
  -p 3030:3030 \
  -v /data/tdb2:/fuseki/databases \
  -e ADMIN_PASSWORD=<password> \
  stain/jena-fuseki:latest

# Load RDF triples
curl -X POST \
  http://localhost:3030/trendcart/data \
  -H "Content-Type: application/rdf+xml" \
  -d @triples.rdf
```

Expose SPARQL endpoint:
```bash
# Port-forward or expose via Ingress
kubectl port-forward svc/jena-fuseki 3030:3030
```

## Step 8: Run Example Queries & Validate

Test SPARQL endpoint:

```bash
# Query 1: Active Customers
curl -X GET 'http://localhost:3030/trendcart/sparql?query=PREFIX%20:%20%3Chttps://trendcart.com/ontology%23%3E%0ASELECT%20%3Fcustomer%20%3Fname%20WHERE%20%7B%0A%20%20%3Fcustomer%20a%20:Customer%20%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20:customerStatus%20:Active%20%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20:hasName%20%3Fname%20.%0A%7D%0ALIMIT%20100'

# Query 2: Churn Risk (from example-queries.md)
curl -X GET 'http://localhost:3030/trendcart/sparql' \
  -d @query-churn-risk.rq \
  -H "Accept: application/json"
```

Expected result: JSON with `head` and `results` sections containing customer IRIs and aggregations.

## Step 9: Configure Monitoring & Alerting

Set up observability:

```yaml
# prometheus/prometheus.yml
scrape_configs:
  - job_name: 'iri-minter'
    static_configs:
      - targets: ['iri-minter:8000']
  
  - job_name: 'jena-fuseki'
    static_configs:
      - targets: ['jena-fuseki:3030']

# alerts
  - alert: HighIRIMinterLatency
    expr: histogram_quantile(0.99, iri_minter_request_duration_seconds) > 2
    annotations:
      summary: "IRI minter latency > 2s"

  - alert: RDFGoldIngestDelay
    expr: time() - rdf_gold_last_update_timestamp > 86400
    annotations:
      summary: "RDF Gold not updated in 24h"
```

## Step 10: Onboard BI Tools & Enable Self-Service

### Looker Integration

Create view on silver + SPARQL federated data:

```looker
view: customers_semantic {
  sql_table_name: public.customers_semantic ;;
  
  dimension: iri {
    primary_key: yes
    type: string
    sql: ${TABLE}.iri ;;
  }
  
  dimension: email { ... }
  dimension: churn_risk_category {
    type: string
    sql: CASE
      WHEN ${open_tickets} >= 3 AND ${failed_payments} >= 1 THEN 'High'
      WHEN ${open_tickets} >= 2 OR ${failed_payments} >= 1 THEN 'Medium'
      ELSE 'Low'
    END ;;
  }
  
  measure: count { type: count }
}
```

### Tableau Integration

Connect to Presto federated gateway:
- Server: `presto-coordinator:8080`
- Database: `semantic` catalog
- Tables: `silver.customers`, `silver.orders`, etc.

## Operational Runbook

### Daily Checks

```bash
# Check CDC lag
kafka-consumer-groups --group debezium-shopify --reset-offsets --to-latest --dry-run

# Verify silver table freshness
spark-sql -e "SELECT MAX(ingest_timestamp) FROM silver.customers"

# SPARQL endpoint health
curl http://localhost:3030/trendcart/sparql?query=SELECT%20*%20WHERE%20{%20?s%20?p%20?o%20}%20LIMIT%201

# IRI minter uptime
curl http://iri-minter:8000/health
```

### Common Issues

**IRI Minter Rate Limiting**: Increase Redis connection pool size and add Presto-level caching.

**RDF Store Out of Disk**: Partition RDF triples by month; archive old partitions to cold storage.

**Slow SPARQL Queries**: Add SPARQL query indices on frequently filtered properties (`:hasStatus`, `:hasEmail`).

## Next Steps

1. **Extend Ontology**: Add product affinity, customer lifetime value, churn probability dimensions
2. **Real-Time Queries**: Deploy SPARQL federation for sub-second latency on dashboards
3. **ML Integration**: Extract entity embeddings from RDF graph for feature engineering
4. **Governance**: Implement data lineage tracking and policy enforcement via RDF metadata

---

**Total deployment time: 3-5 business days** (depends on existing medallion maturity and CDC connector setup)
