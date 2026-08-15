param(
  [string]$DatabaseName = "odonto_simulator",
  [string]$PostgresBin = "C:\Program Files\PostgreSQL\18\bin",
  [switch]$AllowExisting
)

$ErrorActionPreference = "Stop"
$psql = Join-Path $PostgresBin "psql.exe"
$createdb = Join-Path $PostgresBin "createdb.exe"
$projectRoot = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $projectRoot "db\migrations\001_initial.sql"
$migration2 = Join-Path $projectRoot "db\migrations\002_simulated_channels.sql"
$migration3 = Join-Path $projectRoot "db\migrations\003_end_to_end_followup.sql"
$seed = Join-Path $projectRoot "db\seeds\001_simulated.sql"
$seed2 = Join-Path $projectRoot "db\seeds\002_end_to_end_demo.sql"
$transcriptPath = Join-Path $env:TEMP "odonto-postgres-validation.log"

foreach ($requiredPath in @($psql, $createdb, $migration, $migration2, $migration3, $seed, $seed2)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "No se encontro el archivo requerido: $requiredPath"
  }
}

Start-Transcript -Path $transcriptPath -Force | Out-Null
Write-Host "Escribe el password del usuario postgres y presiona Enter." -ForegroundColor Cyan
Write-Host "Por seguridad no apareceran caracteres ni asteriscos mientras escribes." -ForegroundColor DarkGray
$securePassword = Read-Host "Password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  $existing = & $psql -w -h localhost -p 5432 -U postgres -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName'"
  if ($LASTEXITCODE -ne 0) {
    throw "No fue posible autenticar contra PostgreSQL."
  }
  if ($existing -eq "1") {
    if (-not $AllowExisting) {
      throw "La base '$DatabaseName' ya existe. No se modifico para evitar sobrescribir datos."
    }
  }
  else {
    & $createdb -w -h localhost -p 5432 -U postgres --encoding=UTF8 $DatabaseName
    if ($LASTEXITCODE -ne 0) { throw "No fue posible crear la base '$DatabaseName'." }
  }

  $schemaReady = & $psql -w -h localhost -p 5432 -U postgres -d $DatabaseName -Atqc "SELECT to_regclass('public.appointments') IS NOT NULL"
  if ($LASTEXITCODE -ne 0) { throw "No fue posible inspeccionar la base '$DatabaseName'." }
  if ($schemaReady -ne "t") {
    & $psql -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d $DatabaseName -f $migration
    if ($LASTEXITCODE -ne 0) { throw "Fallo la migracion PostgreSQL." }
  }

  $channelsReady = & $psql -w -h localhost -p 5432 -U postgres -d $DatabaseName -Atqc "SELECT to_regclass('public.simulated_whatsapp_messages') IS NOT NULL"
  if ($LASTEXITCODE -ne 0) { throw "No fue posible inspeccionar los canales simulados." }
  if ($channelsReady -ne "t") {
    & $psql -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d $DatabaseName -f $migration2
    if ($LASTEXITCODE -ne 0) { throw "Fallo la migracion de canales simulados." }
  }

  $endToEndReady = & $psql -w -h localhost -p 5432 -U postgres -d $DatabaseName -Atqc "SELECT to_regclass('public.simulated_reception_tasks') IS NOT NULL"
  if ($LASTEXITCODE -ne 0) { throw "No fue posible inspeccionar el flujo end-to-end." }
  if ($endToEndReady -ne "t") {
    & $psql -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d $DatabaseName -f $migration3
    if ($LASTEXITCODE -ne 0) { throw "Fallo la migracion end-to-end." }
  }

  & $psql -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d $DatabaseName -f $seed
  if ($LASTEXITCODE -ne 0) { throw "Fallaron los seeds ficticios." }

  & $psql -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d $DatabaseName -f $seed2
  if ($LASTEXITCODE -ne 0) { throw "Fallo el seed end-to-end." }

  & $psql -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d $DatabaseName -c @"
SELECT
  (SELECT count(*) FROM appointments) AS appointments,
  (SELECT count(*) FROM appointment_status_history) AS history_rows,
  (SELECT count(*) FROM reminder_rules) AS reminder_rules,
  (SELECT count(*) FROM patients WHERE NOT is_fictitious) AS non_fictitious_patients;
"@
  if ($LASTEXITCODE -ne 0) { throw "Fallo la consulta final de verificacion." }

  Write-Host "VALIDACION COMPLETADA: base '$DatabaseName' creada con migracion y seeds ficticios." -ForegroundColor Green
  exit 0
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  Stop-Transcript | Out-Null
}
