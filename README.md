# Agent Debate Consensus

**Put 4+ AI models in one room and make them debate any topic. You moderate. They argue, challenge each other, and find consensus — live, in real time.**

**[Try the live demo at lryq.com](https://lryq.com)** — no signup needed, works instantly.

🇬🇧 [English](README.md) | 🇷🇺 [Русский](README.ru.md) | 🇺🇦 [Українська](README.uk.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss) ![License](https://img.shields.io/badge/license-MIT-green) ![Version](https://img.shields.io/badge/version-2.4.2-blue)

> **v2.4.2** — Performance: React.memo + memoized markdown components eliminate browser slowdown in long debates. Chat input vertical alignment fixed.

---

## What Is This?

When you ask ChatGPT or Claude a question, you get **one answer from one model**. That's one perspective, one set of biases, one reasoning style. You have no idea what you're missing.

Agent Debate Consensus changes that. You pick a topic, select 2–8 AI models (like Claude, Gemini, Grok, Kimi), and they **debate each other in real time** — arguing, challenging weak points, and building on each other's ideas. You watch the conversation unfold token by token, and you can jump in at any moment to steer the discussion.

**Think of it as a roundtable of AI experts that you moderate.**

### What can you use it for?

- **Making better decisions** — Before committing to a strategy, let 4 AI models stress-test it from different angles. Weak assumptions get exposed fast.
- **Exploring complex topics** — Ethics, politics, technology trade-offs — see all sides in one conversation instead of asking each model separately.
- **Understanding where AI disagrees** — When models can't reach consensus, that tells you something important about the problem.
- **Getting faster answers** — 4 models responding in parallel is faster than asking them one by one.
- **Seeing the reasoning, not just the answer** — Watch each model build its argument step by step.

### How does it work in practice?

1. Open the app and pick which AI models you want in the debate
2. Type your question or topic
3. Watch the models respond one by one, each seeing what others said
4. Jump in anytime with follow-ups, challenges, or @mention a specific model
5. Optionally assign a moderator to synthesize the discussion
6. Export the whole debate as a Markdown file when done

That's it. No complicated setup, no workflows to learn.

---

## Core Features

### Multi-Agent Debates
Up to 8 AI agents debate simultaneously (configurable via `MAX_ACTIVE_MODELS`). Each model contributes independently, then reacts to others' arguments.

**Default lineup (all free):**
- **Nemotron 3 Super 120B** (NVIDIA) — powerful reasoning, zero cost
- **Llama 3.3 70B** (Meta) — versatile, strong at analysis
- **Mistral Small 3.1** (Mistral AI) — fast, compact, multilingual
- **Gemma 3 27B** (Google) — efficient, great at structured output

Plus 400+ additional models available via OpenRouter's catalog.

### 3-Phase Debate Engine
The debate follows a structured flow:

1. **Opening (Phase 1)** — All models share their independent perspective on the topic. The moderator speaks last to hear all views first.
2. **Discussion (Phase 2)** — Models challenge, question, and build on each other's arguments via @mentions. Bounded by per-model (5) and total (8) discussion caps to prevent infinite loops.
3. **Summary (Phase 3)** — The moderator (or a random summarizer if none assigned) provides a final synthesis with justified conclusions.

Under the hood: priority-based queue (opening=80, discussion=70, summary=50), 10s cooldowns, simulated reading delays for natural pacing.

### @Mention System
Direct questions to specific agents with `@Nemotron`, `@Llama`, etc. Press `@` to see the dropdown. Navigate with arrow keys, select with Enter or Tab.

- **@ModelName** — Direct a question or challenge to one participant
- **@ALL** — Address all participants at once; everyone who already spoke will respond
- Color-coded mentions — each agent's unique color, visually distinct in chat

### AI Moderator (Participant + Guide)
Designate any model as moderator with the star icon. The moderator is a **full participant**:
- Shares its own opinion in the opening phase (speaks last)
- Evaluates and challenges other participants' arguments during discussion
- Uses @mentions and @ALL to direct the conversation
- Provides final summary with justified conclusions when discussion settles
- Up to 3 moderation cycles (discussion settles, moderator intervenes, repeat)
- Auto-reassigns if the moderator model fails

### Retry Logic
When a model returns an error, the system automatically retries:
- 3 retries with progressive delays (5s, 15s, 30s)
- Status messages in chat ("Model: error, retrying 1/3...")
- Final failure message if all retries exhausted
- Automatic moderator reassignment on failure

### File Attachments
Attach text files (code, markdown, CSV, JSON, config files up to 100KB) to your messages. Files are included in the AI context so models can analyze, review, or discuss attached content.

### Real-time Streaming
Tokens appear as they're generated via Server-Sent Events (SSE). Watch the models think token by token in real time.

### Boost Button
Click the lightning bolt on any AI message to say "develop this further." One-click idea amplification.

### Temperature Control
- **Creative** (0.9) — exploratory, generates novel perspectives
- **Balanced** (0.7) — thoughtful, good for most debates
- **Precise** (0.3) — analytical, minimizes tangents

### Agent Discovery
Browse and add 400+ models from OpenRouter's catalog. Swap agents mid-debate.

### Web Search
Toggle the globe icon to enable real-time web search. Powered by OpenRouter's `:online` mode — models access current internet data alongside their training knowledge.

### Extended Thinking Support
Models with reasoning/chain-of-thought capabilities show their working. Thinking steps collapse by default, expandable for full transparency.

### Export & Copy
- **Export to Markdown** — Full debate with participant list, moderator info, and timestamps
- **Copy Messages** — Copy any individual message to clipboard in Markdown format

### Debate Sessions
Save, load, delete entire debates. Auto-saves when switching. Full state restoration including messages, models, moderator, temperature, and topic.

### Proactive API Key
Even in public mode with free models, users can add their own OpenRouter API key at any time via the sidebar button — unlocking all models, web search, and avoiding rate limits.

### Model Failure Handling
Red indicators, error tooltips, auto-moderator reassignment, retry button for recovery.

### Extended UI Controls
- **Dark/Light Theme** — Toggle in sidebar header
- **Font Size Slider** — Adjust for comfortable reading
- **Click-to-Expand** — Long messages auto-collapse with gradient fade
- **Mobile Responsive** — Sidebar overlay on mobile, fixed on desktop
- **Onboarding** — Clear visual cues when no agents are active

### Public Mode
Deploy without requiring API keys. Users provide their own OpenRouter credentials. Free models work instantly; paid models require a user key.

---

## How It Works: The Debate Algorithm

1. **Topic Injection** — You pose a question or topic. All active agents receive it as context.

2. **Opening Phase** — Each agent formulates an independent position. The moderator speaks last to hear all views first. Priority queue ensures fair ordering.

3. **Discussion Phase** — Agents challenge each other via @mentions. Back-and-forth exchanges are bounded by per-model (5) and total (8) caps. Use @ALL to trigger all participants.

4. **Moderation** — The AI moderator (or you) intervenes: evaluates arguments, challenges weak points, directs questions, proposes synthesis. Up to 3 moderation cycles.

5. **Summary Phase** — When discussion settles, the moderator provides a final synthesis with justified conclusions. The round ends, and you can start a new topic.

The result: **structured dialogue between different minds** with clear phases, fair participation, and definitive conclusions.

---

## Quick Start

### Option A: NPX (fastest)

```bash
npx degit Lexus2016/Agent-Debate-Consensus my-debate
cd my-debate
npm install
cp .env.example .env.local   # Edit with your API key
npm run dev
```

### Option B: Git Clone

```bash
git clone https://github.com/Lexus2016/Agent-Debate-Consensus.git
cd Agent-Debate-Consensus
npm install
cp .env.example .env.local   # Edit with your API key
npm run dev
```

### Configure Environment

Edit `.env.local`:

```env
OPENROUTER_API_KEY=your_api_key_here
MAX_ACTIVE_MODELS=8
```

- Get your API key from [openrouter.ai/keys](https://openrouter.ai/keys)
- `MAX_ACTIVE_MODELS` sets the debate participant limit (default: 8)
- For **public mode** (users provide their own keys), leave `OPENROUTER_API_KEY` empty

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Updating

**If you installed via Git Clone:**
```bash
git pull origin main
npm install
```

**If you installed via NPX degit:**
```bash
npx degit Lexus2016/Agent-Debate-Consensus my-debate-updated
```
Then copy your `.env.local` from the old directory to the new one.

**Install a specific version:**
```bash
npx degit Lexus2016/Agent-Debate-Consensus#v2.1.0 my-debate
```

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

| Agent | Provider | @Mention | Cost |
|-------|----------|----------|------|
| Nemotron 3 Super 120B | NVIDIA | `@Nemotron` | Free |
| Llama 3.3 70B | Meta | `@Llama` | Free |
| Mistral Small 3.1 | Mistral AI | `@Mistral` | Free |
| Gemma 3 27B | Google | `@Gemma` | Free |
| 400+ more | OpenRouter catalog | via Agent Discovery | Varies |

All default models are free. Switch agents mid-debate. Add premium models with your own API key.

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
| `APP_MODE` | `private` | `private` — full access with server key. `public` — free models without key, paid models require user key. |
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
