#!/usr/bin/env python3
"""Read-only checks of an unsigned device archive; never launches the app."""
import argparse
import plistlib
import re
import subprocess
from pathlib import Path


def output(*args):
    return subprocess.check_output(args, text=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    app = args.archive / "Products/Applications/KeyShield.app"
    with (app / "Info.plist").open("rb") as source:
        info = plistlib.load(source)
    binary = app / info["CFBundleExecutable"]
    assert info["CFBundleSupportedPlatforms"] == ["iPhoneOS"], "Not a device app"
    commands = output("otool", "-l", str(binary))
    platform = re.search(r"cmd LC_BUILD_VERSION\b.*?\bplatform\s+(\S+)", commands, re.S)
    assert platform and platform[1].upper() in {"2", "IOS"}, "Not an iOS device Mach-O"
    imports = output("nm", "-u", str(binary))
    selectors = output("otool", "-ov", str(binary))
    strings = output("strings", "-a", str(binary))
    network = r"URLSession|NSURLSession|NSURLConnection|dataTask|uploadTask|downloadTask|NWConnection|nw_connection_|CFHTTP|CFReadStreamCreateForHTTPRequest"
    assert not re.search(network, imports + selectors + strings), "Network API import/selector/string found; review required"
    for token in ["UITestMode", "SIMULATOR_APPROVAL_DEMO", "SimulatorApprovalDemo", "KeyShield Demo Agent",
                  "Simulate agent request", "Request simulated provider call"]:
        assert token not in strings, "Debug/simulator-only token found"
    assert "FAKE_KEYSHIELD_NOT_A_KEY::" in strings, "Synthetic guard marker missing"
    for key in ["CFBundleURLTypes", "CFBundleDocumentTypes", "NSUserActivityTypes"]:
        assert key not in info, "Unexpected external input registration"
    assert not list(app.rglob("*.framework")) and not list(app.rglob("*.dylib")), "Bundled library requires review"
    source = Path(__file__).resolve().parents[1] / "KeyShield"
    for path in source.rglob("*.swift"):
        assert not re.search(r"URLSession|NWConnection|import Network\b|\bopenURL\b|\bonOpenURL\b|\bLink\s*\(", path.read_text()), "Network/URL-opening source requires review"
    print("DEVICE_MACHO_PLATFORM=IOS")
    print("URLSESSION_DATATASK_NETWORK_IMPORT_SELECTOR_STRING_MATCHES=0")
    print("DEBUG_OR_SIMULATOR_DEMO_TOKENS=0")
    print("SYNTHETIC_GUARD_MARKER_PRESENT=true")
    print("URL_DOCUMENT_ACTIVITY_REGISTRATIONS=0")
    print("APP_NETWORK_OR_OPENURL_SOURCE_MATCHES=0")
    print("DEVICE_BETA_STATIC_CHECK=PASS")


if __name__ == "__main__":
    main()
