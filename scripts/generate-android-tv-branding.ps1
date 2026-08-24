param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function ConvertTo-BrandColor([string]$hex) {
    return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-BrandCanvas([int]$width, [int]$height) {
    $bitmap = [System.Drawing.Bitmap]::new(
        $width,
        $height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Draw-BrandMark(
    [System.Drawing.Graphics]$graphics,
    [float]$centerX,
    [float]$centerY,
    [float]$radius
) {
    $points = [System.Drawing.PointF[]]::new(6)
    for ($index = 0; $index -lt 6; $index++) {
        $angle = (-[Math]::PI / 2) + ($index * [Math]::PI / 3)
        $points[$index] = [System.Drawing.PointF]::new(
            $centerX + ([Math]::Cos($angle) * $radius),
            $centerY + ([Math]::Sin($angle) * $radius)
        )
    }

    $bounds = [System.Drawing.RectangleF]::new(
        $centerX - $radius,
        $centerY - $radius,
        $radius * 2,
        $radius * 2
    )
    $shell = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $bounds,
        (ConvertTo-BrandColor '#78BCFF'),
        (ConvertTo-BrandColor '#16C7F3'),
        45
    )
    $outline = [System.Drawing.Pen]::new(
        [System.Drawing.Color]::FromArgb(150, 225, 242, 255),
        [Math]::Max(1.0, $radius * 0.09)
    )
    $center = [System.Drawing.SolidBrush]::new(
        [System.Drawing.Color]::FromArgb(226, 5, 21, 37)
    )
    $core = [System.Drawing.SolidBrush]::new(
        [System.Drawing.Color]::FromArgb(242, 245, 251, 255)
    )

    try {
        $graphics.FillPolygon($shell, $points)
        $graphics.DrawPolygon($outline, $points)
        $graphics.FillEllipse(
            $center,
            $centerX - ($radius * 0.42),
            $centerY - ($radius * 0.42),
            $radius * 0.84,
            $radius * 0.84
        )
        $graphics.FillEllipse(
            $core,
            $centerX - ($radius * 0.16),
            $centerY - ($radius * 0.16),
            $radius * 0.32,
            $radius * 0.32
        )
    }
    finally {
        $shell.Dispose()
        $outline.Dispose()
        $center.Dispose()
        $core.Dispose()
    }
}

function Save-LauncherIcon([string]$path, [int]$size) {
    $canvas = New-BrandCanvas $size $size
    $bitmap = $canvas.Bitmap
    $graphics = $canvas.Graphics
    $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Rectangle]::new(0, 0, $size, $size),
        (ConvertTo-BrandColor '#07131F'),
        (ConvertTo-BrandColor '#123A61'),
        45
    )
    try {
        $graphics.FillRectangle($background, 0, 0, $size, $size)
        Draw-BrandMark $graphics ($size / 2) ($size / 2) ($size * 0.34)
        [System.IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $background.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Save-TvBanner([string]$path) {
    $canvas = New-BrandCanvas 320 180
    $bitmap = $canvas.Bitmap
    $graphics = $canvas.Graphics
    $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Rectangle]::new(0, 0, 320, 180),
        (ConvertTo-BrandColor '#06111D'),
        (ConvertTo-BrandColor '#10385C'),
        0
    )
    $grid = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(16, 150, 205, 255), 1)
    $titleBrush = [System.Drawing.SolidBrush]::new((ConvertTo-BrandColor '#F4F9FF'))
    $subtitleBrush = [System.Drawing.SolidBrush]::new((ConvertTo-BrandColor '#85C8FF'))
    $titleFont = [System.Drawing.Font]::new(
        'Segoe UI',
        30,
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel
    )
    $subtitleFont = [System.Drawing.Font]::new(
        'Segoe UI Semibold',
        11,
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel
    )

    try {
        $graphics.FillRectangle($background, 0, 0, 320, 180)
        for ($x = 0; $x -le 320; $x += 40) {
            $graphics.DrawLine($grid, $x, 0, $x, 180)
        }
        for ($y = 0; $y -le 180; $y += 40) {
            $graphics.DrawLine($grid, 0, $y, 320, $y)
        }
        Draw-BrandMark $graphics 67 90 47
        $graphics.DrawString('BoltBytes', $titleFont, $titleBrush, 125, 57)
        $graphics.DrawString('MEDIA SERVER  /  TV', $subtitleFont, $subtitleBrush, 127, 102)
        [System.IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $background.Dispose()
        $grid.Dispose()
        $titleBrush.Dispose()
        $subtitleBrush.Dispose()
        $titleFont.Dispose()
        $subtitleFont.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

$resourceRoot = Join-Path $RepositoryRoot 'clients/mobile-tv/android/app/src/main/res'
$icons = @{
    'mipmap-mdpi' = 48
    'mipmap-hdpi' = 72
    'mipmap-xhdpi' = 96
    'mipmap-xxhdpi' = 144
    'mipmap-xxxhdpi' = 192
}

foreach ($entry in $icons.GetEnumerator()) {
    Save-LauncherIcon (
        Join-Path $resourceRoot "$($entry.Key)/ic_launcher.png"
    ) $entry.Value
}

Save-TvBanner (
    Join-Path $RepositoryRoot 'clients/mobile-tv/android/app/src/tv/res/drawable-xhdpi/tv_banner.png'
)

Write-Output 'BoltBytes Android launcher icons and 320x180 TV banner generated.'
