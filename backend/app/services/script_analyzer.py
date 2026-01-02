import os
from typing import List

class ScriptAnalyzerService:
    def analyze_folder(self, folder_path: str) -> List[str]:
        # TODO: Implement PSScriptAnalyzer integration or regex extraction
        snippets = []
        if os.path.exists(folder_path):
            for root, _, files in os.walk(folder_path):
                for file in files:
                    if file.endswith(".ps1"):
                        snippets.append(file)
        return snippets
