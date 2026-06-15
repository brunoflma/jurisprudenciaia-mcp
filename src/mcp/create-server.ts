import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isOperationalError } from "../errors.js";
import type { JurisprudenciaIaRunner } from "../jurisprudenciaia/types.js";
import {
  TOOL_DEFINITIONS,
  type JurisprudenciaIaToolDefinition,
  normalizeToolInput,
} from "./tool-definition.js";
import { MCP_SERVER_INSTRUCTIONS } from "./instructions.js";

export { normalizeToolInput } from "./tool-definition.js";

export function createJurisprudenciaIaMcpServer(runner: JurisprudenciaIaRunner): McpServer {
  const server = new McpServer(
    {
      name: "jurisprudenciaia-mcp",
      version: "0.1.0"
    },
    {
      instructions: MCP_SERVER_INSTRUCTIONS
    }
  );

  for (const definition of TOOL_DEFINITIONS) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema
      },
      async (input) => runTool(definition, input, runner)
    );
  }

  return server;
}

async function runTool(
  definition: JurisprudenciaIaToolDefinition,
  input: unknown,
  runner: JurisprudenciaIaRunner
) {
  try {
    const normalized = definition.normalizeInput(input);
    const result = await runner.search(normalized);
    const text = normalized.includeDebug && result.rawText
      ? `${result.markdown}\n\n## Debug\n\n\`\`\`text\n${result.rawText}\n\`\`\``
      : result.markdown;

    return {
      content: [{ type: "text" as const, text }]
    };
  } catch (error) {
    if (isOperationalError(error)) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Falha ao consultar JurisprudenciaIA (${error.code}): ${error.message}`
          }
        ]
      };
    }

    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Falha inesperada ao consultar JurisprudenciaIA. Tente novamente mais tarde."
        }
      ]
    };
  }
}
