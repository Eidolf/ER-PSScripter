from app.services.script_analyzer import ScriptAnalyzerService


def test_extract_function_simple() -> None:
    service = ScriptAnalyzerService()
    content = """
    function Get-Test {
        Write-Host "Hello"
    }
    """
    snippets = service._extract_functions(content, "test.ps1", split_functions=True)
    assert len(snippets) == 1
    assert snippets[0].name == "Get-Test"
    assert snippets[0].content is not None and 'Write-Host "Hello"' in snippets[0].content

def test_extract_function_nested_braces() -> None:
    service = ScriptAnalyzerService()
    content = """
    function Get-Complex {
        if ($true) {
            Write-Host "Nested"
        }
        return "Done"
    }
    """
    snippets = service._extract_functions(content, "complex.ps1", split_functions=True)
    assert len(snippets) == 1
    assert snippets[0].name == "Get-Complex"
    assert snippets[0].content.strip().endswith("}")
    assert snippets[0].content is not None and 'Write-Host "Nested"' in snippets[0].content

def test_extract_help_info() -> None:
    service = ScriptAnalyzerService()
    content = """
<#
.SYNOPSIS
    Short summary.
.DESCRIPTION
    Long description.
.PARAMETER Name
    The name param.
#>
function Get-Helpful {
    param($Name)
}
    """
    snippets = service._extract_functions(content, "help.ps1", split_functions=True)
    assert len(snippets) == 1
    desc = snippets[0].description
    assert desc is not None
    assert "Short summary" in desc
    assert "Long description" in desc
    assert "Parameters: Name" in desc

def test_multiple_functions() -> None:
    service = ScriptAnalyzerService()
    content = """
    function Func-A { "A" }
    function Func-B { "B" }
    """
    snippets = service._extract_functions(content, "multi.ps1", split_functions=True)
    assert len(snippets) == 2
    assert snippets[0].name == "Func-A"
    assert snippets[1].name == "Func-B"
