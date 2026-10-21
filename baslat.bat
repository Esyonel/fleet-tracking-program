@echo off
rem Filament Takip: bu bilgisayarda calistirir (http://localhost:8080). Cift tikla.
chcp 65001 >nul
cd /d "%~dp0"
set "PHP="
for /f "delims=" %%p in ('where php 2^>nul') do if not defined PHP set "PHP=%%p"
if not defined PHP for /d %%d in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.*") do if exist "%%d\php.exe" set "PHP=%%d\php.exe"
if not defined PHP (
  echo PHP bulunamadi. Kurmak icin bir komut penceresinde su komutu calistir:
  echo     winget install PHP.PHP.8.3
  echo Kurulum bitince bu pencereyi kapat ve baslat.bat dosyasini yeniden ac.
  pause
  exit /b 1
)
for %%f in ("%PHP%") do set "PHPDIR=%%~dpf"
echo.
echo  Filament Takip calisiyor: http://localhost:8080
echo  Ilk giris sifresi: 1234  (config.php icinde APP_PASSWORD ile degistir)
echo  Kapatmak icin bu pencereyi kapat.
echo.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
"%PHP%" -d extension_dir="%PHPDIR%ext" -c dev\php-dev.ini -S localhost:8080
pause
