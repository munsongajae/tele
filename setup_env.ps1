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
  "TELE_UI_PORT=$port",
  "TELEGRAM_CHANNELS=TasnimNews|타스님뉴스,farsna|파르스뉴스,sepahcybery|세파 사이버,mehrnews|메흐르뉴스,Irna_en|IRNA 영문,iribnews|IRIB 뉴스,Nournews_ir|누르뉴스"
)

$path = Join-Path $PSScriptRoot ".env"
Set-Content -LiteralPath $path -Value $content -Encoding UTF8
Write-Host "Saved $path"
