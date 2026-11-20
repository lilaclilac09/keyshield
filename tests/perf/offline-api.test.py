"""Exercise the outbound guard without starting a server or making any requests."""
import importlib.util
from pathlib import Path
import socket
import unittest
from unittest.mock import patch


class OfflineGuardTest(unittest.TestCase):
    def test_loopback_only(self):
        connect, connect_ex, getaddrinfo = socket.socket.connect, socket.socket.connect_ex, socket.getaddrinfo
        try:
            with patch("uvicorn.run"):
                spec = importlib.util.spec_from_file_location("offline_api", Path(__file__).with_name("offline-api.py"))
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
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
        finally:
            socket.socket.connect, socket.socket.connect_ex, socket.getaddrinfo = connect, connect_ex, getaddrinfo


if __name__ == "__main__":
    unittest.main()
