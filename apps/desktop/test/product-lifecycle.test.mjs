import assert from "node:assert/strict";
import test from "node:test";
import { WebSocketServer } from "ws";
import { startDesktopProduct } from "../dist/product-composition.js";

async function fakeHostra(openFailure = false) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const clients = new Set();
  server.on("connection", (socket) => {
    clients.add(socket); socket.once("close", () => clients.delete(socket));
    socket.on("message", (raw) => {
      const request = JSON.parse(raw.toString());
      if (request.method === "openWindow" && openFailure) {
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "injected openWindow failure" } }));
      } else {
        const result = request.method === "openWindow" ? request.params.id : true;
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
      }
    });
  });
  const address = server.address();
  return {
    port: address.port,
    terminateRpc() { for (const client of clients) client.terminate(); },
    close() { for (const client of clients) client.terminate(); return new Promise((resolve) => server.close(resolve)); },
  };
}

async function withRpcEnvironment(port, operation) {
  const oldPort = process.env.HOSTRA_RPC_PORT;
  const oldToken = process.env.HOSTRA_RPC_TOKEN;
  process.env.HOSTRA_RPC_PORT = String(port);
  process.env.HOSTRA_RPC_TOKEN = "lifecycle-test-token";
  try { return await operation(); }
  finally {
    if (oldPort === undefined) delete process.env.HOSTRA_RPC_PORT; else process.env.HOSTRA_RPC_PORT = oldPort;
    if (oldToken === undefined) delete process.env.HOSTRA_RPC_TOKEN; else process.env.HOSTRA_RPC_TOKEN = oldToken;
  }
}

test("programmatic product close uses the one cleanup funnel", async () => {
  const hostra = await fakeHostra();
  const observed = [];
  try {
    const product = await withRpcEnvironment(hostra.port, () => startDesktopProduct({ observe: (event) => observed.push(event) }));
    await product.close();
    await product.closed;
    for (const type of ["termination-began", "main-settled", "renderer-control-closed", "data-broker-closed", "content-closed", "product-closed"]) {
      assert.equal(observed.some((event) => event.type === type), true, type);
    }
  } finally { await hostra.close(); }
});

test("Hostra RPC terminal is product-terminal", async () => {
  const hostra = await fakeHostra();
  const observed = [];
  try {
    const product = await withRpcEnvironment(hostra.port, () => startDesktopProduct({ observe: (event) => observed.push(event) }));
    hostra.terminateRpc();
    await product.closed;
    assert.equal(observed.some((event) => event.type === "termination-began"), true);
    assert.equal(observed.some((event) => event.type === "product-closed"), true);
  } finally { await hostra.close(); }
});

test("openWindow failure preserves the cause and closes partial resources", async () => {
  const hostra = await fakeHostra(true);
  const observed = [];
  try {
    await assert.rejects(
      withRpcEnvironment(hostra.port, () => startDesktopProduct({ observe: (event) => observed.push(event) })),
      /injected openWindow failure/u,
    );
    assert.equal(observed.some((event) => event.type === "product-closed"), true);
    assert.equal(observed.some((event) => event.type === "window-open"), false);
  } finally { await hostra.close(); }
});
