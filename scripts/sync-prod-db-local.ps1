[CmdletBinding()]
param(
  [string]$DumpFile = "",
  [switch]$DumpOnly,
  [switch]$RestoreOnly,
  [switch]$SkipStart,
  [switch]$SkipReset,
  [switch]$KeepDump,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$syncDir = Join-Path $repoRoot "supabase\.temp\prod-sync"
New-Item -ItemType Directory -Force -Path $syncDir | Out-Null

if (-not $DumpFile) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $DumpFile = Join-Path $syncDir "prod-data-$timestamp.sql"
}

$DumpFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DumpFile)

function Invoke-SyncStep {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Action
}

function Invoke-Supabase {
  param([string[]]$Arguments)

  & supabase @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "supabase $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

if ($DumpOnly -and $RestoreOnly) {
  throw "Use either -DumpOnly or -RestoreOnly, not both."
}

if ($RestoreOnly -and -not (Test-Path -LiteralPath $DumpFile)) {
  throw "RestoreOnly requires an existing dump file. Missing: $DumpFile"
}

if (-not $DumpOnly -and -not $Force) {
  Write-Warning "This will reset and overwrite your LOCAL Supabase database with production data."
  $answer = Read-Host "Continue? Type 'sync local' to continue"
  if ($answer -ne "sync local") {
    Write-Host "Cancelled."
    exit 0
  }
}

Push-Location $repoRoot
try {
  if (-not $SkipStart -and -not $DumpOnly) {
    Invoke-SyncStep "Starting local Supabase" {
      Invoke-Supabase @("start")
    }
  }

  if (-not $RestoreOnly) {
    Invoke-SyncStep "Dumping production data from linked Supabase project" {
      Invoke-Supabase @("db", "dump", "--linked", "--data-only", "--file", $DumpFile)
    }

    Write-Host "Production dump written to $DumpFile"
  }

  if ($DumpOnly) {
    Write-Host "Dump complete. No local restore was performed."
    exit 0
  }

  if (-not $SkipReset) {
    Invoke-SyncStep "Resetting local database with repo migrations" {
      Invoke-Supabase @("db", "reset", "--local", "--no-seed")
    }
  }

  $prepareRestoreFile = Join-Path $syncDir "prepare-local-restore.sql"
  @"
do `$`$
declare
  truncate_statement text;
begin
  select
    'truncate table ' ||
    string_agg(format('%I.%I', schemaname, tablename), ', ' order by schemaname, tablename) ||
    ' restart identity cascade'
  into truncate_statement
  from pg_tables
  where schemaname in ('auth', 'public', 'storage')
    and not (schemaname = 'auth' and tablename = 'schema_migrations')
    and not (schemaname = 'storage' and tablename = 'migrations');

  if truncate_statement is not null then
    execute truncate_statement;
  end if;
end
`$`$;
"@ | Set-Content -LiteralPath $prepareRestoreFile -Encoding UTF8

  Invoke-SyncStep "Clearing local seed/runtime data before restore" {
    Invoke-Supabase @("db", "query", "--local", "--file", $prepareRestoreFile)
  }

  Invoke-SyncStep "Restoring production data into local database" {
    Invoke-Supabase @("db", "query", "--local", "--file", $DumpFile)
  }

  Invoke-SyncStep "Local Supabase status" {
    Invoke-Supabase @("status", "-o", "env")
  }

  if (-not $KeepDump) {
    Remove-Item -LiteralPath $DumpFile -Force
    Write-Host "Removed local dump file. Use -KeepDump if you want to inspect or reuse it."
  }

  Write-Host ""
  Write-Host "Local Supabase is synced from production."
}
finally {
  Pop-Location
}
