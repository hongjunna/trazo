"""MCP(Model Context Protocol) 서버의 JSON-RPC 처리. 도구(tools)만 제공하는 상태 없는(stateless) 서버입니다.

ChatGPT·Claude 등은 Streamable HTTP 방식으로 POST /mcp에 JSON-RPC 메시지를 보냅니다.
이 서버는 알림을 보내지 않으므로 SSE 스트림 없이 요청마다 JSON 하나로 응답합니다.
"""
import json
from typing import Any, Callable, Optional

from pydantic import BaseModel, ValidationError

# 최신 버전이 앞에 옵니다. 클라이언트가 요청한 버전을 지원하면 그대로, 아니면 최신 버전으로 응답합니다.
PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602


class ToolError(Exception):
    """AI에게 그대로 보여줄 도구 실행 오류 (예: 코스를 찾지 못함). AI가 읽고 다시 시도할 수 있습니다."""


class Tool:
    def __init__(self, name: str, title: str, description: str, arguments: type[BaseModel],
                 handler: Callable[[Any, BaseModel], dict], open_world: bool = False):
        self.name, self.title, self.description = name, title, description
        self.arguments, self.handler, self.open_world = arguments, handler, open_world

    def definition(self) -> dict:
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": clean_schema(self.arguments.model_json_schema()),
            # 모든 도구는 읽기 전용입니다. 클라이언트가 확인 없이 호출해도 되는 도구로 표시됩니다.
            "annotations": {"title": self.title, "readOnlyHint": True, "destructiveHint": False,
                            "idempotentHint": True, "openWorldHint": self.open_world},
        }


def clean_schema(schema):
    """pydantic 스키마에서 AI에게 불필요한 title을 빼고, 선택 항목의 anyOf[..., null]을 단순한 타입으로 바꿉니다."""
    if isinstance(schema, list):
        return [clean_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema
    schema = dict(schema)
    options = schema.get("anyOf")
    if isinstance(options, list):
        non_null = [option for option in options if option != {"type": "null"}]
        if len(non_null) == 1 and len(non_null) < len(options):
            schema.pop("anyOf")
            schema = {**non_null[0], **schema}
            if schema.get("default", ...) is None:
                schema.pop("default")
    cleaned = {}
    for key, value in schema.items():
        if key == "title":
            continue
        if key == "properties":
            cleaned[key] = {name: clean_schema(prop) for name, prop in value.items()}
        else:
            cleaned[key] = clean_schema(value)
    return cleaned


def error_response(request_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def result_response(request_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def tool_result(data: dict, is_error: bool = False) -> dict:
    # 구조화된 결과(structuredContent)를 지원하지 않는 클라이언트를 위해 같은 내용을 JSON 문자열로도 넣습니다.
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    result = {"content": [{"type": "text", "text": text}], "isError": is_error}
    if not is_error:
        result["structuredContent"] = data
    return result


class McpServer:
    def __init__(self, name: str, title: str, version: str, instructions: str, tools: list[Tool]):
        self.info = {"name": name, "title": title, "version": version}
        self.instructions = instructions
        self.tools = {tool.name: tool for tool in tools}

    def handle(self, message: Any, context: Any) -> Optional[dict]:
        """JSON-RPC 메시지 하나를 처리합니다. 알림·응답처럼 답할 필요가 없으면 None을 돌려줍니다."""
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return error_response(None, INVALID_REQUEST, "Invalid JSON-RPC message")
        method = message.get("method")
        if "id" not in message or not isinstance(method, str):
            return None
        request_id = message["id"]
        params = message.get("params") or {}
        if not isinstance(params, dict):
            return error_response(request_id, INVALID_PARAMS, "params must be an object")
        if method == "initialize":
            requested = params.get("protocolVersion")
            return result_response(request_id, {
                "protocolVersion": requested if requested in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0],
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": self.info,
                "instructions": self.instructions,
            })
        if method == "ping":
            return result_response(request_id, {})
        if method == "tools/list":
            return result_response(request_id, {"tools": [tool.definition() for tool in self.tools.values()]})
        if method == "tools/call":
            tool = self.tools.get(params.get("name"))
            if not tool:
                return error_response(request_id, INVALID_PARAMS, f"Unknown tool: {params.get('name')}")
            try:
                arguments = tool.arguments.model_validate(params.get("arguments") or {})
            except ValidationError as error:
                problems = "; ".join(f"{'.'.join(map(str, item['loc'])) or 'arguments'}: {item['msg']}" for item in error.errors())
                return result_response(request_id, tool_result({"error": f"잘못된 입력: {problems}"}, is_error=True))
            try:
                return result_response(request_id, tool_result(tool.handler(context, arguments)))
            except ToolError as error:
                return result_response(request_id, tool_result({"error": str(error)}, is_error=True))
        return error_response(request_id, METHOD_NOT_FOUND, f"Method not found: {method}")
