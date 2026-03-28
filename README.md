# chatcli

A CLI app that combines custom LLM, MCP (Model Context Protocol) and loadable Skills for working in the pipeline. Built with [Bun](https://bun.sh).

## Features

- **Custom LLM** — Connect to any OpenAI-compatible API endpoint (Ollama, LM Studio, vLLM, etc.)
- **MCP Support** — Connect to MCP servers via stdio or remote HTTP and use their tools
- **Skills** — Load custom skill modules from a directory (TypeScript, JavaScript, or Markdown)
- **Streaming** — Responses stream in real-time from the LLM
- **Interactive CLI** — Chat with your LLM using slash commands

## Prerequisites

- [Bun](https://bun.sh) v1.0 or later

## Quick Start

```bash
# Install dependencies
bun install

# Copy the example config and edit it
cp chatcli.config.example.json chatcli.config.json

# Or use environment variables (see .env.example)
cp .env.example .env

# Run the CLI
bun run start
```

## Configuration

chatcli can be configured via a JSON config file or environment variables. Environment variables take precedence.

### Config file (`chatcli.config.json`)

```json
{
  "llm": {
    "baseURL": "http://localhost:11434/v1",
    "apiKey": "no-key",
    "model": "llama3",
    "systemPrompt": "You are a helpful assistant."
  },
  "mcpServers": {
    "local-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    },
    "remote-server": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  },
  "skillsDir": "skills"
}
```

### MCP Server Types

**Stdio (local)** — starts a local process and communicates via stdin/stdout:

```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-everything"]
}
```

**HTTP (remote)** — connects to a remote MCP server using Streamable HTTP:

```json
{
  "type": "http",
  "url": "https://mcp.example.com/mcp",
  "headers": {
    "Authorization": "Bearer your-api-key"
  }
}
```

**SSE (legacy alias)** — `"type": "sse"` remains supported for compatibility:

```json
{
  "type": "sse",
  "url": "https://mcp.example.com/sse",
  "headers": {
    "Authorization": "Bearer your-api-key"
  }
}
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `CHATCLI_LLM_BASE_URL` | LLM API base URL | `http://localhost:11434/v1` |
| `CHATCLI_LLM_API_KEY` | API key | `no-key` |
| `CHATCLI_LLM_MODEL` | Model name | `llama3` |
| `CHATCLI_SYSTEM_PROMPT` | System prompt | — |
| `CHATCLI_SKILLS_DIR` | Skills directory | `skills` |

## CLI Commands

| Command | Description |
|---|---|
| `/help` | Show help |
| `/skills` | List loaded skills |
| `/skill <name> <input>` | Invoke a skill |
| `/mcp servers` | List connected MCP servers |
| `/mcp tools` | List available MCP tools |
| `/clear` | Clear conversation history |
| `/exit` | Exit chatcli |

## Skills

Skills are modules that extend chatcli. Place them in the skills directory (default: `skills/`).

### TypeScript/JavaScript skills

Export a `Skill` object as the default export:

```typescript
import type { Skill } from "../src/types.ts";

const mySkill: Skill = {
  name: "greet",
  description: "Greet someone by name",
  async invoke(input: string) {
    return { content: `Hello, ${input}!` };
  },
};

export default mySkill;
```

### Markdown skills

Create a `.md` file with YAML frontmatter (`name`, `description`) and a body template. Use `{input}` as a placeholder for the invocation input:

```markdown
---
name: summarize
description: Summarize the given text into a concise paragraph
---

Please provide a concise summary of the following text:

{input}
```

### Built-in example skills

- `reverse` — Reverses input text
- `datetime` — Returns the current date and time
- `summarize` — Prompt template for text summarization (markdown)

## Project Structure

```
src/
  index.ts          Entry point
  cli.ts            Interactive CLI / REPL
  config.ts         Configuration loader
  types.ts          Shared TypeScript types
  llm/
    provider.ts     OpenAI-compatible LLM provider
  mcp/
    client.ts       MCP stdio client manager
  skills/
    registry.ts     Skill loader and registry
skills/             User skill modules
  reverse.ts        Example: reverse text
  datetime.ts       Example: current datetime
```

## Testing

```bash
bun test
```

## License

MIT

