#requires -version 5.1

$ErrorActionPreference = 'Stop'

$script:AppName = 'Albion Engage Timer'
$script:ConfigDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'AlbionEngageTimer'
$script:ConfigPath = Join-Path $script:ConfigDir 'settings.json'
$script:LogPath = Join-Path $script:ConfigDir 'app.log'
$script:FatalExitCode = 0

function Write-AppLog {
    param([string]$Message)

    try {
        if (-not (Test-Path $script:ConfigDir)) {
            New-Item -ItemType Directory -Path $script:ConfigDir -Force | Out-Null
        }

        $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f [DateTime]::Now, $Message
        Add-Content -Path $script:LogPath -Value $line -Encoding UTF8
    } catch {
        # Logging must never break the overlay.
    }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
try {
    Add-Type -AssemblyName System.Speech
    $script:SpeechSynthesisAvailable = $true
} catch {
    $script:SpeechSynthesisAvailable = $false
    Write-AppLog "System.Speech is not available: $($_.Exception.Message)"
}

[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
[System.Windows.Forms.Application]::add_ThreadException({
    param($Sender, $EventArgs)

    $message = if ($null -ne $EventArgs.Exception) { $EventArgs.Exception.ToString() } else { 'Unknown UI thread exception.' }
    Write-AppLog "UI thread exception: $message"
    [System.Windows.Forms.MessageBox]::Show(
        "A UI error occurred. The app will keep running if possible.`r`n`r`n$message",
        $script:AppName,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
})
[AppDomain]::CurrentDomain.add_UnhandledException({
    param($Sender, $EventArgs)

    $message = if ($null -ne $EventArgs.ExceptionObject) { $EventArgs.ExceptionObject.ToString() } else { 'Unknown AppDomain exception.' }
    Write-AppLog "Unhandled AppDomain exception: $message"
})

$createdNew = $false
$script:AppMutex = [System.Threading.Mutex]::new($true, 'Local\AlbionEngageTimer', [ref]$createdNew)
$script:HasAppMutex = [bool]$createdNew
if (-not $script:HasAppMutex) {
    [System.Windows.Forms.MessageBox]::Show(
        'Albion Engage Timer is already running.',
        'Albion Engage Timer',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    exit 0
}

$nativeSource = @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class HotkeyHostForm : Form
{
    public event Action<int> HotkeyPressed;

    protected override void SetVisibleCore(bool value)
    {
        base.SetVisibleCore(false);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x0312)
        {
            Action<int> handler = HotkeyPressed;
            if (handler != null)
            {
                handler(m.WParam.ToInt32());
            }
        }

        base.WndProc(ref m);
    }
}

public static class NativeMethods
{
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TRANSPARENT = 0x00000020;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_LAYERED = 0x00080000;
    public const int WS_EX_NOACTIVATE = 0x08000000;

    public const UInt32 SWP_NOSIZE = 0x0001;
    public const UInt32 SWP_NOMOVE = 0x0002;
    public const UInt32 SWP_NOACTIVATE = 0x0010;
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, UInt32 fsModifiers, UInt32 vk);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong", SetLastError = true)]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong", SetLastError = true)]
    private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        UInt32 uFlags
    );

    public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex)
    {
        if (IntPtr.Size == 8)
        {
            return GetWindowLongPtr64(hWnd, nIndex);
        }

        return new IntPtr(GetWindowLong32(hWnd, nIndex));
    }

    public static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong)
    {
        if (IntPtr.Size == 8)
        {
            return SetWindowLongPtr64(hWnd, nIndex, dwNewLong);
        }

        return new IntPtr(SetWindowLong32(hWnd, nIndex, dwNewLong.ToInt32()));
    }
}
"@

Add-Type -TypeDefinition $nativeSource -ReferencedAssemblies 'System.Windows.Forms.dll', 'System.Drawing.dll'

$script:Settings = $null
$script:OverlayForm = $null
$script:HotkeyForm = $null
$script:TrayIcon = $null
$script:UiTimer = $null
$script:SlotControls = @{}
$script:TimerStates = @{}
$script:RegisteredHotkeyIds = @()
$script:HotkeyIdMap = @{}
$script:ResizeHandle = $null
$script:SpeechSynthesizer = $null
$script:ForceOverlayVisible = $false
$script:StartupPreviewUntil = [DateTime]::Now.AddSeconds(10)
$script:ShouldShowOverlay = $true
$script:NextProcessCheck = [DateTime]::MinValue
$script:IsDragging = $false
$script:DragMouseStart = [System.Drawing.Point]::Empty
$script:DragFormStart = [System.Drawing.Point]::Empty
$script:IsResizing = $false
$script:ResizeMouseStart = [System.Drawing.Point]::Empty
$script:ResizeScaleStart = 100
$script:IsRestoringOverlayLocation = $false

function New-TimerDefinition {
    param(
        [string]$Id,
        [string]$Group,
        [string]$Label,
        [int]$Seconds,
        [string]$Hotkey,
        [string]$Color
    )

    [ordered]@{
        id = $Id
        group = $Group
        label = $Label
        seconds = $Seconds
        hotkey = $Hotkey
        color = $Color
        enabled = $true
    }
}

function New-DefaultSettings {
    [ordered]@{
        version = 1
        overlay = [ordered]@{
            enabled = $true
            x = 80
            y = 80
            scalePercent = 100
            opacityPercent = 88
            locked = $true
            clickThroughWhenLocked = $true
            showOnlyWhenAlbionRunning = $true
        }
        sound = [ordered]@{
            enabled = $true
            mode = 'tone'
            ready = $true
            warning5 = $false
            warning2 = $false
        }
        albionProcessNames = @(
            'Albion-Online',
            'AlbionOnline',
            'AlbionOnline_BE'
        )
        timers = @(
            (New-TimerDefinition -Id 'our1' -Group 'our' -Label 'OUR 1' -Seconds 25 -Hotkey 'Ctrl+Alt+1' -Color '#32D583'),
            (New-TimerDefinition -Id 'our2' -Group 'our' -Label 'OUR 2' -Seconds 25 -Hotkey 'Ctrl+Alt+2' -Color '#32D583'),
            (New-TimerDefinition -Id 'our3' -Group 'our' -Label 'OUR 3' -Seconds 30 -Hotkey 'Ctrl+Alt+3' -Color '#32D583'),
            (New-TimerDefinition -Id 'our4' -Group 'our' -Label 'OUR 4' -Seconds 30 -Hotkey 'Ctrl+Alt+4' -Color '#32D583'),
            (New-TimerDefinition -Id 'enemy1' -Group 'enemy' -Label 'ENEMY 1' -Seconds 25 -Hotkey 'Ctrl+Alt+5' -Color '#FF5C5C'),
            (New-TimerDefinition -Id 'enemy2' -Group 'enemy' -Label 'ENEMY 2' -Seconds 25 -Hotkey 'Ctrl+Alt+6' -Color '#FF5C5C'),
            (New-TimerDefinition -Id 'enemy3' -Group 'enemy' -Label 'ENEMY 3' -Seconds 30 -Hotkey 'Ctrl+Alt+7' -Color '#FF5C5C'),
            (New-TimerDefinition -Id 'enemy4' -Group 'enemy' -Label 'ENEMY 4' -Seconds 30 -Hotkey 'Ctrl+Alt+8' -Color '#FF5C5C')
        )
    }
}

function Convert-ToSettingsObject {
    param($Settings)

    return ($Settings | ConvertTo-Json -Depth 8 | ConvertFrom-Json)
}

function Save-Settings {
    param($Settings)

    if (-not (Test-Path $script:ConfigDir)) {
        New-Item -ItemType Directory -Path $script:ConfigDir -Force | Out-Null
    }

    $Settings | ConvertTo-Json -Depth 8 | Set-Content -Path $script:ConfigPath -Encoding UTF8
}

function Load-Settings {
    if (-not (Test-Path $script:ConfigPath)) {
        $defaults = New-DefaultSettings
        Save-Settings -Settings $defaults
        return Convert-ToSettingsObject -Settings $defaults
    }

    try {
        return Get-Content -Path $script:ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-AppLog "Failed to load settings. Recreating defaults. $($_.Exception.Message)"
        $defaults = New-DefaultSettings
        Save-Settings -Settings $defaults
        return Convert-ToSettingsObject -Settings $defaults
    }
}

