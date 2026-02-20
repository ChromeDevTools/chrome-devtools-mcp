---
name: flowise
description: a complete comprehensive overview of how to use Flowise and all of its corresponding features. Use this skill when you are asked to use Flowise or to create or edit Flowise projects.
---

Flowise AI: The Definitive Architectural and Technical Grounding Manual

1. Ecosystem Overview and Platform Identity

Flowise AI is an open-source generative AI development platform engineered to orchestrate complex AI Agents and Large Language Model (LLM) workflows. Unlike simple completion interfaces, Flowise serves as a sophisticated orchestration layer that enables the construction of multi-step, stateful systems. It abstracts the programmatic complexity of the LangChain and LlamaIndex frameworks into a modular, node-based visual architecture, allowing architects to design robust RAG pipelines and autonomous agentic systems.

The platform provides three primary visual builders tailored to specific architectural requirements:

Builder Type	Complexity Level	Target Use Cases	Core Capabilities
Assistant	Beginner	Instructional chat assistants, basic file-based RAG.	Follows instructions, uses tools, knowledge retrieval from uploaded files.
Chatflow	Intermediate	Single-agent systems, flexible LLM flows.	More flexible than Assistant; supports Graph RAG, Reranking, and complex node routing.
Agentflow	Advanced	Multi-agent orchestration, complex workflows.	Superset of all capabilities; handles sequential and multi-agent systems with branching logic.

The modularity of Flowise requires a rigorous understanding of the deployment environment and configuration constraints to ensure that the abstracted framework logic translates into stable, production-ready execution.

2. Deployment Architectures and Environment Configuration

Standardizing the deployment environment is critical for maintaining persistence and security across AI applications. Flowise supports flexible setup paths, from local development to containerized orchestration.

Setup Methods:

* Quick Start (NPM): Local execution via npm install -g flowise and npx flowise start.
* Containerized (Docker): Standardized deployment using docker-compose up -d.
* For Developers (PNPM): A monorepo configuration build using pnpm install and pnpm build across the four core modules: Server, UI, Components, and Api Documentation.

Critical Environment Variables: Technical stability is governed by specific variables in the packages/server/.env file:

* Data Persistence:
  * DATABASE_TYPE: Persistence layer (sqlite, mysql, postgres). Default: sqlite.
  * DATABASE_PATH: Default location is your-home-dir/.flowise.
  * DATABASE_SSL: Boolean for secure database connections. Default: false.
* Storage Management:
  * STORAGE_TYPE: Defines where images, audio, and Assistant-generated files are stored (local, s3, gcs). Default: local.
  * FLOWISE_FILE_SIZE_LIMIT: Critical constraint for file handling. Default: 50mb.
* Security & Networking:
  * PORT: HTTP port (Default: 3000).
  * NUMBER_OF_PROXIES: Critical for rate limiting when behind a load balancer; must be adjusted until the system correctly identifies the client IP via /api/v1/ip.
  * FLOWISE_SECRETKEY_OVERWRITE: A persistent key to prevent "Credentials could not be decrypted" errors if the default random key is regenerated.

Choosing Postgres and S3 is recommended for production to ensure high availability and horizontal scalability, as local SQLite and file storage lack concurrent handling for high-volume agentic traffic.

3. The LangChain Integration: Agents, Chains, and Reasoning

Flowise utilizes LangChain to provide the reasoning logic for AI interactions. Agents serve as reasoning engines that determine tool use, while Chains manage the sequence of conversation turns and context.

Agent Nodes:

* Reasoning Engines: ReAct Agent Chat, ReAct Agent LLM, AutoGPT, BabyAGI.
* Specialized Agents: Airtable Agent, CSV Agent, XML Agent, MistralAI Tool Agent.
* Provider Managed: OpenAI Assistant.

Chain Nodes:

* Query & QA: Retrieval QA Chain, Multi Retrieval QA Chain, VectorDB QA Chain, Sql Database Chain.
* API & Logic: GET API Chain, POST API Chain, OpenAPI Chain, LLM Chain.
* Conversational: Conversation Chain, Conversational Retrieval QA Chain.

Analytical Insight: Contextual Management The system differentiates between the Input Chain (user message) and Output Chain (model response). Performance is governed by the Maximum Length setting; as chains grow, older messages are truncated to preserve computational resources. This truncation directly impacts memory nodes, potentially leading to context loss in long-running reasoning tasks.

4. Model Orchestration: Chat Models, LLMs, and Embeddings

Selecting the correct model type is foundational to system performance. Chat Models are optimized for message-based history, while traditional LLM nodes are primarily used for completion tasks.

Supported Provider Nodes:

