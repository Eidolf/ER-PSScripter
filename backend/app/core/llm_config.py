from pydantic_settings import BaseSettings


class LLMSettings(BaseSettings):
    # Provider: 'openai' or 'azure'
    LLM_PROVIDER: str = "openai"

    # OpenAI / Azure Common
    OPENAI_API_KEY: str = "sk-placeholder"
    
    # OpenAI Specific
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_BASE_URL: str | None = None 
    
    # Azure Specific
    AZURE_OPENAI_ENDPOINT: str | None = None
    AZURE_OPENAI_API_VERSION: str = "2024-02-15-preview"
    AZURE_OPENAI_DEPLOYMENT_NAME: str | None = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore" # Allow extra fields in .env

llm_settings = LLMSettings()