function Get-PropertyValue {
    param(
        $Object,
        [string]$Name,
        $Fallback
    )

    if ($null -eq $Object) {
        return $Fallback
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $Fallback
    }

    return $property.Value
}

function Convert-ToBool {
    param($Value, [bool]$Fallback)

    if ($null -eq $Value) {
        return $Fallback
    }

    try {
        return [System.Convert]::ToBoolean($Value)
    } catch {
        return $Fallback
    }
}

function Convert-ToInt {
    param($Value, [int]$Fallback, [int]$Minimum, [int]$Maximum)

    try {
        $number = [int]$Value
        return [Math]::Min($Maximum, [Math]::Max($Minimum, $number))
    } catch {
        return $Fallback
    }
}

function Get-OverlaySetting {
    param([string]$Name, $Fallback)
    Get-PropertyValue -Object $script:Settings.overlay -Name $Name -Fallback $Fallback
}

function Get-SoundSetting {
    param([string]$Name, $Fallback)
    Get-PropertyValue -Object $script:Settings.sound -Name $Name -Fallback $Fallback
}

function Get-SoundMode {
    $mode = ([string](Get-SoundSetting -Name 'mode' -Fallback 'tone')).Trim().ToLowerInvariant()
    if ($mode -eq 'tts') {
        return 'tts'
    }

    return 'tone'
}

function Normalize-KeyName {
    param([string]$KeyToken)

    $key = $KeyToken.Trim()
    if ($key -match '^[0-9]$') {
        return "D$key"
    }

    switch -Regex ($key) {
        '^(?i)esc$' { return 'Escape' }
        '^(?i)del$' { return 'Delete' }
        '^(?i)ins$' { return 'Insert' }
        '^(?i)pgup$' { return 'PageUp' }
        '^(?i)pgdn$' { return 'PageDown' }
        '^(?i)numpad([0-9])$' { return "NumPad$($Matches[1])" }
        '^(?i)num([0-9])$' { return "NumPad$($Matches[1])" }
        default { return $key }
    }
}

