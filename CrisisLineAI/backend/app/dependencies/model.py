from fastapi import Request
from app.model.llm import Model

def get_model(request: Request) -> Model:
    return request.app.state.model