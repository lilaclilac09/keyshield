import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest


class ArchiveScriptTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.script = Path(__file__).with_name("archive-testflight.sh")
        self.calls = self.root / "calls.jsonl"
        fake = self.root / "xcodebuild"
        fake.write_text("""#!/usr/bin/env python3
import json, os, pathlib, plistlib, sys
args = sys.argv[1:]
call = {"args": args}
if "-exportArchive" in args:
    path = args[args.index("-exportOptionsPlist") + 1]
    call["options_path"] = path
    with open(path, "rb") as source:
        call["options"] = plistlib.load(source)
with open(os.environ["CALLS"], "a") as output:
    output.write(json.dumps(call) + "\\n")
sys.exit(int(os.environ.get("FAKE_EXPORT_STATUS" if "-exportArchive" in args else "FAKE_ARCHIVE_STATUS", "0")))
""")
        fake.chmod(0o755)
        self.env = os.environ.copy()
        self.env.pop("TEAM_ID", None)
        self.env.update(
            PATH=str(self.root) + os.pathsep + self.env["PATH"],
            CALLS=str(self.calls),
            ARCHIVE_PATH=str(self.root / "output with spaces" / "KeyShield.xcarchive"),
            EXPORT_PATH=str(self.root / "export with spaces"),
        )

    def run_script(self, *args):
        return subprocess.run(["/bin/bash", str(self.script), *args], env=self.env,
                              capture_output=True, text=True)

    def recorded_calls(self):
        return [json.loads(line) for line in self.calls.read_text().splitlines()]

    def test_missing_or_invalid_team_never_invokes_xcodebuild(self):
        for team in [None, "YOUR_TEAM_ID", "invalid;echo unsafe"]:
            with self.subTest(team=team):
                if team is not None:
                    self.env["TEAM_ID"] = team
                result = self.run_script()
                self.assertEqual(result.returncode, 64, result.stderr)
                self.assertIn("Set TEAM_ID", result.stderr)
                self.assertFalse(self.calls.exists())

    def test_unknown_or_extra_arguments_never_invoke_xcodebuild(self):
        self.env["TEAM_ID"] = "ABCDE12345"
        for args in [("--export",), ("--upload", "unexpected")]:
            result = self.run_script(*args)
            self.assertEqual(result.returncode, 64, result.stderr)
            self.assertFalse(self.calls.exists())

    def test_default_and_explicit_archive_only_do_not_export(self):
        self.env["TEAM_ID"] = "ABCDE12345"
        for args in [(), ("--archive-only",)]:
            result = self.run_script(*args)
            self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.recorded_calls()
        self.assertEqual(len(calls), 2)
        for call in calls:
            args = call["args"]
            self.assertEqual(args[0], "archive")
            for flag in ["-allowProvisioningUpdates", "DEVELOPMENT_TEAM=ABCDE12345", "CODE_SIGN_STYLE=Automatic"]:
                self.assertIn(flag, args)
            for flag, expected in [("-scheme", "KeyShield"), ("-configuration", "Release"),
                                   ("-destination", "generic/platform=iOS"),
                                   ("-archivePath", self.env["ARCHIVE_PATH"])]:
                self.assertEqual(args[args.index(flag) + 1], expected)
            self.assertNotIn("-exportArchive", args)

    def test_upload_is_explicit_and_uses_private_internal_only_options(self):
        self.env["TEAM_ID"] = "ABCDE12345"
        result = self.run_script("--upload")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.recorded_calls()
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["args"][0], "archive")
        export = calls[1]
        self.assertEqual(export["args"][0], "-exportArchive")
        self.assertIn("-allowProvisioningUpdates", export["args"])
        self.assertEqual(export["options"]["teamID"], self.env["TEAM_ID"])
        self.assertEqual(export["options"]["method"], "app-store-connect")
        self.assertEqual(export["options"]["destination"], "upload")
        self.assertEqual(export["options"]["signingStyle"], "automatic")
        self.assertTrue(export["options"]["testFlightInternalTestingOnly"])
        self.assertFalse(Path(export["options_path"]).exists())
        template = self.script.parent.parent / "ExportOptions-TestFlight.plist"
        with template.open("rb") as source:
            self.assertEqual(plistlib.load(source)["teamID"], "YOUR_TEAM_ID")

    def test_archive_failure_prevents_export(self):
        self.env.update(TEAM_ID="ABCDE12345", FAKE_ARCHIVE_STATUS="65")
        result = self.run_script("--upload")
        self.assertEqual(result.returncode, 65)
        calls = self.recorded_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["args"][0], "archive")

    def test_export_failure_still_removes_private_options(self):
        self.env.update(TEAM_ID="ABCDE12345", FAKE_EXPORT_STATUS="66")
        result = self.run_script("--upload")
        self.assertEqual(result.returncode, 66)
        calls = self.recorded_calls()
        self.assertEqual(len(calls), 2)
        self.assertFalse(Path(calls[1]["options_path"]).exists())


if __name__ == "__main__":
    unittest.main()
