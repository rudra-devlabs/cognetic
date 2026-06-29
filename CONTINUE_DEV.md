# 🧠 Cognetic — Developer Handoff Document
### *"Bring Intelligence from Anywhere"*

---

> **👋 Hey there, future developer!**
>
> So you've opened this file. Maybe you're Rudra coming back after a long break, coffee in hand, wondering where you left off. Maybe you're a contributor who stumbled across this repo and thought *"wait, this looks interesting."* Either way — **welcome to Cognetic**.
>
> This document won't bore you with dry corporate handoff language. It's a real, honest account of what was built, what wasn't, what's broken, and where this thing is headed. As of **June 29, 2026**, the original developer stepped away for a ~7–8 month break. This file exists so that no momentum is lost — and no time is wasted figuring out what the heck is going on.
>
> Grab a drink. Let's walk through it together.

---

## 📌 The Vision

Cognetic was born from a simple but powerful idea:

> **The best agentic AI assistant should not be locked to a single intelligence source.**

Most AI applications force you to use *their* model with *their* API. Cognetic says no. The slogan —
**"Bring Intelligence from Anywhere"** — is not marketing. It's the core architectural principle.

Think about it: why should your AI assistant be shackled to one company's servers? What if the best model for writing code is on Nvidia, the best for reasoning is on Anthropic, and you want to run your private data through a local Ollama instance? Cognetic is the tool that lets you do exactly that — switch, mix, and match intelligence sources as freely as you switch browser tabs.

Cognetic is a **native desktop AI agent** (built with Tauri + Rust backend + vanilla JS frontend) that allows users to:
- 🌐 Connect to any LLM provider from any part of the world — commercial, local, or custom
- 🤖 Build autonomous agents that can write code, browse the web, search the internet, read/write files, and run commands on the user's machine
- 📁 Organize conversations into projects scoped to specific directories
- 🔌 Extend and integrate with third-party services and data sources through a connector system

