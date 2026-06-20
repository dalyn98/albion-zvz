#define UNICODE
#define _UNICODE

#include <windows.h>

#define APP_TITLE L"Albion Engage Timer"

static void show_error(const wchar_t *message, DWORD error_code)
{
    wchar_t buffer[1024];
    wsprintfW(buffer, L"%s\n\nWin32 error: %lu", message, error_code);
    MessageBoxW(NULL, buffer, APP_TITLE, MB_OK | MB_ICONERROR);
}

static int get_exe_directory(wchar_t *buffer, DWORD capacity)
{
    DWORD length = GetModuleFileNameW(NULL, buffer, capacity);
    if (length == 0 || length >= capacity) {
        return 0;
    }

    for (DWORD index = length; index > 0; index--) {
        if (buffer[index - 1] == L'\\' || buffer[index - 1] == L'/') {
            buffer[index - 1] = L'\0';
            return 1;
        }
    }

    return 0;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous_instance, PWSTR command_line, int show_command)
{
    (void)instance;
    (void)previous_instance;
    (void)command_line;
    (void)show_command;

    wchar_t exe_dir[MAX_PATH];
    wchar_t script_path[MAX_PATH];
    wchar_t powershell_args[2048];

    if (!get_exe_directory(exe_dir, MAX_PATH)) {
        show_error(L"Failed to find the executable directory.", GetLastError());
        return 1;
    }

    wsprintfW(script_path, L"%s\\AlbionEngageTimer.ps1", exe_dir);
    if (GetFileAttributesW(script_path) == INVALID_FILE_ATTRIBUTES) {
        show_error(L"AlbionEngageTimer.ps1 was not found next to AlbionEngageTimer.exe.", GetLastError());
        return 1;
    }

    wsprintfW(
        powershell_args,
        L"powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File \"%s\"",
        script_path
    );

    STARTUPINFOW startup_info;
    PROCESS_INFORMATION process_info;
    ZeroMemory(&startup_info, sizeof(startup_info));
    ZeroMemory(&process_info, sizeof(process_info));

    startup_info.cb = sizeof(startup_info);
    startup_info.dwFlags = STARTF_USESHOWWINDOW;
    startup_info.wShowWindow = SW_HIDE;

    BOOL started = CreateProcessW(
        NULL,
        powershell_args,
        NULL,
        NULL,
        FALSE,
        CREATE_NO_WINDOW,
        NULL,
        exe_dir,
        &startup_info,
        &process_info
    );

    if (!started) {
        show_error(L"Failed to start Windows PowerShell.", GetLastError());
        return 1;
    }

    CloseHandle(process_info.hThread);
    CloseHandle(process_info.hProcess);
    return 0;
}
