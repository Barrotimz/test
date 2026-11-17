#!/usr/bin/env python3
"""Turn this PC's internet connection off or on.

Press ON to shut the internet off.
Press OFF to turn the internet back on.

The window asks for administrator permission when the system requires it.
Only this computer is changed.

Run the window:
    python3 internet_switch.py

Windows can also double-click "Internet Switch.bat".
Linux and macOS can double-click "internet-switch.sh".

Commands:
    python3 internet_switch.py on
    python3 internet_switch.py off
    python3 internet_switch.py status
"""

from __future__ import annotations

import base64
import json
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path


class InternetSwitchError(Exception):
    """The connection could not be checked or changed."""


@dataclass(frozen=True)
class CmdResult:
    code: int
    out: str
    err: str


_SKIP_ADAPTER = re.compile(
    r"WAN Miniport|Kernel Debug|Loopback|Teredo|ISATAP|6to4|QoS Packet Scheduler",
    re.IGNORECASE,
)
_IFNAME = re.compile(r"^[A-Za-z0-9_.:@-]{1,15}$")
_UNAVAILABLE = {"Disabled", "Not Present"}
_AUTH_MARKERS = (
    "not authorized",
    "not authorised",
    "insufficient privilege",
    "insufficient privileges",
    "permission denied",
    "authorization failed",
    "authorisation failed",
    "polkit",
    "interactive authentication required",
)
_MAC_HELPER = (
    "import base64,json,subprocess,sys;"
    "commands=json.loads(base64.b64decode(sys.argv[1]));"
    "[subprocess.check_call(command) for command in commands]"
)
_LIST_SCRIPT = """\
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Get-NetAdapter | ForEach-Object {
  [PSCustomObject]@{
    Name = $_.Name
    Status = [string]$_.Status
    Hardware = [bool]$_.HardwareInterface
    Description = [string]$_.InterfaceDescription
  }
} | ConvertTo-Json -Compress
"""

HELP = """\
Internet Switch

  Press ON to shut this PC's internet off.
  Press OFF to turn this PC's internet back on.

Usage:
  python3 internet_switch.py          open the window
  python3 internet_switch.py on       shut internet off
  python3 internet_switch.py off      turn internet on
  python3 internet_switch.py status   print on or off

Windows: double-click "Internet Switch.bat".
Linux and macOS: double-click "internet-switch.sh".
Administrator permission is requested when the system requires it.
"""

BG = "#f4f5f7"
MUTED = "#3f3f46"
FOOTER = "#71717a"


def view_model(internet_on: bool) -> dict[str, object]:
    """Copy for the window. ON means the cutoff is engaged."""
    if internet_on:
        return {
            "status": "Internet is on",
            "detail": "Press ON to shut this PC's internet off.",
            "on_selected": False,
            "off_selected": True,
            "color": "#15803d",
        }
    return {
        "status": "Internet is off",
        "detail": "Press OFF to turn this PC's internet back on.",
        "on_selected": True,
        "off_selected": False,
        "color": "#b91c1c",
    }


def ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def clean_adapter_name(name: str) -> str:
    cleaned = str(name).strip()
    if not cleaned or any(char in cleaned for char in "\r\n\x00"):
        raise InternetSwitchError(
            "A network adapter has a name this switch cannot change safely."
        )
    return cleaned


def windows_change_script(names: list[str], enable: bool) -> str:
    verb = "Enable-NetAdapter" if enable else "Disable-NetAdapter"
    quoted = ",".join(ps_quote(clean_adapter_name(name)) for name in names)
    return (
        "$ErrorActionPreference = 'Stop'\n"
        "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false\n"
        f"$names = @({quoted})\n"
        "foreach ($name in $names) {\n"
        f"  {verb} -Name $name -Confirm:$false\n"
        "}\n"
    )


def extract_json(raw: str) -> str:
    text = raw.lstrip("\ufeff \t\r\n")
    for index, char in enumerate(text):
        if char in "[{":
            return text[index:]
    return ""


def parse_adapters(raw: str) -> list[dict]:
    body = extract_json(raw)
    if not body:
        return []
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise InternetSwitchError("Could not read the network adapters.") from exc
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    raise InternetSwitchError("Could not read the network adapters.")


