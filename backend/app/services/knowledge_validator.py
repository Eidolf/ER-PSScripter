import re
from typing import Any

from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeEntity


class PowerShellKnowledgeValidator:
    """Validates generated PowerShell code against verified knowledge entities to eliminate hallucinations."""

    @staticmethod
    def extract_invoked_cmdlets(script_content: str) -> list[str]:
        # Strip comments
        cleaned = re.sub(r"<#[\s\S]*?#>", "", script_content)
        cleaned = re.sub(r"#.*$", "", cleaned, flags=re.MULTILINE)

        # Match Verb-Noun patterns typically used for PowerShell commands
        matches = re.findall(r"\b([A-Z][a-zA-Z0-9]+-[A-Z][a-zA-Z0-9]+)\b", cleaned)
        # Filter standard builtin common verbs/nouns if necessary, keep unique
        return list(set(matches))

    def validate_script(self, script_content: str, db: Session) -> dict[str, Any]:
        invoked_cmdlets = self.extract_invoked_cmdlets(script_content)
        verified_cmdlets: list[dict[str, Any]] = []
        unverified_cmdlets: list[str] = []
        traceable_sources: list[dict[str, str]] = []

        for cmdlet in invoked_cmdlets:
            entity = db.query(KnowledgeEntity).filter(KnowledgeEntity.canonical_name.ilike(cmdlet)).first()

            if entity:
                verified_cmdlets.append(
                    {
                        "name": entity.canonical_name,
                        "module": entity.module_name,
                        "trust_level": entity.trust_level,
                        "source_type": entity.source_type,
                        "source_url": entity.source_url,
                    }
                )
                if entity.source_url:
                    traceable_sources.append(
                        {
                            "entity": str(entity.canonical_name),
                            "url": str(entity.source_url),
                            "source_type": str(entity.source_type),
                        }
                    )

            else:
                unverified_cmdlets.append(cmdlet)

        # Confidence calculation based on ratio of verified cmdlets
        total_cmdlets = len(invoked_cmdlets)
        confidence = 1.0 if total_cmdlets == 0 else round(len(verified_cmdlets) / total_cmdlets, 2)
        is_valid = len(unverified_cmdlets) == 0 or confidence >= 0.5

        return {
            "is_valid": is_valid,
            "confidence_score": confidence,
            "verified_cmdlets": verified_cmdlets,
            "unverified_cmdlets": unverified_cmdlets,
            "traceable_sources": traceable_sources,
            "validation_message": (
                f"Verified {len(verified_cmdlets)} of {total_cmdlets} cmdlets against authoritative knowledge base."
                if total_cmdlets > 0
                else "No external cmdlets detected."
            ),
        }


powershell_validator = PowerShellKnowledgeValidator()
