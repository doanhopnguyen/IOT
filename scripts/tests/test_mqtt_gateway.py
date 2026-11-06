import asyncio
import argparse
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("gateway", Path(__file__).resolve().parents[1] / "mqtt_gateway.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        async def echo(reader, writer):
            try:
                while data := await reader.read(4096):
                    writer.write(data)
                    await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()
        self.upstream = await asyncio.start_server(echo, "127.0.0.1", 0)
        self.relay = gateway.Gateway("127.0.0.1", self.upstream.sockets[0].getsockname()[1])
        self.server = await asyncio.start_server(self.relay.handle, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]

    async def asyncTearDown(self):
        self.server.close()
        self.upstream.close()
        await self.server.wait_closed()
        await self.upstream.wait_closed()
        await self.relay.close()

    async def test_multiple_clients_preserve_binary_payloads(self):
        async def client(number):
            reader, writer = await asyncio.open_connection("127.0.0.1", self.port)
            payload = bytes(range(256)) * 1024 + bytes([number])
            writer.write(payload)
            await writer.drain()
            self.assertEqual(await asyncio.wait_for(reader.readexactly(len(payload)), 5), payload)
            writer.close()
            await writer.wait_closed()
        await asyncio.gather(*(client(i) for i in range(6)))

    async def test_upstream_failure_closes_client(self):
        self.upstream.close()
        await self.upstream.wait_closed()
        reader, writer = await asyncio.open_connection("127.0.0.1", self.port)
        self.assertEqual(await asyncio.wait_for(reader.read(), 3), b"")
        writer.close()
        await writer.wait_closed()

    async def test_shutdown_closes_active_connections(self):
        reader, writer = await asyncio.open_connection("127.0.0.1", self.port)
        writer.write(b"connected")
        await writer.drain()
        self.assertEqual(await reader.readexactly(9), b"connected")
        await self.relay.close()
        self.assertEqual(await asyncio.wait_for(reader.read(), 3), b"")
        writer.close()
        await writer.wait_closed()

    def test_requires_tailnet_destination_and_specific_lan_binding(self):
        self.assertEqual(gateway.tailscale_address("100.111.90.116"), "100.111.90.116")
        self.assertEqual(gateway.tailscale_address("server.example.ts.net"), "server.example.ts.net")
        for address in ("8.8.8.8", "192.168.1.1", "anything.example.com"):
            with self.assertRaises(argparse.ArgumentTypeError):
                gateway.tailscale_address(address)
        for address in ("0.0.0.0", "224.0.0.1", "8.8.8.8"):
            with self.assertRaises(argparse.ArgumentTypeError):
                gateway.lan_address(address)


if __name__ == "__main__":
    unittest.main()
