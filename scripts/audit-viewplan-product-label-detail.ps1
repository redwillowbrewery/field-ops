param([string]$OutputPath=(Join-Path $PSScriptRoot 'product-label-detail.json'))
# Only the audited base product table; read-only snapshot, no saved queries or writes.
$ErrorActionPreference='Stop'
if([Environment]::Is64BitProcess){throw 'Use 32-bit Windows PowerShell in the logged-in ViewPlan session.'}
try{$access=[Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application');$db=$access.CurrentDb()}
catch{throw 'Open and log into ViewPlan in this Windows session first.'}
$rs=$null
$rows=New-Object System.Collections.Generic.List[object]
try{
    $rs=$db.OpenRecordset('SELECT TOP 10001 [brew_type_id],[brew_product_name],[label_text],[is_vegan],[lud],[is_sys],[is_available],[is_bex],[allow_sale],[is_variant],[variant_brew_type_id] FROM [tblBrew_Type] ORDER BY [brew_type_id]',4)
    while(-not $rs.EOF){
        if($rows.Count -ge 10000){throw 'Product count exceeded the audit limit; no partial report will be written.'}
        $row=[ordered]@{}
        foreach($f in $rs.Fields){
            $v=$f.Value
            if($null -eq $v -or $v -is [DBNull]){$v=$null}
            elseif($v -is [DateTime]){$v=$v.ToString('o')}
            $row[[string]$f.Name]=$v
        }
        $rows.Add([pscustomobject]$row);$rs.MoveNext()
    }
}finally{if($null -ne $rs){$rs.Close()}}
$report=[ordered]@{audit='ViewPlan product label detail - read only';observed_at=[DateTime]::UtcNow.ToString('o');source='tblBrew_Type';complete=$true;row_count=$rows.Count;rows=@($rows.ToArray());note='Source observations only. Includes historical/system rows for explicit classification. No claims are approved; no source flags are canonical lifecycle rules.'}
$destination=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
[IO.File]::WriteAllText($destination,(ConvertTo-Json -InputObject $report -Depth 6),[Text.UTF8Encoding]::new($false))
Write-Host "Read-only product audit written to $destination ($($rows.Count) rows)"
