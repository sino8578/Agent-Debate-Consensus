# Agent Debate Consensus

**Multi-agent AI debate platform — watch state-of-the-art models discuss, argue, and find consensus while you moderate.**

🇬🇧 [English](README.md) | 🇷🇺 [Русский](README.ru.md) | 🇺🇦 [Українська](README.uk.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss) ![License](https://img.shields.io/badge/license-MIT-green)

---

## The Problem

A single AI gives you one perspective. One training dataset. One set of biases. One reasoning style.

You're not seeing the full picture. You're seeing *an* answer, not *the* best answer.

## The Solution

**Agent Debate Consensus** forces multiple state-of-the-art AI models into structured debate. They argue. They challenge. They build on each other's insights. Different models have different strengths — combining them reveals what any single model would miss.

The result? More complete analysis. Sharper reasoning. Consensus born from genuine intellectual contest, not statistical aggregation.

---

## Why This Matters

- **Stress-test ideas** before committing resources. Expose weak assumptions through adversarial discussion.
- **Explore complexity** with multiple perspectives simultaneously. Strategy, ethics, technical decisions — see all sides in one conversation.
- **Understand disagreement**. When models don't converge, that tells you something important about the problem.
- **Faster decisions**. Real-time parallel responses from 4+ models beats running them sequentially.
- **Transparent reasoning**. Watch how each model builds its argument. See the logic, not just the conclusion.

---

## Live Demo

Try it now: **[lryq.com](https://lryq.com)**

No signup required for basic testing. Deploy with your own OpenRouter API key for full model access.

---

## Core Features

### Multi-Agent Debates
Up to 8 AI agents debate simultaneously (configurable via `MAX_ACTIVE_MODELS`). Each model contributes independently, then reacts to others' arguments. Per-model round tracking ensures fair contribution — no model dominates the conversation.

**Default lineup:**
- **Kimi K2** (Moonshot AI) — deep reasoning, excellent at nuance
- **Gemini 3 Pro** (Google) — broad knowledge, strong pattern recognition
- **Claude Haiku 4.5** (Anthropic) — clear logic, balanced perspective
- **Grok 4.1 Fast** (xAI) — quick thinking, contrarian edge

Plus 400+ additional models available via OpenRouter's catalog.

### Real-time Streaming
No waiting for complete responses. Tokens appear as they're generated via Server-Sent Events (SSE). Watch the models think in real time.

### Smart Debate Engine
- **Per-model round tracking** — 2 rounds per model per user message
- **Priority-based queuing** — prevents models from stepping on each other
- **Cooldown management** — fair opportunity for all participants
- **Question detection** — automatically triggers all models when it detects a question
- **Context window intelligence** — user question always pinned (never pushed out), correct role mapping

### @Mention System
Direct questions to specific agents with `@Kimi`, `@Gemini`, `@Claude`, or `@Grok`. Press `@` to see the dropdown. Navigate with arrow keys, select with Enter or Tab.

Each mention is color-coded with the agent's unique color — visually distinct in chat.

### AI Moderator Role
Designate any model as debate moderator with a star icon. The moderator:
- Synthesizes and summarizes key points
- Resolves conflicts between positions
- Proposes paths to consensus
- Auto-reassigns if the moderator fails to respond

This transforms debate from parallel monologues into actual dialogue.

### Boost Button
See an idea worth developing? Click the lightning bolt on any AI message to say "develop this further." The platform creates a synthetic user message quoting the idea, prompting deeper exploration.

One-click idea amplification.

### Temperature Control
Choose your debate style:
- **Creative** (0.9) — exploratory, generates novel perspectives
- **Balanced** (0.7) — thoughtful, good for most debates
- **Precise** (0.3) — analytical, minimizes tangents

Styled as a segmented control in the sidebar for instant switching.

### Agent Discovery
Browse and add 400+ models from OpenRouter's catalog. Not satisfied with the default lineup? Swap agents mid-debate. Experiment with different combinations.

The lineup you build is yours.

### Extended Thinking Support
Models with reasoning/chain-of-thought capabilities show their working. Thinking steps collapse by default ("Thinking..." section), expandable for full transparency into model reasoning.

### Topic Pinning
Your first message appears as a pinned banner at the top of chat. Never lose sight of what you're debating about as the conversation grows.

### Debate Sessions
Save, load, delete entire debates. Auto-saves when switching or starting new debates. Full state restoration:
- All messages (with streaming state preserved)
- Active models
- Moderator assignment
- Temperature settings
- Debate topic

Resume complex conversations weeks later.

### Export & Copy
- **Export to Markdown** — Download entire debate as a `.md` file for documentation, sharing, or archiving
- **Copy Messages** — Copy any individual message to clipboard in Markdown format

### Model Failure Handling
- Red indicators for failed models
- Tooltip shows error detail
- Auto-moderator reassignment if moderator fails
- Retry button to attempt recovery

Robust even when some models stumble.

### Extended UI Controls
- **Dark/Light Theme** — Toggle in sidebar header for comfortable reading any time
- **Font Size Slider** — Adjust for comfortable long reading sessions
- **Click-to-Expand** — Long messages auto-collapse with gradient fade; click to expand/collapse
- **Mobile Responsive** — Sidebar overlay with backdrop on mobile, fixed on desktop
- **Collapsible Sidebar** — Toggle with animation, hamburger menu when collapsed

### Public Mode
Deploy without requiring API keys on the server. Users provide their own OpenRouter credentials. Ideal for shared instances and open experimentation.

---

## How It Works: The Debate Algorithm

1. **Topic Injection** — You introduce a topic or question. All active agents receive it as context, unaware of what others will draft.

2. **Independent Responses** — Each agent formulates a position based on the question, their training, and their reasoning style.

3. **Cross-Pollination** — Subsequent rounds include prior agent responses in the context. Models can now react, challenge, build on, or refute what others said.

4. **Per-Model Rounds** — Each model gets up to 2 response rounds per user message. This ensures fair participation — no single model dominates by responding faster.

5. **Moderation** — You or an AI moderator intervenes: clarify terms, challenge weak arguments, direct questions to specific agents, propose synthesis.

6. **Boost** — Identify promising arguments and develop them further with one click.

7. **Convergence** — Through iterative exchange, agents refine positions, acknowledge stronger arguments, and move toward consensus — or surface irreconcilable differences worth knowing about.

The result: **genuine dialogue between different minds**, not just parallel independent predictions.

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Lexus2016/Agent-Debate-Consensus.git
cd Agent-Debate-Consensus
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env.local` file in the project root:

```env
OPENROUTER_API_KEY=your_api_key_here
MAX_ACTIVE_MODELS=8
```

- Get your API key from [openrouter.ai/keys](https://openrouter.ai/keys)
- `MAX_ACTIVE_MODELS` sets the debate participant limit (default: 8, recommended max)

For **public mode** (users provide their own keys), leave `OPENROUTER_API_KEY` empty.

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Usage

1. **Select agents** from the sidebar (toggle the default lineup or add custom models)
2. **Set debate style** with the temperature control (Creative, Balanced, or Precise)
3. **Choose a topic** — ask a question or pose a scenario
4. **Watch the debate** — agents respond in real time, building on each other's arguments
5. **Use @mentions** to direct specific questions: `@Claude, what about scalability?`
6. **Designate a moderator** with the star icon to synthesize and guide consensus
7. **Boost promising ideas** with the lightning bolt for deeper exploration
8. **Export or copy** messages as needed for documentation or sharing
9. **Save the session** — resume complex debates later with full context intact

---

## Available Models

| Agent | Provider | @Mention | Type |
|-------|----------|----------|------|
| Kimi K2 | Moonshot AI | `@Kimi` | Default |
| Gemini 3 Pro | Google | `@Gemini` | Default |
| Claude Haiku 4.5 | Anthropic | `@Claude` | Default |
| Grok 4.1 Fast | xAI | `@Grok` | Default |
| 400+ more | OpenRouter catalog | via Agent Discovery | Custom |

Switch agents mid-debate. Test different model combinations. Build your ideal debate team.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js 16 (App Router, Turbopack) | Fast builds, edge-ready |
| **Language** | TypeScript 5 | Full type safety |
| **Styling** | Tailwind CSS v4 | With @theme directive |
| **State** | Zustand (persist middleware) | localStorage integration |
| **API Routing** | OpenRouter (via OpenAI SDK) | 400+ models, single interface |
| **Streaming** | Server-Sent Events (SSE) | Real-time token delivery |

---

## Commands

```bash
npm run dev      # Start development server on http://localhost:3000
npm run build    # Create production-optimized build
npm run start    # Run production build locally
npm run lint     # Check code quality with ESLint
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | (empty) | Your OpenRouter API key. Leave empty for public mode. |
| `MAX_ACTIVE_MODELS` | `8` | Maximum simultaneous debate participants. Adjust based on your OpenRouter plan. |

---

## Project Structure

```
Agent-Debate-Consensus/
├── src/
│   ├── app/                 # Next.js app router
│   │   ├── api/chat/       # Streaming chat endpoint
│   │   ├── api/models/     # Model discovery endpoint
│   │   └── layout.tsx      # Root layout
│   ├── components/          # React components
│   │   ├── ChatContainer   # Main debate view
│   │   ├── MessageBubble   # Individual message rendering
│   │   ├── ModelSelector   # Agent selection UI
│   │   └── ModelDiscoveryModal  # Browse OpenRouter catalog
│   ├── lib/                 # Utilities
│   │   └── streamHandler   # SSE streaming logic
│   ├── store/              # Zustand state management
│   │   └── chatStore       # Debate state, persistence
│   └── types/              # TypeScript interfaces
│       └── chat.ts         # Message, Model, Debate types
├── public/                 # Static assets
├── package.json
├── tailwind.config.ts      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
└── next.config.ts          # Next.js configuration
```

---

## Contributing

We welcome contributions! Whether it's bug fixes, feature requests, or improvements to the debate algorithm:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

**Areas we're actively developing:**
- Additional debate strategies and moderator behaviors
- Extended thinking support for more models
- Custom model fine-tuning options
- Debate analytics and consensus metrics
- Multi-language support expansion

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## License

MIT License — use this in any project, commercial or personal. See [LICENSE](LICENSE) for full details.

**Author:** [Lexus2016](https://github.com/Lexus2016)

**Repository:** [github.com/Lexus2016/Agent-Debate-Consensus](https://github.com/Lexus2016/Agent-Debate-Consensus)

---

## Support

- **Issues & Bug Reports:** [GitHub Issues](https://github.com/Lexus2016/Agent-Debate-Consensus/issues)
- **Live Demo:** [lryq.com](https://lryq.com)
- **API Documentation:** [OpenRouter API Docs](https://openrouter.ai/docs/api)

---

**Made with clarity in mind. Let multiple perspectives guide your decisions.**
