# Phase 2: Semantic Unification - Example Queries

This document provides 5 worked query examples demonstrating the power of unified semantic queries against the TrendCart e-commerce ontology. All queries are executable against the SPARQL endpoint (`/sparql`) or the federated SQL gateway.

## Query 1: Active Customers (Simple SPARQL)

**Objective**: Retrieve all active customers with name and join date.

**SPARQL**:
```sparql
PREFIX : <https://trendcart.com/ontology#>

SELECT ?customer ?name ?joinDate ?tier
WHERE {
  ?customer a :Customer ;
           :customerStatus :Active ;
           :hasName ?name ;
           :joinDate ?joinDate ;
           :inTier ?tier .
}
ORDER BY ?name
LIMIT 100
```

**Explanation**:
- `a :Customer` matches the customer class
- `:customerStatus :Active` filters for engaged customers (not churned)
- Triple patterns bind attributes to variables
- `ORDER BY` and `LIMIT` provide pagination

**Expected Result** (sample):
```
customer                                     | name              | joinDate   | tier
─────────────────────────────────────────────┼──────────────────┼────────────┼──────
https://trendcart.com/customer/c001          | Alice Johnson    | 2023-01-15 | Gold
https://trendcart.com/customer/c002          | Bob Smith        | 2023-02-20 | Silver
https://trendcart.com/customer/c003          | Charlie Brown    | 2023-03-10 | Gold
```

---

## Query 2: Churn Risk (Complex SPARQL with Aggregation)

**Objective**: Identify customers at high churn risk: those with 3+ open support tickets AND 1+ failed payment in past 90 days.

**SPARQL**:
```sparql
PREFIX : <https://trendcart.com/ontology#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?customer ?name ?openTicketCount ?failedPaymentCount
WHERE {
  ?customer a :Customer ;
           :hasName ?name ;
           :customerStatus :Active .
  
  # Subquery 1: Count open support tickets
  {
    SELECT ?customer (COUNT(?ticket) AS ?openTicketCount)
    WHERE {
      ?customer :hasSupportTicket ?ticket .
      ?ticket :hasStatus :Open .
    }
    GROUP BY ?customer
    HAVING (COUNT(?ticket) >= 3)
  }
  
  # Subquery 2: Count failed payments in past 90 days
  {
    SELECT ?customer (COUNT(?payment) AS ?failedPaymentCount)
    WHERE {
      ?customer :hasFailedPayment ?payment .
      ?payment :paymentDate ?paymentDate .
      BIND(NOW() - ?paymentDate AS ?daysSince)
      FILTER (?daysSince <= "P90D"^^xsd:duration)
    }
    GROUP BY ?customer
    HAVING (COUNT(?payment) >= 1)
  }
}
ORDER BY DESC(?openTicketCount) DESC(?failedPaymentCount)
```

**Explanation**:
- Two sub-SELECTs aggregate ticket counts and payment failures independently
- `HAVING` clauses enforce thresholds (≥3 tickets, ≥1 failed payment)
- `FILTER` with duration arithmetic excludes payments older than 90 days
- Results ordered by risk severity

**Expected Result** (sample):
```
customer                                     | name              | openTicketCount | failedPaymentCount
─────────────────────────────────────────────┼──────────────────┼─────────────────┼───────────────────
https://trendcart.com/customer/c045          | Diana Evans      | 5               | 2
https://trendcart.com/customer/c102          | Eve Wilson       | 4               | 1
https://trendcart.com/customer/c087          | Frank Adams      | 3               | 3
```

---

## Query 3: Customer 360° View (Federated SQL)

**Objective**: Unified customer profile blending silver dimensional data with semantic relationships.

