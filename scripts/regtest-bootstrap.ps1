# Bootstrap Flow regtest: start bitcoind + 2x LND, create wallets, mine, open channel.
# Usage (from repo root):
#   pwsh -File scripts/regtest-bootstrap.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Compose = @("-f", "docker-compose.yml", "-f", "docker-compose.regtest.yml")
$Password = "flowregtest"
$LndNetwork = @("--network=regtest")

function Invoke-Compose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & docker compose @Compose @Args
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $Args" }
}

function Wait-Bitcoind {
  Write-Host "Waiting for bitcoind RPC..."
  for ($i = 0; $i -lt 60; $i++) {
    docker compose @Compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=flow -rpcpassword=flow getblockchaininfo 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Seconds 2
  }
  throw "bitcoind did not become ready"
}

function Ensure-Wallet([string]$Service) {
  Write-Host "Ensuring wallet on $Service..."
  $state = docker compose @Compose exec -T $Service lncli @LndNetwork getinfo 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  $Service already unlocked"
    return
  }
  # Create if missing (interactive answers: password, confirm, no seed passphrase)
  $createInput = "$Password`n$Password`nn`n"
  $createInput | docker compose @Compose exec -T $Service lncli @LndNetwork create 2>&1 | Out-Host
  Start-Sleep -Seconds 3
  for ($i = 0; $i -lt 30; $i++) {
    docker compose @Compose exec -T $Service lncli @LndNetwork getinfo 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { return }
    # Try unlock if create already happened on a prior run
    $Password | docker compose @Compose exec -T $Service lncli @LndNetwork unlock --stdin 2>$null | Out-Null
    Start-Sleep -Seconds 2
  }
  throw "Could not unlock/create wallet on $Service"
}

function LncliJson([string]$Service, [string[]]$Cmd) {
  $raw = docker compose @Compose exec -T $Service lncli @LndNetwork @Cmd 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "lncli on $Service failed: $raw" }
  return $raw | ConvertFrom-Json
}

Write-Host "== Stopping any accidental non-regtest bitcoin/lnd containers =="
$accidental = docker ps -aq --filter "name=bitcoind" --filter "name=lnd" 2>$null
# Only stop containers that are NOT from this compose project name pattern if they look like old testnet
docker ps -a --format "{{.Names}}" | ForEach-Object {
  if ($_ -match "testnet" -or $_ -eq "bitcoind" -or $_ -eq "lnd") {
    Write-Host "  Stopping $_"
    docker stop $_ 2>$null | Out-Null
    docker rm $_ 2>$null | Out-Null
  }
}

Write-Host "== Starting Postgres + regtest stack =="
Invoke-Compose up -d

Wait-Bitcoind
Ensure-Wallet "lnd"
Ensure-Wallet "lnd-peer"

Write-Host "== Mining blocks to lnd (Alice) =="
$addrInfo = LncliJson "lnd" @("newaddress", "p2wkh")
$mineAddr = $addrInfo.address
Write-Host "  Mining address: $mineAddr"
docker compose @Compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=flow -rpcpassword=flow generatetoaddress 120 $mineAddr | Out-Null
Start-Sleep -Seconds 5

Write-Host "== Funding lnd-peer (Bob) =="
$bobAddr = (LncliJson "lnd-peer" @("newaddress", "p2wkh")).address
# Send some coins from Alice's wallet (on-chain)
docker compose @Compose exec -T lnd lncli @LndNetwork sendcoins --addr $bobAddr --amt 25000000 2>&1 | Out-Host
Start-Sleep -Seconds 2
docker compose @Compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=flow -rpcpassword=flow generatetoaddress 6 $mineAddr | Out-Null
Start-Sleep -Seconds 5

Write-Host "== Connecting peers + opening channel =="
$bobInfo = LncliJson "lnd-peer" @("getinfo")
$bobPubkey = $bobInfo.identity_pubkey
docker compose @Compose exec -T lnd lncli @LndNetwork connect "$bobPubkey@lnd-peer:9735" 2>&1 | Out-Host
Start-Sleep -Seconds 2

$channels = LncliJson "lnd" @("listchannels")
if (-not $channels.channels -or $channels.channels.Count -eq 0) {
  docker compose @Compose exec -T lnd lncli @LndNetwork openchannel --node_key $bobPubkey --local_amt 5000000 --push_amt 1000000 2>&1 | Out-Host
  Start-Sleep -Seconds 2
  docker compose @Compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=flow -rpcpassword=flow generatetoaddress 6 $mineAddr | Out-Null
  Start-Sleep -Seconds 8
}

Write-Host "== Copying Alice TLS + macaroon into creds/ =="
New-Item -ItemType Directory -Force -Path "$Root\creds" | Out-Null
docker compose @Compose cp "lnd:/root/.lnd/tls.cert" "$Root\creds\tls.cert" | Out-Null
docker compose @Compose cp "lnd:/root/.lnd/data/chain/bitcoin/regtest/admin.macaroon" "$Root\creds\admin.macaroon" | Out-Null

$macHex = [System.BitConverter]::ToString([IO.File]::ReadAllBytes("$Root\creds\admin.macaroon")).Replace("-", "").ToLower()

Write-Host ""
Write-Host "==== Regtest ready — put this in .env (and CLEAR COINOS_TOKEN / OPENNODE_API_KEY) ===="
Write-Host @"
LIGHTNING_NETWORK=regtest
LND_REST_URL=https://127.0.0.1:8081
LND_MACAROON=$macHex
LND_TLS_CERT_PATH=./creds/tls.cert
LND_TLS_SKIP_VERIFY=false
COINOS_TOKEN=
OPENNODE_API_KEY=
"@
Write-Host "==== Quick checks ===="
Write-Host "  docker compose -f docker-compose.yml -f docker-compose.regtest.yml exec lnd lncli --network=regtest getinfo"
Write-Host "  # Create invoice on Alice, pay from Bob:"
Write-Host "  docker compose ... exec lnd lncli --network=regtest addinvoice --amt 1000"
Write-Host "  docker compose ... exec lnd-peer lncli --network=regtest payinvoice -f <BOLT11>"
Write-Host ""
$alice = LncliJson "lnd" @("getinfo")
Write-Host ("Alice synced={0} height={1} network={2}" -f $alice.synced_to_chain, $alice.block_height, ($alice.chains[0].network))
