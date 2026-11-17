"""Behavior tests for the internet switch. They never change a real connection."""

from __future__ import annotations

import base64
import io
import json
import re
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory

import internet_switch as switch


class MemoryBackend:
    def __init__(self, online: bool = True):
        self.online = online
        self.presses: list[str] = []

    def internet_on(self) -> bool:
        return self.online

    def press_on(self) -> None:
        self.presses.append("on")
        self.online = False

    def press_off(self) -> None:
        self.presses.append("off")
        self.online = True


class BoomBackend(MemoryBackend):
    def press_on(self) -> None:
        raise switch.InternetSwitchError("Adapter is busy.")


def payloads(script: str) -> list:
    found = []
    for token in re.findall(r"[A-Za-z0-9+/=]{8,}", script):
        try:
            found.append(json.loads(base64.b64decode(token)))
        except Exception:
            continue
    return found


class ViewTests(unittest.TestCase):
    def test_on_button_means_internet_off(self):
        model = switch.view_model(False)
        self.assertEqual(model["status"], "Internet is off")
        self.assertTrue(model["on_selected"])
        self.assertFalse(model["off_selected"])
        self.assertIn("Press OFF", str(model["detail"]))

    def test_off_button_means_internet_on(self):
        model = switch.view_model(True)
        self.assertEqual(model["status"], "Internet is on")
        self.assertFalse(model["on_selected"])
        self.assertTrue(model["off_selected"])
        self.assertIn("Press ON", str(model["detail"]))


class WindowsCommandTests(unittest.TestCase):
    def test_adapter_names_stay_inside_powershell_strings(self):
        script = switch.windows_change_script(["Wi-Fi", "O'Hare"], enable=False)
        self.assertIn("'Wi-Fi'", script)
        self.assertIn("'O''Hare'", script)
        self.assertIn("Disable-NetAdapter", script)
        self.assertNotIn("Enable-NetAdapter", script)
        self.assertNotIn("O'Hare'", script.replace("'O''Hare'", ""))

    def test_newline_in_adapter_name_is_rejected(self):
        with self.assertRaises(switch.InternetSwitchError):
            switch.windows_change_script(["Wi-Fi\nRemove-Item"], enable=True)

    def test_parse_adapters_accepts_object_list_and_noise(self):
        raw = 'WARNING: extra\n{"Name":"Wi-Fi","Status":"Up","Hardware":true,"Description":"Intel"}'
        self.assertEqual(switch.parse_adapters(raw)[0]["Name"], "Wi-Fi")
        listed = json.dumps(
            [
                {"Name": "Wi-Fi", "Status": "Up", "Hardware": True, "Description": "Intel"},
                {"Name": "Ethernet", "Status": "Disconnected", "Hardware": True, "Description": "Realtek"},
            ]
        )
        self.assertEqual(len(switch.parse_adapters(listed)), 2)

    def test_virtual_minports_are_skipped_when_a_real_adapter_exists(self):
        adapters = switch.filter_controllable(
            [
                {"Name": "Wi-Fi", "Status": "Up", "Hardware": True, "Description": "Intel Wi-Fi"},
                {
                    "Name": "Local Area Connection* 1",
                    "Status": "Up",
                    "Hardware": True,
                    "Description": "WAN Miniport (IP)",
                },
                {
                    "Name": "vEthernet",
                    "Status": "Up",
                    "Hardware": False,
                    "Description": "Hyper-V Virtual Ethernet Adapter",
                },
            ]
        )
        self.assertEqual([item["Name"] for item in adapters], ["Wi-Fi"])

    def test_only_virtual_adapter_can_still_be_switched(self):
        adapters = switch.filter_controllable(
            [
                {
                    "Name": "vEthernet",
                    "Status": "Up",
                    "Hardware": False,
                    "Description": "Hyper-V Virtual Ethernet Adapter",
                }
            ]
        )
        self.assertEqual([item["Name"] for item in adapters], ["vEthernet"])