function Convert-HotkeyText {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    $parts = @($Text -split '\+' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    if ($parts.Count -lt 1) {
        return $null
    }

    $modifiers = [uint32]0x4000
    $keyToken = $parts[$parts.Count - 1]

    for ($index = 0; $index -lt ($parts.Count - 1); $index++) {
        switch ($parts[$index].ToLowerInvariant()) {
            'alt' { $modifiers = $modifiers -bor [uint32]0x0001; continue }
            'ctrl' { $modifiers = $modifiers -bor [uint32]0x0002; continue }
            'control' { $modifiers = $modifiers -bor [uint32]0x0002; continue }
            'shift' { $modifiers = $modifiers -bor [uint32]0x0004; continue }
            'win' { $modifiers = $modifiers -bor [uint32]0x0008; continue }
            'windows' { $modifiers = $modifiers -bor [uint32]0x0008; continue }
            default { throw "Unknown hotkey modifier '$($parts[$index])' in '$Text'." }
        }
    }

    $keyName = Normalize-KeyName -KeyToken $keyToken
    try {
        $key = [System.Enum]::Parse([System.Windows.Forms.Keys], $keyName, $true)
    } catch {
        throw "Unknown hotkey key '$keyToken' in '$Text'."
    }

    [pscustomobject]@{
        Modifiers = $modifiers
        Key = [uint32]$key
        Text = ($parts -join '+')
    }
}

function Convert-KeyCodeToHotkeyToken {
    param([System.Windows.Forms.Keys]$KeyCode)

    $keyName = $KeyCode.ToString()
    if ($keyName -match '^D([0-9])$') {
        return $Matches[1]
    }

    if ($keyName -match '^NumPad([0-9])$') {
        return "NumPad$($Matches[1])"
    }

    switch ($keyName) {
        'ControlKey' { return $null }
        'LControlKey' { return $null }
        'RControlKey' { return $null }
        'ShiftKey' { return $null }
        'LShiftKey' { return $null }
        'RShiftKey' { return $null }
        'Menu' { return $null }
        'LMenu' { return $null }
        'RMenu' { return $null }
        'LWin' { return $null }
        'RWin' { return $null }
        'Modifiers' { return $null }
        default { return $keyName }
    }
}

function Convert-KeyEventToHotkeyText {
    param([System.Windows.Forms.KeyEventArgs]$EventArgs)

    $keyToken = Convert-KeyCodeToHotkeyToken -KeyCode $EventArgs.KeyCode
    if ([string]::IsNullOrWhiteSpace($keyToken)) {
        return $null
    }

    $parts = @()
    if ($EventArgs.Control) {
        $parts += 'Ctrl'
    }
    if ($EventArgs.Alt) {
        $parts += 'Alt'
    }
    if ($EventArgs.Shift) {
        $parts += 'Shift'
    }
    $parts += $keyToken

    return ($parts -join '+')
}

function Test-HotkeyGridCellActive {
    param([System.Windows.Forms.DataGridView]$Grid)

    if ($null -eq $Grid -or $null -eq $Grid.CurrentCell) {
        return $false
    }

    $column = $Grid.Columns[$Grid.CurrentCell.ColumnIndex]
    return $null -ne $column -and $column.Name -eq 'Hotkey'
}

function Set-HotkeyGridCellFromKeyEvent {
    param(
        [System.Windows.Forms.DataGridView]$Grid,
        [System.Windows.Forms.KeyEventArgs]$EventArgs
    )

    if (-not (Test-HotkeyGridCellActive -Grid $Grid)) {
        return $false
    }

    if ($EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Tab -or
        $EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Enter) {
        return $false
    }

    if ($EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Back -or
        $EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Delete) {
        $Grid.CurrentCell.Value = ''
        $EventArgs.SuppressKeyPress = $true
        $EventArgs.Handled = $true
        return $true
    }

    $hotkeyText = Convert-KeyEventToHotkeyText -EventArgs $EventArgs
    if ([string]::IsNullOrWhiteSpace($hotkeyText)) {
        $EventArgs.SuppressKeyPress = $true
        $EventArgs.Handled = $true
        return $true
    }

    $Grid.CurrentCell.Value = $hotkeyText
    $EventArgs.SuppressKeyPress = $true
    $EventArgs.Handled = $true
    return $true
}

function Convert-HexColor {
    param([string]$Hex, [System.Drawing.Color]$Fallback)

    if ($Hex -match '^#[0-9a-fA-F]{6}$') {
        try {
            return [System.Drawing.ColorTranslator]::FromHtml($Hex)
        } catch {
            return $Fallback
        }
    }

    return $Fallback
}

function New-AppFont {
    param(
        [double]$Size,
        [System.Drawing.FontStyle]$Style
    )

    try {
        return [System.Drawing.Font]::new('Segoe UI', [single]$Size, $Style, [System.Drawing.GraphicsUnit]::Point)
    } catch {
        Write-AppLog "Font creation failed, falling back to default UI font: $($_.Exception.Message)"
        return [System.Drawing.SystemFonts]::MessageBoxFont
    }
}

function Play-TonePattern {
    param([string]$Kind)

    try {
        switch ($Kind) {
            'Ready' {
                [Console]::Beep(880, 70)
                Start-Sleep -Milliseconds 35
                [Console]::Beep(1320, 120)
                return
            }
            'Warning5' {
                [Console]::Beep(660, 130)
                return
            }
            'Warning2' {
                [Console]::Beep(990, 65)
                Start-Sleep -Milliseconds 25
                [Console]::Beep(990, 65)
                Start-Sleep -Milliseconds 25
                [Console]::Beep(1320, 90)
                return
            }
            default {
                [Console]::Beep(880, 100)
                return
            }
        }
    } catch {
        Write-AppLog "Tone playback failed ($Kind): $($_.Exception.Message)"
    }
}

function Play-TtsAlert {
    param([string]$Kind)

    if (-not $script:SpeechSynthesisAvailable) {
        Play-TonePattern -Kind $Kind
        return
    }

    try {
        if ($null -eq $script:SpeechSynthesizer) {
            $script:SpeechSynthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
            $script:SpeechSynthesizer.Rate = 1
            $script:SpeechSynthesizer.Volume = 100
        }

        $text = switch ($Kind) {
            'Ready' { 'Ready'; break }
            'Warning5' { 'Five'; break }
            'Warning2' { 'Two'; break }
            default { 'Alert'; break }
        }

        $script:SpeechSynthesizer.SpeakAsyncCancelAll()
        $script:SpeechSynthesizer.SpeakAsync($text) | Out-Null
    } catch {
        Write-AppLog "TTS playback failed ($Kind): $($_.Exception.Message)"
        Play-TonePattern -Kind $Kind
    }
}

function Play-NotificationSound {
    param([string]$Kind)

    $enabled = Convert-ToBool -Value (Get-SoundSetting -Name 'enabled' -Fallback $true) -Fallback $true
    if (-not $enabled) {
        return
    }

    if ((Get-SoundMode) -eq 'tts') {
        Play-TtsAlert -Kind $Kind
    } else {
        Play-TonePattern -Kind $Kind
    }
}

function Initialize-TimerStates {
    $script:TimerStates = @{}
    foreach ($timer in @($script:Settings.timers)) {
        $script:TimerStates[[string]$timer.id] = @{
            Running = $false
            EndsAt = [DateTime]::MinValue
            Duration = (Convert-ToInt -Value $timer.seconds -Fallback 25 -Minimum 1 -Maximum 180)
            FlashUntil = [DateTime]::MinValue
            Warning5Played = $false
            Warning2Played = $false
            ReadyPlayed = $false
        }
    }
}

function Get-TimerDefinition {
    param([string]$TimerId)

    foreach ($timer in @($script:Settings.timers)) {
        if ([string]$timer.id -eq $TimerId) {
            return $timer
        }
    }

    return $null
}

function Start-TimerSlot {
    param([string]$TimerId)

    $timer = Get-TimerDefinition -TimerId $TimerId
    if ($null -eq $timer) {
        return
    }

    if (-not (Convert-ToBool -Value $timer.enabled -Fallback $true)) {
        return
    }

    $duration = Convert-ToInt -Value $timer.seconds -Fallback 25 -Minimum 1 -Maximum 180
    $script:TimerStates[$TimerId] = @{
        Running = $true
        EndsAt = [DateTime]::Now.AddSeconds($duration)
        Duration = $duration
        FlashUntil = [DateTime]::MinValue
        Warning5Played = $false
        Warning2Played = $false
        ReadyPlayed = $false
    }

    Update-Overlay
}

function Reset-AllTimers {
    foreach ($key in @($script:TimerStates.Keys)) {
        $script:TimerStates[$key].Running = $false
        $script:TimerStates[$key].EndsAt = [DateTime]::MinValue
        $script:TimerStates[$key].FlashUntil = [DateTime]::Now.AddMilliseconds(350)
        $script:TimerStates[$key].Warning5Played = $false
        $script:TimerStates[$key].Warning2Played = $false
        $script:TimerStates[$key].ReadyPlayed = $false
    }

    Update-Overlay
}

function Unregister-AllHotkeys {
    if ($null -eq $script:HotkeyForm) {
        return
    }

    foreach ($id in @($script:RegisteredHotkeyIds)) {
        [NativeMethods]::UnregisterHotKey($script:HotkeyForm.Handle, [int]$id) | Out-Null
    }

    $script:RegisteredHotkeyIds = @()
    $script:HotkeyIdMap = @{}
}

function Register-AllHotkeys {
    Unregister-AllHotkeys

    if ($null -eq $script:HotkeyForm) {
        return
    }

    $hotkeyId = 1000
    foreach ($timer in @($script:Settings.timers)) {
        if (-not (Convert-ToBool -Value $timer.enabled -Fallback $true)) {
            continue
        }

        try {
            $spec = Convert-HotkeyText -Text ([string]$timer.hotkey)
            if ($null -eq $spec) {
                continue
            }

            $registered = [NativeMethods]::RegisterHotKey(
                $script:HotkeyForm.Handle,
                $hotkeyId,
                [uint32]$spec.Modifiers,
                [uint32]$spec.Key
            )

            if ($registered) {
                $script:RegisteredHotkeyIds += $hotkeyId
                $script:HotkeyIdMap[$hotkeyId] = [string]$timer.id
            } else {
                $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
                Write-AppLog "Failed to register hotkey '$($timer.hotkey)' for '$($timer.label)'. Win32=$errorCode"
            }
        } catch {
            Write-AppLog "Invalid hotkey '$($timer.hotkey)' for '$($timer.label)': $($_.Exception.Message)"
        }

        $hotkeyId++
    }
}

function Set-OverlayClickThrough {
    param([System.Windows.Forms.Form]$Form)

    if ($null -eq $Form -or $Form.IsDisposed) {
        return
    }

    $locked = Convert-ToBool -Value (Get-OverlaySetting -Name 'locked' -Fallback $true) -Fallback $true
    $clickThrough = Convert-ToBool -Value (Get-OverlaySetting -Name 'clickThroughWhenLocked' -Fallback $true) -Fallback $true
    $shouldClickThrough = $locked -and $clickThrough

    $current = [NativeMethods]::GetWindowLongPtr($Form.Handle, [NativeMethods]::GWL_EXSTYLE).ToInt64()
    $next = $current -bor [NativeMethods]::WS_EX_TOOLWINDOW -bor [NativeMethods]::WS_EX_LAYERED -bor [NativeMethods]::WS_EX_NOACTIVATE

    if ($shouldClickThrough) {
        $next = $next -bor [NativeMethods]::WS_EX_TRANSPARENT
    } else {
        $next = $next -band (-bnot [NativeMethods]::WS_EX_TRANSPARENT)
    }

    [NativeMethods]::SetWindowLongPtr($Form.Handle, [NativeMethods]::GWL_EXSTYLE, [IntPtr]$next) | Out-Null
}

function Set-OverlayTopMost {
    if ($null -eq $script:OverlayForm -or $script:OverlayForm.IsDisposed) {
        return
    }

    $flags = [uint32]([NativeMethods]::SWP_NOMOVE -bor [NativeMethods]::SWP_NOSIZE -bor [NativeMethods]::SWP_NOACTIVATE)
    [NativeMethods]::SetWindowPos($script:OverlayForm.Handle, [NativeMethods]::HWND_TOPMOST, 0, 0, 0, 0, $flags) | Out-Null
}

function Test-OverlayLocked {
    Convert-ToBool -Value (Get-OverlaySetting -Name 'locked' -Fallback $true) -Fallback $true
}

function Get-SavedOverlayLocation {
    [System.Drawing.Point]::new(
        (Convert-ToInt -Value (Get-OverlaySetting -Name 'x' -Fallback 80) -Fallback 80 -Minimum -10000 -Maximum 10000),
        (Convert-ToInt -Value (Get-OverlaySetting -Name 'y' -Fallback 80) -Fallback 80 -Minimum -10000 -Maximum 10000)
    )
}

function Save-CurrentOverlayLocationToSettings {
    if ($null -eq $script:OverlayForm -or $script:OverlayForm.IsDisposed) {
        return
    }

    $script:Settings.overlay.x = $script:OverlayForm.Location.X
    $script:Settings.overlay.y = $script:OverlayForm.Location.Y
}

function Restore-LockedOverlayPosition {
    if ($script:IsRestoringOverlayLocation) {
        return
    }

    if ($null -eq $script:OverlayForm -or $script:OverlayForm.IsDisposed) {
        return
    }

    if (-not (Test-OverlayLocked)) {
        return
    }

    $target = Get-SavedOverlayLocation
    if ($script:OverlayForm.Location.X -eq $target.X -and
        $script:OverlayForm.Location.Y -eq $target.Y) {
        return
    }

    try {
        $script:IsRestoringOverlayLocation = $true
        $script:OverlayForm.Location = $target
    } finally {
        $script:IsRestoringOverlayLocation = $false
    }
}

function Stop-OverlayMouseInteraction {
    param($Control)

    $script:IsDragging = $false
    $script:IsResizing = $false

    try {
        if ($null -ne $Control) {
            $Control.Capture = $false
        }
    } catch {
        Write-AppLog "Failed to release mouse capture: $($_.Exception.Message)"
    }
}

function Save-OverlayPosition {
    if ($null -eq $script:OverlayForm -or $script:OverlayForm.IsDisposed) {
        return
    }

    if (Test-OverlayLocked) {
        Restore-LockedOverlayPosition
        return
    }

    Save-CurrentOverlayLocationToSettings
    Save-Settings -Settings $script:Settings
}

function Get-EnabledOverlayTimers {
    @(
        $script:Settings.timers |
            Where-Object { Convert-ToBool -Value $_.enabled -Fallback $true } |
            Sort-Object @{ Expression = { if ($_.group -eq 'our') { 0 } else { 1 } } }, @{ Expression = { $_.id } } |
            Select-Object -First 8
    )
}

function Get-OverlayLayout {
    param([int]$TimerCount)

    $count = [Math]::Max(0, [Math]::Min(8, $TimerCount))
    $columns = 1
    $rows = 1

    if ($count -gt 0 -and $count -le 4) {
        $columns = $count
    } elseif ($count -gt 4) {
        $columns = [int][Math]::Ceiling($count / 2.0)
        $rows = 2
    }

    [pscustomobject]@{
        Columns = $columns
        Rows = $rows
        Width = 155 * $columns
        Height = 61 * $rows
    }
}

function Apply-OverlayScale {
    param([int]$ScalePercent)

    if ($null -eq $script:OverlayForm -or $script:OverlayForm.IsDisposed) {
        return
    }

    $safeScalePercent = Convert-ToInt -Value $ScalePercent -Fallback 100 -Minimum 70 -Maximum 160
    $scale = $safeScalePercent / 100.0
    $layout = Get-OverlayLayout -TimerCount $script:SlotControls.Count
    $script:Settings.overlay.scalePercent = $safeScalePercent

    $script:OverlayForm.Size = [System.Drawing.Size]::new(
        [int]($layout.Width * $scale),
        [int]($layout.Height * $scale)
    )

    foreach ($id in @($script:SlotControls.Keys)) {
        $controls = $script:SlotControls[$id]
        $controls.Name.Font = New-AppFont -Size (8.0 * $scale) -Style ([System.Drawing.FontStyle]::Bold)
        $controls.Name.Height = [int](20 * $scale)
        $controls.Time.Font = New-AppFont -Size (15.5 * $scale) -Style ([System.Drawing.FontStyle]::Bold)
        $controls.BarBack.Height = [int](4 * $scale)
    }

    if ($null -ne $script:ResizeHandle -and -not $script:ResizeHandle.IsDisposed) {
        $script:ResizeHandle.Location = [System.Drawing.Point]::new(
            ($script:OverlayForm.ClientSize.Width - $script:ResizeHandle.Width),
            ($script:OverlayForm.ClientSize.Height - $script:ResizeHandle.Height)
        )
        $script:ResizeHandle.BringToFront()
    }
}

function Update-ResizeHandleVisibility {
    if ($null -eq $script:ResizeHandle -or $script:ResizeHandle.IsDisposed) {
        return
    }

    try {
        $locked = Test-OverlayLocked
        if ($locked) {
            Stop-OverlayMouseInteraction -Control $script:ResizeHandle
            Restore-LockedOverlayPosition
        }

        $script:ResizeHandle.Enabled = -not $locked
        $script:ResizeHandle.Visible = -not $locked
        if ($script:ResizeHandle.Visible) {
            $script:ResizeHandle.BringToFront()
        }
    } catch {
        Write-AppLog "Resize handle visibility update failed: $($_.Exception.Message)"
    }
}

function Attach-ResizeHandlers {
    param([System.Windows.Forms.Control]$Control)

    $Control.Add_MouseDown({
        param($Sender, $EventArgs)

        try {
            if (Test-OverlayLocked) {
                Stop-OverlayMouseInteraction -Control $Sender
                return
            }

            if ($null -eq $EventArgs -or $EventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) {
                return
            }

            $script:IsResizing = $true
            $script:IsDragging = $false
            $script:ResizeMouseStart = [System.Windows.Forms.Cursor]::Position
            $script:ResizeScaleStart = Convert-ToInt -Value (Get-OverlaySetting -Name 'scalePercent' -Fallback 100) -Fallback 100 -Minimum 70 -Maximum 160
            $Sender.Capture = $true
        } catch {
            Stop-OverlayMouseInteraction -Control $Sender
            Write-AppLog "Resize mouse down failed: $($_.Exception.Message)"
        }
    })

    $Control.Add_MouseMove({
        param($Sender, $EventArgs)

        try {
            if (Test-OverlayLocked) {
                Stop-OverlayMouseInteraction -Control $Sender
                return
            }

            if (-not $script:IsResizing) {
                return
            }

            $position = [System.Windows.Forms.Cursor]::Position
            $dx = $position.X - $script:ResizeMouseStart.X
            $dy = $position.Y - $script:ResizeMouseStart.Y
            $deltaX = [int][Math]::Round(($dx / 620.0) * 100)
            $deltaY = [int][Math]::Round(($dy / 122.0) * 100)
            $delta = if ([Math]::Abs($deltaY) -gt [Math]::Abs($deltaX)) { $deltaY } else { $deltaX }

            Apply-OverlayScale -ScalePercent ($script:ResizeScaleStart + $delta)
        } catch {
            Stop-OverlayMouseInteraction -Control $Sender
            Write-AppLog "Resize mouse move failed: $($_.Exception.Message)"
        }
    })

    $Control.Add_MouseUp({
        param($Sender, $EventArgs)

        try {
            if (-not $script:IsResizing) {
                return
            }

            $script:IsResizing = $false
            $Sender.Capture = $false
            if (-not (Test-OverlayLocked)) {
                Save-Settings -Settings $script:Settings
            }
        } catch {
            Write-AppLog "Resize mouse up failed: $($_.Exception.Message)"
        } finally {
            Stop-OverlayMouseInteraction -Control $Sender
        }
    })
}

function Attach-DragHandlers {
    param([System.Windows.Forms.Control]$Control)

    $Control.Add_MouseDown({
        param($Sender, $EventArgs)

        try {
            if ($script:IsResizing) {
                return
            }

            if (Test-OverlayLocked) {
                Stop-OverlayMouseInteraction -Control $Sender
                return
            }

            if ($null -eq $EventArgs -or $EventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) {
                return
            }

            $script:IsDragging = $true
            $script:DragMouseStart = [System.Windows.Forms.Cursor]::Position
            $script:DragFormStart = $script:OverlayForm.Location
        } catch {
            Stop-OverlayMouseInteraction -Control $Sender
            Write-AppLog "Drag mouse down failed: $($_.Exception.Message)"
        }
    })

    $Control.Add_MouseMove({
        param($Sender, $EventArgs)

        try {
            if ($script:IsResizing) {
                return
            }

            if (Test-OverlayLocked) {
                Stop-OverlayMouseInteraction -Control $Sender
                return
            }

            if (-not $script:IsDragging) {
                return
            }

            $position = [System.Windows.Forms.Cursor]::Position
            $dx = $position.X - $script:DragMouseStart.X
            $dy = $position.Y - $script:DragMouseStart.Y
            $script:OverlayForm.Location = [System.Drawing.Point]::new(
                ($script:DragFormStart.X + $dx),
                ($script:DragFormStart.Y + $dy)
            )
        } catch {
            Stop-OverlayMouseInteraction -Control $Sender
            Write-AppLog "Drag mouse move failed: $($_.Exception.Message)"
        }
    })

    $Control.Add_MouseUp({
        param($Sender, $EventArgs)

        try {
            if (-not $script:IsDragging) {
                return
            }

            $script:IsDragging = $false
            if (-not (Test-OverlayLocked)) {
                Save-OverlayPosition
            }
        } catch {
            Write-AppLog "Drag mouse up failed: $($_.Exception.Message)"
        } finally {
            Stop-OverlayMouseInteraction -Control $Sender
        }
    })
}

function New-SlotPanel {
    param($Timer)

    $scale = (Convert-ToInt -Value (Get-OverlaySetting -Name 'scalePercent' -Fallback 100) -Fallback 100 -Minimum 70 -Maximum 160) / 100.0

    $panel = New-Object System.Windows.Forms.Panel
    $panel.Margin = [System.Windows.Forms.Padding]::new(3)
    $panel.Dock = [System.Windows.Forms.DockStyle]::Fill
    $panel.BackColor = [System.Drawing.Color]::FromArgb(32, 37, 48)

    $nameLabel = New-Object System.Windows.Forms.Label
    $nameLabel.AutoSize = $false
    $nameLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $nameLabel.Font = New-AppFont -Size (8.0 * $scale) -Style ([System.Drawing.FontStyle]::Bold)
    $nameLabel.ForeColor = Convert-HexColor -Hex ([string]$Timer.color) -Fallback ([System.Drawing.Color]::White)
    $nameLabel.Text = [string]$Timer.label
    $nameLabel.Dock = [System.Windows.Forms.DockStyle]::Top
    $nameLabel.Height = [int](20 * $scale)
    $nameLabel.Padding = [System.Windows.Forms.Padding]::new(6, 0, 6, 0)

    $timeLabel = New-Object System.Windows.Forms.Label
    $timeLabel.AutoSize = $false
    $timeLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $timeLabel.Font = New-AppFont -Size (15.5 * $scale) -Style ([System.Drawing.FontStyle]::Bold)
    $timeLabel.ForeColor = [System.Drawing.Color]::White
    $timeLabel.Text = 'READY'
    $timeLabel.Dock = [System.Windows.Forms.DockStyle]::Fill

    $barBack = New-Object System.Windows.Forms.Panel
    $barBack.Dock = [System.Windows.Forms.DockStyle]::Bottom
    $barBack.Height = [int](4 * $scale)
    $barBack.BackColor = [System.Drawing.Color]::FromArgb(18, 22, 28)

    $barFill = New-Object System.Windows.Forms.Panel
    $barFill.Dock = [System.Windows.Forms.DockStyle]::Left
    $barFill.Width = 0
    $barFill.BackColor = Convert-HexColor -Hex ([string]$Timer.color) -Fallback ([System.Drawing.Color]::White)
    $barBack.Controls.Add($barFill)

    $panel.Controls.Add($timeLabel)
    $panel.Controls.Add($nameLabel)
    $panel.Controls.Add($barBack)

    Attach-DragHandlers -Control $panel
    Attach-DragHandlers -Control $nameLabel
    Attach-DragHandlers -Control $timeLabel
    Attach-DragHandlers -Control $barBack
    Attach-DragHandlers -Control $barFill

    $script:SlotControls[[string]$Timer.id] = @{
        Panel = $panel
        Name = $nameLabel
        Time = $timeLabel
        BarBack = $barBack
        BarFill = $barFill
    }

    return $panel
}

function New-OverlayForm {
    $scalePercent = Convert-ToInt -Value (Get-OverlaySetting -Name 'scalePercent' -Fallback 100) -Fallback 100 -Minimum 70 -Maximum 160
    $scale = $scalePercent / 100.0
    $orderedTimers = @(Get-EnabledOverlayTimers)
    $layout = Get-OverlayLayout -TimerCount $orderedTimers.Count
    $width = [int]($layout.Width * $scale)
    $height = [int]($layout.Height * $scale)

    $form = New-Object System.Windows.Forms.Form
    $form.Text = $script:AppName
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.ShowInTaskbar = $false
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $form.TopMost = $true
    $form.BackColor = [System.Drawing.Color]::FromArgb(12, 14, 18)
    $form.Size = [System.Drawing.Size]::new($width, $height)
    $form.Location = Get-SavedOverlayLocation
    $form.Opacity = (Convert-ToInt -Value (Get-OverlaySetting -Name 'opacityPercent' -Fallback 88) -Fallback 88 -Minimum 35 -Maximum 100) / 100.0

    $table = New-Object System.Windows.Forms.TableLayoutPanel
    $table.Dock = [System.Windows.Forms.DockStyle]::Fill
    $table.BackColor = [System.Drawing.Color]::FromArgb(12, 14, 18)
    $table.ColumnCount = $layout.Columns
    $table.RowCount = $layout.Rows
    $table.Padding = [System.Windows.Forms.Padding]::new(4)

    for ($column = 0; $column -lt $layout.Columns; $column++) {
        $table.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new([System.Windows.Forms.SizeType]::Percent, (100 / $layout.Columns))) | Out-Null
    }

    for ($row = 0; $row -lt $layout.Rows; $row++) {
        $table.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Percent, (100 / $layout.Rows))) | Out-Null
    }

    $script:SlotControls = @{}
    for ($index = 0; $index -lt [Math]::Min(8, $orderedTimers.Count); $index++) {
        $timer = $orderedTimers[$index]
        $slotPanel = New-SlotPanel -Timer $timer
        $table.Controls.Add($slotPanel, ($index % $layout.Columns), [int][Math]::Floor($index / $layout.Columns))
    }

    Attach-DragHandlers -Control $form
    Attach-DragHandlers -Control $table

    $script:ResizeHandle = New-Object System.Windows.Forms.Panel
    $script:ResizeHandle.Size = [System.Drawing.Size]::new(16, 16)
    $script:ResizeHandle.Location = [System.Drawing.Point]::new(
        ($form.ClientSize.Width - 16),
        ($form.ClientSize.Height - 16)
    )
    $script:ResizeHandle.Anchor = [System.Windows.Forms.AnchorStyles]::Right -bor [System.Windows.Forms.AnchorStyles]::Bottom
    $script:ResizeHandle.BackColor = [System.Drawing.Color]::FromArgb(95, 120, 145)
    $script:ResizeHandle.Cursor = [System.Windows.Forms.Cursors]::SizeNWSE
    Attach-ResizeHandlers -Control $script:ResizeHandle

    $form.Controls.Add($table)
    $form.Controls.Add($script:ResizeHandle)
    $form.Add_LocationChanged({
        try {
            if ($script:IsRestoringOverlayLocation) {
                return
            }

            if (Test-OverlayLocked) {
                Stop-OverlayMouseInteraction -Control $script:OverlayForm
                Restore-LockedOverlayPosition
            }
        } catch {
            Write-AppLog "Locked overlay position restore failed: $($_.Exception.Message)"
        }
    })
    $form.Add_Shown({
        Set-OverlayClickThrough -Form $script:OverlayForm
        Set-OverlayTopMost
        Update-ResizeHandleVisibility
    })

    return $form
}

