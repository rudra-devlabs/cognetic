@echo off
set PATH=%PATH%;%USERPROFILE%\.cargo\bin
set CARGO_TARGET_DIR=C:\rust_targets\agent-framework
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
npm run tauri dev
