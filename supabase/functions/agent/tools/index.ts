import { getCurrentTime } from './get-current-time.ts';
import { webSearch } from './web-search.ts';

export interface Tool {
  name: string;
  description: string;
  // JSON Schema for arguments, passed straight to OpenRouter.
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

const tools: Tool[] = [getCurrentTime, webSearch];

const byName = new Map(tools.map(t => [t.name, t]));

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const toolSchemas: ToolSchema[] = tools.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

// Returns a JSON-stringified tool result suitable to send back as a
// `role: 'tool'` message. Errors (unknown tool, bad JSON args, thrown
// during execute) are caught and returned as `{ error: ... }` so the
// model can recover instead of the loop crashing.
export const executeTool = async (
  name: string,
  argumentsJson: string,
): Promise<string> => {
  const tool = byName.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argumentsJson) as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: 'Tool arguments were not valid JSON.' });
  }

  try {
    const result = await tool.execute(args);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
  }
};