function Test-AlbionRunning {
    $names = @($script:Settings.albionProcessNames)
    if ($names.Count -eq 0) {
        return $false
    }

    foreach ($name in $names) {
        if ([string]::IsNullOrWhiteSpace($name)) {
            continue
        }

        try {
            $process = Get-Process -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($null -ne $process) {
                return $true
            }
        } catch {
            Write-AppLog "Process check failed for '$name': $($_.Exception.Message)"
        }
    }

    return $false
}

function Update-OverlayVisibility {
    if ($null -eq $script:OverlayForm -or $script:OverlayForm.IsDisposed) {
        return
    }

    $enabled = Convert-ToBool -Value (Get-OverlaySetting -Name 'enabled' -Fallback $true) -Fallback $true
    if (-not $enabled) {
        if ($script:OverlayForm.Visible) {
            $script:OverlayForm.Hide()
        }
        return
    }

    if (@(Get-EnabledOverlayTimers).Count -le 0) {
        if ($script:OverlayForm.Visible) {
            $script:OverlayForm.Hide()
        }
        return
    }

    $showOnlyWhenAlbionRunning = Convert-ToBool -Value (Get-OverlaySetting -Name 'showOnlyWhenAlbionRunning' -Fallback $true) -Fallback $true
    $isStartupPreview = [DateTime]::Now -lt $script:StartupPreviewUntil
    $shouldShow = $script:ForceOverlayVisible -or $isStartupPreview -or (-not $showOnlyWhenAlbionRunning) -or $script:ShouldShowOverlay

    if ($shouldShow) {
        if (-not $script:OverlayForm.Visible) {
            $script:OverlayForm.Show()
        }
        Set-OverlayTopMost
    } else {
        if ($script:OverlayForm.Visible) {
            $script:OverlayForm.Hide()
        }
    }
}

