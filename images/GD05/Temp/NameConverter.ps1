# ==========================
# Configuration
# ==========================

$sourceFolder = "E:\GundamTCG\GundamTCG-GD04\images\GD05\Temp\Original"     # Folder containing the filenames to copy
$targetFolder = "E:\GundamTCG\GundamTCG-GD04\images\GD05\Temp\Downloads"     # Folder containing the files to rename

# ==========================
# Get files
# ==========================

$sourceFiles = Get-ChildItem $sourceFolder -File | Sort-Object Name
$targetFiles = Get-ChildItem $targetFolder -File | Sort-Object Name

if ($sourceFiles.Count -ne $targetFiles.Count)
{
    Write-Host "File count does not match!"
    Write-Host "Source: $($sourceFiles.Count)"
    Write-Host "Target: $($targetFiles.Count)"
    exit
}

# ==========================
# Rename
# ==========================

for ($i = 0; $i -lt $sourceFiles.Count; $i++)
{
    $newName = [System.IO.Path]::GetFileNameWithoutExtension($sourceFiles[$i].Name) +
               $targetFiles[$i].Extension

    Rename-Item $targetFiles[$i].FullName $newName

    Write-Host "$($targetFiles[$i].Name)  ->  $newName"
}

Write-Host ""
Write-Host "Done!"

Read-Host "Press Enter to close"