The product is aimed at power users, developers, and researchers who want maximum flexibility without sacrificing UX polish. And yes — it looks great doing it.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Runtime** | [Tauri 2.x](https://tauri.app/) |
| **Backend** | Rust (`reqwest`, `regex`, `walkdir`, `glob`) |
| **Frontend** | Vanilla JavaScript (ES Modules, no React) |
| **UI Framework** | Vanilla CSS + custom design system |
| **Icon Set** | Lucide Icons (static) |
| **Markdown Rendering** | `marked.js` |
| **Build Tool** | Vite 8.x |
| **State Management** | Custom `StateManager` class (`src/core/state.js`) |
| **Routing** | Custom single-file router (`src/core/router.js`) |

### Why Tauri and Not Electron?
Tauri uses the OS native webview (WebView2 on Windows, WebKit on macOS) instead of bundling Chromium. This results in ~10x smaller bundle sizes and much lower memory overhead — critical for an app designed to run AI workloads locally.

### Why Vanilla JS?
Speed of iteration during the prototyping phase. The codebase is now large enough that migrating to a component framework (Svelte is strongly recommended — see AI Suggestions below) would be a significant but worthwhile investment.

---

## 📁 Project Structure

```
agent-framework/
├── src/
│   ├── core/
│   │   ├── llmService.js      # LLM provider dispatch, callOpenAI/Anthropic/Google
│   │   ├── toolEngine.js      # Agent tool executor (search_web, fetch_url, filesystem, etc.)
│   │   ├── state.js           # Global state manager, persisted to localStorage
│   │   ├── router.js          # Client-side SPA router
│   │   └── tauri.js           # Tauri utility helpers
│   ├── views/
│   │   ├── home/              # Main chat interface (Home.js is the largest file ~115KB)
│   │   ├── agents/            # Provider/API key management (Agents.js + providers.json)
│   │   ├── browser/           # In-app browser view (stub — not fully implemented)
│   │   ├── channels/          # Channels/integrations view (stub)
│   │   └── connectors/        # Data source connectors view (stub)
│   ├── config/
│   │   └── systemPrompt.js    # The master system prompt for the agent
│   └── assets/
│       └── icons/             # All provider and UI icons (SVGs)
├── src-tauri/
│   └── src/
│       └── lib.rs             # ALL Rust backend commands live here (single file)
├── providers.json             # Master list of all providers, their base URLs, and model IDs
├── vite.config.js
└── CONTINUE_DEV.md            # ← You are here
```

---

## ✅ What Has Been Implemented

### 1. Core Chat Engine
- **Multi-turn conversation**: Full conversation history is maintained and sent to the LLM on every turn.
- **Project-scoped chats**: Users can create "Projects" linked to specific directories on disk. When active, the agent's system prompt is restricted to those paths.
- **Global chats**: Standard free-form conversations with no project context.
- **Conversation persistence**: All chats, messages, and settings are persisted to `localStorage` via `StateManager`.
- **Markdown rendering**: AI responses are rendered as styled markdown with syntax highlighting.
- **Stop/Cancel generation**: Users can cancel mid-generation using an AbortController signal.
- **Token & speed stats**: Each AI response shows `input tokens`, `output tokens`, and `tokens/sec`.

### 2. Intent Analyzer
A lightweight two-model architecture:
- **Intent Analyzer Model**: A fast, cheap model that classifies each user message before sending it to the main LLM. It determines: `intent (chat|action)`, `needs_project_context`, `needs_image_analysis`, `needs_tools`, `complexity_score`, `confidence`.
- **Main Model**: Receives the classified, context-aware request.
- This avoids wasting tool-call overhead on simple conversational messages.

### 3. Agentic Tool Engine (`toolEngine.js`)
The agent can autonomously use the following tools (defined via XML-style `<tool name="...">` blocks in the LLM response):

| Tool | Description |
|---|---|
| `get_current_dir` | Returns the active working directory |
| `date` | Returns current date and time |
| `read_file` | Reads a file from disk |
| `write_file` | Writes content to a file |
| `edit_file` | Edits specific lines or target text in a file |
| `readlines` | Reads a specific line range from a file |
| `writelines` | Overwrites a specific line range in a file |
| `list_files` | Lists contents of a directory |
| `search_files` | Searches file contents for a query string |
| `glob` | Glob-pattern file matching |
| `grep` | Regex search across files |
| `tree` | Prints directory tree structure |
| `delete_path` | Deletes a file or directory |
| `rename_path` | Renames/moves a file or directory |
| `create_directory` | Creates a new directory |
| `run_command` | Executes a shell command (PowerShell/bash) |
| `path_stats` | Returns metadata about a path |
| `search_web` | Searches the web via Tavily, Jina, Brave, Bing, SerpAPI, or DuckDuckGo scraping |
| `fetch_url` | Fetches and converts a URL to Markdown using Jina Reader |
| `next_search_batch` | Paginated reading of large fetched pages |

> ⚠️ All filesystem tools go through `resolve_and_validate_path` in Rust, which prevents directory traversal attacks. The agent cannot access files outside the user-defined project paths.

### 4. Multi-Provider LLM Support
Cognetic supports a huge range of providers via `providers.json`. The current list includes:

- **Commercial APIs**: OpenAI, Anthropic, Google AI Studio, Grok (xAI), Nvidia NIM, Groq, Cerebras, OpenRouter, Fireworks AI, Vercel AI Gateway, Alibaba Cloud (Qwen), Opencode Zen
- **Local Runners**: Ollama, LM Studio
- **Custom**: OpenAI Compatible (any API that follows the OpenAI chat completions format), Anthropic Compatible

Each provider entry contains:
- `baseUrl`: The root URL (no path or version suffix — versioning is appended programmatically)
- `apiPath`: The version prefix (e.g., `/v1`) to append before the endpoint
- `models`: List of known model IDs for that provider
- `icon`: Path to the provider's SVG logo
- `link`: URL to the provider's API key dashboard

### 5. Native Rust HTTP Backend (CORS-Free Networking)
> **This was the last major feature implemented before the break.**

All LLM API calls, web search requests, and URL fetches are routed through a native Rust Tauri command (`perform_http_request`) instead of the browser's `fetch()` API. This completely eliminates CORS errors when connecting to APIs that do not support browser preflight requests (e.g., Nvidia NIM, Opencode Zen).

The Rust command accepts: `url`, `method`, `headers` (HashMap), `body`.
It returns: `{ status: u16, text: String }`.

This is defined in `src-tauri/src/lib.rs` as `async fn perform_http_request`.

### 6. API Key Validation System
When saving a provider API key, the system:
1. Sends a real test request (using the first model from the provider's model list) via the Rust backend
2. If it receives `200/201/400/404/422` → Key is valid (the API accepted it, but our dummy request may have a bad payload — that's fine)
3. If it receives `401/403` → Key is invalid — shows a beautiful error card with structured error details (status code, message, raw JSON)
4. If it receives a network error → Shows a network error card

### 7. Force Save Button
Alongside the "Save & Validate" button, there is a "Force Save" button that bypasses validation and saves the key without any API check — useful for local providers (Ollama, LM Studio) that don't require keys.

### 8. State Architecture
`StateManager` (`src/core/state.js`) handles all global state:
- Persists to `localStorage` under the key `Cognetic_state`
- Manages: `activeModel`, `intentAnalyzerModel`, `providers` (per-provider API keys and custom models), `integrations` (web search/fetch config), `projects`, `chats`, `activeProjectId`, `activeChatId`
- Broadcasts change notifications to registered listeners via `notify()`

### 9. Projects System
- Users can create named Projects, each linked to one or more folder paths on disk
- When a project is active, the agent's context and filesystem access is scoped to those folders
- Projects contain nested chats
- Project metadata is persisted in state

### 10. Image Uploads in Chat
- Users can attach images to their messages
- Images are sent to the LLM in the appropriate format (OpenAI `image_url` base64, Anthropic `source.type: base64`, Google `inlineData`)
- Stats display correctly even with multimodal messages

### 11. Channels View (UI Only — Stub)
A navigation section exists for "Channels" but only has UI scaffolding. No real functionality implemented.

### 12. Connectors View (UI Only — Stub)
A navigation section exists for "Connectors" (data source integrations) but only has UI scaffolding. No real functionality implemented.

### 13. Browser View (UI Only — Stub)
A navigation section exists for an in-app browser. Only UI scaffolding exists.

---

## 🚧 What Is NOT Implemented (The Backlog)

This is the honest list of what was planned but not built. These range from quick wins to multi-week features.

### High Priority — Core Features

#### 1. Streaming LLM Responses
The current `callOpenAI`, `callAnthropic`, and `callGoogleAI` implementations use `stream: false` — they wait for the entire response before displaying it. This causes noticeable delay, especially with large responses. 

**The Challenge:** `perform_http_request` in Rust returns the full body at once. Streaming requires Tauri's event-emission system (`tauri::Emitter`) to push Server-Sent Events (SSE) chunks from Rust back to the frontend as they arrive. This is a significant but critical refactor.

**What to do:**
- In Rust, create a new `stream_http_request` command that parses SSE chunks from the response body and emits Tauri events (`app_handle.emit("llm_token", chunk)`)
- In the frontend, listen to these events and append tokens to the chat UI in real-time

#### 2. Real Parallel Tool Execution
The `parseAllToolCalls` function exists and extracts multiple tool calls from a response. However, the execution pipeline only executes them sequentially. True parallel execution with `Promise.all()` and proper result merging is partially wired but not fully reliable.

#### 3. Memory / Long-Term Context
Currently, every chat just sends the full message history to the LLM. There is no:
- Conversation summarization when the context window fills up
- Vector-based episodic memory for long-running projects
- RAG (Retrieval-Augmented Generation) from project files

**Suggestion:** Integrate a local vector DB (e.g., `usearch` via a Rust binding, or serialize embeddings to a JSON sidecar file per-project) for semantic retrieval of past conversation snippets.

#### 4. Channels — Real Implementation
Channels were envisioned as persistent, named workspaces that connect to external data streams or automations (e.g., GitHub issue watcher, Slack bot, email inbox). The UI exists. The backend doesn't. This is a major feature that would differentiate Cognetic significantly.

#### 5. Connectors — Real Implementation
Connectors were planned as modular data-source plugins:
- **File system connectors**: Watch a folder and ingest new files automatically
- **Database connectors**: SQLite, PostgreSQL read access
- **API connectors**: Pull data from REST APIs on a schedule
- **Service connectors**: GitHub, Notion, Jira, Linear
The UI stub exists. Nothing is wired up.

## 🚀 YET TO BUILD: The Grand Vision Backlog

> *"These are the big, exciting ideas I planned to implement but couldn't due to the sudden project halt. They represent the true soul of Cognetic: making it the ultimate local AI workstation, completely independent of expensive API locks. Future developers (and my future self!) — please implement these! They will turn this app into a powerhouse."*
> — Rudra

Here is the blueprint for the 6 signature features that will take Cognetic to the next level. They are written in detail to make the implementation as straightforward and fun as possible.

---

### 🌐 1. Browser LLM Runtime (Web LLM Exploiter)
**Status:** Conceptualized & Prototyped
<br>**Priority:** High / Experimental

**The Idea:** API keys are expensive, require billing setups, and block people who just want to use the models they already pay for (or use for free) via web interfaces. 

**The Solution:** Instead of requiring API keys, Cognetic will boot or connect to a separate browser instance running with the user's authenticated profile. If the user is logged into `claude.ai` or `chatgpt.com`, Cognetic pings these interfaces directly underneath. To the orchestrator, it's just another model provider!

```
    User's Browser Profile (with active sessions)
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│           Browser LLM Runtime                   │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Claude  │  │  ChatGPT │  │    Gemini    │   │
│  │ Adapter  │  │ Adapter  │  │   Adapter    │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
│       │              │               │          │
│       └──────────────┼───────────────┘          │
│                      ▼                          │
│          Unified Provider Interface             │
└─────────────────────────────────────────────────┘
                       │
                       ▼
              Cognetic Orchestrator
  (treats browser models exactly like API models)
```

#### How to build it:
- **Tauri Webview:** Spawn a hidden Tauri `WebviewWindow` that loads the user's default browser profile.
- **Adapter Pattern:** Create modular adapters (`ClaudeAdapter.js`, `ChatGPTAdapter.js`, etc.) that handle page interaction (typing, clicking send, waiting for the stop-button to toggle, scraping the final text block).
- **Session Auto-Detection:** Ping the service homepages on start to see if user is already logged in. If yes, dynamically add them to the provider list.
- **Ethics:** Keep it fully transparent, optional, and labeled as experimental.
- 🔗 **Rudra's Reference Repo:** I have made a version this earlier! Go read the code at [github.com/rudra-devlabs/web_llm_exploiter](https://github.com/rudra-devlabs/web_llm_exploiter) to see how to automate these web interfaces.

---

### 🧠 2. Specialized Model Orchestration
**Status:** Planned
<br>**Priority:** High / Core Feature

**The Idea:** Using a single model (like Claude 3.5 Sonnet or GPT-4o) for *everything* is both slow and expensive. You don't need a frontier-class model to summarize search results or format a JSON object, but you definitely want one when writing complex code.

**The Solution:** Build a role-based ranked fallback system. Instead of picking one model for the entire chat session, Cognetic maintains ranked model lists mapped to specific agent sub-tasks:
- **Intent Analyzer:** Needs speed and simple classification (e.g., Llama 3.2 3B, Gemini 1.5 Flash).
- **Planner:** Needs logic and structure.
- **Coder:** Needs coding mastery (e.g., Claude 3.5 Sonnet, Qwen 2.5 Coder).
- **Reviewer:** Double-checks code, looks for bugs.
- **Reasoner:** Complex math or logical problems (e.g., o1/o3, DeepSeek R1).
- **Search Summarizer:** Fast parsing of web page dumps.
- **Vision:** Visual analysis of screenshots.
- **Writer:** Natural, engaging final summary response.

```
               ┌───────────────┐
               │ User Message  │
               └───────┬───────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
 [Intent Analyzer]           [Search Summarizer]
(Gemini Flash/Llama)          (Fast Local/API)
         │                           │
         ├───────────────────────────┤
         ▼                           ▼
      [Coder]                    [Reviewer]
(Qwen Coder/Sonnet)          (GPT-4o/Sonnet)
```

#### How to build it:
- When a user inputs API keys for OpenAI, Anthropic, Gemini, Groq, or OpenRouter, Cognetic automatically parses the available models.
- It assigns models to roles behind the scenes based on standard benchmarks.
- If a user has a local LLM runner (Ollama) active with a specific coding model, Cognetic dynamically registers it for the Coder role.
- **The Payoff:** Frontier-quality results at a fraction of the cost and latency, without the user having to manually switch models.

---

### 🔀 3. Multi-Stage Intelligence Pipeline
**Status:** Planned
<br>**Priority:** High

**The Idea:** The standard `User -> LLM -> Answer` flow is too simple. For complex development and research, it leads to hallucinated files, wrong assumptions, and superficial answers.

**The Solution:** Restructure the execution pipeline into a multi-stage process where each stage passes structured context to the next, potentially utilizing different specialized models:

```
    User Message
         │
         ▼
     [Intent]         (Determine: code task? research? simple chat?)
         │
         ▼
    [Planning]        (Generate a structured execution plan first)
         │
         ▼
[Context Builder]     (Fetch file mappings, run greps, locate imports)
         │
         ▼
   [Generation]       (Write/Modify the code or assemble details)
         │
         ▼
  [Verification]      (Synthesize, build checks, verify code logic)
         │
         ▼
    [Patching]        (Apply the changes back safely to the project)
         │
         ▼
   Final Answer
```

#### How to build it:
- Refactor the prompt loop in `Home.js` (or in a new `AgentRuntime.js`) so that it goes through these explicit transitions.
- Emit UI events for each stage so the user sees a visual "thinking pipeline" progress bar showing exactly what the engine is working on (e.g. `[Planning] Done`, `[Context Builder] Scanning imports...`).

---

### 🔍 4. Free Meta Search Engine
**Status:** Planned
<br>**Priority:** Medium / Utility

**The Idea:** API-based search tools like Tavily, Jina Search, or Brave Search are fantastic but either cost money or have strict free-tier rate limits.

**The Solution:** Build a native, free search and scraping pipeline directly in the Rust backend. Instead of querying a search API, Cognetic behaves like a human search client:

```
    User Search Query
            │
            ▼
┌───────────────────────┐
│    Search Engines     │ (DuckDuckGo, Yahoo, Bing, Google)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│     Collect URLs      │ (Scrape links from result pages)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│     Download HTML     │ (Reqwest on Rust backend)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│      Clean HTML       │ (Strip scripts, styles, boilerplates)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│    Chunk & Rank       │ (Regex/semantic distance check)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│    Summarize & Output │ (Present clean context to LLM)
└───────────────────────┘
```

#### How to build it:
- Use Rust's `reqwest` to query basic HTML versions of search engines (like DuckDuckGo HTML) and parse the links out.
- Spin up concurrent Rust threads to fetch the top 3-5 target pages.
- Parse the HTML with a lightweight rust library (like `scraper`) or write regex routines to clean text.
- Split the text into semantic chunks, compute a quick score based on query keywords, and feed the best chunks into the LLM context.
- **The Payoff:** Web search becomes permanently free, fast, and completely immune to API keys or CORS restrictions.

---

### ⚔️ 5. Debate / Multi-Agent Reasoning
**Status:** Planned
<br>**Priority:** High / Reasoning

**The Idea:** Single-agent models are prone to confirmation bias. If an agent writes a piece of code, it will often insist its solution is correct, even when there is an obvious bug.

**The Solution:** Create a "Debate Mode" for difficult tasks (reminiscent of Cursor or OpenAI Deep Research). Instead of one model generating the answer, three models debate each other:

```
              [Planner]
     (Lays out the goal & constraints)
                 │
                 ▼
        [Model A: Solution]
      (Drafts the initial code)
                 │
                 ▼
        [Model B: Critique]
(Actively tries to find bugs/flaws)
                 │
                 ▼
      [Model C: Improvements]
 (Refines solution based on critique)
                 │
                 ▼
         [Final Synthesis]
  (Produces the clean output block)
```

#### How to build it:
- Add a "Deep Mode" toggle in the chat input toolbar.
- When enabled, the chat run spawns a sequence of hidden messages where Model A generates, Model B critiques, and Model C adjusts.
- Show the debate transcript in a collapsible accordion in the UI so the user can watch the models "argue" and refine their work.

---

### 📂 6. Project Brain (Living Project Twin)
**Status:** Planned
<br>**Priority:** High / Context

**The Idea:** When you open a project, the LLM has zero context. It doesn't know where the entry points are, what coding styles you prefer, how your modules interact, or what libraries you use. Feeding the whole codebase on every message is impossible.

**The Solution:** Create a background indexer ("Project Brain") that gradually constructs a living map of the project. It maps out:
- **Architecture:** The project layout and folder structure.
- **Modules:** Key classes, exports, and core utilities.
- **Coding Style:** Do you use tabs or spaces? ES Modules or CommonJS? Arrow functions or standard definitions?
- **Dependencies:** What third-party libraries are present and how they are imported.
- **Conventions:** Naming schemes, database schemas, test patterns.
- **Important Files:** Where the main logic resides (e.g. `main.js`, `lib.rs`).

#### How to build it:
- Write a background worker in JS (using Web Workers) or Rust (using threads) that indexes project paths when a project is loaded.
- Store this metadata in a `.cognetic/brain.json` file inside the project directory or in global storage.
- Inject this project profile as a system prompt prefix on every message.
- **The Payoff:** The assistant feels like a senior engineer who has worked on the project for months, immediately adhering to your style and picking the right files to modify.

---

### 🔍 7. Self Review + Patching
**Status:** Planned
\n<br>**Priority:** High / Code Quality

**The Idea:** LLMs are fast, but they can easily write code with syntax errors, forgotten parameters, or missing imports. If the system just stops after generation and hands the code to the user, the developer has to spend time debugging the agent's work.

**The Solution:** Build a self-correction loop directly into the code-generation cycle. Instead of stopping after writing a file or generating code, Cognetic runs a validation step:

```
      [Generate]
   (Initial Draft)
          │
          ▼
       [Review]
 (Check against context & rules)
          │
          ▼
    [Find Mistakes]
(Identify syntax errors, type mismatches)
          │
          ▼
  [Automatically Patch]
 (Apply fixes silently behind scenes)
          │
          ▼
      [Deliver]
 (Clean, working code sent to user)
```

#### How to build it:
- Set up a post-generation prompt handler. Before updating the UI, feed the generated code block to a lightweight review prompt (e.g. using a fast local Coder or a critique model).
- Ask the model: *"Check this code for syntax errors, missing variables, or logical flaws. If any exist, output only the corrected lines in edit format."*
- If fixes are found, patch the file content silently before presenting it to the user.
- **The Payoff:** A massive boost in code quality, significantly reducing compile errors and making the agent feel incredibly competent.

---

### 🛠️ 8. Agentic IDE Features
**Status:** Planned
\n<br>**Priority:** High / UX

**The Idea:** Cognetic shouldn't feel like a standard web chatbot. It's a native desktop application, and it needs to leverage that fact to feel like a living, breathing, AI-native IDE.

**The Solution:** Implement a suite of core IDE mechanics built specifically around agent workflows:

- **Background Agents:** Run agents asynchronously in their own isolated loops. An agent can research a library or run tests in the background while you keep chatting or editing code.
- **Task Queue:** A visible checklist of tasks that are scheduled, running, or completed. The user can prioritize, cancel, or re-run steps.
- **Live Terminal:** An integrated terminal widget in the UI that streams shell outputs dynamically, letting both the user and the agent input commands interactively.
- **Live File Watching:** Use Rust's `notify` crate to watch project folders. If you save an external file, the agent's context updates automatically, or it can proactively suggest fixes if you introduce a compile error.
- **Diff Viewer:** A beautiful, git-like visual comparison screen that shows exactly what changes the agent plans to make to your files *before* it applies them, letting you accept or reject them line-by-line.
- **Undo Everything:** A transactional history of the agent's operations. If the agent makes a mistake and ruins a build, a single "Undo" button reverts all file changes, creations, and deletions in one click.
- **Planning Mode:** Force the agent to write a structured blueprint first, aligning on requirements and file edits before executing any code changes.
- **Multi-Agent Collaboration:** A workspace where a Planner, a Coder, and a QA Tester agent work together, talking to each other and passing tasks back and forth to achieve a goal.

*These features take Cognetic from a simple chatbot wrapper to a workspace that feels truly alive.*

---

### 💾 9. Hierarchical Session Memory (Token Optimization)
**Status:** Planned
\n<br>**Priority:** High / Performance

**The Idea:** One of the biggest inefficiencies in today's AI assistants is repeatedly sending the entire conversation history back and forth to the model. As your project chats grow longer, this wastes tons of tokens, spikes latency, and eventually hits hard context window limits.

**The Solution:** Implement a hierarchical memory system that evolves alongside the chat instead of treating all messages equally. 

Every 10–20 interactions, Cognetic will run a background summarization to update a structured **Session Memory** object containing the project's active goals, key decisions made, current progress, constraints, and pending tasks.

```
┌────────────────────────────────────────────────────────┐
│                   Hierarchical Memory                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  [Recent Chat History] ───> Active, untouched context  │
│                                                        │
│  [Session Memory] ────────> Goals, Decisions, Tasks    │
│                             (Updated every 15 turns)   │
│                                                        │
│  [Long-Term Summary] ─────> Oldest 75% compressed      │
│                             (When history > 100k tkn)  │
└────────────────────────────────────────────────────────┘
```

#### How to build it:
- **Periodic Consolidation:** Set up a counter in the state. Every 15 message turns, trigger a call to a cheap local or API model (like Gemini Flash) with the prompt: *"Update the session memory based on the latest turns. Keep the goals list, constraints, and pending tasks up to date."*
- **Rolling Compression:** If the conversation history exceeds a threshold (say, 100k tokens), take the oldest 70–75% of the chat, compress it into a high-density chronological bullet-point summary, and merge it into long-term session memory. Remove those raw messages from the active array.
- **Context Constructor:** When assembling a payload for the LLM, construct it like this: `System Prompt + Project Brain Profile + Structured Session Memory + Long-Term Summary + Recent Messages (untouched)`.
- **The Payoff:** Conversations remain blazing fast, token usage is slashed by up to 70% in long sessions, and you can keep a single conversation open for months without losing context or paying through the nose for redundant token transmissions.

---

### 🖼️ 10. Client-Side Image Compression
**Status:** Planned
<br>**Priority:** High / Performance

**The Idea:** High-resolution screenshots and image uploads can be massive — often several megabytes. Sending these uncompressed raw base64 images directly to multimodal LLMs (like Sonnet or GPT-4o) wastes an enormous amount of tokens and leads to sluggish upload times, making multimodal chat feel slow.

**The Solution:** Build a client-side image processing utility that automatically downscales and compresses images before they are base64-encoded and sent to the LLMs.

```
 [User Uploads High-Res Image] (e.g. 5MB PNG, 4000x3000)
                │
                ▼
     [Canvas Downscaling API] (Resizes to max 1024x1024 or 1600x1200)
                │
                ▼
     [JPEG/WebP Compression]  (Compresses quality to ~75-80%)
                │
                ▼
  [Base64 Encoding] ───> Net Payload Slashing (~150KB)
                │
                ▼
        [Tauri/Rust Send] ───> Blazing Fast Token Upload
```

#### How to build it:
- **Canvas Processing Pipeline:** In `src/views/home/Home.js` (or a helper utility `src/core/imageHelper.js`), catch image files before they are read as data URLs.
- Draw the image onto an offscreen HTML5 `Canvas` element, maintaining the aspect ratio but capping the maximum width or height to a config-specified limit (e.g. 1024px or 1600px).
- Output the canvas content using `canvas.toDataURL('image/jpeg', 0.8)` or `image/webp` instead of raw PNG.
- **The Payoff:** Slashing the network payload by up to 90%, speeding up API calls significantly, reducing token ingestion costs, and making image-based debugging smooth even on slower internet connections.

---



### Medium Priority — Polish & UX

#### 11. Multi-Agent Orchestration
Currently one model handles everything. The architecture *supports* it (via `intentAnalyzerModel` being separate), but a true multi-agent system would allow:
- A "planner" agent to decompose complex tasks into subtasks
- Multiple "worker" agents running in parallel
- A "critic" agent to validate outputs

#### 12. Tool Result Rendering
Tool results are injected back into the conversation as plain text. They should be rendered as structured, collapsible UI cards. For example:
- `search_web` results → a card with title, URL, and snippet per result
- `run_command` → a terminal-styled output block
- `read_file` → a code block with syntax highlighting
- `list_files` → an interactive file tree

#### 13. System Prompt Editor
The system prompt is hardcoded in `src/config/systemPrompt.js`. Users should be able to:
- View and edit the system prompt per-project
- Create prompt templates
- Toggle specific agent capabilities on/off (e.g., "no filesystem access in this chat")

#### 14. Conversation Export
No ability to export chats. Should support:
- Markdown export
- JSON export
- PDF (via Tauri's shell printing or a Rust crate)

#### 15. Tauri Native File Picker
File upload for images uses a hacky workaround. Should use `tauri-plugin-dialog` (already in `Cargo.toml`) to invoke the native OS file picker properly.

#### 16. Model Context Window Display
Users have no visibility into how many tokens are left in the context window. A progress bar or token counter at the bottom of the chat would greatly help power users manage their context.

#### 17. Better Ollama/LM Studio UX
Local providers need special treatment:
- Auto-discover running Ollama/LM Studio instances (ping `localhost:11434/api/tags`)
- Dynamically populate the model list from the local provider instead of relying on the static `providers.json`

#### 18. Notification & Background Agent Runs
For long-running agentic tasks, there's no way to let the agent run in the background while the user does other things. OS-level native notifications (via Tauri's notification plugin) should alert the user when a run completes.

### Low Priority — Nice to Have

#### 19. Keyboard Shortcuts
No keyboard shortcuts exist beyond the basics. Power users expect `Ctrl+K` to open command palette, `Ctrl+N` for new chat, `Esc` to cancel, etc.

#### 20. Plugin / Extension System
The architecture could support a plugin system where users install third-party tools that the agent can invoke. This would make the connector and tool ecosystem community-driven.

#### 21. Voice Input / Output
`tauri-plugin-audio` or integration with OS TTS/STT could enable voice mode.

#### 22. Themes & Appearance Settings
The UI has a single dark theme. A theme switcher (light/dark/system + custom accent colors) would improve accessibility and personalization.

---

## 🐛 Known Issues & Technical Debt

1. **`Home.js` is too large (~115KB, ~3000+ lines)**. It desperately needs to be split into sub-components. The chat message renderer, the tool call parser, the sidebar manager, and the project manager should each be separate modules.

2. **No TypeScript**. The lack of types makes refactoring risky. A gradual migration to TypeScript (or at minimum JSDoc annotations) is strongly recommended before adding major features.

3. **`providers.json` is manually maintained**. The model lists go stale quickly as providers update their offerings. A future system that auto-fetches model lists from `/v1/models` endpoints would be more robust.

4. **The `anthropic-dangerous-direct-browser-access: 'true'` header** is still in `callAnthropic`. This is now unnecessary since all requests go through the Rust backend (not the browser). Remove it — it signals to Anthropic's servers that a browser is making the call, which may cause rate limiting in the future.

5. **No error boundaries**. If a tool fails or the LLM returns malformed JSON, the entire conversation can silently break. Proper try/catch wrapping around every tool call result, with graceful error messages injected into the chat, needs to be hardened.

6. **State grows unboundedly**. Chat history is never pruned from `localStorage`. Over months of use, this will cause performance issues or exceed storage limits. Implement a configurable history limit or move storage to Tauri's native filesystem.

7. **The Vite CORS proxy in `vite.config.js` is now unnecessary** since all requests route through Rust. It can be removed.

---

## ⚠️ Bug Warning — Read This Before You Touch Anything

> **Honest heads-up:** This project was built at a very fast pace, mostly iteratively through AI-assisted development sessions. While the core architecture is solid, **there are almost certainly bugs lurking throughout the codebase** — some known, some yet to be discovered. Do not assume any feature is bug-free without testing it yourself. The sections below document the most likely categories of bugs you will encounter.

---

### 🔴 Critical / High Likelihood Bugs

#### 1. Chat History Corruption on Fast Switching
If the user rapidly switches between projects or chats while a generation is in progress, the `StateManager` may write the incoming AI message to the wrong chat. The `activeChatId` is read at the start of generation but the user can change it mid-stream. The result is ghost messages appearing in the wrong conversation.

**Where to look:** `src/core/state.js` → `addMessage()`, and `src/views/home/Home.js` → the generation completion handler.

#### 2. Intent Analyzer Race Condition
The Intent Analyzer runs as a separate async call before the main model. If the user sends a second message while the intent analysis for the first is still in flight, both analyses may resolve at unpredictable times, causing the main model to be called twice simultaneously or with mismatched contexts.

**Where to look:** `src/core/llmService.js` → `analyzeIntent()`, and the send-button handler in `src/views/home/Home.js`.

#### 3. Tool Call Parsing Failures (Malformed XML)
The tool parser uses a regex against the raw LLM response text. LLMs frequently produce slightly malformed XML — unclosed tags, nested quotes, or newlines inside attribute values. When this happens, `parseAllToolCalls` silently returns an empty array, the agent thinks it's done, and gives the user an incomplete answer with no error message.

**Where to look:** `src/core/toolEngine.js` → `parseSingleToolBlock()` and `parseAllToolCalls()`.

#### 4. Infinite Agent Loop Risk
If the LLM keeps generating tool calls in every response without ever producing a final answer (e.g., it gets stuck in a search → read → search loop), there is **no hard limit** on the number of agentic iterations. The loop will run indefinitely until the user manually presses "Stop" or the browser tab crashes from memory exhaustion.

**Where to look:** The agent loop in `src/views/home/Home.js` — search for the `while (hasToolCalls)` or recursive call pattern. Add a `MAX_ITERATIONS` guard (e.g., 20).

#### 5. `localStorage` Quota Exceeded Silently
`StateManager` saves the entire state (all chats, all messages, all projects) to `localStorage` on every state change. Modern browsers limit `localStorage` to ~5–10MB. After heavy use, the `setItem` call will throw a `QuotaExceededError` which is not caught anywhere. The app will appear to work normally but **no new state will be saved**, and data loss will occur silently on the next reload.

**Where to look:** `src/core/state.js` → `saveState()` — wrap the `localStorage.setItem` in a `try/catch` and surface a visible warning to the user.

#### 6. Provider API Key Saved Even on Network Failure
During API key validation, if the Rust `perform_http_request` command itself throws (e.g., DNS resolution failure, TLS error), the error is caught and the validation result is treated as `{ isValid: false }`. However, in some edge cases where the error is not propagated correctly through the `invoke` boundary, the save handler may incorrectly treat the Rust error as a successful validation. **Always verify your keys actually work before trusting the green checkmark.**

**Where to look:** `src/views/agents/Agents.js` → `validateAPIKey()` and the `btnSave` click handler around line 370.

---

### 🟡 Medium Likelihood Bugs

#### 7. Broken Model Routing for "Anthropic Compatible" Provider
The provider routing in `llmService.js` dispatches to `callAnthropic()` only if `providerName === 'Anthropic'`. The "Anthropic Compatible" provider entry in `providers.json` exists but is never matched to the Anthropic call path — it silently falls through to `callOpenAI()`. This will fail for any non-OpenAI-compatible Anthropic-format endpoint.

**Where to look:** `src/core/llmService.js` → the `if/else if` dispatch block around line 79.

#### 8. Image Messages Cause Token Count Errors
When a message contains base64-encoded images, the token count logged in the stats panel may be wildly inaccurate or display `0`. Different providers report image token costs differently (or not at all), and the `stats` field parsing in `callOpenAI` / `callAnthropic` / `callGoogleAI` doesn't handle the vision-specific usage fields correctly.

**Where to look:** All three `call*` methods in `llmService.js` — look at how `data.usage` is read after an image-containing request.

#### 9. Project Path Validation Fails on Windows UNC Paths
The `resolve_and_validate_path` Rust function uses `canonicalize()` and string-prefix matching to enforce sandboxing. On Windows, network paths (`\\server\share\...`) and paths with symlinks may not canonicalize predictably, causing valid files to be rejected with "Permission Denied: Path is outside the active project workspaces."

**Where to look:** `src-tauri/src/lib.rs` → `resolve_and_validate_path()`.

#### 10. DuckDuckGo Scraper Breaks Silently on Layout Changes
The DuckDuckGo fallback in `search_web` scrapes `html.duckduckgo.com` by looking for `.web-result`, `.result__title`, and `.result__snippet` CSS class selectors. DuckDuckGo can change their HTML structure at any time without warning. When this happens, `results.length` will be 0 and the tool returns "No results found" with no indication of why.

**Where to look:** `src/core/toolEngine.js` → `case 'search_web':` → the `else` (DuckDuckGo) branch.

#### 11. Stale `activeChatId` After Project Deletion
If a user deletes a project that contains the currently active chat, `state.activeChatId` may still point to the deleted chat's ID. The next message will attempt to append to a chat that no longer exists, creating a new orphan chat instead of cleanly starting fresh.

**Where to look:** `src/core/state.js` — the project/chat deletion handlers. Ensure `activeChatId` and `activeProjectId` are nullified when their targets are removed.

#### 12. Lucide Icons Fail to Render After Dynamic DOM Injection
Several parts of the UI (error cards, the save button loading state) inject raw HTML strings and then call `window.lucide.createIcons({ root: element })`. If Lucide hasn't fully initialized by the time the injection runs, or if the `root` element reference is stale, the icons will render as blank squares.

**Where to look:** `src/views/agents/Agents.js` — any call to `window.lucide.createIcons()` after dynamic HTML injection.

#### 13. `run_command` Output Truncated for Long-Running Processes
The `run_command` Rust implementation uses `child.wait_with_output()` which buffers the entire stdout/stderr in memory before returning it to JavaScript. For commands that produce megabytes of output (e.g., `npm install`, `cargo build`), this can cause visible hangs, memory pressure, and truncated output — or the process times out and the agent thinks the command failed.

**Where to look:** `src-tauri/src/lib.rs` → `run_command()`.

---

### 🟢 Low Likelihood (But Watch Out For These)

#### 14. `marked.js` XSS Vulnerability
AI responses are rendered by passing raw LLM output through `marked.js` and injecting it as `innerHTML`. If an attacker crafts a prompt that causes the LLM to output malicious JavaScript (e.g., `<script>...`), it would execute in the Tauri webview context. The app uses `DOMPurify` in some places but it may not be applied consistently to all markdown render paths.

**Where to look:** `src/views/home/Home.js` — every `.innerHTML =` assignment that involves LLM-generated content. Ensure `DOMPurify.sanitize()` is always called before injection.

#### 15. Provider Config Overwritten on First Load for New Providers
When the app loads, `StateManager` merges saved state from `localStorage` with the default state. If a new provider is added to `providers.json` after the user already has saved state, their local state won't have an entry for the new provider and no migration path exists. This is not a crash, but the new provider will appear in the UI with no data until the user manually touches it.

#### 16. `fetch_url` Cache Never Expires
The `fetchCache` Map in `toolEngine.js` stores fetched page content indefinitely for the lifetime of the page. In a very long agentic session where many URLs are fetched, this can accumulate significant memory. There is no TTL or LRU eviction policy.

**Where to look:** `src/core/toolEngine.js` → `const fetchCache = new Map()` at the top of the file.

#### 17. Google AI Studio Model URL Double-Encoding
The Google AI call constructs a URL like `endpoint + /v1beta/models/${modelId}:generateContent?key=${apiKey}`. If `modelId` contains characters that need URL encoding (e.g., a slash in a fine-tuned model path like `tunedModels/my-model`), the URL will be malformed and the request will fail with a 404.

**Where to look:** `src/core/llmService.js` → `callGoogleAI()` — the endpoint construction block.

---

### 🛠️ General Debugging Tips

- **Check the Tauri DevTools**: In dev mode (`npm run tauri dev`), right-click the window and select "Inspect Element" to open DevTools. All `console.log` and `console.error` output appears here.
- **Check the Rust terminal output**: The terminal where you ran `npm run tauri dev` shows all Rust `println!` and `eprintln!` output. Many silent failures in Rust commands will appear here.
- **State inspection**: Open DevTools console and type `JSON.parse(localStorage.getItem('Cognetic_state'))` to inspect the full current state tree.
- **Test providers independently**: Use `curl` or Postman to test an API endpoint directly before assuming the bug is in Cognetic.

---

## 💡 Suggestions from AI — To the Cognetic Dev Team

*This section was written by the AI assistant (Antigravity / Claude Sonnet 4.6) that helped build the bulk of the v0 codebase. These are genuine architectural and product recommendations based on direct experience with the codebase.*

---

### 🏛️ Architecture

**1. Migrate the Frontend to SvelteKit or Solid.js**
Vanilla JS was the right call for speed of prototyping, but `Home.js` at 115KB is a warning sign. The next major version should migrate to **Svelte** specifically — it compiles to pure JavaScript with zero runtime overhead (no virtual DOM), keeping the Tauri bundle lean while giving you proper reactivity, component scoping, and TypeScript support. SvelteKit's file-based routing is a natural fit for the view structure you already have.

**2. Move All State to Rust / SQLite**
`localStorage` is a browser API. It doesn't belong in a native desktop app. Tauri has first-class access to the OS filesystem. Move all state to a local **SQLite database** (via the `rusqlite` crate) or `serde_json` flat files. This enables:
- Unlimited storage capacity
- Better query performance for searching chat history
- Proper backups and migrations

**3. Introduce an Agent Runtime Loop**
Right now, the "agent loop" is implemented inline inside `Home.js`. When the model returns a tool call, the JS handles it, then calls the model again — all imperative, all tangled with UI code. Abstract this into a proper `AgentRuntime` class in `src/core/` that owns the loop, handles retries, manages tool call depth limits, and emits structured events that the UI consumes. This separation will pay dividends immediately.

**4. Implement a Tool Registry Pattern**
Currently, all tools are hardcoded in a giant `switch` statement in `toolEngine.js`. Replace this with a **Tool Registry** — a map of tool name → `{ description, parameters, execute }` objects. This makes tools self-documenting, enables dynamic tool discovery, and is the foundation for a future plugin system. The tool descriptions can also be fed directly into the system prompt instead of being hardcoded there.

**5. Use Tauri's IPC Event System for Streaming**
The single most impactful UX improvement is streaming token output. Users should see the response appear word-by-word, not all at once after a 5-10 second wait. Use Tauri's `emit`/`listen` pattern:
- Rust reads SSE stream from the LLM → emits `"llm_token"` events to the frontend
- Frontend listens and appends each token to the last message in real-time
This is a well-documented Tauri pattern and is not particularly complex to implement once you understand the event system.

---

### 🧪 Product & UX

**6. Lean into the "Bring Intelligence from Anywhere" Positioning Hard**
The multi-provider support is the most unique thing about Cognetic. Double down on it:
- Add a **Provider Health Dashboard** showing response latency, uptime, and model availability per provider
- Show the user which model/provider is being used for each response inline in the chat
- Allow per-conversation provider overrides (use Gemini for this session, Nvidia for that one)
- Make provider switching instant and frictionless — one click

**7. Build the Connector System as the Next Major Feature**
After streaming, the Connector system is the highest-leverage feature. Connectors turn Cognetic from a chat app into a **platform**. The vision: a marketplace of connectors (GitHub, Notion, Google Drive, Jira, Slack, databases, custom APIs) that the agent can query as context sources or action targets. Each connector should expose a standard interface: `fetch_context(query)` and `perform_action(action, params)`. The agent tool engine already handles the execution side — connectors just need to be the *source* side.

**8. Per-Project System Prompt Customization**
Let power users define exactly what persona and capabilities they want for each project. A software project might want "you are a senior Rust engineer" while a writing project wants "you are an editor who values clarity." This is trivially easy to implement (just add a `systemPromptOverride` field to the project model) and has outsized impact on user satisfaction.

**9. Agent "Runs" with Audit Log**
The state model already has a `runs: []` array that was never fully populated. Every agentic task should create a `Run` record with: start time, end time, model used, tools called (with inputs/outputs), token count, and success/failure status. Display this in a dedicated "History" view. Power users will love having an audit trail of what their agent did.

**10. Design a First-Run Onboarding Experience**
There is currently no onboarding. When someone installs Cognetic for the first time, they are dropped into a blank screen with no guidance. The first-run experience should:
1. Show a welcome card with the "Bring Intelligence from Anywhere" tagline
2. Walk the user through adding their first provider (with direct links to get API keys)
3. Suggest their first action (create a project, start a chat, add a connector)
This is a weekend's worth of work with enormous impact on first-impression quality.

**11. Model Benchmarking Built-In**
A unique Cognetic feature: let users run a standardized benchmark task across all their configured providers simultaneously and see a comparison table of response quality, speed (tokens/sec), and cost estimate. No other tool does this. It would become a viral demo and a genuinely useful utility for power users who want to pick the best model for a task.

---

### 🔐 Security

**12. Encrypt Stored API Keys**
Currently, API keys are stored in plaintext in `localStorage`. For a desktop app with Tauri access to the OS keychain, use the OS secure credential store (`tauri-plugin-stronghold` or direct OS keychain access via Rust's `keyring` crate). Users' API keys are the most sensitive data in the app — treat them accordingly.

**13. Sandbox the `run_command` Tool**
The current implementation lets the agent run any shell command on the user's machine. This is powerful but dangerous if a malicious prompt injection occurs. Add a confirmation dialog before executing commands in non-project contexts, and consider a whitelist/blacklist of allowed command prefixes per project.

---

### 📈 Metrics & Telemetry (Optional)

**14. Opt-in Anonymous Usage Analytics**
If Cognetic ever becomes a product with multiple users, opt-in analytics (which providers are being used, which tools are invoked most, average session length) would inform product decisions enormously. Use a lightweight, privacy-respecting service like Plausible or a self-hosted instance.

---

## 🚀 How to Continue Development

### Prerequisites
- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) v20+
- [Tauri CLI v2](https://tauri.app/start/prerequisites/)
- [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (Windows only)

### Running the Dev App
```bash
npm install
npm run tauri dev
```

> **Important:** Run `npm run tauri dev` — NOT just `npm run dev`. The Rust backend must be running for all LLM calls, filesystem tools, and web search to work. If you run only `vite`, every API call will fail silently.

### Building for Production
```bash
npm run tauri build
```

### Key Files to Read First
Before writing any code, read these in order:
1. `src/core/state.js` — Understand the data model
2. `src/core/llmService.js` — Understand how models are called
3. `src/core/toolEngine.js` — Understand the tool execution system
4. `src/config/systemPrompt.js` — Understand what the agent is told about its capabilities
5. `src-tauri/src/lib.rs` — Understand all available Rust backend commands

---

## 🤖 A Word on How This Was Built — The Antigravity Story

Here's something you won't find in most READMEs, but it feels important to be transparent about:

**The overwhelming majority of Cognetic's code was written by an AI agent — specifically Google's Antigravity agent, powered by a combination of Gemini and Claude Sonnet models.Even this markdown is written by Antigravity agent**

Rudra (me) drove the vision, made the product decisions, caught the bugs, steered the architecture, and had the original idea. But the actual *typing* — the hundreds of functions, the Rust backend, the CSS, the tool engine, the provider configs, the error cards, the validation logic, the network migration — essentially all of it was produced through an extended AI-assisted development session spanning many hours.

This is not something to be embarrassed about. It's actually kind of remarkable:

- A 17-year-old with a clear vision used an AI coding assistant to build a desktop application with a native Rust backend, 50+ LLM providers, a full agentic tool engine, and a polished dark-mode UI — in a single development sprint.
- The AI (Antigravity) wrote the code. The human (Rudra) architected and directed.
- Every significant decision — what to build, what to call it, what to prioritize — was Rudra's.

We mention this because:
1. **It's honest.** You deserve to know the origin of the code you're working with.
2. **It sets expectations.** AI-generated code at this speed is *mostly* solid but occasionally inconsistent. The bug section of this document exists precisely because of this.
3. **It's the future.** This kind of human-AI collaboration is going to become the default for software development. Cognetic itself was proof of concept — built *by* AI, *for* AI-assisted workflows.

If you continue development, you're encouraged to use AI assistance too. The architecture is designed to be AI-readable. Go nuts. Just make sure a human is steering.

> *"The best tools are built by people who understand the problem, not just the implementation."*
> — Rudra probably thought this at some point

---

## 📝 Final Note from the Original Developer

Cognetic is at a critical inflection point. The core engine works. The provider ecosystem is comprehensive. The foundation is solid. What it needs now is polish, streaming output, and the Connector system to unlock its full potential as a platform.

The name **"Cognetic"** is a portmanteau of *cognition* and *kinetics* — the idea that intelligence should be in motion, fluid, and capable of drawing from anywhere. Keep that spirit alive in every feature you build.

Good luck. Build something great.

---

## 👤 A Note on Who Will Continue This

If you're reading this as an outside contributor — welcome, and thank you. But honestly?

**The most likely person to pick this back up is me — Rudra — the original developer.**

I'm 17 years old as of June 29, 2026, and I'm taking a break of roughly 7–8 months for personal reasons. When I return, I intend to continue Cognetic's development as my primary long-term project. The architecture decisions, the naming, the vision, the slogan — all of it was deliberate and personal.

So if you're a future collaborator, know that this project has an active developer, feel free to inform me whatever direction you are taking this in(at rudra.devlabs@gmail.com). If you want to contribute in the meantime, go ahead, you are free to build something great and implement whatever features you would love! The best contributions during the break would be:
- **Bug fixes** (the bug section above is a good starting point)
- **Model list updates** in `providers.json` (models go stale fast)
- **Documentation improvements**
- **Small, self-contained features** from the backlog

And if you're *me(Rudra)* reading this after coming back — hey. You built this at 17. Whatever state the world is in right now, just open your editor and write one line of code. The rest will follow.

---

*Last updated: June 29, 2026*
*Primary developer: Rudra (17 y/o)*
*AI collaborator: Antigravity (Google DeepMind / Gemini 3.1 pro + Claude Sonnet 4.6 + Mistral Large 3)*
