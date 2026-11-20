"""Exercise the server-loop outbound guard using only loopback connections."""
import importlib.util
import asyncio
import _socket
from pathlib import Path
import socket
import unittest
from unittest.mock import patch

import uvicorn


class OfflineGuardTest(unittest.TestCase):
    def test_loopback_only(self):
        connect, connect_ex, getaddrinfo = socket.socket.connect, socket.socket.connect_ex, socket.getaddrinfo
        try:
            with patch("uvicorn.run") as run:
                spec = importlib.util.spec_from_file_location("offline_api", Path(__file__).with_name("offline-api.py"))
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
            self.assertEqual(run.call_args.kwargs["loop"], "asyncio")
            for host in ("localhost", "127.0.0.1", "::1"):
                module.allowed(host)
            for host in ("example.com", "app.ks.aileena.xyz", "8.8.8.8", "", "10.0.0.1"):
                with self.assertRaises(OSError):
                    module.allowed(host)
            with self.assertRaises(OSError):
                socket.getaddrinfo("app.ks.aileena.xyz", 443)
            with socket.socket() as client:
                with self.assertRaises(OSError):
                    client.connect(("8.8.8.8", 443))
                with self.assertRaises(OSError):
                    client.connect_ex(("8.8.8.8", 443))
                with self.assertRaisesRegex(OSError, "denied non-loopback"):
                    _socket.socket.connect(client, ("0.0.0.0", 0))

            async def exercise(sockets=None):
                loop = asyncio.get_running_loop()
                self.assertTrue(type(loop).__module__.startswith("asyncio."), type(loop))
                with self.assertRaisesRegex(OSError, "denied non-loopback"):
                    await asyncio.open_connection("0.0.0.0", 0)
                server = await asyncio.start_server(lambda reader, writer: writer.close(), "127.0.0.1", 0)
                try:
                    reader, writer = await asyncio.open_connection(*server.sockets[0].getsockname())
                    writer.close()
                    await writer.wait_closed()
                finally:
                    server.close()
                    await server.wait_closed()

            server = uvicorn.Server(uvicorn.Config("unused:app", **run.call_args.kwargs))
            with patch.object(server, "serve", exercise):
                server.run()
        finally:
            socket.socket.connect, socket.socket.connect_ex, socket.getaddrinfo = connect, connect_ex, getaddrinfo


if __name__ == "__main__":
    unittest.main()