**SQL** (via Presto/Trino federated query):
```sql
SELECT 
  c.iri,
  c.email,
  c.name,
  c.tier,
  COUNT(DISTINCT o.order_id) AS order_count,
  SUM(o.amount) AS total_spent,
  MAX(o.order_timestamp) AS last_order_date,
  COUNT(DISTINCT st.ticket_id) AS open_ticket_count,
  AVG(st.sentiment_score) AS avg_ticket_sentiment,
  COUNT(DISTINCT pf.payment_id) AS failed_payment_count
FROM silver.customers c
LEFT JOIN silver.orders o
  ON c.id = o.customer_id
LEFT JOIN silver.support_tickets st
  ON c.id = st.customer_id AND st.status = 'open'
LEFT JOIN silver.payments pf
  ON c.id = pf.customer_id AND pf.status = 'failed'
WHERE c.email IS NOT NULL
GROUP BY c.iri, c.email, c.name, c.tier
HAVING COUNT(DISTINCT o.order_id) > 0
ORDER BY total_spent DESC
LIMIT 50
```

**Explanation**:
- Pulls from silver tables (not RDF), making this a fast operational query
- Aggregates orders, tickets, and failures per customer
- `LEFT JOIN` captures customers with zero items in any category
- `HAVING` filters to customers with at least one order

**Expected Result** (sample):
```
iri                                          | email                  | name           | tier   | order_count | total_spent | last_order_date | open_ticket_count | avg_ticket_sentiment | failed_payment_count
────────────────────────────────────────────┼────────────────────────┼────────────────┼────────┼─────────────┼─────────────┼─────────────────┼───────────────────┼──────────────────────┼──────────────────────
https://trendcart.com/customer/c001          | alice@example.com      | Alice Johnson  | Gold   | 18          | $8,432.99   | 2026-05-28      | 0                 | NULL                 | 0
https://trendcart.com/customer/c012          | bob@example.com        | Bob Smith      | Silver | 12          | $4,221.50   | 2026-05-15      | 2                 | 0.62                 | 1
```

---

## Query 4: Cross-Source Revenue Aggregation (SPARQL)

**Objective**: Calculate total revenue per customer across all orders using semantic queries.

**SPARQL**:
```sparql
PREFIX : <https://trendcart.com/ontology#>

SELECT ?customer ?name ?totalRevenue
WHERE {
  ?customer a :Customer ;
           :hasName ?name ;
           :hasOrder ?order .
  ?order :amount ?orderAmount ;
         :hasStatus :Completed .
  
  {
    SELECT ?customer (SUM(?orderAmount) AS ?totalRevenue)
    WHERE {
      ?customer :hasOrder ?order .
      ?order :amount ?orderAmount ;
             :hasStatus :Completed .
    }
    GROUP BY ?customer
  }
}
ORDER BY DESC(?totalRevenue)
LIMIT 20
```

**Explanation**:
- `:hasOrder` relationship traverses customer-to-order links
- Filters on `:Completed` status to exclude pending/cancelled orders
- Aggregation subquery sums amounts per customer
- Outer query retrieves customer name alongside aggregate

**Expected Result** (sample):
```
customer                                     | name              | totalRevenue
─────────────────────────────────────────────┼──────────────────┼──────────────
https://trendcart.com/customer/c001          | Alice Johnson    | $8,432.99
https://trendcart.com/customer/c003          | Charlie Brown    | $6,891.50
https://trendcart.com/customer/c012          | Bob Smith        | $4,221.50
```

---

## Query 5: Duplicate Detection via IRI Consolidation (SPARQL)

**Objective**: Find potential duplicate customers (same email address across IRIs), indicating deduplication misses or manual review needs.

**SPARQL**:
```sparql
PREFIX : <https://trendcart.com/ontology#>

SELECT ?customer1_iri ?customer1_name ?customer2_iri ?customer2_name ?email
WHERE {
  ?customer1 a :Customer ;
            :hasEmail ?email ;
            :hasName ?customer1_name .
  
  ?customer2 a :Customer ;
            :hasEmail ?email ;
            :hasName ?customer2_name .
  
  BIND(IRI(STR(?customer1)) AS ?customer1_iri)
  BIND(IRI(STR(?customer2)) AS ?customer2_iri)
  
  FILTER (?customer1_iri < ?customer2_iri)  # Avoid symmetric duplicates
  FILTER (?customer1 != ?customer2)         # Exclude self-joins
}
ORDER BY ?email
LIMIT 20
```

