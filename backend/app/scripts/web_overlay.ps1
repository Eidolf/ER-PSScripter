function Out-WebGridView {
    <#
    .SYNOPSIS
        Sends object data to the Web Console Overlay window.
    .DESCRIPTION
        Takes input objects, converts them to JSON, Base64 encodes them,
        and emits an OSC 1337 escape sequence that the web terminal frontend interprets
        to display a Data Grid Modal.
    .EXAMPLE
        Get-Process | Select-Object -First 10 | Out-WebGridView
    #>
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline = $true, Mandatory = $true)]
        [PSObject]$InputObject
    )

    begin {
        $dataCollection = @()
    }

    process {
        if ($null -eq $InputObject) { return }

        # Check if the object is a simple scalar type that needs wrapping
        # Strings, numbers, booleans don't have interesting properties for a grid view by default
        $type = $InputObject.GetType()
        if ($type.IsPrimitive -or $type.Name -eq 'String' -or $type.Name -eq 'DateTime' -or $type.Name -eq 'Decimal') {
            $dataCollection += [PSCustomObject]@{ Value = $InputObject }
        } else {
            $dataCollection += $InputObject
        }
    }

    end {
        if ($dataCollection.Count -eq 0) {
            Write-Warning "No data pipeline input for Out-WebGridView"
            return
        }

        # Convert to JSON (Depth 4 is usually sufficient for grid display)
        # Compress to save space in the OSC sequence
        $json = $dataCollection | ConvertTo-Json -Depth 4 -Compress -WarningAction SilentlyContinue

        if (-not $json) {
            return
        }

        # Base64 Encode the JSON string to avoid terminal escape code clashes
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        $base64 = [Convert]::ToBase64String($bytes)

        # Emit the OSC Sequence
        # OSC 1337 ; WebGridView ; [BASE64] ST
        $osc = "`e]1337;WebGridView;$base64`a"
        
        # Write directly to host to ensure it passes through PTY
        [Console]::Write($osc)
    }
}