class ScriptedPowerShell:
    def __init__(self, adapters: list[dict]):
        self.adapters = adapters
        self.scripts: list[str] = []
        self.fail_disable = False
        self.state_during_disable = None
        self.state_path: Path | None = None

    def __call__(self, args: list[str]) -> switch.CmdResult:
        script = args[-1]
        self.scripts.append(script)
        if "Get-NetAdapter" in script:
            return switch.CmdResult(0, json.dumps(self.adapters), "")
        if "Disable-NetAdapter" in script:
            if self.state_path is not None:
                self.state_during_disable = json.loads(self.state_path.read_text(encoding="utf-8"))
            if self.fail_disable:
                return switch.CmdResult(1, "", "Adapter is busy")
            for adapter in self.adapters:
                if switch.ps_quote(adapter["Name"]) in script:
                    adapter["Status"] = "Disabled"
            return switch.CmdResult(0, "", "")
        if "Enable-NetAdapter" in script:
            for adapter in self.adapters:
                if switch.ps_quote(adapter["Name"]) in script:
                    adapter["Status"] = "Up"
            return switch.CmdResult(0, "", "")
        return switch.CmdResult(1, "", "unexpected powershell")


class WindowsBackendTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "state.json"
        self.adapters = [
            {"Name": "Wi-Fi", "Status": "Up", "Hardware": True, "Description": "Intel Wi-Fi"},
            {
                "Name": "Ethernet",
                "Status": "Disabled",
                "Hardware": True,
                "Description": "Realtek",
            },
        ]
        self.runner = ScriptedPowerShell(self.adapters)
        self.runner.state_path = self.path
        self.backend = switch.WindowsBackend(self.runner, self.path)

    def test_on_disables_only_adapters_that_are_up_and_off_restores_those(self):
        self.assertTrue(self.backend.internet_on())
        self.backend.press_on()
        disable = [script for script in self.runner.scripts if "Disable-NetAdapter" in script]
        self.assertEqual(len(disable), 1)
        self.assertIn("'Wi-Fi'", disable[0])
        self.assertNotIn("'Ethernet'", disable[0])
        self.assertEqual(self.runner.state_during_disable["disabled"], ["Wi-Fi"])
        self.assertFalse(self.backend.internet_on())

        self.backend.press_off()
        enable = [script for script in self.runner.scripts if "Enable-NetAdapter" in script]
        self.assertEqual(len(enable), 1)
        self.assertIn("'Wi-Fi'", enable[0])
        self.assertNotIn("'Ethernet'", enable[0])
        self.assertTrue(self.backend.internet_on())
        self.assertEqual(switch.load_state(self.path), [])

    def test_failed_disable_turns_the_adapter_back_on(self):
        switch.save_state(self.path, ["kept"])
        self.runner.fail_disable = True
        with self.assertRaises(switch.InternetSwitchError):
            self.backend.press_on()
        enable = [script for script in self.runner.scripts if "Enable-NetAdapter" in script]
        self.assertEqual(len(enable), 1)
        self.assertEqual(switch.load_state(self.path), ["kept"])
        self.assertEqual(self.adapters[0]["Status"], "Up")

    def test_off_without_memory_enables_disabled_adapters(self):
        self.adapters[0]["Status"] = "Disabled"
        self.backend.press_off()
        enable = [script for script in self.runner.scripts if "Enable-NetAdapter" in script][-1]
        self.assertIn("'Wi-Fi'", enable)
        self.assertIn("'Ethernet'", enable)

    def test_pressing_on_twice_does_not_disable_again(self):
        self.backend.press_on()
        scripts_after_first = len(self.runner.scripts)
        self.backend.press_on()
        later = self.runner.scripts[scripts_after_first:]
        self.assertFalse(any("Disable-NetAdapter" in script for script in later))


class ServiceText:
    SAMPLE = (
        "An asterisk (*) denotes that a network service is disabled.\n"
        "USB LAN\n"
        "*Wi-Fi\n"
        "Thunderbolt Bridge\n"
    )


class MacRunner:
    def __init__(self, fail_off: bool = False):
        self.fail_off = fail_off
        self.calls: list[list[str]] = []

    def __call__(self, args: list[str]) -> switch.CmdResult:
        self.calls.append(args)
        if args[:2] == ["networksetup", "-listallnetworkservices"]:
            return switch.CmdResult(0, ServiceText.SAMPLE, "")
        if args[:2] == ["networksetup", "-setnetworkserviceenabled"] and args[-1] == "off":
            if self.fail_off:
                return switch.CmdResult(1, "", "busy")
            return switch.CmdResult(0, "", "")
        if args[:2] == ["networksetup", "-setnetworkserviceenabled"]:
            return switch.CmdResult(0, "", "")
        if args[:2] == ["osascript", "-e"]:
            if self.fail_off:
                return switch.CmdResult(1, "", "busy")
            return switch.CmdResult(0, "", "")
        return switch.CmdResult(1, "", "unexpected")


class MacTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "state.json"

    def test_parser_keeps_the_disabled_marker(self):
        services = switch.parse_services(ServiceText.SAMPLE)
        self.assertEqual(
            services,
            [("USB LAN", True), ("Wi-Fi", False), ("Thunderbolt Bridge", True)],
        )

    def test_root_press_on_disables_enabled_services_only(self):
        runner = MacRunner()
        backend = switch.MacBackend(runner, self.path, euid=lambda: 0)
        backend.press_on()
        changed = [call for call in runner.calls if "-setnetworkserviceenabled" in call]
        self.assertEqual(
            changed,
            [
                ["networksetup", "-setnetworkserviceenabled", "USB LAN", "off"],
                ["networksetup", "-setnetworkserviceenabled", "Thunderbolt Bridge", "off"],
            ],
        )
        backend.press_off()
        restored = [call for call in runner.calls if call[-1] == "on"]
        self.assertEqual(
            restored,
            [
                ["networksetup", "-setnetworkserviceenabled", "USB LAN", "on"],
                ["networksetup", "-setnetworkserviceenabled", "Thunderbolt Bridge", "on"],
            ],
        )

    def test_admin_prompt_receives_the_real_commands(self):
        runner = MacRunner()
        backend = switch.MacBackend(
            runner, self.path, euid=lambda: 501, python="/usr/bin/python3"
        )
        backend.press_on()
        self.assertEqual(runner.calls[-1][0], "osascript")
        decoded = payloads(runner.calls[-1][2])
        self.assertIn(
            [
                ["networksetup", "-setnetworkserviceenabled", "USB LAN", "off"],
                ["networksetup", "-setnetworkserviceenabled", "Thunderbolt Bridge", "off"],
            ],
            decoded,
        )

    def test_failure_restores_services(self):
        switch.save_state(self.path, ["kept"])
        runner = MacRunner(fail_off=True)
        backend = switch.MacBackend(runner, self.path, euid=lambda: 0)
        with self.assertRaises(switch.InternetSwitchError):
            backend.press_on()
        self.assertIn(
            ["networksetup", "-setnetworkserviceenabled", "USB LAN", "on"],
            runner.calls,
        )
        self.assertEqual(switch.load_state(self.path), ["kept"])


class LinkRunner:
    def __init__(self, links: list[dict], fail_down: str | None = None):
        self.links = links
        self.fail_down = fail_down
        self.calls: list[list[str]] = []

    def __call__(self, args: list[str]) -> switch.CmdResult:
        self.calls.append(list(args))
        if "-json" in args:
            return switch.CmdResult(0, json.dumps(self.links), "")
        if args[0] in {"pkexec", "sudo"}:
            return switch.CmdResult(0, "", "")
        if len(args) >= 5 and args[1:3] == ["link", "set"]:
            name, state = args[3], args[4]
            if state == "down" and name == self.fail_down:
                return switch.CmdResult(1, "", "busy")
            self._set(name, state == "up")
            return switch.CmdResult(0, "", "")
        return switch.CmdResult(1, "", "unexpected " + " ".join(args))

    def _set(self, name: str, up: bool) -> None:
        for link in self.links:
            if link["ifname"] == name:
                flags = [flag for flag in link["flags"] if flag != "UP"]
                if up:
                    flags.append("UP")
                link["flags"] = flags


def linux_which(names: dict[str, str | None]):
    def which(name: str) -> str | None:
        return names.get(name)

    return which


class LinuxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "state.json"

    def test_ip_on_brings_down_only_links_that_are_up_then_restores_them(self):
        runner = LinkRunner(
            [
                {"ifname": "lo", "flags": ["LOOPBACK", "UP"]},
                {"ifname": "eth0", "flags": ["BROADCAST", "UP", "LOWER_UP"]},
                {"ifname": "wlan0", "flags": ["BROADCAST"]},
            ]
        )
        backend = switch.LinuxBackend(
            runner,
            self.path,
            which=linux_which({"nmcli": None, "ip": "/usr/sbin/ip", "pkexec": "/usr/bin/pkexec"}),
            euid=lambda: 0,
        )
        self.assertTrue(backend.internet_on())
        backend.press_on()
        self.assertIn(["/usr/sbin/ip", "link", "set", "eth0", "down"], runner.calls)
        self.assertNotIn(["/usr/sbin/ip", "link", "set", "lo", "down"], runner.calls)
        self.assertNotIn(["/usr/sbin/ip", "link", "set", "wlan0", "down"], runner.calls)
        self.assertFalse(backend.internet_on())
        backend.press_off()
        self.assertIn(["/usr/sbin/ip", "link", "set", "eth0", "up"], runner.calls)
        self.assertNotIn(["/usr/sbin/ip", "link", "set", "wlan0", "up"], runner.calls)
        self.assertTrue(backend.internet_on())
        self.assertEqual(switch.load_state(self.path), [])

    def test_dangerous_link_name_is_refused(self):
        runner = LinkRunner([{"ifname": "eth0;rm", "flags": ["UP"]}])
        backend = switch.LinuxBackend(
            runner,
            self.path,
            which=linux_which({"nmcli": None, "ip": "/usr/sbin/ip"}),
            euid=lambda: 0,
        )
        with self.assertRaises(switch.InternetSwitchError):
            backend.press_on()
        self.assertFalse(any(call[1:3] == ["link", "set"] for call in runner.calls if len(call) > 2))

    def test_not_root_uses_one_pkexec_for_every_link(self):
        runner = LinkRunner(
            [
                {"ifname": "eth0", "flags": ["UP"]},
                {"ifname": "wlan0", "flags": ["UP"]},
            ]
        )
        backend = switch.LinuxBackend(
            runner,
            self.path,
            which=linux_which(
                {"nmcli": None, "ip": "/usr/sbin/ip", "pkexec": "/usr/bin/pkexec", "sudo": "/usr/bin/sudo"}
            ),
            euid=lambda: 1000,
        )
        backend.press_on()
        privileged = runner.calls[-1]
        self.assertEqual(privileged[:3], ["pkexec", "/bin/sh", "-c"])
        self.assertEqual(
            privileged[3],
            "/usr/sbin/ip link set eth0 down && /usr/sbin/ip link set wlan0 down",
        )

    def test_sudo_is_used_only_when_pkexec_is_missing(self):
        runner = LinkRunner([{"ifname": "eth0", "flags": ["UP"]}])
        backend = switch.LinuxBackend(
            runner,
            self.path,
            which=linux_which({"nmcli": None, "ip": "/usr/sbin/ip", "pkexec": None, "sudo": "/usr/bin/sudo"}),
            euid=lambda: 1000,
        )
        backend.press_on()
        self.assertEqual(runner.calls[-1][:4], ["sudo", "-n", "/bin/sh", "-c"])

    def test_missing_privilege_helper_does_not_invent_a_command(self):
        runner = LinkRunner([{"ifname": "eth0", "flags": ["UP"]}])
        backend = switch.LinuxBackend(
            runner,
            self.path,
            which=linux_which({"nmcli": None, "ip": "/usr/sbin/ip", "pkexec": None, "sudo": None}),
            euid=lambda: 1000,
        )
        with self.assertRaises(switch.InternetSwitchError):
            backend.press_on()
        self.assertFalse(any(call[:2] == ["/usr/sbin/ip", "link"] for call in runner.calls))

    def test_partial_failure_brings_the_link_back_up(self):
        switch.save_state(self.path, ["kept"])
        runner = LinkRunner(
            [
                {"ifname": "eth0", "flags": ["UP"]},
                {"ifname": "wlan0", "flags": ["UP"]},
            ],
            fail_down="wlan0",
        )
        backend = switch.LinuxBackend(
            runner,
            self.path,
            which=linux_which({"nmcli": None, "ip": "/usr/sbin/ip"}),
            euid=lambda: 0,
        )
        with self.assertRaises(switch.InternetSwitchError):
            backend.press_on()
        eth0 = next(link for link in runner.links if link["ifname"] == "eth0")
        self.assertIn("UP", eth0["flags"])
        self.assertEqual(switch.load_state(self.path), ["kept"])

    def test_nmcli_is_preferred_and_auth_failure_retries_with_pkexec(self):
        calls: list[list[str]] = []

        def runner(args: list[str]) -> switch.CmdResult:
            calls.append(list(args))
            if "general" in args:
                return switch.CmdResult(0, "enabled\n", "")
            if args[-1] == "off" and args[0].endswith("nmcli"):
                return switch.CmdResult(4, "", "Error: Not authorized to control networking.")
            if args[0] == "pkexec":
                self.assertIn("networking off", args[-1])
                return switch.CmdResult(0, "", "")
            return switch.CmdResult(1, "", "unexpected")

        backend = switch.LinuxBackend(
            runner,
            self.path,
            which=linux_which({"nmcli": "/usr/bin/nmcli", "ip": "/usr/sbin/ip", "pkexec": "/usr/bin/pkexec"}),
            euid=lambda: 1000,
        )
        self.assertTrue(backend.internet_on())
        backend.press_on()
        self.assertEqual(calls[2], ["/usr/bin/nmcli", "networking", "off"])
        self.assertEqual(calls[3][0], "pkexec")
        self.assertFalse(any(call[0].endswith("ip") for call in calls))

    def test_nmcli_off_is_skipped_when_networking_is_already_disabled(self):
        calls: list[list[str]] = []

        def runner(args: list[str]) -> switch.CmdResult:
            calls.append(list(args))
            if "general" in args:
                return switch.CmdResult(0, "disabled\n", "")
            return switch.CmdResult(1, "", "should not change")

        backend = switch.LinuxBackend(
            runner,
            self.path,
            which=linux_which({"nmcli": "/usr/bin/nmcli"}),
            euid=lambda: 0,
        )
        self.assertFalse(backend.internet_on())
        backend.press_on()
        self.assertEqual(len(calls), 2)


