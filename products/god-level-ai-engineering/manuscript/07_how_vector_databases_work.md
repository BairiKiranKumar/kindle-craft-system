# Concept 7: How Vector Databases Work

Vector databases are specialized storage engines optimized for indexing, querying, and updating high-dimensional vector embeddings at scale. While relational databases excel at exact matches (`WHERE id = 42`) and scalar ranges (`WHERE age > 30`), they cannot natively search for conceptual similarity across unstructured text, images, or audio.

---

## 7.1 Understanding High-Dimensional Embeddings

An **embedding model** (such as `text-embedding-3-small` or `bge-large-en`) projects unstructured text into a dense vector of floating-point numbers in a continuous vector space:

$$\vec{v} \in \mathbb{R}^D \quad (D = 768, 1536, \text{or } 3072)$$

In this geometric space, semantic similarity corresponds to geometric proximity: words and concepts sharing semantic contexts are mapped to vectors pointing in nearly identical directions.

---

## 7.2 Distance Metrics

To measure proximity between vectors $\vec{u}$ and $\vec{v}$, vector databases support three primary metrics:

### 1. Cosine Similarity
Measures the cosine of the angle between two vectors, completely invariant to vector magnitude:

$$\text{Cosine}(\vec{u}, \vec{v}) = \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\|_2 \|\vec{v}\|_2}$$

### 2. Euclidean Distance (L2)
Measures the straight-line geometric distance between two coordinate points:

$$d_{\text{L2}}(\vec{u}, \vec{v}) = \sqrt{\sum_{i=1}^D (u_i - v_i)^2}$$

### 3. Dot Product (Inner Product)
If vectors are unit-normalized ($\|\vec{u}\| = 1$), the dot product is mathematically equivalent to cosine similarity but requires significantly fewer CPU/GPU instructions:

$$\text{Dot}(\vec{u}, \vec{v}) = \sum_{i=1}^D u_i v_i$$

---

## 7.3 Why Exact Search (k-NN) Fails at Scale

Finding the exact nearest neighbors requires computing distance between the query vector and **every single vector in the database**:

$$\text{Complexity: } O(N \times D)$$

For 10,000,000 vectors with dimension $D=1536$, a single query demands **over 15 billion floating-point operations** and reading 61 Gigabytes of memory from disk. Latency exceeds several seconds.

---

## 7.4 Approximate Nearest Neighbors (ANN)

Vector databases trade 100% exact recall for sub-10ms search speeds by using **Approximate Nearest Neighbor (ANN)** indexing algorithms:

1. **Inverted File Index (IVF):** Partitions vector space into $K$ Voronoi clusters. At query time, the system identifies the closest cluster centroids and only searches vectors within those clusters, ignoring 95% of the database.
2. **Product Quantization (PQ):** Compresses 32-bit floating-point numbers into 8-bit cluster indices, reducing memory footprint by up to 90% and enabling vector distance computation using fast hardware lookup tables.
3. **Hierarchical Navigable Small World (HNSW):** Constructs multi-layer graph structures where search hops down layers with logarithmic $O(\log N)$ complexity. (Explored in detail in Concept 16).
