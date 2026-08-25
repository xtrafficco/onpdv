param(
  [string]$Release = '2026.08.25-v35'
)

$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskBuildRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot '.build'))
$taskStage = [IO.Path]::GetFullPath((Join-Path $taskBuildRoot 'onpdv-caixa-pdv-stage'))
$taskSourceZip = Join-Path $taskRoot 'downloads\onpdv-caixa-pdv.zip'
$taskNewZip = Join-Path $taskBuildRoot 'onpdv-caixa-pdv-new.zip'
$taskInstaller = Join-Path $taskRoot 'downloads\onpdv-caixa.bat'
$taskNewInstaller = Join-Path $taskBuildRoot 'onpdv-caixa-new.bat'

if (-not $taskStage.StartsWith($taskBuildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Diretorio de staging fora da pasta de build.'
}
if (-not (Test-Path -LiteralPath $taskSourceZip) -or -not (Test-Path -LiteralPath $taskInstaller)) {
  throw 'Pacote-base ou instalador atual nao encontrado.'
}

New-Item -ItemType Directory -Path $taskBuildRoot -Force | Out-Null
if (Test-Path -LiteralPath $taskStage) {
  Remove-Item -LiteralPath $taskStage -Recurse -Force
}
New-Item -ItemType Directory -Path $taskStage -Force | Out-Null
Expand-Archive -LiteralPath $taskSourceZip -DestinationPath $taskStage -Force

$taskDirectories = @('assets', 'icons', 'lib', 'partials')
foreach ($taskDirectory in $taskDirectories) {
  $taskSource = Join-Path $taskRoot $taskDirectory
  $taskDestination = Join-Path $taskStage $taskDirectory
  if (Test-Path -LiteralPath $taskDestination) {
    Remove-Item -LiteralPath $taskDestination -Recurse -Force
  }
  Copy-Item -LiteralPath $taskSource -Destination $taskDestination -Recurse -Force
}

$taskFiles = @(
  'app.webmanifest', 'cliente.html', 'cliente.webmanifest', 'entregador.html',
  'icon-192.png', 'icon-512.png', 'icon-maskable.png', 'index.html',
  'manifest.webmanifest', 'sw.js', 'vitrine.html', 'vitrine.webmanifest'
)
foreach ($taskFile in $taskFiles) {
  Copy-Item -LiteralPath (Join-Path $taskRoot $taskFile) -Destination (Join-Path $taskStage $taskFile) -Force
}

if (Test-Path -LiteralPath $taskNewZip) {
  Remove-Item -LiteralPath $taskNewZip -Force
}
Compress-Archive -Path (Join-Path $taskStage '*') -DestinationPath $taskNewZip -CompressionLevel Optimal

$taskRequired = @(
  'assets/css/onpdv.css', 'assets/js/onpdv-app.js', 'assets/js/onpdv-bootstrap.js',
  'partials/onpdv-app.html', 'index.html', 'sw.js', 'onpdv-caixa.mjs'
)
$taskEntries = @(tar -tf $taskNewZip) | ForEach-Object { ($_ -replace '\\','/').TrimEnd('/') }
foreach ($taskRequiredEntry in $taskRequired) {
  if ($taskEntries -notcontains $taskRequiredEntry) {
    throw "Arquivo ausente no ZIP: $taskRequiredEntry"
  }
}

$taskRawInstaller = [IO.File]::ReadAllText($taskInstaller)
$taskMarker = '::ONPDV_BUNDLE_BASE64::'
$taskMarkerIndex = $taskRawInstaller.LastIndexOf($taskMarker, [StringComparison]::Ordinal)
if ($taskMarkerIndex -lt 0) {
  throw 'Marcador do pacote embutido nao encontrado no instalador.'
}
$taskHeader = $taskRawInstaller.Substring(0, $taskMarkerIndex)
$taskHeader = [regex]::Replace(
  $taskHeader,
  'set "ONPDV_RELEASE=[^"]+"',
  ('set "ONPDV_RELEASE=' + $Release + '"')
)
$taskBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($taskNewZip))
$taskWrapped = [regex]::Replace($taskBase64, '.{1,120}', '$0' + "`r`n").TrimEnd()
$taskInstallerContent = $taskHeader.TrimEnd("`r", "`n") + "`r`n`r`n" + $taskMarker + "`r`n" + $taskWrapped + "`r`n"
[IO.File]::WriteAllText($taskNewInstaller, $taskInstallerContent, [Text.UTF8Encoding]::new($false))

Move-Item -LiteralPath $taskNewZip -Destination $taskSourceZip -Force
Move-Item -LiteralPath $taskNewInstaller -Destination $taskInstaller -Force

$taskZipHash = (Get-FileHash -LiteralPath $taskSourceZip -Algorithm SHA256).Hash
$taskEmbeddedBytes = [Convert]::FromBase64String((([IO.File]::ReadAllText($taskInstaller).Substring(([IO.File]::ReadAllText($taskInstaller).LastIndexOf($taskMarker) + $taskMarker.Length))) -replace '\s',''))
$taskEmbeddedHash = [BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($taskEmbeddedBytes)).Replace('-', '')
if ($taskEmbeddedHash -ne $taskZipHash) {
  throw 'O pacote embutido no instalador difere do ZIP publicado.'
}

Write-Output "RELEASE=$Release"
Write-Output "ZIP_SHA256=$taskZipHash"
Write-Output "ZIP_BYTES=$((Get-Item -LiteralPath $taskSourceZip).Length)"
Write-Output "INSTALLER_BYTES=$((Get-Item -LiteralPath $taskInstaller).Length)"
