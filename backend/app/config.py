from __future__ import annotations

import os

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field

load_dotenv()


class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    neo4j_uri: str = Field(default="bolt://localhost:7687", alias="NEO4J_URI")
    neo4j_user: str = Field(default="neo4j", alias="NEO4J_USER")
    neo4j_password: str = Field(default="password", alias="NEO4J_PASSWORD")
    semantic_scholar_api_key: str = Field(default="", alias="SEMANTIC_SCHOLAR_API_KEY")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    product_database_url: str = Field(default="sqlite:///./product_demo.db", alias="PRODUCT_DATABASE_URL")
    demo_user_id: str = Field(default="demo-user", alias="DEMO_USER_ID")
    demo_user_name: str = Field(default="Demo User", alias="DEMO_USER_NAME")
    rocketride_uri: str = Field(default="https://cloud.rocketride.ai", alias="ROCKETRIDE_URI")
    rocketride_api_key: str = Field(default="", alias="ROCKETRIDE_API_KEY")
    rocketride_base_url: str = Field(default="https://api.rocketride.ai/v1", alias="ROCKETRIDE_BASE_URL")
    rocketride_model: str = Field(default="openai/gpt-5.4", alias="ROCKETRIDE_MODEL")
    gmi_api_key: str = Field(default="", alias="GMI_API_KEY")
    gmi_base_url: str = Field(default="https://api.gmi-serving.com/v1/", alias="GMI_BASE_URL")
    gmi_model: str = Field(default="openai/gpt-5.4", alias="GMI_MODEL")


settings = Settings.model_validate(os.environ)

NEO4J_URI = settings.neo4j_uri
NEO4J_USER = settings.neo4j_user
NEO4J_PASSWORD = settings.neo4j_password
SEMANTIC_SCHOLAR_API_KEY = settings.semantic_scholar_api_key
ANTHROPIC_API_KEY = settings.anthropic_api_key
PRODUCT_DATABASE_URL = settings.product_database_url
DEMO_USER_ID = settings.demo_user_id
DEMO_USER_NAME = settings.demo_user_name
ROCKETRIDE_URI = settings.rocketride_uri
ROCKETRIDE_API_KEY = settings.rocketride_api_key or settings.gmi_api_key
ROCKETRIDE_BASE_URL = settings.rocketride_base_url or settings.gmi_base_url
ROCKETRIDE_MODEL = settings.rocketride_model or settings.gmi_model
GMI_API_KEY = settings.gmi_api_key
GMI_BASE_URL = settings.gmi_base_url
GMI_MODEL = settings.gmi_model
