# Déploiement du site sur un serveur, par SSH.
#
# ┌─ À FAIRE UNE FOIS ─────────────────────────────────────────────────────────┐
# │ 1. Copier ce fichier en `deploy.ps1` — il est ignoré par git.              │
# │ 2. Renseigner les deux valeurs de `param` ci-dessous : l'hôte SSH et le    │
# │    chemin servi sur ce serveur.                                            │
# │ Rien d'autre n'est à personnaliser.                                        │
# └────────────────────────────────────────────────────────────────────────────┘
#
# Pourquoi la copie n'est pas versionnée : une fois remplie, elle ne décrit plus
# le site mais l'endroit où il est posé.
#
# Stratégie : build -> tar+gzip -> envoi -> extraction distante. Un aller-retour
# réseau compressé plutôt qu'une copie fichier par fichier.
#
# Usage :
#   .\deploy.ps1                # check + build + envoi
#   .\deploy.ps1 -SkipBuild     # envoi de build/ tel quel
#   .\deploy.ps1 -SkipCheck     # saute svelte-check
#   .\deploy.ps1 -RemoteHost …  # cible ponctuelle, sans toucher au fichier

param(
    # ---- LES DEUX VALEURS À RENSEIGNER ----
    [string]$RemoteHost = "utilisateur@machine",
    [string]$RemotePath = "/chemin/vers/la/racine/servie",
    # ---------------------------------------
    [switch]$SkipBuild,
    [switch]$SkipCheck
)

# Garde-fou : partir avec les valeurs d'exemple enverrait le site nulle part, ou
# pire, quelque part au hasard. Mieux vaut échouer sur la première ligne.
if ($RemoteHost -eq "utilisateur@machine" -or $RemotePath -like "/chemin/*") {
    throw "Renseigne `$RemoteHost et `$RemotePath en tête de ce fichier (voir l'en-tête)."
}

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $SkipBuild) {
    if (-not $SkipCheck) {
        Write-Host "==> check" -ForegroundColor Cyan
        bun run check
        if ($LASTEXITCODE -ne 0) { throw "check a échoué - corrige ou relance avec -SkipCheck" }
    }

    Write-Host "==> build" -ForegroundColor Cyan
    bun run build
    if ($LASTEXITCODE -ne 0) { throw "Build a échoué" }
}

$out = Join-Path $PSScriptRoot "build"

# Garde-fou : l'index racine doit exister, sinon on écrase un site qui marche
# par une arborescence inutilisable. Le rm distant est sans retour arrière.
if (-not (Test-Path "$out/index.html")) { throw "build/index.html manquant - lance un build complet" }

# Les routes attendues, vérifiées avant l'envoi et non après. Le pré-rendu est
# silencieux quand une page n'est pas atteignable : elle sort simplement du
# build, et le 404 n'apparaît qu'en ligne. Cette liste doit rester en accord
# avec TOYS dans src/routes/toys.ts.
$Routes = @("glyphcast", "sonoglyph", "glyphlapse", "glyphslot")
foreach ($r in $Routes) {
    if (-not (Test-Path "$out/$r/index.html")) { throw "build/$r/index.html manquant - route non pré-rendue" }
}

$n = (Get-ChildItem -Recurse -File $out).Count
Write-Host "    $n fichiers, / + $($Routes -join ', ')" -ForegroundColor DarkGray

# --- envoi ------------------------------------------------------------------
$tar = New-TemporaryFile
$tarPath = $tar.FullName

try {
    Write-Host "==> Création du tarball" -ForegroundColor Cyan
    tar -czf $tarPath -C $out .
    if ($LASTEXITCODE -ne 0) { throw "tar a échoué" }

    Write-Host "==> Upload vers ${RemoteHost}:${RemotePath}" -ForegroundColor Cyan
    scp $tarPath "${RemoteHost}:/tmp/glyph-deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "scp a échoué" }

    Write-Host "==> Extraction distante + cleanup" -ForegroundColor Cyan
    ssh $RemoteHost "set -e; mkdir -p '$RemotePath'; rm -rf '$RemotePath'/* '$RemotePath'/.[!.]* 2>/dev/null; tar -xzf /tmp/glyph-deploy.tar.gz -C '$RemotePath'; rm /tmp/glyph-deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "Extraction distante a échoué" }

    Write-Host "==> Done." -ForegroundColor Green
    Write-Host "    Hard reload (Ctrl+Shift+R) : les assets hachés sont servis en immutable." -ForegroundColor DarkGray
}
finally {
    Remove-Item $tarPath -ErrorAction SilentlyContinue
}
