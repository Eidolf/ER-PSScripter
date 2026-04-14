from .snippet import SnippetCreate


class SnippetAnalysisResult(SnippetCreate):
    is_duplicate: bool = False