def filter_controllable(adapters: list[dict]) -> list[dict]:
    physical: list[dict] = []
    fallback: list[dict] = []
    for adapter in adapters:
        name = str(adapter.get("Name") or "").strip()
        description = str(adapter.get("Description") or "")
        if not name or any(char in name for char in "\r\n\x00"):
            continue
        if _SKIP_ADAPTER.search(name) or _SKIP_ADAPTER.search(description):
            continue
        row = {
            "Name": name,
            "Status": str(adapter.get("Status") or ""),
            "Hardware": bool(adapter.get("Hardware")),
            "Description": description,
        }
        fallback.append(row)
        if row["Hardware"]:
            physical.append(row)
    return physical or fallback


def parse_services(text: str) -> list[tuple[str, bool]]:
    services: list[tuple[str, bool]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("An asterisk"):
            continue
        enabled = True
        if line.startswith("*"):
            enabled = False
            line = line[1:].lstrip()
        if line:
            services.append((line, enabled))
    return services


def parse_links(raw: str) -> list[dict]:
    body = extract_json(raw)
    if not body:
        raise InternetSwitchError("Could not read network links.")
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise InternetSwitchError("Could not read network links.") from exc
    if not isinstance(data, list):
        raise InternetSwitchError("Could not read network links.")
    links: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("ifname") or "")
        if not name or name == "lo":
            continue
        flags = item.get("flags") or []
        if isinstance(flags, str):
            flags = [part.strip() for part in flags.split(",")]
        up = "UP" in flags or item.get("operstate") == "UP"
        links.append({"name": name, "up": up})
    return links


def require_ifname(name: str) -> str:
    if not _IFNAME.fullmatch(name):
        raise InternetSwitchError(f"Refusing to change network link {name!r}.")
    return name


def macos_privileged_launcher(commands: list[list[str]], python: str) -> list[str]:
    payload = base64.b64encode(json.dumps(commands).encode()).decode("ascii")
    inner = f"{shlex.quote(python)} -c {shlex.quote(_MAC_HELPER)} {payload}"
    script = (
        "do shell script "
        + _applescript_string(inner)
        + " with administrator privileges"
    )
    return ["osascript", "-e", script]


def _applescript_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return '"' + escaped + '"'


def default_state_path() -> Path:
    if platform.system() == "Windows":
        root = os.environ.get("LOCALAPPDATA")
        base = Path(root) if root else Path.home() / "AppData" / "Local"
    else:
        root = os.environ.get("XDG_DATA_HOME")
        base = Path(root) if root else Path.home() / ".local" / "share"
    return base / "internet-switch" / "state.json"