function Update-Overlay {
    if ($null -eq $script:OverlayForm -or $script:OverlayForm.IsDisposed) {
        return
    }

    $now = [DateTime]::Now

    foreach ($timer in @($script:Settings.timers)) {
        $id = [string]$timer.id
        if (-not $script:SlotControls.ContainsKey($id)) {
            continue
        }

        if (-not $script:TimerStates.ContainsKey($id)) {
            $script:TimerStates[$id] = @{
                Running = $false
                EndsAt = [DateTime]::MinValue
                Duration = (Convert-ToInt -Value $timer.seconds -Fallback 25 -Minimum 1 -Maximum 180)
                FlashUntil = [DateTime]::MinValue
                Warning5Played = $false
                Warning2Played = $false
                ReadyPlayed = $false
            }
        }

        $controls = $script:SlotControls[$id]
        $state = $script:TimerStates[$id]
        $enabled = Convert-ToBool -Value $timer.enabled -Fallback $true
        $baseColor = Convert-HexColor -Hex ([string]$timer.color) -Fallback ([System.Drawing.Color]::White)

        if (-not $enabled) {
            $controls.Panel.Visible = $false
            $controls.BarFill.Width = 0
            continue
        }

        $controls.Panel.Visible = $true

        if ($state.Running) {
            $remaining = ($state.EndsAt - $now).TotalSeconds
            if ($remaining -le 0) {
                $state.Running = $false
                $state.FlashUntil = $now.AddMilliseconds(650)
                if (-not $state.ReadyPlayed -and
                    (Convert-ToBool -Value (Get-SoundSetting -Name 'ready' -Fallback $true) -Fallback $true)) {
                    Play-NotificationSound -Kind 'Ready'
                    $state.ReadyPlayed = $true
                }
                $remaining = 0
            }

            if ($state.Running) {
                if ($remaining -le 2 -and
                    -not $state.Warning2Played -and
                    (Convert-ToBool -Value (Get-SoundSetting -Name 'warning2' -Fallback $false) -Fallback $false)) {
                    Play-NotificationSound -Kind 'Warning2'
                    $state.Warning2Played = $true
                } elseif ($remaining -le 5 -and
                    $remaining -gt 2 -and
                    -not $state.Warning5Played -and
                    (Convert-ToBool -Value (Get-SoundSetting -Name 'warning5' -Fallback $false) -Fallback $false)) {
                    Play-NotificationSound -Kind 'Warning5'
                    $state.Warning5Played = $true
                }

                $controls.Time.Text = ('{0:0.0}' -f $remaining)
                $controls.Time.ForeColor = [System.Drawing.Color]::White

                if ($remaining -le 2) {
                    $controls.Panel.BackColor = [System.Drawing.Color]::FromArgb(96, 18, 24)
                } elseif ($remaining -le 5) {
                    $controls.Panel.BackColor = [System.Drawing.Color]::FromArgb(82, 58, 12)
                } else {
                    $controls.Panel.BackColor = [System.Drawing.Color]::FromArgb(31, 36, 47)
                }

                $duration = [Math]::Max(1, [double]$state.Duration)
                $ratio = [Math]::Min(1.0, [Math]::Max(0.0, $remaining / $duration))
                $controls.BarFill.Width = [int]($controls.BarBack.ClientSize.Width * $ratio)
                $controls.BarFill.BackColor = $baseColor
                continue
            }
        }

        $controls.Time.Text = 'READY'
        $controls.Time.ForeColor = [System.Drawing.Color]::White
        $controls.BarFill.Width = 0

        if ($state.FlashUntil -gt $now) {
            $controls.Panel.BackColor = [System.Drawing.Color]::FromArgb(
                [Math]::Min(255, [int](28 + ($baseColor.R * 0.35))),
                [Math]::Min(255, [int](33 + ($baseColor.G * 0.35))),
                [Math]::Min(255, [int](43 + ($baseColor.B * 0.35)))
            )
        } else {
            $controls.Panel.BackColor = [System.Drawing.Color]::FromArgb(28, 33, 43)
        }
    }
}