class CommandTests(unittest.TestCase):
    def test_status_on_and_off_use_the_supplied_backend(self):
        backend = MemoryBackend(True)
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(switch.main(["status"], backend), 0)
        self.assertEqual(output.getvalue().strip(), "on")
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(switch.main(["on"], backend), 0)
        self.assertEqual(output.getvalue().strip(), "off")
        self.assertFalse(backend.internet_on())
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(switch.main(["off"], backend), 0)
        self.assertEqual(output.getvalue().strip(), "on")
        self.assertEqual(backend.presses, ["on", "off"])

    def test_help_and_unknown_arguments(self):
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(switch.main(["--help"], MemoryBackend()), 0)
        self.assertIn("Press ON", output.getvalue())
        self.assertIn("Press OFF", output.getvalue())
        error = io.StringIO()
        with redirect_stderr(error):
            self.assertEqual(switch.main(["sideways"], MemoryBackend()), 2)

    def test_a_backend_error_is_printed_and_does_not_change_state(self):
        backend = BoomBackend(True)
        error = io.StringIO()
        with redirect_stderr(error):
            self.assertEqual(switch.main(["on"], backend), 1)
        self.assertIn("Adapter is busy.", error.getvalue())
        self.assertTrue(backend.internet_on())


class WindowTests(unittest.TestCase):
    def test_buttons_switch_the_label(self):
        try:
            import tkinter as tk
        except Exception as exc:
            self.skipTest(f"tkinter is not available: {exc}")
        try:
            root = tk.Tk()
        except Exception as exc:
            self.skipTest(f"no display: {exc}")
        root.withdraw()
        try:
            backend = MemoryBackend(True)
            app = switch.App(root, backend, sync=True)
            self.assertEqual(app.status_var.get(), "Internet is on")
            self.assertEqual(str(app.off_button.cget("relief")), "sunken")
            app.on_button.invoke()
            self.assertEqual(app.status_var.get(), "Internet is off")
            self.assertFalse(backend.internet_on())
            self.assertEqual(str(app.on_button.cget("relief")), "sunken")
            self.assertEqual(str(app.off_button.cget("relief")), "raised")
            app.off_button.invoke()
            self.assertEqual(app.status_var.get(), "Internet is on")
            self.assertTrue(backend.internet_on())

            broken = BoomBackend(True)
            app.backend = broken
            app.on_button.invoke()
            self.assertEqual(app.error_var.get(), "Adapter is busy.")
            self.assertEqual(app.status_var.get(), "Internet is on")
            self.assertEqual(str(app.on_button.cget("state")), "normal")
        finally:
            root.destroy()


if __name__ == "__main__":
    unittest.main()
