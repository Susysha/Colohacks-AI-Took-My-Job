$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodeModules = Join-Path $repoRoot "node_modules"
$androidDir = Join-Path $repoRoot "apps\mobile\android"
$localPropertiesPath = Join-Path $androidDir "local.properties"
$expoCorePluginPath = Join-Path $repoRoot "node_modules\expo-modules-core\android\ExpoModulesCorePlugin.gradle"

function Normalize-ReparseFiles {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootPath
    )

    $normalized = 0
    $files = Get-ChildItem $RootPath -Recurse -File -Attributes ReparsePoint -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        $fullPath = $file.FullName
        if ($fullPath -notlike "$RootPath*") {
            throw "Refusing to modify path outside node_modules: $fullPath"
        }

        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            continue
        }

        try {
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            Remove-Item -LiteralPath $fullPath -Force -ErrorAction Stop
            [System.IO.File]::WriteAllBytes($fullPath, $bytes)
            $normalized++
        } catch {
            Write-Warning "Skipping $fullPath because it could not be normalized."
        }
    }

    return $normalized
}

if (-not (Test-Path $nodeModules)) {
    throw "node_modules not found. Run npm install first."
}

$normalized = Normalize-ReparseFiles -RootPath $nodeModules
$remaining = (Get-ChildItem $nodeModules -Recurse -File -Attributes ReparsePoint -ErrorAction SilentlyContinue).Count

Write-Host "Normalized files: $normalized"
Write-Host "Remaining reparse files: $remaining"

if (-not $env:JAVA_HOME) {
    $androidStudioJbr = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $androidStudioJbr) {
        $env:JAVA_HOME = $androidStudioJbr
        $env:PATH = "$androidStudioJbr\bin;$env:PATH"
    }
}

$env:NODE_ENV = "development"

$defaultSdkPath = "C:\Users\LENOVO\AppData\Local\Android\Sdk"
if (Test-Path $defaultSdkPath) {
    $sdkDirValue = $defaultSdkPath.Replace("\", "\\")
    Set-Content -LiteralPath $localPropertiesPath -Value "sdk.dir=$sdkDirValue"
}

if (Test-Path $expoCorePluginPath) {
    $pluginText = Get-Content -LiteralPath $expoCorePluginPath -Raw
    $patchedText = $pluginText.Replace(': "1.9.24"', ': (project.rootProject.findProperty("android.kotlinVersion") ?: "1.9.25")')
    if ($patchedText -ne $pluginText) {
        Set-Content -LiteralPath $expoCorePluginPath -Value $patchedText
    }
}

Push-Location $androidDir
try {
    .\gradlew.bat :app:assembleDebug
} finally {
    Pop-Location
}
