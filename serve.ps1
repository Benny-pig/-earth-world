$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($env:PORT) { $env:PORT } else { 8761 }
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "地球世界 serving $root at $prefix (Ctrl+C 停止)"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".mjs"  = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".geojson" = "application/json; charset=utf-8"
  ".jpg"  = "image/jpeg"
  ".png"  = "image/png"
  ".css"  = "text/css; charset=utf-8"
  ".mp3"  = "audio/mpeg"
  ".wav"  = "audio/wav"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if ($rel -eq "/") { $rel = "/index.html" }
  $path = Join-Path $root ($rel.TrimStart("/") -replace "/", "\")
  if (Test-Path $path -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ctx.Response.ContentType = $ct
    $ctx.Response.Headers.Add("Cache-Control", "no-cache")
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.OutputStream.Close()
}
