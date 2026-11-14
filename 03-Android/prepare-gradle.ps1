$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$version = '8.13'
$checksum = '20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78'
$cache = Join-Path $env:LOCALAPPDATA 'Papalita-Android'
$zip = Join-Path $cache "gradle-$version-bin.zip"
$gradle = Join-Path $cache "gradle-$version\bin\gradle.bat"

$studioJava = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
if (-not $env:JAVA_HOME -and (Test-Path (Join-Path $studioJava 'bin\java.exe'))) {
    $env:JAVA_HOME = $studioJava
}
if (-not $env:JAVA_HOME -and -not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw 'Install Android Studio or set JAVA_HOME to a JDK before continuing.'
}

New-Item -ItemType Directory -Force -Path $cache | Out-Null
if (-not (Test-Path $zip)) {
    Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-$version-bin.zip" -OutFile $zip
}
if ((Get-FileHash -Algorithm SHA256 -Path $zip).Hash -ine $checksum) {
    Remove-Item -LiteralPath $zip
    throw 'Gradle download checksum mismatch. Run the script again to download a fresh copy.'
}
if (-not (Test-Path $gradle)) {
    Expand-Archive -LiteralPath $zip -DestinationPath $cache -Force
}

Push-Location $root
try {
    & $gradle wrapper --gradle-version $version --distribution-type bin --gradle-distribution-sha256-sum $checksum
    if ($LASTEXITCODE -ne 0) { throw 'Gradle could not prepare the wrapper. Check the error above.' }
} finally {
    Pop-Location
}
