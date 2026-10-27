from sqlalchemy.orm import Session

from app.schemas.knowledge import KnowledgeEntityCreate, KnowledgeRelationCreate, KnowledgeSourceCreate
from app.services.knowledge_service import knowledge_service


def seed_powershell_knowledge_base(db: Session) -> None:
    # 1. Sources
    ms_learn = knowledge_service.get_or_create_source(
        db,
        KnowledgeSourceCreate(
            name="Microsoft Learn PowerShell Docs",
            source_type="microsoft_learn",
            url="https://learn.microsoft.com/powershell/",
            trust_level=1.0,
            is_active=True,
            auto_refresh=True,
            refresh_frequency_hours=168,
        ),
    )

    ms_graph = knowledge_service.get_or_create_source(
        db,
        KnowledgeSourceCreate(
            name="Microsoft Graph SDK Documentation",
            source_type="microsoft_learn",
            url="https://learn.microsoft.com/graph/powershell/get-started",
            trust_level=1.0,
            is_active=True,
            auto_refresh=True,
            refresh_frequency_hours=168,
        ),
    )

    knowledge_service.get_or_create_source(
        db,
        KnowledgeSourceCreate(
            name="PowerShell Gallery",
            source_type="psgallery",
            url="https://www.powershellgallery.com/",
            trust_level=0.9,
            is_active=True,
            auto_refresh=True,
            refresh_frequency_hours=72,
        ),
    )

    # 2. Key Modules & Cmdlets
    # Microsoft.PowerShell.Management
    mod_mgmt = knowledge_service.upsert_entity(
        db,
        KnowledgeEntityCreate(
            canonical_name="Microsoft.PowerShell.Management",
            category="module",
            description="Core module managing processes, services, files, items, and registry in PowerShell.",
            tags=["core", "built-in", "management"],
            source_id=ms_learn.id,
            source_url="https://learn.microsoft.com/powershell/module/microsoft.powershell.management/",
            source_type="official_microsoft",
            ps_edition="Desktop,Core",
            min_ps_version="5.1",
            module_name="Microsoft.PowerShell.Management",
            trust_level=1.0,
            confidence_score=1.0,
            structured_details={"author": "Microsoft", "type": "Built-in"},
        ),
    )

    cmd_get_process = knowledge_service.upsert_entity(
        db,
        KnowledgeEntityCreate(
            canonical_name="Get-Process",
            category="cmdlet",
            description="Gets the processes that are running on the local computer or a remote computer.",
            tags=["process", "diagnostic", "system"],
            source_id=ms_learn.id,
            source_url="https://learn.microsoft.com/powershell/module/microsoft.powershell.management/get-process",
            source_type="official_microsoft",
            ps_edition="Desktop,Core",
            min_ps_version="5.1",
            module_name="Microsoft.PowerShell.Management",
            trust_level=1.0,
            confidence_score=1.0,
            structured_details={
                "syntax": "Get-Process [[-Name] <string[]>] [-ComputerName <string[]>] [-FileVersionInfo] [-Module]",
                "parameters": [
                    {
                        "name": "Name",
                        "type": "string[]",
                        "required": False,
                        "description": "Specifies one or more process names.",
                    },
                    {
                        "name": "Id",
                        "type": "int[]",
                        "required": False,
                        "description": "Specifies one or more process IDs.",
                    },
                    {
                        "name": "ErrorAction",
                        "type": "ActionPreference",
                        "required": False,
                        "description": "Determines action on non-terminating errors.",
                    },
                ],
                "output_type": "System.Diagnostics.Process",
            },
        ),
    )

    cmd_stop_process = knowledge_service.upsert_entity(
        db,
        KnowledgeEntityCreate(
            canonical_name="Stop-Process",
            category="cmdlet",
            description="Stops one or more running processes with safety checks.",
            tags=["process", "management", "kill"],
            source_id=ms_learn.id,
            source_url="https://learn.microsoft.com/powershell/module/microsoft.powershell.management/stop-process",
            source_type="official_microsoft",
            ps_edition="Desktop,Core",
            min_ps_version="5.1",
            module_name="Microsoft.PowerShell.Management",
            trust_level=1.0,
            confidence_score=1.0,
            structured_details={
                "syntax": "Stop-Process [-Id] <int[]> [-PassThru] [-Force] [-WhatIf] [-Confirm]",
                "parameters": [
                    {"name": "Id", "type": "int[]", "required": True},
                    {
                        "name": "Force",
                        "type": "switch",
                        "required": False,
                        "description": "Forces the process to stop without confirmation.",
                    },
                    {"name": "WhatIf", "type": "switch", "required": False},
                ],
            },
        ),
    )

    # Microsoft Graph Module & Cmdlets
    mod_graph = knowledge_service.upsert_entity(
        db,
        KnowledgeEntityCreate(
            canonical_name="Microsoft.Graph.Authentication",
            category="module",
            description=(
                "Microsoft Graph PowerShell SDK module providing authentication cmdlets "
                "including Connect-MgGraph and Disconnect-MgGraph."
            ),
            tags=["microsoft-graph", "cloud", "identity", "azure-ad", "entra-id"],
            source_id=ms_graph.id,
            source_url="https://learn.microsoft.com/powershell/module/microsoft.graph.authentication/",
            source_type="official_microsoft",
            ps_edition="Desktop,Core",
            min_ps_version="7.0",
            module_name="Microsoft.Graph.Authentication",
            trust_level=1.0,
            confidence_score=1.0,
            structured_details={"sdk_version": "v2", "auth_types": ["Delegated", "AppOnly"]},
        ),
    )

    cmd_connect_graph = knowledge_service.upsert_entity(
        db,
        KnowledgeEntityCreate(
            canonical_name="Connect-MgGraph",
            category="cmdlet",
            description=(
                "Authenticates to the Microsoft Graph API using interactive user login, "
                "managed identities, client credentials, or certificates."
            ),
            tags=["authentication", "microsoft-graph", "oauth", "entra-id"],
            source_id=ms_graph.id,
            source_url="https://learn.microsoft.com/powershell/module/microsoft.graph.authentication/connect-mggraph",
            source_type="official_microsoft",
            ps_edition="Desktop,Core",
            min_ps_version="7.0",
            module_name="Microsoft.Graph.Authentication",
            trust_level=1.0,
            confidence_score=1.0,
            structured_details={
                "syntax": (
                    "Connect-MgGraph [-Scopes <string[]>] [-TenantId <string>] "
                    "[-ClientId <string>] [-CertificateThumbprint <string>] [-Identity]"
                ),
                "parameters": [
                    {
                        "name": "Scopes",
                        "type": "string[]",
                        "required": False,
                        "description": "Delegated permission scopes, e.g. User.Read.All, Group.Read.All",
                    },
                    {"name": "TenantId", "type": "string", "required": False, "description": "Azure/Entra Tenant ID"},
                    {
                        "name": "Identity",
                        "type": "switch",
                        "required": False,
                        "description": "Connect using Azure Managed Identity",
                    },
                ],
                "security_guidance": (
                    "Principle of least privilege: only request required scopes. "
                    "Prefer Managed Identity or Certificate over raw client secrets in automated scripts."
                ),
            },
        ),
    )

    cmd_get_mguser = knowledge_service.upsert_entity(
        db,
        KnowledgeEntityCreate(
            canonical_name="Get-MgUser",
            category="cmdlet",
            description=(
                "Retrieves a list of Microsoft Entra ID user objects or a specific user by ID or UserPrincipalName."
            ),
            tags=["users", "entra-id", "microsoft-graph"],
            source_id=ms_graph.id,
            source_url="https://learn.microsoft.com/powershell/module/microsoft.graph.users/get-mguser",
            source_type="official_microsoft",
            ps_edition="Desktop,Core",
            min_ps_version="7.0",
            module_name="Microsoft.Graph.Users",
            trust_level=1.0,
            confidence_score=1.0,
            structured_details={
                "syntax": "Get-MgUser [-UserId <string>] [-Filter <string>] [-Property <string[]>] [-All]",
                "parameters": [
                    {"name": "UserId", "type": "string", "required": False},
                    {"name": "Filter", "type": "string", "required": False, "description": "OData v4 filter clause"},
                    {
                        "name": "All",
                        "type": "switch",
                        "required": False,
                        "description": "Automatically page through all results",
                    },
                ],
            },
        ),
    )

    # Best Practices & Security Entities
    knowledge_service.upsert_entity(
        db,
        KnowledgeEntityCreate(
            canonical_name="PowerShell Strict Error Handling (Stop + Try/Catch)",
            category="best_practice",
            description=(
                "Robust enterprise scripts should set $ErrorActionPreference = 'Stop' or use -ErrorAction Stop "
                "on cmdlets to convert non-terminating errors into catchable terminating errors."
            ),
            tags=["error-handling", "try-catch", "best-practice", "reliability"],
            source_id=ms_learn.id,
            source_url="https://learn.microsoft.com/powershell/scripting/learn/deep-dives/everything-about-exceptions",
            source_type="official_microsoft",
            ps_edition="Desktop,Core",
            trust_level=1.0,
            confidence_score=1.0,
            structured_details={
                "pattern": (
                    "$ErrorActionPreference = 'Stop'\ntry {\n    # Code\n} catch {\n"
                    '    Write-Error "Failed: $_"\n    throw\n}'
                )
            },
        ),
    )

    sec_credentials = knowledge_service.upsert_entity(
        db,
        KnowledgeEntityCreate(
            canonical_name="PowerShell Secure Credential Management",
            category="security_guidance",
            description=(
                "Never hardcode plain-text passwords or client secrets in PowerShell scripts. "
                "Use PSCredential, Azure Key Vault, SecretManagement module, or OAuth token authentication."
            ),
            tags=["security", "passwords", "credentials", "compliance"],
            source_id=ms_learn.id,
            source_url="https://learn.microsoft.com/powershell/module/microsoft.powershell.secretmanagement/",
            source_type="official_microsoft",
            ps_edition="Desktop,Core",
            trust_level=1.0,
            confidence_score=1.0,
            structured_details={
                "module_recommendation": "Microsoft.PowerShell.SecretManagement",
                "rules": [
                    "Never use ConvertTo-SecureString with plain text key in source control",
                    "Use SecretStore or Azure Key Vault for production automated execution",
                ],
            },
        ),
    )

    # 3. Create Relations
    # Get-Process is in Microsoft.PowerShell.Management
    knowledge_service.add_relation(
        db,
        KnowledgeRelationCreate(
            from_entity_id=cmd_get_process.id,
            to_entity_id=mod_mgmt.id,
            relation_type="requires_module",
            description="Get-Process is exported by Microsoft.PowerShell.Management",
        ),
    )

    # Stop-Process is in Microsoft.PowerShell.Management
    knowledge_service.add_relation(
        db,
        KnowledgeRelationCreate(
            from_entity_id=cmd_stop_process.id,
            to_entity_id=mod_mgmt.id,
            relation_type="requires_module",
            description="Stop-Process is exported by Microsoft.PowerShell.Management",
        ),
    )

    # Get-Process is related to Stop-Process
    knowledge_service.add_relation(
        db,
        KnowledgeRelationCreate(
            from_entity_id=cmd_get_process.id,
            to_entity_id=cmd_stop_process.id,
            relation_type="related_to",
            description="Common pipeline workflow: Get-Process | Stop-Process",
        ),
    )

    # Connect-MgGraph is in Microsoft.Graph.Authentication
    knowledge_service.add_relation(
        db,
        KnowledgeRelationCreate(
            from_entity_id=cmd_connect_graph.id,
            to_entity_id=mod_graph.id,
            relation_type="requires_module",
            description="Connect-MgGraph requires Microsoft.Graph.Authentication",
        ),
    )

    # Get-MgUser authenticates with Connect-MgGraph
    knowledge_service.add_relation(
        db,
        KnowledgeRelationCreate(
            from_entity_id=cmd_get_mguser.id,
            to_entity_id=cmd_connect_graph.id,
            relation_type="authenticates_with",
            description="Get-MgUser requires active authenticated session via Connect-MgGraph",
        ),
    )

    # Connect-MgGraph relates to Secure Credential Management
    knowledge_service.add_relation(
        db,
        KnowledgeRelationCreate(
            from_entity_id=cmd_connect_graph.id,
            to_entity_id=sec_credentials.id,
            relation_type="best_practice_for",
            description="App-only authentication should follow secure credential storage best practices",
        ),
    )