function Tick-App {
    try {
        $now = [DateTime]::Now
        if ($now -ge $script:NextProcessCheck) {
            $script:ShouldShowOverlay = Test-AlbionRunning
            $script:NextProcessCheck = $now.AddSeconds(1)
        }

        Update-OverlayVisibility
        Update-Overlay
    } catch {
        Write-AppLog "Tick failed: $($_.Exception.Message)"
    }
}

function Recreate-Overlay {
    if ($null -ne $script:OverlayForm -and -not $script:OverlayForm.IsDisposed) {
        $script:OverlayForm.Hide()
        $script:OverlayForm.Dispose()
    }

    $script:OverlayForm = New-OverlayForm
    Set-OverlayClickThrough -Form $script:OverlayForm
    Update-OverlayVisibility
    Update-Overlay
}

function Apply-Settings {
    Initialize-TimerStates
    Recreate-Overlay
    Register-AllHotkeys
}

function New-Label {
    param([string]$Text, [int]$X, [int]$Y, [int]$Width)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Location = [System.Drawing.Point]::new($X, $Y)
    $label.Size = [System.Drawing.Size]::new($Width, 22)
    $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    return $label
}

function Show-SettingsWindow {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "$script:AppName Settings"
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.Size = [System.Drawing.Size]::new(760, 640)
    $form.TopMost = $true

    $chkEnabled = New-Object System.Windows.Forms.CheckBox
    $chkEnabled.Text = 'Overlay enabled'
    $chkEnabled.Location = [System.Drawing.Point]::new(18, 16)
    $chkEnabled.Size = [System.Drawing.Size]::new(160, 24)
    $chkEnabled.Checked = Convert-ToBool -Value (Get-OverlaySetting -Name 'enabled' -Fallback $true) -Fallback $true

    $chkShowOnly = New-Object System.Windows.Forms.CheckBox
    $chkShowOnly.Text = 'Show only when Albion is running'
    $chkShowOnly.Location = [System.Drawing.Point]::new(200, 16)
    $chkShowOnly.Size = [System.Drawing.Size]::new(240, 24)
    $chkShowOnly.Checked = Convert-ToBool -Value (Get-OverlaySetting -Name 'showOnlyWhenAlbionRunning' -Fallback $true) -Fallback $true

    $chkLocked = New-Object System.Windows.Forms.CheckBox
    $chkLocked.Text = 'Lock position'
    $chkLocked.Location = [System.Drawing.Point]::new(470, 16)
    $chkLocked.Size = [System.Drawing.Size]::new(130, 24)
    $chkLocked.Checked = Convert-ToBool -Value (Get-OverlaySetting -Name 'locked' -Fallback $true) -Fallback $true

    $chkClickThrough = New-Object System.Windows.Forms.CheckBox
    $chkClickThrough.Text = 'Click-through while locked'
    $chkClickThrough.Location = [System.Drawing.Point]::new(18, 48)
    $chkClickThrough.Size = [System.Drawing.Size]::new(220, 24)
    $chkClickThrough.Checked = Convert-ToBool -Value (Get-OverlaySetting -Name 'clickThroughWhenLocked' -Fallback $true) -Fallback $true

    $numOpacity = New-Object System.Windows.Forms.NumericUpDown
    $numOpacity.Location = [System.Drawing.Point]::new(318, 49)
    $numOpacity.Size = [System.Drawing.Size]::new(70, 24)
    $numOpacity.Minimum = 35
    $numOpacity.Maximum = 100
    $numOpacity.Value = Convert-ToInt -Value (Get-OverlaySetting -Name 'opacityPercent' -Fallback 88) -Fallback 88 -Minimum 35 -Maximum 100

    $numScale = New-Object System.Windows.Forms.NumericUpDown
    $numScale.Location = [System.Drawing.Point]::new(482, 49)
    $numScale.Size = [System.Drawing.Size]::new(70, 24)
    $numScale.Minimum = 70
    $numScale.Maximum = 160
    $numScale.Value = Convert-ToInt -Value (Get-OverlaySetting -Name 'scalePercent' -Fallback 100) -Fallback 100 -Minimum 70 -Maximum 160

    $numX = New-Object System.Windows.Forms.NumericUpDown
    $numX.Location = [System.Drawing.Point]::new(606, 49)
    $numX.Size = [System.Drawing.Size]::new(62, 24)
    $numX.Minimum = -10000
    $numX.Maximum = 10000
    $numX.Value = Convert-ToInt -Value (Get-OverlaySetting -Name 'x' -Fallback 80) -Fallback 80 -Minimum -10000 -Maximum 10000

    $numY = New-Object System.Windows.Forms.NumericUpDown
    $numY.Location = [System.Drawing.Point]::new(680, 49)
    $numY.Size = [System.Drawing.Size]::new(62, 24)
    $numY.Minimum = -10000
    $numY.Maximum = 10000
    $numY.Value = Convert-ToInt -Value (Get-OverlaySetting -Name 'y' -Fallback 80) -Fallback 80 -Minimum -10000 -Maximum 10000

    $chkSoundEnabled = New-Object System.Windows.Forms.CheckBox
    $chkSoundEnabled.Text = 'Sound enabled'
    $chkSoundEnabled.Location = [System.Drawing.Point]::new(18, 82)
    $chkSoundEnabled.Size = [System.Drawing.Size]::new(130, 24)
    $chkSoundEnabled.Checked = Convert-ToBool -Value (Get-SoundSetting -Name 'enabled' -Fallback $true) -Fallback $true

    $chkSoundReady = New-Object System.Windows.Forms.CheckBox
    $chkSoundReady.Text = 'Ready sound'
    $chkSoundReady.Location = [System.Drawing.Point]::new(160, 82)
    $chkSoundReady.Size = [System.Drawing.Size]::new(120, 24)
    $chkSoundReady.Checked = Convert-ToBool -Value (Get-SoundSetting -Name 'ready' -Fallback $true) -Fallback $true

    $chkSoundWarning5 = New-Object System.Windows.Forms.CheckBox
    $chkSoundWarning5.Text = '5s warning'
    $chkSoundWarning5.Location = [System.Drawing.Point]::new(300, 82)
    $chkSoundWarning5.Size = [System.Drawing.Size]::new(110, 24)
    $chkSoundWarning5.Checked = Convert-ToBool -Value (Get-SoundSetting -Name 'warning5' -Fallback $false) -Fallback $false

    $chkSoundWarning2 = New-Object System.Windows.Forms.CheckBox
    $chkSoundWarning2.Text = '2s warning'
    $chkSoundWarning2.Location = [System.Drawing.Point]::new(430, 82)
    $chkSoundWarning2.Size = [System.Drawing.Size]::new(110, 24)
    $chkSoundWarning2.Checked = Convert-ToBool -Value (Get-SoundSetting -Name 'warning2' -Fallback $false) -Fallback $false

    $comboSoundMode = New-Object System.Windows.Forms.ComboBox
    $comboSoundMode.Location = [System.Drawing.Point]::new(626, 82)
    $comboSoundMode.Size = [System.Drawing.Size]::new(116, 24)
    $comboSoundMode.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
    $comboSoundMode.Items.Add('Tone') | Out-Null
    $comboSoundMode.Items.Add('TTS') | Out-Null
    $comboSoundMode.SelectedItem = if ((Get-SoundMode) -eq 'tts') { 'TTS' } else { 'Tone' }

    $grid = New-Object System.Windows.Forms.DataGridView
    $grid.Location = [System.Drawing.Point]::new(18, 118)
    $grid.Size = [System.Drawing.Size]::new(724, 360)
    $grid.AllowUserToAddRows = $false
    $grid.AllowUserToDeleteRows = $false
    $grid.RowHeadersVisible = $false
    $grid.SelectionMode = [System.Windows.Forms.DataGridViewSelectionMode]::CellSelect
    $grid.MultiSelect = $false
    $grid.AutoSizeColumnsMode = [System.Windows.Forms.DataGridViewAutoSizeColumnsMode]::Fill

    $colEnabled = New-Object System.Windows.Forms.DataGridViewCheckBoxColumn
    $colEnabled.Name = 'Enabled'
    $colEnabled.HeaderText = 'On'
    $colEnabled.FillWeight = 35

    $colGroup = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colGroup.Name = 'Group'
    $colGroup.HeaderText = 'Group'
    $colGroup.ReadOnly = $true
    $colGroup.FillWeight = 55

    $colLabel = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colLabel.Name = 'Label'
    $colLabel.HeaderText = 'Label'
    $colLabel.FillWeight = 120

    $colSeconds = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colSeconds.Name = 'Seconds'
    $colSeconds.HeaderText = 'Seconds'
    $colSeconds.FillWeight = 70

    $colHotkey = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colHotkey.Name = 'Hotkey'
    $colHotkey.HeaderText = 'Hotkey'
    $colHotkey.FillWeight = 120
    $colHotkey.ReadOnly = $true
    $colHotkey.SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable

    $colColor = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colColor.Name = 'Color'
    $colColor.HeaderText = 'Color'
    $colColor.FillWeight = 80

    $grid.Columns.AddRange([System.Windows.Forms.DataGridViewColumn[]]@(
        $colEnabled,
        $colGroup,
        $colLabel,
        $colSeconds,
        $colHotkey,
        $colColor
    ))

    foreach ($timer in @($script:Settings.timers)) {
        $rowIndex = $grid.Rows.Add(
            (Convert-ToBool -Value $timer.enabled -Fallback $true),
            [string]$timer.group,
            [string]$timer.label,
            [int](Convert-ToInt -Value $timer.seconds -Fallback 25 -Minimum 1 -Maximum 180),
            [string]$timer.hotkey,
            [string]$timer.color
        )
        $grid.Rows[$rowIndex].Tag = [string]$timer.id
    }

    $hint = New-Object System.Windows.Forms.Label
    $hint.Text = 'Hotkey cell: click the field, then press the shortcut. Backspace/Delete clears it.'
    $hint.Location = [System.Drawing.Point]::new(18, 486)
    $hint.Size = [System.Drawing.Size]::new(724, 22)

    $grid.Add_KeyDown({
        if (Set-HotkeyGridCellFromKeyEvent -Grid $grid -EventArgs $_) {
            $hint.Text = 'Hotkey captured. Click Save to apply it.'
        }
    })

    $grid.Add_CellEnter({
        if ($_.ColumnIndex -eq $grid.Columns['Hotkey'].Index) {
            $hint.Text = 'Hotkey cell: press the shortcut now. Backspace/Delete clears it.'
        } else {
            $hint.Text = 'Hotkey cell: click the field, then press the shortcut. Backspace/Delete clears it.'
        }
    })

    $grid.Add_CellClick({
        if ($_.ColumnIndex -eq $grid.Columns['Hotkey'].Index) {
            $hint.Text = 'Hotkey cell: press the shortcut now. Backspace/Delete clears it.'
        }
    })

    $btnSave = New-Object System.Windows.Forms.Button
    $btnSave.Text = 'Save'
    $btnSave.Location = [System.Drawing.Point]::new(560, 548)
    $btnSave.Size = [System.Drawing.Size]::new(86, 30)

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Text = 'Cancel'
    $btnCancel.Location = [System.Drawing.Point]::new(654, 548)
    $btnCancel.Size = [System.Drawing.Size]::new(86, 30)

    $btnReset = New-Object System.Windows.Forms.Button
    $btnReset.Text = 'Reset defaults'
    $btnReset.Location = [System.Drawing.Point]::new(18, 548)
    $btnReset.Size = [System.Drawing.Size]::new(112, 30)

    $btnOpenConfig = New-Object System.Windows.Forms.Button
    $btnOpenConfig.Text = 'Open config'
    $btnOpenConfig.Location = [System.Drawing.Point]::new(140, 548)
    $btnOpenConfig.Size = [System.Drawing.Size]::new(104, 30)

    $btnCancel.Add_Click({ $form.Close() })
    $btnOpenConfig.Add_Click({
        if (-not (Test-Path $script:ConfigDir)) {
            New-Item -ItemType Directory -Path $script:ConfigDir -Force | Out-Null
        }
        Start-Process explorer.exe $script:ConfigDir
    })

    $btnReset.Add_Click({
        $result = [System.Windows.Forms.MessageBox]::Show(
            'Reset all timer and overlay settings?',
            $script:AppName,
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Question
        )
        if ($result -ne [System.Windows.Forms.DialogResult]::Yes) {
            return
        }

        $defaults = New-DefaultSettings
        Save-Settings -Settings $defaults
        $script:Settings = Convert-ToSettingsObject -Settings $defaults
        Apply-Settings
        $form.Close()
    })

    $btnSave.Add_Click({
        try {
            $newTimers = @()
            foreach ($row in @($grid.Rows)) {
                if ($row.IsNewRow) {
                    continue
                }

                $timerId = [string]$row.Tag
                $existing = Get-TimerDefinition -TimerId $timerId
                if ($null -eq $existing) {
                    continue
                }

                $label = [string]$row.Cells['Label'].Value
                if ([string]::IsNullOrWhiteSpace($label)) {
                    throw "Label is required for $timerId."
                }

                $seconds = Convert-ToInt -Value $row.Cells['Seconds'].Value -Fallback 25 -Minimum 1 -Maximum 180
                $hotkey = ([string]$row.Cells['Hotkey'].Value).Trim()
                if (-not [string]::IsNullOrWhiteSpace($hotkey)) {
                    Convert-HotkeyText -Text $hotkey | Out-Null
                }

                $color = ([string]$row.Cells['Color'].Value).Trim()
                if ($color -notmatch '^#[0-9a-fA-F]{6}$') {
                    throw "Color for '$label' must be like #32D583."
                }

                $newTimers += [ordered]@{
                    id = $timerId
                    group = [string]$existing.group
                    label = $label.Trim()
                    seconds = $seconds
                    hotkey = $hotkey
                    color = $color
                    enabled = [bool]$row.Cells['Enabled'].Value
                }
            }

            $newSettings = [ordered]@{
                version = 1
                overlay = [ordered]@{
                    enabled = [bool]$chkEnabled.Checked
                    x = [int]$numX.Value
                    y = [int]$numY.Value
                    scalePercent = [int]$numScale.Value
                    opacityPercent = [int]$numOpacity.Value
                    locked = [bool]$chkLocked.Checked
                    clickThroughWhenLocked = [bool]$chkClickThrough.Checked
                    showOnlyWhenAlbionRunning = [bool]$chkShowOnly.Checked
                }
                sound = [ordered]@{
                    enabled = [bool]$chkSoundEnabled.Checked
                    mode = if ([string]$comboSoundMode.SelectedItem -eq 'TTS') { 'tts' } else { 'tone' }
                    ready = [bool]$chkSoundReady.Checked
                    warning5 = [bool]$chkSoundWarning5.Checked
                    warning2 = [bool]$chkSoundWarning2.Checked
                }
                albionProcessNames = @(
                    'Albion-Online',
                    'AlbionOnline',
                    'AlbionOnline_BE'
                )
                timers = $newTimers
            }

            Save-Settings -Settings $newSettings
            $script:Settings = Convert-ToSettingsObject -Settings $newSettings
            Apply-Settings
            $form.Close()
        } catch {
            [System.Windows.Forms.MessageBox]::Show(
                $_.Exception.Message,
                "$script:AppName Settings",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Error
            ) | Out-Null
        }
    })

    $form.Controls.AddRange([System.Windows.Forms.Control[]]@(
        $chkEnabled,
        $chkShowOnly,
        $chkLocked,
        $chkClickThrough,
        (New-Label -Text 'Opacity %' -X 250 -Y 49 -Width 70),
        $numOpacity,
        (New-Label -Text 'Scale %' -X 422 -Y 49 -Width 58),
        $numScale,
        (New-Label -Text 'X' -X 586 -Y 49 -Width 20),
        $numX,
        (New-Label -Text 'Y' -X 664 -Y 49 -Width 20),
        $numY,
        $chkSoundEnabled,
        $chkSoundReady,
        $chkSoundWarning5,
        $chkSoundWarning2,
        (New-Label -Text 'Sound mode' -X 548 -Y 82 -Width 76),
        $comboSoundMode,
        $grid,
        $hint,
        $btnSave,
        $btnCancel,
        $btnReset,
        $btnOpenConfig
    ))

    $form.ShowDialog() | Out-Null
}

