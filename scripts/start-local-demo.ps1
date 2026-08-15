param(
  [string]$DatabaseName = "odonto_simulator",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverFile = Join-Path $projectRoot "dist\src\server.js"
if (-not (Test-Path -LiteralPath $serverFile)) {
  throw "Compila primero con npm run build."
}

Write-Host "Escribe el password del usuario postgres y presiona Enter." -ForegroundColor Cyan
Write-Host "No apareceran caracteres ni asteriscos mientras escribes." -ForegroundColor DarkGray
$securePassword = Read-Host "Password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:PGHOST = "localhost"
  $env:PGPORT = "5432"
  $env:PGUSER = "postgres"
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:PGDATABASE = $DatabaseName
  $env:PORT = [string]$Port
  Set-Location -LiteralPath $projectRoot
  & node $serverFile
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
