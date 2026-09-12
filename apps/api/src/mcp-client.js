// Cliente MCP: lanza el servidor banorte-banking como subproceso (stdio),
// descubre sus herramientas y las expone en el formato de tool-calling de Groq/OpenAI.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SERVER_PATH } from '@norte/mcp-server';

let clientPromise = null;

async function connect() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    stderr: 'inherit',
  });
  const client = new Client({ name: 'banorte-agent', version: '1.0.0' });
  await client.connect(transport);
  // Si el subproceso MCP muere, se descarta el cliente para reconectar en la siguiente llamada.
  client.onclose = () => {
    console.error('[MCP] conexión cerrada; se reconectará en la próxima llamada');
    clientPromise = null;
  };
  return client;
}

export async function getMcpClient() {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export async function listToolsForLlm() {
  const client = await getMcpClient();
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

export async function callMcpTool(name, args) {
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args ?? {} });
  const text = (result.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  return text || JSON.stringify(result);
}
