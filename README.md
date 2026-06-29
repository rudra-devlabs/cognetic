# 
<div align="center">

![Cognetic Logo](https://img.shields.io/badge/Cognetic-AI%20Agent%20Framework-2563eb?style=for-the-badge&logo=robot&logoColor=white)

### **🚀 Build. Think. Repeat.**

**Cognetic** is a powerful, cross-platform **AI Agent Framework** that transforms your workflow with intelligent automation. Built with **Tauri + Rust** for performance and **Vite** for rapid development, Cognetic provides a unified interface to interact with **50+ LLM providers**, execute filesystem operations, perform web searches, and manage complex workflows through natural language.

![GitHub License](https://img.shields.io/badge/license-MIT-2563eb?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2563eb?style=flat-square)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8D8?style=flat-square&logo=tauri)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)

</div>

---

## 🌟 **Features**

### 🤖 **Multi-Provider LLM Integration**
Connect to **50+ AI providers** with a unified interface:

| Category | Providers | Models |
|----------|-----------|---------|
| **Premium** | Anthropic, Google AI Studio, OpenAI | Claude 3.5, GPT-4o, Gemini 3 |
| **Open Source** | Mistral, DeepSeek, Qwen, LM Studio | Mixtral, Llama 3, DeepSeek V3 |
| **Cloud** | AWS Bedrock, Azure, Vercel AI Gateway | 100+ pre-configured models |
| **Local** | Ollama, LM Studio | Run models on your machine |
| **Specialized** | Groq, Fireworks AI, Nebius | Low-latency inference |

🔹 *Full list in [Supported Providers](#-supported-providers) section*

### 🛠️ **Powerful Tool Engine**

Cognetic agents can execute **25+ built-in tools** through natural language:

#### 📁 **Filesystem Operations**
```
read_file      - Read file contents
write_file     - Create/overwrite files
edit_file      - Replace text or line ranges
list_files     - List directory contents
tree           - Visual directory tree
search_files   - Text search in files
glob           - Pattern matching
grep           - Regex search
path_stats     - File metadata (size, type, etc.)
create_directory - Make new directories
delete_path    - Remove files/folders
rename_path    - Rename files/folders
```

#### 🌐 **Web & Search**
```
search_web     - Web search (DuckDuckGo, Tavily, Jina, Brave, Bing, SerpAPI)
fetch_url      - Fetch and extract webpage content
next_search_batch - Paginated content fetching
```

#### 💻 **System Operations**
```
run_command    - Execute shell commands (with security restrictions)
date           - Get current date/time
get_current_dir - Get working directory
```

### 🗂️ **Project & Chat Management**
- **Projects**: Organize chats by project with restricted filesystem access
- **Nested Chats**: Multiple conversations per project
- **Global Chats**: Standalone conversations outside projects
- **Incognito Mode**: Temporary chats that don't persist
- **Message History**: Full conversation context with token statistics

### 🎯 **Smart Intent Analysis**
- Automatic intent classification (chat vs. action)
- Complexity scoring for optimal tool usage
- Context-aware responses based on project scope

### 🔒 **Security Features**
- **Path Validation**: Restricts file operations to project directories
- **Command Blocking**: Prevents dangerous shell commands
- **API Key Encryption**: Secure storage of provider credentials
- **CORS Proxy**: Built-in proxy for NVIDIA API and other services

### ⚡ **Performance Optimizations**
- **Rust Backend**: Native filesystem operations
- **Batched Fetching**: Large web content split into manageable chunks
- **Parallel Tool Execution**: Independent tools run simultaneously
- **Token Statistics**: Real-time usage tracking per response

---

## 🏗️ **Architecture**

```
┌──────────────────────────────────────────────────────────────┐
│                    COGNETIC ARCHITECTURE                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐   ┌──────────────────┐   ┌───────────┐ │
│  │  Frontend (Vite) │   │   Rust Backend   │   │   Tauri   │ │
│  │                  │   │                  │   │   Core    │ │
│  │  • Components    │◄─►│  • Filesystem    │◄─►│  Runtime  │ │
│  │  • State Mgmt    │   │  • HTTP Client   │   │           │ │
│  │  • Router        │   │  • Command Exec  │   │           │ │
│  │  • UI Rendering  │   │  • Path Security │   │           │ │
│  └──────────────────┘   └──────────────────┘   └───────────┘ │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐   │
│   │                  LLM SERVICE LAYER                   │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│   │  │   OpenAI    │  │  Anthropic  │  │   Other     │   │   │
│   │  │ Compatible  │  │  Compatible │  │ Providers   │   │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘   │   │
│   │                                                      │   │
│   │  ┌──────────────────────────────────────────────┐    │   │
│   │  │                 TOOL ENGINE                  │    │   │
│   │  │  • Parser: <tool name="..."> syntax          │    │   │
│   │  │  • Executor: 25+ built-in tools              │    │   │
│   │  │  • Cache: Batched fetch storage              │    │   │
│   │  └──────────────────────────────────────────────┘    │   │
│   └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 📦 **Tech Stack**

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | [Tauri 2.x](https://tauri.app/) | Cross-platform desktop framework |
| **Frontend** | [Vite 8.x](https://vitejs.dev/) | Fast development server & bundler |
| **UI Icons** | [Lucide](https://lucide.dev/) | Beautiful, consistent icons |
| **Markdown** | [marked.js](https://marked.js.org/) | Markdown parsing & rendering |
| **HTML Sanitization** | [DOMPurify](https://github.com/cure53/DOMPurify) | XSS protection |
| **Backend** | [Rust 1.77+](https://www.rust-lang.org/) | Native system operations |
| **HTTP Client** | [reqwest](https://docs.rs/reqwest/) | Async HTTP requests |
| **Filesystem** | [std::fs](https://doc.rust-lang.org/std/fs/) | Native file operations |
| **State Management** | Custom | LocalStorage-based persistence |

---

## 🚀 **Quick Start**

### 📥 **Prerequisites**

- [Node.js 18+](https://nodejs.org/) (LTS recommended)
- [Rust 1.77+](https://www.rust-lang.org/) (with cargo)
- [Git](https://git-scm.com/)

### 🛠️ **Installation**

```bash
# Clone the repository
git clone https://github.com/rudra-devlabs/cognetic.git
cd cognetic

# Install frontend dependencies
npm install

# Install Tauri CLI
npm install --global @tauri-apps/cli

# Build and run
npm run tauri dev
```

### 🎯 **Running in Development**

```bash
# Frontend only (no Rust backend)
npm run dev

# Full application with Tauri
npm run tauri dev

# Build for production
npm run tauri build
```

### 📦 **Available Scripts**

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | Build frontend assets |
| `npm run preview` | Preview production build |
| `npm run tauri` | Tauri commands (dev/build) |
| `npm run tauri dev` | Run full application |
| `npm run tauri build` | Build production app |

---

## 🔧 **Configuration**

### 🔑 **Provider Setup**

1. Navigate to **Agents > Integrations**
2. Select your provider from the sidebar
3. Enter your **API Key** and optional **Custom Host**
4. Save configuration

#### **Example: OpenAI Compatible (Custom Endpoint)**
```
Provider: OpenAI Compatible
API Key: sk-your-api-key
Custom Host: https://your-openai-proxy.com/v1
Custom Models:
  - Name: My Model, ID: my-model-7b
```

#### **Example: Ollama (Local)**
```
Provider: Ollama
API Key: (not required)
Custom Host: http://localhost:11434
```

### 🌍 **Web Search Integration**

Configure search providers in **Settings > Integrations > Web Search**:

| Provider | API Key Required | Features |
|----------|------------------|----------|
| Tavily | ✅ Yes | Structured search results |
| Jina | ✅ Yes | AI-powered search |
| Brave | ✅ Yes | Privacy-focused |
| Bing | ✅ Yes | Microsoft search |
| SerpAPI | ✅ Yes | Google results |
| DuckDuckGo | ❌ No | Free, built-in fallback |

### 📁 **Project Configuration**

1. Click **"New Project"** button
2. Enter project name
3. Add folder paths (restricts AI access to these directories)
4. Create project

---

## 📚 **Usage**

### 💬 **Basic Chat**

```
User: Explain quantum computing
AI: [Response with explanation]
```

### 🔧 **Using Tools**

```
User: List all JavaScript files in my project
AI: <tool name="list_files">
dirpath = /path/to/project
</tool>
```

The AI will automatically parse and execute the tool, returning the results.

### 🛠️ **File Operations**

```
# Read a file
User: Show me the contents of app.js

# Edit a file
User: Replace "oldValue" with "newValue" in config.json

# Create a file
User: Create a new file called test.txt with "Hello World"

# Search in files
User: Find all occurrences of "TODO" in the src folder
```

### 🌐 **Web Research**

```
# Search the web
User: What's the latest news about AI in 2026?

# Fetch a webpage
User: Get the content from https://example.com/docs

# Multi-step research
User: Research React best practices and summarize key points
```

### 💻 **System Commands**

```
# Run a command
User: Run "git status" in the current directory

# Get date/time
User: What's today's date?

# Check current directory
User: Where am I?
```

### 📊 **Multi-Tool Workflows**

The AI can execute multiple independent tools in parallel:

```
User: Research React hooks and fetch the official docs

AI: <tool name="search_web">
query = latest React hooks best practices
</tool>
<tool name="fetch_url">
url = https://react.dev/reference/react
</tool>
```

---

## 🔐 **Security**

### 🛡️ **Path Restrictions**

When working within a **Project**:
- AI can only access files within the project's designated folders
- All file operations are validated against the allowed paths
- Attempts to access external directories are **blocked**

### 🚫 **Blocked Commands**

The following commands are **always blocked** for security:
```
rm, del, rmdir, rd, format, mkfs, fdisk, diskpart, dd, shutdown, reboot, 
halt, poweroff, chmod, chown, attrib, takeown, icacls, diskutil, 
sudo, su, passwd
```

### 🔒 **Shell Command Validation**

When using `run_command`:
- Command and arguments are scanned for blocked terms
- Commands run in isolated processes
- Processes can be **killed** via the Tauri backend

### 🌐 **CORS Proxy**

Built-in proxy for APIs with strict CORS policies:
```javascript
// vite.config.js
proxy: {
  '/cors-proxy': {
    target: 'https://integrate.api.nvidia.com',
    changeOrigin: true,
    // CORS headers injected automatically
  }
}
```

---

## 📋 **Project Structure**

```
cognetic/
├── src/                          # Frontend source
│   ├── main.js                   # Entry point
│   ├── global.css                # Global styles
│   ├── style.css                 # Additional styles
│   │
│   ├── core/                     # Core services
│   │   ├── llmService.js         # LLM provider integration
│   │   ├── state.js              # State management
│   │   ├── router.js             # Navigation router
│   │   ├── tauri.js              # Tauri API wrapper
│   │   └── toolEngine.js         # Tool parsing & execution
│   │
│   ├── config/                   # Configuration
│   │   └── systemPrompt.js        # AI system prompt
│   │
│   ├── components/               # Reusable components
│   │   ├── chat/                 # Chat interface
│   │   │   ├── Chat.html
│   │   │   ├── Chat.js
│   │   │   └── Chat.css
│   │   ├── sidebar/              # Left sidebar
│   │   ├── toolbar/              # Top toolbar
│   │   └── FileChangesSummary.js  # Git-like file changes
│   │
│   └── views/                    # Main views
│       ├── home/                 # Main chat interface
│       │   ├── Home.html
│       │   ├── Home.js
│       │   └── Home.css
│       ├── agents/               # Provider configuration
│       │   ├── Agents.html
│       │   ├── Agents.js
│       │   ├── Agents.css
│       │   ├── pages.css
│       │   └── providers.json     # 50+ provider configs
│       ├── browser/              # (Placeholder)
│       ├── channels/             # (Placeholder)
│       └── connectors/           # (Placeholder)
│
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml                # Rust dependencies
│   ├── build.rs                  # Build configuration
│   ├── main.rs                   # Application entry
│   └── lib.rs                    # Tauri commands
│
├── public/                       # Static assets
│   ├── favicon.svg
│   ├── icons/                    # 100+ SVG icons
│   │   ├── ai-logos/             # Provider logos
│   │   └── general/              # General icons
│   └── icons.svg
│
├── dist/                         # Built assets (generated)
├── node_modules/                # npm dependencies
├── package.json                 # Project metadata
├── vite.config.js               # Vite configuration
├── tauri.conf.json             # Tauri configuration
└── index.html                   # HTML entry point
```

---

## 🌍 **Supported Providers**

### 🔥 **Complete List (50+ Providers)**

#### **Major Cloud Providers**

| Provider | Base URL | Models | Status |
|----------|----------|--------|--------|
| **Anthropic** | `https://api.anthropic.com` | Claude 3.5, Claude 3 | ✅ Active |
| **OpenAI** | `https://api.openai.com` | GPT-4o, GPT-3.5 | ✅ Active |
| **Google AI Studio** | `https://generativelanguage.googleapis.com` | Gemini 3 | ✅ Active |
| **Mistral** | `https://api.mistral.ai` | Mistral Large, Mixtral | ✅ Active |
| **DeepSeek** | `https://api.deepseek.com` | DeepSeek V3, R1 | ✅ Active |

#### **Chinese Providers**

| Provider | Base URL | Models | Status |
|----------|----------|--------|--------|
| **Alibaba Cloud (Qwen)** | `https://dashscope.aliyuncs.com` | Qwen 3, Qwen 2.5 | ✅ Active |
| **Z.ai (GLM)** | `https://api.z.ai` | GLM-5, GLM-4.7 | ✅ Active |
| **Moonshot** | `https://api.moonshot.cn` | Kimi K2 | ✅ Active |
| **Minimax** | `https://api.minimax.chat` | Minimax M3 | ✅ Active |
| **SambaNova** | `https://api.sambanova.ai` | Custom | ✅ Active |

#### **Open Source & Local**

| Provider | Base URL | Models | Status |
|----------|----------|--------|--------|
| **Ollama** | `http://localhost:11434` | Llama 3, Mistral, Phi 3 | ✅ Active |
| **LM Studio** | `http://localhost:1234` | 100+ local models | ✅ Active |
| **OpenRouter** | `https://openrouter.ai` | 200+ routed models | ✅ Active |
| **Groq** | `https://api.groq.com` | Llama 3, Mixtral | ✅ Active |
| **Cerebras** | `https://api.cerebras.ai` | GPT-OSS | ✅ Active |

#### **Specialized & Aggregators**

| Provider | Base URL | Models | Status |
|----------|----------|--------|--------|
| **AWS Bedrock** | Custom | Claude, Llama, Titan | ✅ Active |
| **Azure** | Custom | GPT-4, GPT-5 | ✅ Active |
| **Vercel AI Gateway** | `https://gateway.ai.vercel.com` | Multi-provider | ✅ Active |
| **Fireworks AI** | `https://api.fireworks.ai` | Llama, Mixtral | ✅ Active |
| **NVIDIA** | `https://integrate.api.nvidia.com` | Nemotron, Llama | ✅ Active |
| **Nebius** | `https://api.nebius.com` | Custom | ✅ Active |
| **OrcaRouter** | `https://api.orcarouter.ai` | Custom | ✅ Active |
| **Opencode Zen** | `https://opencode.ai` | GPT-5, Claude | ✅ Active |

#### **Custom Endpoints**

| Provider | Type | Use Case |
|----------|------|----------|
| **OpenAI Compatible** | OpenAI API | Any OpenAI-compatible endpoint |
| **Anthropic Compatible** | Anthropic API | Any Anthropic-compatible endpoint |

💡 *See [providers.json](./src/views/agents/providers.json) for complete model lists*

---

## 🎨 **User Interface**

### 🖥️ **Main Layout**

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Toolbar: Model Selector, Settings, etc.]                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌───────────────────────────┐  ┌──────────────┐    │
│  │             │  │                           │  │              │    │
│  │ »PROJECTS   │  │        CHAT AREA          │  │   Memory &   │    │
│  │             │  │                           │  │ Instructions │    │
│  │   →Proj1    │  │  ┌─────────────────────┐  │  │  ┌────────┐  │    │
│  │   →Proj2    │  │  │  Message History    │  │  │  │  1.    │  │    │
│  │   →Proj3    │  │  │  ← AI Response      │  │  │  │  2.    │  │    │
│  │             │  │  │  User Message →     │  │  │  │  3.    │  │    │
│  │ »CHATS      │  │  └─────────────────────┘  │  │  │  4.    │  │    │
│  │   →Chat1    │  │                           │  │  └────────┘  │    │
│  │   →Chat2    │  │  [Prompt Input Area]      │  │              │    │
│  │   →Chat3    │  │                           │  │              │    │
│  └─────────────┘  └───────────────────────────┘  └──────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 🎯 **Key UI Components**

#### **Sidebar (Left)**
- **Projects**: Folder-based workspaces with restricted access
- **Global Chats**: Standalone conversations
- **New Chat Button**: Start fresh conversation
- **Resizable**: Drag to adjust width

#### **Chat Canvas (Center)**
- **Message History**: Conversation with AI
- **Tool Execution**: Visual indication of tool usage
- **Error Cards**: Beautiful, formatted error messages
- **Prompt Input**: Rich text area with attachments

#### **Memory Panel (Right)**
- **Instructions**: Getting started guide
- **Memory Toggle**: Enable/disable conversation memory
- **Quick Actions**: Common workflows

#### **Prompt Box**
- **Model Selector**: Choose active LLM
- **Agent Selector**: Solo Agent or Agent Swarm
- **Attachments**: Drag & drop files/images
- **Send Button**: Submit prompt

---

## 🔧 **Available Tools**

### 📁 **Filesystem Tools**

| Tool | Description | Example |
|------|-------------|---------|
| `read_file` | Read file contents | `filepath = ./src/app.js` |
| `write_file` | Create/overwrite file | `filepath = ./new.txt, content = Hello` |
| `edit_file` | Edit file content | `filepath = config.js, target_text = OLD, content = NEW` |
| `readlines` | Read line range | `filepath = file.txt, startline = 1, endline = 10` |
| `writelines` | Replace line range | `filepath = file.txt, startline = 5, content = new line` |
| `list_files` | List directory | `dirpath = ./src` |
| `search_files` | Text search | `dirpath = ./src, query = function` |
| `glob` | Pattern search | `pattern = **/*.js` |
| `grep` | Regex search | `dirpath = ./src, pattern = ^import` |
| `tree` | Directory tree | `dirpath = ./` |
| `path_stats` | File metadata | `path = ./file.txt` |
| `create_directory` | Make directory | `path = ./new-folder` |
| `delete_path` | Delete file/folder | `path = ./old.txt, recursive = true` |
| `rename_path` | Rename file/folder | `old_path = ./old.txt, new_path = ./new.txt` |

### 🌐 **Web Tools**

| Tool | Description | Example |
|------|-------------|---------|
| `search_web` | Web search | `query = latest AI news` |
| `fetch_url` | Fetch webpage | `url = https://example.com` |
| `next_search_batch` | Next content batch | `url = https://example.com` |

### 💻 **System Tools**

| Tool | Description | Example |
|------|-------------|---------|
| `run_command` | Execute shell command | `command = git, args = status` |
| `date` | Current date/time | No parameters |
| `get_current_dir` | Current directory | No parameters |

---

## 📊 **State Management**

### 💾 **Persistence**

All application state is **automatically persisted** to `localStorage`:

```javascript
// Key: 'cognetic_state'
{
  activeModel: 'OpenAI Compatible',
  intentAnalyzerModel: 'OpenAI Compatible',
  providers: {
    'OpenAI': { apiKey: 'sk-...', apiHost: '' },
    'Anthropic': { apiKey: 'sk-...', apiHost: '' }
  },
  integrations: {
    webSearch: { activeProvider: 'tavily', apiKeys: {...} },
    webFetch: { activeProvider: 'jina', apiKeys: {...} }
  },
  runs: [],
  chats: [
    {
      id: 'chat_123456789',
      title: 'Untitled Conversation',
      messages: [...],
      updatedAt: 1234567890
    }
  ],
  projects: [
    {
      id: 'proj_123456789',
      name: 'My Project',
      paths: ['/path/to/project'],
      chats: [...]
    }
  ],
  activeProjectId: null,
  activeChatId: null
}
```

### 🔄 **Migration**

Automatic migration from older versions:
- Global `messages` → `chats` array
- Project `path` → `paths` array
- Legacy message format normalization

---

## 🐛 **Troubleshooting**

### ❌ **Common Issues & Solutions**

#### **1. Tauri Commands Not Working**
```
Problem: "Tauri is not available" in browser
Solution: Run with `npm run tauri dev` instead of `npm run dev`
```

#### **2. API Connection Failed**
```
Problem: Network/CORS Error
Solutions:
- Verify API key is correct
- Check if provider is accessible from your region
- For NVIDIA: Uses built-in CORS proxy
- For others: May need to configure CORS on server
```

#### **3. Model Not Found**
```
Problem: "Could not find provider configuration"
Solutions:
- Add provider in Agents > Integrations
- Check model name matches provider's model list
- For custom endpoints: Use "OpenAI Compatible" provider
```

#### **4. Path Permission Denied**
```
Problem: "Permission Denied: Path is outside active project"
Solution: 
- Create a Project with the folder path
- Or use Global Chat (no restrictions)
```

#### **5. Command Blocked**
```
Problem: "Command 'rm' is blocked for security reasons"
Solution: This is intentional. Use file tools (delete_path) instead.
```

### 🐞 **Debugging**

#### **Enable Debug Logs**
```javascript
// In development, Tauri logs are enabled automatically
// Check browser console and Tauri terminal output
```

#### **Access State for Debugging**
```javascript
// In browser console:
window.stateManager.getState()    // Get current state
window.router                  // Access router
window.tauriApi                 // Tauri API wrapper
```

#### **Test HTTP Requests**
```javascript
// Use the built-in HTTP client
window.tauriApi.invoke('perform_http_request', {
  url: 'https://api.example.com/test',
  method: 'GET',
  headers: { 'Authorization': 'Bearer token' },
  body: null
})
```

---

## 📈 **Performance Tips**

### ⚡ **Optimize LLM Calls**

1. **Use Intent Analyzer**: Reduces unnecessary tool calls
2. **Batch Operations**: Combine multiple file reads in one prompt
3. **Parallel Tools**: Independent tools execute simultaneously
4. **Context Truncation**: Automatically trims old messages

### 💾 **Reduce Token Usage**

```
✅ Do:
- "Summarize these files" → AI picks relevant ones
- "Search for X in src/" → AI uses grep efficiently
- Use line ranges (readlines) for large files

❌ Avoid:
- "Read all files in this project" → Too many tokens
- Pasting entire large files → Use file references instead
- Repeated similar queries → Use conversation context
```

### 🔧 **Local Providers**

For best performance:
- **Ollama**: `npx ollama pull llama3.2`
- **LM Studio**: Download models locally
- **OpenRouter**: Route to fastest provider

---

## 🤝 **Contributing**

### 🍴 **Fork & Pull Request**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### 🏗️ **Development Guidelines**

#### **Frontend**
- Use existing CSS variables from `global.css`
- Follow component pattern: `Component.html`, `Component.js`, `Component.css`
- Use Lucide icons (`<i data-lucide="icon-name"></i>`)
- Sanitize all HTML with DOMPurify

#### **Backend (Rust)**
- Add new commands to `lib.rs`
- Register in `run()` function
- Use proper error handling with `Result<T, String>`
- Validate all paths for security

#### **Provider Configuration**
- Add to `providers.json` with:
  - `icon`: Path to logo
  - `baseUrl`: API base URL
  - `link`: API key page URL
  - `models`: Array of supported model IDs
  - `apiPath`: Optional path suffix

### 🎯 **Adding New Tools**

1. Add tool parser in `toolEngine.js`:
```javascript
case 'new_tool':
  return await executeNewTool(params);
```

2. Add Rust command if needed (in `lib.rs`):
```rust
#[tauri::command]
fn new_tool_command(param: &str) -> Result<String, String> {
    // Implementation
}
```

3. Update system prompt with tool documentation

---

## 📜 **License**

This project is **MIT Licensed**.

```
MIT License

Copyright (c) 2024 Cognetic

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 **Acknowledgements**

### 🔗 **Libraries & Frameworks**

- **[Tauri](https://tauri.app/)** - The next generation desktop framework
- **[Vite](https://vitejs.dev/)** - Next generation frontend tooling
- **[Rust](https://www.rust-lang.org/)** - Systems programming language
- **[Lucide](https://lucide.dev/)** - Beautiful, community-driven icons
- **[marked.js](https://marked.js.org/)** - Markdown parser and compiler
- **[DOMPurify](https://github.com/cure53/DOMPurify)** - DOM-based HTML sanitizer
- **[Mozilla Readability](https://github.com/mozilla/readability)** - Extract readable content from pages
- **[reqwest](https://docs.rs/reqwest/)** - HTTP client for Rust

### 🎨 **Design Inspiration**

- Modern, minimalist UI inspired by leading AI applications
- Dark theme optimized for long coding sessions
- Responsive layout for various screen sizes

---

## 📞 **Contact & Support**

### 🐙 **GitHub**
```
Repository: https://github.com/rudra-devlabs/cognetic
Issues: https://github.com/rudra-devlabs/cognetic/issues
Discussions: https://github.com/rudra-devlabs/cognetic/discussions
```

---

## 🎉 **Changelog**

### 🚀 **v0.1.0 (Current)**

**Initial Release**

- ✅ Multi-provider LLM support (50+ providers)
- ✅ 25+ built-in tools for filesystem, web, and system
- ✅ Project-based workflow with path restrictions
- ✅ Conversation management with history
- ✅ Intent analysis for smart tool usage
- ✅ Security features (path validation, command blocking)
- ✅ CORS proxy for restricted APIs
- ✅ Beautiful, responsive UI with dark theme
- ✅ Tauri + Rust backend for native performance
- ✅ Cross-platform support (Windows, macOS, Linux)

---

## 🔮 **Roadmap**

### 📅 **Upcoming Features**

| Priority | Feature | Status |
|----------|---------|--------|
| 🔴 High | Plugin System | Planned |
| 🔴 High | Multi-agent Collaboration | Planned |
| 🟡 Medium | Real-time Streaming | In Development |
| 🟡 Medium | Voice Input/Output | Planned |
| 🟡 Medium | Image Generation | Planned |
| 🟢 Low | Mobile App | Future |
| 🟢 Low | Cloud Sync | Future |

### 💡 **Feature Requests**

Have an idea? Open a [Feature Request](https://github.com/rudra-devlabs/cognetic/issues/new?template=feature-request.md)!

---

<div align="center">

## 🤖 **Made with ❤️ and AI**

**Cognetic** - Your intelligent workflow companion

*Build. Think. Repeat.*

```
   ██████╗ ██████╗  ██████╗ ███╗   ██╗███████╗████████╗██╗ ██████╗ 
  ██╔════╝██╔═══██╗██╔════╝ ████╗  ██║██╔════╝╚══██╔══╝██║██╔════╝ 
  ██║     ██║   ██║██║  ███╗██╔██╗ ██║█████╗     ██║   ██║██║      
  ██║     ██║   ██║██║   ██║██║╚██╗██║██╔══╝     ██║   ██║██║      
  ╚██████╗╚██████╔╝╚██████╔╝██║ ╚████║███████╗   ██║   ██║╚██████╗ 
   ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝ ╚═════╝ 
```

[![Star on GitHub](https://img.shields.io/github/stars/rudra-devlabs/cognetic?style=social)](https://github.com/rudra-devlabs/cognetic/stargazers)
[![Fork on GitHub](https://img.shields.io/github/forks/rudra-devlabs/cognetic?style=social)](https://github.com/rudra-devlabs/cognetic/network/members)

</div>

---

*Last updated: June 29, 2026*
