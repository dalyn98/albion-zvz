# Albion Engage Timer

Windows overlay utility for manually counting Albion Online ZvZ engage timers.

## What it does

- Shows up to 8 compact timers: 4 friendly engage timers and 4 enemy engage timers.
- Hides disabled timer slots from the overlay instead of showing `OFF`.
- Starts each timer from a user-configured global hotkey.
- Shows running timers in red and idle timers in light green.
- Separates each timer into its own framed slot so active and idle engages are easier to scan.
- Supports 25s/30s/custom durations.
- Runs as a tray app.
- Lets you move and lock the overlay position.
- Lets you resize the overlay by dragging the bottom-right handle while unlocked.
- Uses a click-through overlay while locked so it does not block game input.
- Can ignore the mouse pointer entirely from the tray menu or Settings.
- Can play short tone patterns or TTS voice alerts for ready and warning events.
- Does not read game memory, network packets, screen pixels, or Albion client data.

## Run

1. Extract the zip.
2. Double-click `AlbionEngageTimer.exe`.
3. Use the tray icon to open Settings.
4. Start Albion Online. The overlay appears when Albion is running by default.

For testing without Albion running, right-click the tray icon and enable `Preview Overlay`.

To move or resize the overlay, right-click the tray icon and uncheck `Lock Position`. If `Ignore Mouse Pointer` is enabled, turn it off first. Drag the overlay body to move it, or drag the small bottom-right handle to resize it. Lock it again before playing; while locked, the overlay restores itself to the saved position if it is moved.

`AlbionEngageTimer.exe` is a small native Windows launcher. It starts `AlbionEngageTimer.ps1` from the same folder. If it does not start on your PC, use `start-engage-timer.cmd`; it uses only Windows PowerShell and shows startup errors instead of closing silently.

If startup still fails, run `run-debug.cmd` and check:

```text
%APPDATA%\AlbionEngageTimer\app.log
```

If Windows shows a `.NET Framework` error dialog, close the dialog and open the same log file. Version 0.1.3 and later record UI thread exceptions there.

## Hotkey format

In Settings, click a timer's `Hotkey` field and press the shortcut you want to use. Press Backspace/Delete while the field is selected to clear it.

Examples:

- `Ctrl+Alt+1`
- `Ctrl+Alt+5`
- `F13`
- `Shift+F13`
- `Ctrl+Shift+Q`

Mouse buttons are intentionally not supported in this first version. Use keyboard hotkeys or bind a mouse side button to an unused keyboard key such as `F13` with your mouse software.

## Sound alerts

Settings includes:

- `Sound enabled`
- `Ready sound`
- `5s warning`
- `2s warning`
- `Sound mode`: `Tone` or `TTS`

`Tone` uses short beep patterns that are easier to distinguish in combat. `TTS` says `Ready`, `Five`, or `Two`.

## Settings file

The app writes settings here:

```text
%APPDATA%\AlbionEngageTimer\settings.json
```

Keep `AlbionEngageTimer.exe` and `AlbionEngageTimer.ps1` in the same extracted folder.

## Game policy note

This tool is intentionally manual-only. It does not inspect Albion Online, automate input, detect enemies, read packets, or parse combat state. Third-party overlays can still carry account risk depending on game policy and anti-cheat behavior, so use at your own risk.
