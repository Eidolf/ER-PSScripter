import os
import subprocess
import tempfile

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class ScriptRequest(BaseModel):
    script: str

class ScriptResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int

@router.post("/execute", response_model=ScriptResponse)
async def execute_script(request: ScriptRequest) -> ScriptResponse:
    """
    Execute a PowerShell script and return the output.
    """
    if not request.script.strip():
        return ScriptResponse(stdout="", stderr="Script is empty", exit_code=1)

    try:
        # Create a temporary file to hold the script
        with tempfile.NamedTemporaryFile(mode='w', suffix='.ps1', delete=False) as temp_script:
            temp_script.write(request.script)
            temp_script_path = temp_script.name

        # Execute the script using pwsh
        # We use -File to run the script file
        result = subprocess.run(
            ["pwsh", "-NonInteractive", "-NoProfile", "-File", temp_script_path],
            capture_output=True,
            text=True,
            timeout=30  # Timeout after 30 seconds
        )

        # Cleanup
        os.unlink(temp_script_path)

        return ScriptResponse(
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.returncode
        )

    except subprocess.TimeoutExpired:
        if os.path.exists(temp_script_path):
            os.unlink(temp_script_path)
        return ScriptResponse(
            stdout="", 
            stderr="Script execution timed out (30s limit).", 
            exit_code=124
        )
    except Exception as e:
        if 'temp_script_path' in locals() and os.path.exists(temp_script_path):
            os.unlink(temp_script_path)
        return ScriptResponse(
            stdout="", 
            stderr=f"An error occurred: {str(e)}", 
            exit_code=1
        )
