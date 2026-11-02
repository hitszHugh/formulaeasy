param(
  [Parameter(Mandatory = $true)][string]$MathmlPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Office ships the MathML -> OMML stylesheet; its location differs per version.
$candidates = @(
  "C:\Program Files\Microsoft Office\root\Office16\MML2OMML.XSL",
  "C:\Program Files (x86)\Microsoft Office\root\Office16\MML2OMML.XSL"
)
$xslPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $xslPath) {
  $xslPath = Get-ChildItem "C:\Program Files\Microsoft Office" -Recurse -Filter "MML2OMML.XSL" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}

if (-not $xslPath) {
  [Console]::Error.WriteLine("MML2OMML.XSL not found")
  exit 3
}

$xslt = New-Object System.Xml.Xsl.XslCompiledTransform
$xslt.Load($xslPath)

$xmlDocument = New-Object System.Xml.XmlDocument
$xmlDocument.Load($MathmlPath)

$writer = New-Object System.IO.StringWriter
$xslt.Transform($xmlDocument, $null, $writer)
$omml = ($writer.ToString() -replace '^<\?xml[^>]*\?>', "").Trim()

$workDir = Join-Path ([System.IO.Path]::GetTempPath()) ("formula-docx-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path (Join-Path $workDir "_rels"), (Join-Path $workDir "word") | Out-Null

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>
'@

$relationships = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>
'@

$document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p>' +
$omml +
'</w:p><w:sectPr/></w:body></w:document>'

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $workDir "[Content_Types].xml"), $contentTypes, $utf8)
[System.IO.File]::WriteAllText((Join-Path $workDir "_rels\.rels"), $relationships, $utf8)
[System.IO.File]::WriteAllText((Join-Path $workDir "word\document.xml"), $document, $utf8)

if (Test-Path $OutputPath) { Remove-Item $OutputPath -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($workDir, $OutputPath)
Remove-Item $workDir -Recurse -Force

Write-Output "ok"
