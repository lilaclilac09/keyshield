#!/usr/bin/env python3
"""Fresh-Simulator UI tests with host-only synthetic paste and Face ID events."""

import argparse
import hashlib
import json
import plistlib
import subprocess
import tempfile
import time
from pathlib import Path


IOS = Path(__file__).resolve().parents[1]


def simctl(*args, **kwargs):
    return subprocess.run(["xcrun", "simctl", *args], check=True, capture_output=True, **kwargs).stdout


def fixture_files(directory):
    fixtures = json.loads((IOS / "KeyShieldTests/Fixtures/keys.json").read_text())
    primary = next(item["value"] for item in fixtures["samples"] if item["id"] == "openai")
    invalid = next(item["value"] for item in fixtures["negatives"] if item["id"] == "placeholder")
    if primary != "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-" + "A" * 32:
        raise RuntimeError("Bundled synthetic OpenAI fixture changed; review the UI fixture mapping")
    values = {"pasteFixture": primary, "pasteRotation": primary[:-32] + "B" * 32, "pasteInvalid": invalid}
    files = {}
    for action, value in values.items():
        path = directory / (action + ".txt")
        path.write_text(value)
        path.chmod(0o600)
        files[action] = path
    return files


def host_action(udid, action, files):
    if action in files:
        with files[action].open("rb") as source:
            simctl("pbcopy", udid, stdin=source)
        return True
    if action == "matchFaceID":
        simctl("spawn", udid, "notifyutil", "-p", "com.apple.BiometricKit_Sim.pearl.match")
        return True
    expected = {"verifyFixture": "pasteFixture", "verifyRotation": "pasteRotation"}.get(action)
    if expected:
        actual_hash = hashlib.sha256(simctl("pbpaste", udid)).digest()
        return actual_hash == hashlib.sha256(files[expected].read_bytes()).digest()
    raise RuntimeError("Unsupported host action")


def configure_runner(value):
    if isinstance(value, dict):
        if value.get("IsUITestBundle"):
            value.setdefault("CommandLineArguments", []).extend([
                "-DisableDiagnosticScreenshots", "YES", "-DisableDiagnosticScreenRecordings", "YES",
            ])
            return 1
        return sum(configure_runner(child) for child in value.values())
    if isinstance(value, list):
        return sum(configure_runner(child) for child in value)
    return 0


def execute_tests(command, log_path, udid, runner_id, files):
    container = None
    last_lookup = 0
    handled = None
    with log_path.open("w") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
        try:
            while process.poll() is None:
                if container is None and time.monotonic() - last_lookup > 1:
                    last_lookup = time.monotonic()
                    try:
                        container = Path(simctl("get_app_container", udid, runner_id, "data").decode().strip())
                    except subprocess.CalledProcessError:
                        pass
                if container:
                    bridge = container / "Documents/KeyShieldE2EHost"
                    request_path = bridge / "request.json"
                    if request_path.exists():
                        request = json.loads(request_path.read_text())
                        if request["id"] != handled:
                            handled = request["id"]
                            try:
                                success = host_action(udid, request["action"], files)
                            except (subprocess.CalledProcessError, RuntimeError):
                                success = False
                            print(f"HOST_ACTION {request['action']} success={str(success).lower()}", flush=True)
                            response = bridge / "response.pending"
                            response.write_text(json.dumps({"id": handled, "success": success}))
                            response.replace(bridge / "response.json")
                time.sleep(0.1)
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()
    print("\n".join(log_path.read_text().splitlines()[-30:]), flush=True)
    return process.returncode


def run_suite(suite, results, runtime, device_type, files):
    output = results / suite
    output.mkdir()
    udid = simctl("create", "KeyShield E2E " + suite, device_type, runtime).decode().strip()
    print(f"SUITE={suite} FRESH_SIMULATOR={udid}", flush=True)
    try:
        simctl("boot", udid)
        simctl("bootstatus", udid, "-b")
        simctl("spawn", udid, "notifyutil", "-s", "com.apple.BiometricKit.enrollmentChanged", "1",
               "-p", "com.apple.BiometricKit.enrollmentChanged")
        scheme = "KeyShieldSimulatorTester" if suite == "journey" else "KeyShield"
        configuration = "SimulatorRelease" if suite == "journey" else "Debug"
        derived = output / "DerivedData"
        destination = "platform=iOS Simulator,id=" + udid
        build = ["xcodebuild", "build-for-testing", "-project", str(IOS / "KeyShield.xcodeproj"),
                 "-scheme", scheme, "-configuration", configuration, "-destination", destination,
                 "-derivedDataPath", str(derived), "CODE_SIGN_IDENTITY=-", "CODE_SIGNING_ALLOWED=YES",
                 "CODE_SIGNING_REQUIRED=NO"]
        with (output / "build.log").open("w") as log:
            built = subprocess.run(build, stdout=log, stderr=subprocess.STDOUT)
        print("\n".join((output / "build.log").read_text().splitlines()[-8:]), flush=True)
        if built.returncode:
            return built.returncode
        products = derived / "Build/Products"
        source = next(products.glob("*.xctestrun"))
        configuration_data = plistlib.loads(source.read_bytes())
        if configure_runner(configuration_data) != 1:
            raise RuntimeError("Expected exactly one UI-test runner to configure capture privacy")
        test_run = products / "KeyShieldE2E.xctestrun"
        test_run.write_bytes(plistlib.dumps(configuration_data))
        runner_info = next(products.glob("*-iphonesimulator/KeyShieldUITests-Runner.app/Info.plist"))
        runner_id = plistlib.loads(runner_info.read_bytes())["CFBundleIdentifier"]
        command = ["xcodebuild", "test-without-building", "-xctestrun", str(test_run),
                   "-destination", destination, "-parallel-testing-enabled", "NO",
                   "-collect-test-diagnostics", "never",
                   "-resultBundlePath", str(output / "Tests.xcresult")]
        if suite == "journey":
            command.append("-only-testing:KeyShieldUITests/KeyShieldE2EJourneyTests")
        return execute_tests(command, output / "test.log", udid, runner_id, files)
    finally:
        subprocess.run(["xcrun", "simctl", "shutdown", udid], capture_output=True)
        simctl("delete", udid)
        print(f"DISPOSABLE_SIMULATOR_DELETED={udid}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=["all", "journey", "regression"], default="all")
    parser.add_argument("--results", required=True, type=Path, help="New local, non-synced results directory")
    parser.add_argument("--runtime", default="com.apple.CoreSimulator.SimRuntime.iOS-26-5")
    parser.add_argument("--device-type", default="com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro")
    args = parser.parse_args()
    sync = subprocess.run(["defaults", "read", "com.apple.iphonesimulator", "PasteboardAutomaticSync"],
                          capture_output=True, text=True)
    if sync.returncode or sync.stdout.strip() != "0":
        parser.error("Turn OFF Simulator > Edit > Automatically Sync Pasteboard before running; host clipboard is never accessed")
    print("HOST_PASTEBOARD_SYNC_OFF=true", flush=True)
    print("Synthetic fixtures only. Face ID matches are simulated OS events; the journey has no app test flags.", flush=True)
    results = args.results.expanduser().resolve()
    results.mkdir(parents=True, exist_ok=False)
    scratch = Path.home() / ".keyshield-e2e-fixtures"
    scratch.mkdir(mode=0o700, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=scratch) as directory:
        files = fixture_files(Path(directory))
        for suite in (["regression", "journey"] if args.suite == "all" else [args.suite]):
            code = run_suite(suite, results, args.runtime, args.device_type, files)
            if code:
                return code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
