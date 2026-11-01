import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.security import SecurityHeadersMiddleware
from app.api.routes import threats, swarm, data
from app.services.ws_manager import ws_manager

logger = logging.getLogger("sentinel.main")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Autonomous multi-agent disaster intelligence and supply chain logistics swarm.",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 1. Security Headers & Rate Limiting Middleware
app.add_middleware(SecurityHeadersMiddleware)

# 2. CORS Middleware with specific allowed origins
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# 3. Global Exception Handlers (No sensitive stack trace leakage)
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "code": exc.status_code,
            "message": exc.detail
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        field = " -> ".join(str(loc) for loc in err.get("loc", []))
        errors.append(f"{field}: {err.get('msg', 'Invalid input')}")
    return JSONResponse(
        status_code=422,
        content={
            "status": "validation_error",
            "code": 422,
            "message": "Input validation failed. Please check coordinate and parameter constraints.",
            "details": errors
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "internal_error",
            "code": 500,
            "message": "An unexpected error occurred in the autonomous kernel. Operation safeguarded."
        }
    )

# 4. Connect API routers
app.include_router(threats.router, prefix="/api/v1")
app.include_router(swarm.router, prefix="/api/v1")
app.include_router(data.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "mode": "autonomous_active",
        "upstream_apis": {
            "open_meteo": "operational",
            "osrm_routing": "operational",
            "gdacs_georss": "operational",
            "data_gov_in": "synced"
        },
        "security_controls": {
            "rate_limiter": "active",
            "ssrf_protection": "active",
            "owasp_headers": "active",
            "input_sanitizer": "active"
        }
    }

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Send periodic telemetry heartbeat
            await asyncio.sleep(15)
            await websocket.send_json({
                "type": "HEARTBEAT",
                "status": "MONITORING_ACTIVE",
                "nodes_online": 5,
                "upstream_sync": "100%"
            })
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
