---
name: Modbus connection & simulator rules
description: Non-obvious causes of "request fc and response fc does not match" in the S21 addon — single shared socket needs serialization, and the dev simulator must not stack connection handlers.
---

# One shared socket per device → all requests MUST be serialized
There is exactly one cached `ModbusTCPClient`/socket per device, shared by the
register poll endpoint, the automation/control cycle, the MQTT command handler,
and the API write endpoint. A Modbus/TCP socket can only have one transaction in
flight; overlapping requests make jsmodbus match a response to the wrong request
and throw `"request fc and response fc does not match"`.
**Why:** these callers run in independent async contexts and otherwise interleave
reads and writes on the same socket. Profiles that issue several writes per cycle
(e.g. weather_compensated with the heater: fan + setpoint + mode) hit it most.
**How to apply:** `getModbusClient` returns a Proxy that funnels every read*/write*
method through a per-device promise chain (`runExclusive`). Keep that serialization;
never bypass it by holding the raw client. Adding more writes per cycle is safe only
because of it.

# jsmodbus ModbusTCPServer wires its OWN connection handler — construct it ONCE
The dev simulator (`server/lib/simulator.ts`) must create the `ModbusTCPServer`
exactly once, bound to the `net.Server`. jsmodbus's `ModbusTCPServer` constructor
already does `server.on('connection', this._onConnection.bind(this))`.
**Why:** a previous version created a new `ModbusTCPServer` inside the NetServer
connection callback and called `_onConnection(socket)` manually. Every client
connection registered another `connection` listener, so the Nth socket got answered
by N server instances → duplicate responses → the client reported
`"request fc and response fc does not match"`. It worsened over time because the
client reconnects whenever the 5s idle timeout destroys the socket.
**How to apply:** `new NetServer()` with NO connectionListener, then
`new ModbusTCPServer(netServer, {coils,discrete,holding,input})`, then `netServer.listen()`.
Never call `_onConnection` yourself.