def load_state(path: Path) -> list[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []
    names = data.get("disabled") if isinstance(data, dict) else None
    if not isinstance(names, list):
        return []
    return [str(name) for name in names if str(name).strip()]


def save_state(path: Path, names: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps({"disabled": names}, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def run_argv(args: list[str]) -> CmdResult:
    kwargs: dict = {}
    if platform.system() == "Windows":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            check=False,
            **kwargs,
        )
    except FileNotFoundError as exc:
        program = args[0] if args else "a system command"
        raise InternetSwitchError(f"Could not run {program}.") from exc
    except subprocess.TimeoutExpired as exc:
        raise InternetSwitchError(
            "The system took too long to change the internet connection."
        ) from exc
    return CmdResult(completed.returncode, completed.stdout or "", completed.stderr or "")


def _fail(result: CmdResult, fallback: str) -> None:
    detail = (result.err or result.out).strip()
    raise InternetSwitchError(detail or fallback)


def _auth_failed(result: CmdResult) -> bool:
    if result.code == 0:
        return False
    text = f"{result.err}\n{result.out}".lower()
    return result.code == 4 or any(marker in text for marker in _AUTH_MARKERS)


def run_powershell(script: str, runner) -> str:
    result = runner(
        [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-OutputFormat",
            "Text",
            "-Command",
            script,
        ]
    )
    if result.code != 0:
        _fail(result, "Windows could not change the network adapters.")
    return result.out


def _restore(previous: list[str], path: Path, undo, original: InternetSwitchError) -> None:
    try:
        undo()
    except InternetSwitchError:
        raise original from None
    save_state(path, previous)
    raise original


class WindowsBackend:
    """Disable the PC's network adapters, then enable the same ones again."""

    def __init__(self, runner, state_file: Path):
        self.runner = runner
        self.state_file = Path(state_file)

    def internet_on(self) -> bool:
        adapters = self._adapters()
        return any(adapter["Status"] not in _UNAVAILABLE for adapter in adapters)

    def press_on(self) -> None:
        adapters = self._adapters()
        names = [
            adapter["Name"]
            for adapter in adapters
            if adapter["Status"] not in _UNAVAILABLE
        ]
        if not names:
            return
        previous = load_state(self.state_file)
        save_state(self.state_file, names)
        try:
            self._change(names, enable=False)
        except InternetSwitchError as exc:
            _restore(previous, self.state_file, lambda: self._change(names, enable=True), exc)

    def press_off(self) -> None:
        names = load_state(self.state_file)
        if not names:
            if self.internet_on():
                return
            names = [
                adapter["Name"]
                for adapter in self._adapters()
                if adapter["Status"] == "Disabled"
            ]
        if not names:
            raise InternetSwitchError("No network adapter was found to turn back on.")
        self._change(names, enable=True)
        save_state(self.state_file, [])

    def _adapters(self) -> list[dict]:
        parsed = parse_adapters(run_powershell(_LIST_SCRIPT, self.runner))
        adapters = filter_controllable(parsed)
        if not adapters:
            raise InternetSwitchError("No network adapter was found on this PC.")
        return adapters

    def _change(self, names: list[str], enable: bool) -> None:
        run_powershell(windows_change_script(names, enable), self.runner)


class MacBackend:
    """Turn macOS network services off, then back on."""

    def __init__(self, runner, state_file: Path, euid=None, python: str | None = None):
        self.runner = runner
        self.state_file = Path(state_file)
        self.euid = euid or _current_euid
        self.python = python or sys.executable

    def internet_on(self) -> bool:
        return any(enabled for _name, enabled in self._services())

    def press_on(self) -> None:
        names = [name for name, enabled in self._services() if enabled]
        if not names:
            return
        previous = load_state(self.state_file)
        save_state(self.state_file, names)
        commands = [
            ["networksetup", "-setnetworkserviceenabled", name, "off"] for name in names
        ]
        try:
            self._run(commands)
        except InternetSwitchError as exc:
            undo = [
                ["networksetup", "-setnetworkserviceenabled", name, "on"] for name in names
            ]
            _restore(previous, self.state_file, lambda: self._run(undo), exc)

    def press_off(self) -> None:
        names = load_state(self.state_file)
        if not names:
            if self.internet_on():
                return
            names = [name for name, enabled in self._services() if not enabled]
        if not names:
            raise InternetSwitchError("No network service was found to turn back on.")
        self._run(
            [["networksetup", "-setnetworkserviceenabled", name, "on"] for name in names]
        )
        save_state(self.state_file, [])

    def _services(self) -> list[tuple[str, bool]]:
        result = self.runner(["networksetup", "-listallnetworkservices"])
        if result.code != 0:
            _fail(result, "Could not list network services.")
        services = parse_services(result.out)
        if not services:
            raise InternetSwitchError("No network service was found on this Mac.")
        return services

    def _run(self, commands: list[list[str]]) -> None:
        if self.euid() == 0:
            for command in commands:
                result = self.runner(command)
                if result.code != 0:
                    _fail(result, "Could not change the network services.")
            return
        result = self.runner(macos_privileged_launcher(commands, self.python))
        if result.code != 0:
            _fail(result, "Could not change the network services.")


class LinuxBackend:
    """Turn Linux networking off with NetworkManager, or with ip link."""

    def __init__(self, runner, state_file: Path, which=None, euid=None):
        self.runner = runner
        self.state_file = Path(state_file)
        self.which = which or shutil.which
        self.euid = euid or _current_euid

    def internet_on(self) -> bool:
        if self._nmcli_path():
            return self._nmcli_enabled()
        return any(link["up"] for link in self._links())

    def press_on(self) -> None:
        if self._nmcli_path():
            if self._nmcli_enabled():
                self._nmcli(["networking", "off"])
            return
        links = self._links()
        names = [require_ifname(link["name"]) for link in links if link["up"]]
        if not names:
            return
        previous = load_state(self.state_file)
        save_state(self.state_file, names)
        try:
            self._ip_set(names, "down")
        except InternetSwitchError as exc:
            _restore(previous, self.state_file, lambda: self._ip_set(names, "up"), exc)

    def press_off(self) -> None:
        if self._nmcli_path():
            if not self._nmcli_enabled():
                self._nmcli(["networking", "on"])
            return
        names = load_state(self.state_file)
        if not names:
            if any(link["up"] for link in self._links()):
                return
            names = [link["name"] for link in self._links() if not link["up"]]
        if not names:
            raise InternetSwitchError("No network link was found to turn back on.")
        for name in names:
            require_ifname(name)
        self._ip_set(names, "up")
        save_state(self.state_file, [])

    def _nmcli_path(self) -> str | None:
        found = self.which("nmcli")
        return found or None

    def _nmcli_enabled(self) -> bool:
        binary = self._nmcli_path() or "nmcli"
        result = self.runner([binary, "-t", "-f", "NETWORKING", "general"])
        if result.code != 0:
            _fail(result, "Could not check the internet connection.")
        lines = [line.strip() for line in result.out.splitlines() if line.strip()]
        if not lines:
            raise InternetSwitchError("Could not check the internet connection.")
        token = lines[-1].split(":")[-1].strip().lower()
        if token == "enabled":
            return True
        if token == "disabled":
            return False
        raise InternetSwitchError(f"Unexpected NetworkManager status: {lines[-1]}")

    def _nmcli(self, args: list[str]) -> None:
        binary = self._nmcli_path() or "nmcli"
        command = [binary, *args]
        if self.euid() == 0:
            result = self.runner(command)
            if result.code != 0:
                _fail(result, "Could not change the internet connection.")
            return
        result = self.runner(command)
        if result.code == 0:
            return
        if not _auth_failed(result):
            _fail(result, "Could not change the internet connection.")
        self._privileged([command], "Could not change the internet connection.")

    def _ip_binary(self) -> str:
        found = self.which("ip")
        if found:
            return found
        for candidate in ("/usr/sbin/ip", "/sbin/ip"):
            if Path(candidate).exists():
                return candidate
        raise InternetSwitchError(
            "This PC needs NetworkManager (nmcli) or the ip command to change the internet connection."
        )

    def _links(self) -> list[dict]:
        result = self.runner([self._ip_binary(), "-json", "link", "show"])
        if result.code != 0:
            _fail(result, "Could not read network links.")
        return parse_links(result.out)

    def _ip_set(self, names: list[str], state: str) -> None:
        binary = self._ip_binary()
        commands = [[binary, "link", "set", name, state] for name in names]
        self._privileged(commands, "Could not change the network links.")

    def _privileged(self, commands: list[list[str]], fallback: str) -> None:
        if self.euid() == 0:
            for command in commands:
                result = self.runner(command)
                if result.code != 0:
                    _fail(result, fallback)
            return
        script = " && ".join(shlex.join(command) for command in commands)
        if self.which("pkexec"):
            result = self.runner(["pkexec", "/bin/sh", "-c", script])
        elif self.which("sudo"):
            result = self.runner(["sudo", "-n", "/bin/sh", "-c", script])
        else:
            raise InternetSwitchError(
                "Administrator permission is required to change the internet connection."
            )
        if result.code != 0:
            _fail(result, fallback)


def _current_euid() -> int:
    geteuid = getattr(os, "geteuid", None)
    if geteuid is None:
        return 0
    return int(geteuid())


def make_backend(runner=None, state_file: Path | None = None):
    runner = runner or run_argv
    path = Path(state_file) if state_file else default_state_path()
    system = platform.system()
    if system == "Windows":
        return WindowsBackend(runner, path)
    if system == "Darwin":
        return MacBackend(runner, path)
    return LinuxBackend(runner, path)


def _ui_font(size: int, weight: str = "normal") -> tuple[str, int, str]:
    family = "Segoe UI" if platform.system() == "Windows" else "DejaVu Sans"
    return (family, size, weight)


class App:
    """Two buttons: ON shuts the internet off, OFF turns it back on."""

    def __init__(self, root, backend, sync: bool = False):
        import tkinter as tk

        self.tk = tk
        self.root = root
        self.backend = backend
        self.sync = sync
        self._busy = False
        self._closed = False

        root.title("Internet Switch")
        root.configure(bg=BG)
        root.resizable(False, False)

        frame = tk.Frame(root, bg=BG, padx=28, pady=24)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(0, weight=1)
        frame.columnconfigure(1, weight=1)

        self.status_var = tk.StringVar(value="Checking...")
        self.detail_var = tk.StringVar(value="")
        self.error_var = tk.StringVar(value="")

        self.status_label = tk.Label(
            frame,
            textvariable=self.status_var,
            font=_ui_font(22, "bold"),
            bg=BG,
            fg=MUTED,
        )
        self.status_label.grid(row=0, column=0, columnspan=2, pady=(0, 6))

        tk.Label(
            frame,
            textvariable=self.detail_var,
            font=_ui_font(11),
            bg=BG,
            fg=MUTED,
            wraplength=420,
            justify="center",
        ).grid(row=1, column=0, columnspan=2, pady=(0, 18))

        self.on_button = tk.Button(
            frame,
            text="ON",
            command=self.press_on,
            font=_ui_font(22, "bold"),
            width=8,
            height=2,
            cursor="hand2",
        )
        self.off_button = tk.Button(
            frame,
            text="OFF",
            command=self.press_off,
            font=_ui_font(22, "bold"),
            width=8,
            height=2,
            cursor="hand2",
        )
        self.on_button.grid(row=2, column=0, padx=12, pady=(0, 6))
        self.off_button.grid(row=2, column=1, padx=12, pady=(0, 6))

        tk.Label(
            frame,
            text="shuts internet off",
            font=_ui_font(10),
            bg=BG,
            fg=MUTED,
        ).grid(row=3, column=0)
        tk.Label(
            frame,
            text="turns internet on",
            font=_ui_font(10),
            bg=BG,
            fg=MUTED,
        ).grid(row=3, column=1, padx=(8, 0))

        tk.Label(
            frame,
            textvariable=self.error_var,
            font=_ui_font(10),
            bg=BG,
            fg="#b91c1c",
            wraplength=420,
            justify="center",
        ).grid(row=4, column=0, columnspan=2, pady=(16, 0))

        tk.Label(
            frame,
            text="This changes only this computer.",
            font=_ui_font(9),
            bg=BG,
            fg=FOOTER,
        ).grid(row=5, column=0, columnspan=2, pady=(14, 0))

        self.refresh()
        if not sync:
            self._schedule_poll()
        self._place(root)

    def press_on(self) -> None:
        self._start(self.backend.press_on)

    def press_off(self) -> None:
        self._start(self.backend.press_off)

    def refresh(self) -> None:
        if self._busy and not self.sync:
            return
        self._start(lambda: None, refresh_only=True)

    def _schedule_poll(self) -> None:
        if self._closed:
            return
        self.root.after(4000, self._poll)

    def _poll(self) -> None:
        if self._closed:
            return
        if not self._busy:
            self.refresh()
        self._schedule_poll()

    def _start(self, action, refresh_only: bool = False) -> None:
        if self._busy:
            return
        self._busy = True
        if not refresh_only:
            self._set_buttons_enabled(False)
            self.status_var.set("Working...")
            self.detail_var.set("Changing this PC's internet connection.")
            self.error_var.set("")

        def finish(online: bool | None, error: str) -> None:
            self._show(online, error)

        if self.sync:
            online, error = self._perform(action)
            finish(online, error)
            return

        def work() -> None:
            online, error = self._perform(action)
            try:
                self.root.after(0, lambda: finish(online, error))
            except Exception:
                return

        threading.Thread(target=work, daemon=True).start()

    def _perform(self, action) -> tuple[bool | None, str]:
        error = ""
        try:
            action()
        except InternetSwitchError as exc:
            error = str(exc)
        try:
            return self.backend.internet_on(), error
        except InternetSwitchError as exc:
            return None, error or str(exc)

    def _show(self, online: bool | None, error: str) -> None:
        self._busy = False
        if self._closed or not self._alive():
            return
        self._set_buttons_enabled(True)
        self.error_var.set(error)
        if online is None:
            self.status_var.set("Could not check the connection")
            self.status_label.configure(fg="#92400e")
            self.detail_var.set("Try again in a moment.")
            return
        model = view_model(online)
        self.status_var.set(str(model["status"]))
        self.detail_var.set(str(model["detail"]))
        self.status_label.configure(fg=str(model["color"]))
        self._style_choice(self.on_button, bool(model["on_selected"]), "#b91c1c", "#7f1d1d")
        self._style_choice(self.off_button, bool(model["off_selected"]), "#15803d", "#14532d")

    def _style_choice(self, button, selected: bool, color: str, active: str) -> None:
        button.configure(
            state=self.tk.NORMAL,
            relief=self.tk.SUNKEN if selected else self.tk.RAISED,
            bg=color,
            fg="white",
            activebackground=active,
            activeforeground="white",
            highlightbackground="#18181b" if selected else color,
            highlightthickness=3 if selected else 1,
            bd=4 if selected else 2,
        )

    def _set_buttons_enabled(self, enabled: bool) -> None:
        state = self.tk.NORMAL if enabled else self.tk.DISABLED
        if self._alive():
            self.on_button.configure(state=state)
            self.off_button.configure(state=state)

    def _alive(self) -> bool:
        try:
            return bool(self.root.winfo_exists())
        except Exception:
            return False

    def _place(self, root) -> None:
        try:
            root.update_idletasks()
            width = root.winfo_reqwidth()
            height = root.winfo_reqheight()
            x = max((root.winfo_screenwidth() - width) // 2, 0)
            y = max((root.winfo_screenheight() - height) // 3, 0)
            root.geometry(f"{width}x{height}+{x}+{y}")
        except Exception:
            return


def windows_is_admin() -> bool:
    if platform.system() != "Windows":
        return False
    import ctypes

    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def windows_relaunch_as_admin() -> bool:
    import ctypes

    ctypes.windll.shell32.ShellExecuteW.restype = ctypes.c_void_p
    params = subprocess.list2cmdline(sys.argv)
    result = ctypes.windll.shell32.ShellExecuteW(
        None, "runas", sys.executable, params, None, 1
    )
    return bool(result and int(result) > 32)


def windows_message(text: str) -> None:
    import ctypes

    ctypes.windll.user32.MessageBoxW(None, text, "Internet Switch", 0x10)


def ensure_windows_admin() -> None:
    if platform.system() != "Windows" or windows_is_admin():
        return
    if windows_relaunch_as_admin():
        raise SystemExit(0)
    windows_message(
        "Administrator permission is required to turn the internet off or on."
    )
    raise SystemExit(0)


def _error_dialog(message: str) -> None:
    try:
        import tkinter as tk
        from tkinter import messagebox
    except Exception:
        return
    try:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Internet Switch", message)
        root.destroy()
    except Exception:
        return


def _open_gui(backend) -> None:
    try:
        import tkinter as tk
    except Exception as exc:
        raise InternetSwitchError(
            "This program needs tkinter. On Linux, install the python3-tk package."
        ) from exc
    root = tk.Tk()
    app = App(root, backend)
    root.protocol("WM_DELETE_WINDOW", lambda: _close(app))
    root.mainloop()


def _close(app: App) -> None:
    app._closed = True
    try:
        app.root.destroy()
    except Exception:
        return


def main(argv: list[str] | None = None, backend=None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    try:
        return _dispatch(argv, backend)
    except InternetSwitchError as exc:
        print(str(exc), file=sys.stderr)
        if not argv:
            _error_dialog(str(exc))
        return 1


def _dispatch(argv: list[str], backend) -> int:
    if argv and argv[0] in {"-h", "--help"}:
        print(HELP)
        return 0
    if len(argv) > 1 or (argv and argv[0] not in {"on", "off", "status"}):
        print(HELP, file=sys.stderr)
        return 2
    if backend is None:
        if not argv or argv[0] in {"on", "off"}:
            ensure_windows_admin()
        backend = make_backend()
    if not argv:
        _open_gui(backend)
        return 0
    if argv[0] == "status":
        print("on" if backend.internet_on() else "off")
        return 0
    if argv[0] == "on":
        backend.press_on()
    else:
        backend.press_off()
    print("on" if backend.internet_on() else "off")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130) from None
