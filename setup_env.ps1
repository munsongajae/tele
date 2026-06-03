$apiId = Read-Host "TELEGRAM_API_ID"
$apiHash = Read-Host "TELEGRAM_API_HASH"
$phone = Read-Host "TELEGRAM_PHONE (+821012345678)"
$port = Read-Host "TELE_UI_PORT [8788]"

if ([string]::IsNullOrWhiteSpace($port)) {
  $port = "8788"
}

$content = @(
  "TELEGRAM_API_ID=$apiId",
  "TELEGRAM_API_HASH=$apiHash",
  "TELEGRAM_PHONE=$phone",
  "TELE_UI_PORT=$port"
)

$path = Join-Path $PSScriptRoot ".env"
Set-Content -LiteralPath $path -Value $content -Encoding UTF8
Write-Host "Saved $path"