function Initialize-Tray {
    $menu = New-Object System.Windows.Forms.ContextMenuStrip

    $previewItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $previewItem.Text = 'Preview Overlay'
    $previewItem.CheckOnClick = $true
    $previewItem.Checked = $script:ForceOverlayVisible
    $previewItem.Add_CheckedChanged({
        $script:ForceOverlayVisible = [bool]$previewItem.Checked
        Update-OverlayVisibility
    })

    $lockItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $lockItem.Text = 'Lock Position'
    $lockItem.CheckOnClick = $true
    $lockItem.Checked = Convert-ToBool -Value (Get-OverlaySetting -Name 'locked' -Fallback $true) -Fallback $true
    $lockItem.Add_CheckedChanged({
        if ([bool]$lockItem.Checked) {
            Save-CurrentOverlayLocationToSettings
        }

        $script:Settings.overlay.locked = [bool]$lockItem.Checked
        Save-Settings -Settings $script:Settings
        Stop-OverlayMouseInteraction -Control $script:OverlayForm
        Set-OverlayClickThrough -Form $script:OverlayForm
        Update-ResizeHandleVisibility
    })

    $settingsItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $settingsItem.Text = 'Settings...'
    $settingsItem.Add_Click({ Show-SettingsWindow })

    $resetTimersItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $resetTimersItem.Text = 'Reset Timers'
    $resetTimersItem.Add_Click({ Reset-AllTimers })

    $exitItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $exitItem.Text = 'Exit'
    $exitItem.Add_Click({
        if ($null -ne $script:HotkeyForm) {
            $script:HotkeyForm.Close()
        }
    })

    $menu.Items.Add($previewItem) | Out-Null
    $menu.Items.Add($lockItem) | Out-Null
    $menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
    $menu.Items.Add($settingsItem) | Out-Null
    $menu.Items.Add($resetTimersItem) | Out-Null
    $menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
    $menu.Items.Add($exitItem) | Out-Null

    $script:TrayIcon = New-Object System.Windows.Forms.NotifyIcon
    $script:TrayIcon.Text = $script:AppName
    $script:TrayIcon.Icon = [System.Drawing.SystemIcons]::Application
    $script:TrayIcon.ContextMenuStrip = $menu
    $script:TrayIcon.Visible = $true
    $script:TrayIcon.Add_DoubleClick({ Show-SettingsWindow })
}

