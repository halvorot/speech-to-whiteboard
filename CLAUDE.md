# CLAUDE.md

## 1. Project Overview
**Name:** Speech-to-Whiteboard (Project "VoiceBoard")
**Goal:** A real-time collaborative whiteboard that uses voice commands to generate, arrange, and modify diagrams.
**Philosophy:**
* **Professional Hobbyist:** High code quality and security, but relying on Free Tier/Open Source tools.
* **Pragmatic:** Start simple (YAGNI), but extensible. Do not over-engineer (e.g., no microservices yet).
* **Real-Time First:** Latency is the enemy. Prefer WebSockets over REST for interaction.

## 2. Technology Stack
### Frontend
* **Framework:** React (Vite) + TypeScript.
* **Whiteboard:** `tldraw` (engine & UI).
* **Layout Engine:** `elkjs` (Eclipse Layout Kernel) for client-side graph auto-layout.
* **Styling:** Tailwind CSS.
* **State:** React Context + tldraw `store`.

### Backend
* **Language:** Kotlin (JVM).
* **Framework:** Ktor (Server/Netty).
* **Build Tool:** Gradle (Kotlin DSL).
* **AI Clients:** Deepgram (STT), Groq (Llama 3 for fast logic), Anthropic (Claude 3.5 Sonnet for review).

### Infrastructure & Data
* **Database/Auth:** Supabase (Postgres + GoTrue/Auth).
* **Deployment:** Docker container (Backend), Static site (Frontend).

## 3. Architecture & Data Flow
1. **Audio:** Browser Mic -> WebSocket -> Ktor -> Deepgram (Stream) -> Transcript.
2. **Command:** Transcript -> Ktor -> Groq (Llama 3) -> "Sketch Protocol" JSON.
3. **Visuals:** JSON -> Frontend WebSocket -> ELK.js (Math) -> tldraw (Render).
4. **Review:** tldraw Snapshot -> Ktor -> Claude 3.5 Sonnet -> Markdown Report.

## 4. Development Commands

### Makefile Commands (from root)
```bash
make help          # Show all available commands
make install       # Install all dependencies
make setup-env     # Create .env files from examples
make dev-client    # Start frontend (http://localhost:5173)
make dev-server    # Start backend (port 8080)
make build         # Build both projects
make clean         # Clean build artifacts
make check-env     # Verify environment setup
make lint          # Lint frontend code
```

### Direct Commands

**Frontend (client/):**
```bash
npm install        # Install dependencies
npm run dev        # Start dev server
npm run build      # Build for production
npm run lint       # Lint code
```

**Backend (server/):**
```bash
./gradlew build    # Build project
./gradlew run      # Run server
./gradlew clean    # Clean build artifacts
```

### Environment Setup
- Create `.env` files in both `client/` and `server/` directories
- See `.env.example` files for required variables
- Backend requires: SUPABASE_URL, DEEPGRAM_API_KEY, GROQ_API_KEY
- Frontend requires: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_WS_URL
- Backend uses HS256 for local Supabase, RS256/JWKS for production

## 5. Implementation Roadmap
Use this checklist to track progress. **Do not skip stages.**

- [x] **Stage 1: The Skeleton**
    - [x] Setup Monorepo structure (client/server).
    - [x] Configure Supabase Auth (Frontend & Backend verification).
    - [x] Setup Ktor WebSocket server with Auth guards.
    - [x] Implement Deepgram live streaming (Mic -> Text).
    - [x] UI: Basic tldraw canvas + Push-to-Talk button + Transcript Toast.

- [x] **Stage 2: The Semantic Engine**
    - [x] Implement Groq Client in Kotlin.
    - [x] Implement "Sketch Protocol" System Prompt (see Section 7).
    - [x] Create Backend Logic to maintain "Current Graph State" (node IDs).
    - [x] WebSocket: Stream JSON commands to client.
    - [x] Fix audio format (webm/opus auto-detect).
    - [x] Add ContentNegotiation for Groq HTTP client.
    - [x] Strip markdown code fences from Groq responses.