* Chat Models: AWS ChatBedrock, ChatOpenAI, ChatGoogleGenerativeAI, ChatMistralAI, ChatOllama, ChatAnthropic, ChatCohere, GroqChat.
* Traditional LLMs: AWS Bedrock, OpenAI, GoogleVertex AI, Azure OpenAI, HuggingFace Inference, Replicate.
* Embeddings: AWS Bedrock Embeddings, OpenAI Embeddings, Google GenerativeAI Embeddings, VoyageAI Embeddings, LocalAI Embeddings.

Strategic Role of Embeddings: Beyond simple search, embeddings enable high-level architectural features:

* Anomaly Detection: Identifying outliers with low relatedness to the established knowledge base.
* Diversity Measurement: Analyzing similarity distributions to ensure a broad range of retrieved context.
* Clustering: Grouping related text strings to optimize the retrieval of semantically similar "chunks."

5. Data Frameworks and Knowledge Retrieval (LlamaIndex)

LlamaIndex provides the specialized framework for ingesting and structuring domain-specific data, serving as the backbone for advanced RAG systems.

LlamaIndex Engine Nodes:

* Query Engine: Direct retrieval.
* Simple/Context Chat Engine: Stateful interaction with knowledge.
* Sub-Question Query Engine: Essential for complex query decomposition, where a single user prompt is broken into multiple sub-queries against different data nodes.

Response Synthesizer Modes:

1. Refine: Iteratively updates the answer by processing each retrieved node (High accuracy, slower).
2. Compact and Refine: Merges nodes into fewer LLM calls before refining (Balanced efficiency).
3. Simple Response Builder: The fast, direct baseline; generates a response from all nodes in one call.
4. Tree Summarize: Hierarchically summarizes nodes to provide high-level syntheses.

6. Data Ingestion: Document Loaders, Splitters, and Vector Stores

Flowise supports a pipeline that transforms unstructured data into searchable vectors across 100+ sources.

* Document Loaders: PDF Files, Csv File, Notion, S3 File Loader, Github, Cheerio Web Scraper, Playwright Web Scraper.
* Text Splitters: Recursive Character Text Splitter, Code Text Splitter, Markdown Text Splitter, Token Text Splitter.
* Vector Stores: Pinecone, Milvus, Postgres, Qdrant, AstraDB, Weaviate. Note: Pinecone, Milvus, and Postgres are required for the on-the-fly RAG File Upload feature.

The "So What?" of Text Splitting: Chunk size and overlap determine retrieval relevance. Granularity can be customized by split type (e.g., character) or token count. If chunks are too small, the agent loses semantic context; if too large, irrelevant noise dilutes vector similarity, directly degrading the accuracy of the RAG system.

7. Operational Logic: Memory, Variables, and Tools

State management allows for human-like interaction and dynamic execution through memory nodes (e.g., Buffer Memory, Redis-Backed, Zep Memory).

Syntax and Variable Execution:

* $vars.<name>: Reserved for Functions within nodes like Custom Tool, Custom Function, or Custom MCP.
* {{$vars.<name>}}: Reserved for Text Inputs, such as System Messages or Prompt Templates.

Runtime Variables: Runtime variables allow for session-specific overrides via the API's overrideConfig. For the Prediction API, a unique sessionId must be specified in overrideConfig to maintain separate conversation states for multiple users.

8. External Interaction: Tools and MCP Integration

Tools allow Agents to interact with external systems. Flowise integrates the Model Context Protocol (MCP) to standardize these interactions.

* Tool Nodes: BraveSearch API, Calculator, Web Browser, Custom Tool.
* MCP Protocols:
  * stdio: The default protocol; requires command execution on the host system.
  * sse: Server-Sent Events over HTTP; recommended for production due to superior security and isolation.

Security Constraints: Security is enforced through the CUSTOM_MCP_SECURITY_CHECK (Default: true). When active, it applies a Command Allowlist (node, npx, python, etc.) and performs Injection Prevention against shell metacharacters. Additionally, the HTTP_DENY_LIST environment variable allows architects to block requests to specific internal domains.

9. Advanced Implementation: API, Streaming, and Security

Moving from prototype to production requires implementing architectural constraints for scale and user experience.

File Upload Precedence: Flowise supports two file architectures:

1. RAG File Uploads: Upserts files to a vector store on the fly. Best for token efficiency in large documents.
2. Full File Uploads: Injects the entire file string into the prompt. Best for summarization and full-context analysis. Architectural Rule: When both options are enabled, Full File Uploads take precedence.

Streaming and Rate Limiting: The Streaming API utilizes Server-Sent Events (SSE). Developers must handle the following specific event types: start, token, error, end, metadata, sourceDocuments, and usedTools.

Rate Limiting is tracked by IP-address. In a load-balanced environment, NUMBER_OF_PROXIES must be configured. If the returned IP from /api/v1/ip does not match the client, increment NUMBER_OF_PROXIES by 1 until parity is achieved. This ensures that the system accurately enforces message limits per duration to prevent service abuse.