function Initialize-App {
    [System.Windows.Forms.Application]::EnableVisualStyles()
    [System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

    $script:Settings = Load-Settings
    Initialize-TimerStates

    $script:HotkeyForm = New-Object HotkeyHostForm
    $script:HotkeyForm.Text = $script:AppName
    $script:HotkeyForm.ShowInTaskbar = $false
    $script:HotkeyForm.add_HotkeyPressed({
        param([int]$HotkeyId)

        if ($script:HotkeyIdMap.ContainsKey($HotkeyId)) {
            Start-TimerSlot -TimerId $script:HotkeyIdMap[$HotkeyId]
        }
    })
    $null = $script:HotkeyForm.Handle

    Initialize-Tray
    Recreate-Overlay
    Register-AllHotkeys

    $script:UiTimer = New-Object System.Windows.Forms.Timer
    $script:UiTimer.Interval = 100
    $script:UiTimer.Add_Tick({ Tick-App })
    $script:UiTimer.Start()

    $script:TrayIcon.ShowBalloonTip(
        2500,
        $script:AppName,
        'Running. Right-click the tray icon for Settings or Preview Overlay.',
        [System.Windows.Forms.ToolTipIcon]::Info
    )
}

function Dispose-App {
    try {
        if ($null -ne $script:UiTimer) {
            $script:UiTimer.Stop()
            $script:UiTimer.Dispose()
        }

        Unregister-AllHotkeys

        if ($null -ne $script:OverlayForm -and -not $script:OverlayForm.IsDisposed) {
            $script:OverlayForm.Close()
            $script:OverlayForm.Dispose()
        }

        if ($null -ne $script:TrayIcon) {
            $script:TrayIcon.Visible = $false
            $script:TrayIcon.Dispose()
        }

        if ($null -ne $script:SpeechSynthesizer) {
            $script:SpeechSynthesizer.SpeakAsyncCancelAll()
            $script:SpeechSynthesizer.Dispose()
            $script:SpeechSynthesizer = $null
        }

        if ($script:HasAppMutex -and $null -ne $script:AppMutex) {
            $script:AppMutex.ReleaseMutex()
            $script:AppMutex.Dispose()
            $script:HasAppMutex = $false
        }
    } catch {
        Write-AppLog "Dispose failed: $($_.Exception.Message)"
    }
}

try {
    Initialize-App
    [System.Windows.Forms.Application]::Run($script:HotkeyForm)
} catch {
    $script:FatalExitCode = 1
    Write-AppLog "Fatal error: $($_.Exception.Message)"
    [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message,
        $script:AppName,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
} finally {
    Dispose-App
}

exit $script:FatalExitCode
