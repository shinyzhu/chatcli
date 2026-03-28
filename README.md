# chatcli

A CLI app that combines custom LLM, MCP (Model Context Protocol) and loadable Skills for working in the pipeline. Built with [Bun](https://bun.sh).

## Features

- **Custom LLM** — Connect to any OpenAI-compatible API endpoint (Ollama, LM Studio, vLLM, etc.)
- **MCP Support** — Connect to MCP servers via stdio and use their tools
- **Skills** — Load custom skill modules from a directory to extend functionality
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
    "my-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    }
  },
  "skillsDir": "skills"
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

Skills are TypeScript/JavaScript modules that export a `Skill` object. Place them in the skills directory (default: `skills/`).

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

Two example skills are included:
- `reverse` — Reverses input text
- `datetime` — Returns the current date and time

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