**Explanation**:
- Two customer patterns both match on `:hasEmail`
- `FILTER (?customer1_iri < ?customer2_iri)` ensures each pair appears once
- `FILTER (?customer1 != ?customer2)` excludes reflexive matches
- Sorted by email to group suspected duplicates
- Results indicate deduplication errors needing manual review

**Expected Result** (sample):
```
customer1_iri                                | customer1_name       | customer2_iri                              | customer2_name       | email
──────────────────────────────────────────────┼──────────────────────┼────────────────────────────────────────────┼──────────────────────┼─────────────────────
https://trendcart.com/customer/c045          | Diana Evans (v1)     | https://trendcart.com/customer/c156        | Diana Evans (v2)     | diana@example.com
https://trendcart.com/customer/c089          | George Hall Jr.      | https://trendcart.com/customer/c201        | George Hall          | george@example.com
```

---

## Query Execution and Performance Notes

### SPARQL Endpoint Performance

**Query 1 (Active Customers)**: 
- Execution: ~100ms
- Rows returned: typically 2000-5000 active customers
- Index: Scans `:customerStatus` property index

**Query 2 (Churn Risk)**:
- Execution: ~500ms-1s (aggregation complexity)
- Rows returned: 50-500 churn-risk customers
- Optimization: Pre-computed materialized view of ticket/payment counts (optional)

**Query 5 (Duplicate Detection)**:
- Execution: ~200-300ms
- Rows returned: 10-100 suspected duplicates
- Optimization: Indexes on `:hasEmail` property essential

### Federated Query Performance (Query 3)

- **SQL Execution**: ~2-5 seconds (silver tables are Delta format, vectorized)
- **Data Source**: Delta Lake on S3/GCS (partitioned by `customer_id`)
- **Optimization**: Partition pruning on `customer_id` reduces scan scope

### Tips for Query Optimization

1. **Use FILTER early**: Move filtering (e.g., `:hasStatus :Open`) into WHERE clause before aggregations
2. **Index properties**: Ensure SPARQL endpoint has B-tree indices on frequently filtered properties (`:hasStatus`, `:customerStatus`, `:hasEmail`)
3. **Materialized views**: For expensive aggregations (ticket counts per customer), maintain materialized views updated nightly
4. **Federated vs. SPARQL**: Use SQL for operational (silver) queries; SPARQL for exploratory semantic navigation
5. **LIMIT results**: Always paginate with `LIMIT` and `OFFSET` for large result sets

---

## Integration with BI Tools

All queries are accessible via:

1. **Looker** (SPARQL via JDBC connector + custom view layer)
2. **Tableau** (federated SQL gateway via Presto JDBC)
3. **Superset** (direct SPARQL endpoint query)
4. **Python/R** (via `requests` library to `/sparql` HTTP endpoint)

Example Python client:

```python
import requests
import json

# Query active customers
sparql_query = """
PREFIX : <https://trendcart.com/ontology#>
SELECT ?customer ?name WHERE {
  ?customer a :Customer ;
           :customerStatus :Active ;
           :hasName ?name .
}
LIMIT 100
"""

response = requests.get(
    "https://api.trendcart.com/sparql",
    params={"query": sparql_query, "format": "json"},
    headers={"Authorization": "Bearer <token>"}
)

results = response.json()["results"]["bindings"]
for row in results:
    print(f"{row['name']['value']}: {row['customer']['value']}")
```

---

## Comparison: Before and After Semantic Unification

### Before (Manual SQL)
```sql
-- 200+ lines of complex joins and CTEs
-- Hard to understand domain logic buried in SQL syntax
-- Brittle to schema changes
-- Requires data engineering review for modifications
```

### After (Semantic Queries)
```sparql
-- 15-25 lines of declarative SPARQL
-- Domain logic visible in ontology classes and properties
-- Robust to silver table schema changes
-- Self-service for domain experts (business analysts, analysts)
```

**Estimated time-to-insight reduction: 3-5 days → 2-4 hours**
