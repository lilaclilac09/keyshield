"""Run the real API with loopback-only outbound sockets and no request logs."""
import ipaddress
import socket
import sys

import uvicorn

connect = socket.socket.connect
connect_ex = socket.socket.connect_ex
getaddrinfo = socket.getaddrinfo


def allowed(host):
    if host == "localhost":
        return
    try:
        if ipaddress.ip_address(host).is_loopback:
            return
    except ValueError:
        pass
    raise OSError("Performance harness denied non-loopback network access")


def local_connect(self, address):
    if self.family in (socket.AF_INET, socket.AF_INET6):
        allowed(address[0])
    return connect(self, address)


def local_connect_ex(self, address):
    if self.family in (socket.AF_INET, socket.AF_INET6):
        allowed(address[0])
    return connect_ex(self, address)


def local_getaddrinfo(host, *args, **kwargs):
    if host is not None:
        allowed(host)
    return getaddrinfo(host, *args, **kwargs)


socket.socket.connect = local_connect
socket.socket.connect_ex = local_connect_ex
socket.getaddrinfo = local_getaddrinfo


def audit_network(event, args):
    if event in ("socket.connect", "socket.sendto", "socket.sendmsg"):
        sock, address = args[:2]
        if sock.family in (socket.AF_INET, socket.AF_INET6) and address:
            allowed(address[0])
    elif event == "socket.getaddrinfo":
        if args[0] is not None:
            allowed(args[0])


sys.addaudithook(audit_network)
uvicorn.run("src.backend.app:app", host="127.0.0.1", port=8001,
            access_log=False, log_level="critical", loop="asyncio")