- [x] **Stage 3: The Visualizer**
    - [x] Client: Integrate `elkjs`.
    - [x] Logic: Convert "Sketch Protocol" JSON -> ELK Graph -> tldraw Shapes.
    - [x] Implement automatic layout and rendering.
    - [x] Add bidirectional edge support.
    - [x] Implement edge manipulation (create, delete, reverse, bidirectional).
    - [x] Handle empty action notifications.
    - [x] Fix JSON parsing for array/object formats.
    - [x] **Frames/Grouping Support:**
        - [x] Add frame node type with parent-child relationships.
        - [x] Implement hierarchical ELK layout for frames.
        - [x] Create colored frame backgrounds (semantic color scheme).
        - [x] Apply semantic colors to nodes (database=green, server=blue, etc.).
        - [x] Update system prompt to teach AI about frames and grouping.

- [ ] **Stage 3.5: Advanced Shape Types**
    - [ ] **Text Boxes:**
        - [ ] Add text box node type (headers, body text, captions).
        - [ ] Implement rich text formatting support (bold, italic, lists).
        - [ ] Update Sketch Protocol for text box actions.
    - [ ] **Notes/Annotations:**
        - [ ] Add sticky note shape type.
        - [ ] Implement note positioning and styling.
        - [ ] Support voice commands for note creation.
    - [ ] **Images:**
        - [ ] Add image node type to Sketch Protocol.
        - [ ] Implement AI stock image selection based on descriptions.
        - [ ] Integrate image fetching and rendering in tldraw.
    - [ ] **System Integration:**
        - [ ] Update system prompt with examples for all new shape types.
        - [ ] Test all shape types working together.
        - [ ] Ensure proper layout and color coordination.

- [ ] **Stage 4: The Architect (Review)**
    - [ ] UI: "Review Board" button.
    - [ ] Logic: Export tldraw snapshot -> Sanitize JSON -> Send to Claude Sonnet.
    - [ ] UI: Render Markdown response in side panel.

- [ ] **Stage 5: Persistence**
    - [ ] Save graph state to Supabase per user.
    - [ ] Load graph state on WebSocket connect.
    - [ ] Auto-save on graph changes.

- [ ] **Stage 6: Multi-Language Support**
    - [ ] Add language selection UI component.
    - [ ] Configure Deepgram language parameter for STT.
    - [ ] Update backend to accept language preferences via WebSocket.
    - [ ] Test with multiple languages (e.g., English, Spanish, French).
    - [ ] Store user language preference in Supabase.

## 6. Coding Standards
### Kotlin (Backend)
* **Coroutines:** Use `Dispatchers.IO` for network calls.
* **Serialization:** Use `kotlinx.serialization` for all JSON handling.
* **Structure:** Feature-based packaging (e.g., `features/transcription`, `features/drawing`).
* **Error Handling:** Wrap external API calls in `Result<T>` or `try/catch` blocks; never crash the socket.

### TypeScript (Frontend)
* **Strict Mode:** No `any`. Define Interfaces for all WebSocket messages.
* **Components:** Functional components only.
* **tldraw:** Interact with the store via `editor.store.mergeRemoteChanges` or `editor.createShapes` to ensure undo/redo history works.

## 7. The "Sketch Protocol" & System Prompt
**Model:** Llama 3 (via Groq)
**Temperature:** 0.1
**Response Format:** JSON Object

**System Prompt Content:**
```text
You are the core logic engine for a real-time whiteboard application.
Your goal is to translate spoken user intentions into structured JSON graph operations.

INPUTS:
1. "current_graph_summary": List of existing node IDs/labels.
2. "user_prompt": The spoken command.

OUTPUT SCHEMA:
{
  "actions": [
    {
      "action": "create_node" | "update_node" | "delete_node" | "create_edge" | "delete_edge",
      "id": "string (short, readable, e.g., 'web_server_1')",
      "label": "string",
      "type": "database" | "server" | "client" | "storage" | "network" | "unknown",
      "target_id": "string (for edges)",
      "source_id": "string (for edges)"
    }
  ]
}

RULES:
1. Infer type based on label (Redis -> database).
2. If user says "connect A to B", generate the edge.
3. If user refers to "it", infer context from recent nodes.
4. Ignore filler words.
```