# Mine N blocks to Alice (Flow’s LND). Default 6.
param([int]$Blocks = 6)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Compose = @("-f", "docker-compose.yml", "-f", "docker-compose.regtest.yml")

$raw = docker compose @Compose exec -T lnd lncli --network=regtest newaddress p2wkh | Out-String
$addr = ($raw | ConvertFrom-Json).address
Write-Host "Mining $Blocks blocks to $addr"
docker compose @Compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=flow -rpcpassword=flow generatetoaddress $Blocks $addr
