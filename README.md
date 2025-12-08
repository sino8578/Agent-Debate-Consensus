# AI Group Chat

A group chat application where multiple AI models can converse with you and each other. Built with Next.js and powered by OpenRouter.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-4-cyan)

## Features

- **Multi-Model Chat**: Chat with multiple AI models simultaneously
- **@Mentions**: Tag specific models with `@Kimi`, `@Claude`, `@Gemini`, or `@Grok`
- **Organic Conversations**: Models respond naturally and can interact with each other
- **Streaming Responses**: See responses as they're generated token-by-token
- **Typing Indicators**: Know when a model is thinking
- **Stop Button**: Cancel all responses instantly

## Available Models

| Model | Provider | Tag |
|-------|----------|-----|
| Kimi K2 | Moonshot AI | @Kimi |
| Gemini 3 Pro | Google | @Gemini |
| Claude Haiku 4.5 | Anthropic | @Claude |
| Grok 4.1 Fast | xAI | @Grok |

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/AllAboutAI-YT/llm-grpchat.git
cd llm-grpchat
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Create a `.env` file in the root directory:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Get your API key from [OpenRouter](https://openrouter.ai/keys).

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Select Models**: Click on models in the left sidebar to add them to the chat
2. **Send Messages**: Type in the input box and press Enter or click Send
3. **@Mention Models**: Use `@ModelName` to direct a message to a specific model
4. **Stop Generation**: Click the Stop button to cancel all ongoing responses
5. **Clear Chat**: Use the Clear Chat button to start fresh

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **State**: Zustand
- **API**: OpenRouter (unified API for multiple LLM providers)
- **Streaming**: Server-Sent Events (SSE)

## Project Structure

```
src/
├── app/
│   ├── api/chat/route.ts    # Streaming API endpoint
│   ├── globals.css          # Theme and animations
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main page
├── components/
│   ├── ChatContainer.tsx    # Main chat orchestrator
│   ├── ChatInput.tsx        # Message input with stop button
│   ├── MessageBubble.tsx    # Individual message display
│   ├── MessageList.tsx      # Scrollable message container
│   ├── ModelSelector.tsx    # Model toggle buttons
│   ├── ActiveModels.tsx     # Shows active models
│   └── TypingIndicator.tsx  # "X is thinking..." display
├── lib/
│   ├── conversationEngine.ts # Response logic and queuing
│   ├── models.ts            # Model definitions
│   └── streamHandler.ts     # API streaming utilities
├── store/
│   └── chatStore.ts         # Zustand state management
└── types/
    └── chat.ts              # TypeScript interfaces
```

## License

MIT
