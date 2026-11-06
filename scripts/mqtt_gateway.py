"""Forward a site's ESP32 MQTT connections to the central broker over Tailscale.

Run on a PC in the ESP32's Wi-Fi/LAN. Requires only Python 3.11+ and Tailscale.
The relay does not terminate MQTT, store payloads, or replace broker authentication.
"""
import argparse
import asyncio
import ipaddress
import logging

LOG = logging.getLogger("mqtt-gateway")


def lan_address(value):
    address = ipaddress.IPv4Address(value)
    if not (address.is_private or address.is_loopback) or address.is_unspecified or address.is_multicast:
        raise argparse.ArgumentTypeError("Bind to the PC LAN IPv4, for example 192.168.1.20.")
    return str(address)


def tailscale_address(value):
    try:
        address = ipaddress.ip_address(value)
        if address in ipaddress.ip_network("100.64.0.0/10"):
            return str(address)
    except ValueError:
        if value.endswith(".ts.net") and all(c.isalnum() or c in ".-" for c in value):
            return value
    raise argparse.ArgumentTypeError("Use the central server Tailscale IPv4 or full .ts.net hostname.")


class Gateway:
    def __init__(self, host, port, max_connections=128, connect_timeout=10):
        self.host, self.port = host, port
        self.max_connections, self.connect_timeout = max_connections, connect_timeout
        self.connections = set()

    async def pump(self, reader, writer):
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()

    async def handle(self, reader, writer):
        task = asyncio.current_task()
        if len(self.connections) >= self.max_connections:
            writer.close()
            await writer.wait_closed()
            return
        self.connections.add(task)
        remote_writer = None
        pipes = []
        try:
            remote_reader, remote_writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port), self.connect_timeout)
            pipes = [asyncio.create_task(self.pump(reader, remote_writer)),
                     asyncio.create_task(self.pump(remote_reader, writer))]
            done, _ = await asyncio.wait(pipes, return_when=asyncio.FIRST_COMPLETED)
            for completed in done:
                completed.result()
        except (OSError, asyncio.TimeoutError) as error:
            LOG.warning("Connection closed: %s", type(error).__name__)
        finally:
            for pipe in pipes:
                pipe.cancel()
            await asyncio.gather(*pipes, return_exceptions=True)
            for stream in (writer, remote_writer):
                if stream is not None:
                    stream.close()
                    try:
                        await stream.wait_closed()
                    except OSError:
                        pass
            self.connections.discard(task)

    async def close(self):
        tasks = list(self.connections)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def run(args):
    gateway = Gateway(args.server, args.server_port)
    if args.check:
        _, writer = await asyncio.wait_for(asyncio.open_connection(args.server, args.server_port), 10)
        writer.close()
        await writer.wait_closed()
        print("TCP connection to central broker: OK (MQTT authentication is checked separately).")
        return
    server = await asyncio.start_server(gateway.handle, args.listen, args.listen_port)
    LOG.info("Listening on %s:%d -> %s:%d", args.listen, args.listen_port, args.server, args.server_port)
    try:
        async with server:
            await server.serve_forever()
    finally:
        await gateway.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listen", type=lan_address, default="127.0.0.1")
    parser.add_argument("--listen-port", type=int, choices=range(1, 65536), metavar="PORT", default=1884)
    parser.add_argument("--server", type=tailscale_address, required=True)
    parser.add_argument("--server-port", type=int, choices=range(1, 65536), metavar="PORT", default=1884)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass
    except OSError as error:
        parser.exit(1, f"Gateway cannot connect or listen: {error}\n")


if __name__ == "__main__":
    main()
