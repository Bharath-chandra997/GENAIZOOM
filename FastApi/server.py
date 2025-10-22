import os
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from gradio_client import Client, file
import logging
import jwt

# --- LOGGING SETUP ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
HF_SPACE_NAME = "Ruthwik/tmpathvqa-model-demo"
UPLOAD_FOLDER = "./uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- GRADIO CLIENT SETUP ---
client = None
try:
    logger.info(f"Connecting to Hugging Face Space: {HF_SPACE_NAME}...")
    client = Client(HF_SPACE_NAME)
    logger.info("✅ Connection to Hugging Face Space successful!")
except Exception as e:
    logger.error(f"❌ Failed to connect to Hugging Face Space: {e}")

# --- FASTAPI APP SETUP ---
app = FastAPI(title="SynergySphere VQA Proxy API")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://genaizoom123.onrender.com",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "*"]
)

# --- JWT AUTHENTICATION ---
security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    jwt_secret = os.getenv('JWT_SECRET')
    if not jwt_secret:
        logger.error("JWT_SECRET environment variable is not set")
        raise HTTPException(status_code=500, detail="Server configuration error: JWT_SECRET not set")
    try:
        logger.info(f"Verifying token for /predict...")
        payload = jwt.decode(token, jwt_secret, algorithms=['HS256'])
        logger.info(f"Token verified for user: {payload.get('username', 'unknown')}")
        return payload
    except jwt.PyJWTError as e:
        logger.error(f"JWT verification failed: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")

# --- API ROUTES ---

@app.get("/")
async def health_check():
    if client:
        return {"status": "✅ Proxy server is running and connected to Hugging Face Space."}
    else:
        return JSONResponse(content={"status": "❌ Proxy server is running but FAILED to connect."}, status_code=503)

@app.get("/ping")
async def ping():
    """Wake-up endpoint for keep-alive"""
    logger.info("Ping received - Server is awake")
    return {"status": "Server is awake"}

@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    audio: UploadFile = File(...),
    user: dict = Depends(verify_token)
):
    """
    Proxy endpoint for the VQA model.
    """
    logger.info(f"🚀 Predict request from user: {user.get('username')}")
    logger.info(f"📁 Image: {image.filename} ({image.content_type}, {image.size} bytes)")
    logger.info(f"🎵 Audio: {audio.filename} ({audio.content_type}, {audio.size} bytes)")
    
    if not client:
        logger.error("Gradio client not available for prediction")
        raise HTTPException(
            status_code=503,
            detail="Gradio client is not connected to the Hugging Face Space."
        )

    # Validate file types
    valid_image_types = ['image/jpeg', 'image/png']
    valid_audio_types = ['audio/mpeg', 'audio/wav']
    if image.content_type not in valid_image_types:
        logger.error(f"Invalid image format: {image.content_type}")
        raise HTTPException(status_code=400, detail="Invalid image format. Only JPEG/PNG allowed.")
    if audio.content_type not in valid_audio_types:
        logger.error(f"Invalid audio format: {audio.content_type}")
        raise HTTPException(status_code=400, detail="Invalid audio format. Only MP3/WAV allowed.")

    # Generate unique filenames
    image_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_{image.filename}")
    audio_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_{audio.filename}")

    try:
        # Save uploaded files
        logger.info("💾 Saving uploaded files...")
        with open(image_path, "wb") as f:
            content = await image.read()
            f.write(content)
            logger.info(f"✅ Image saved: {image_path} ({len(content)} bytes)")
        
        with open(audio_path, "wb") as f:
            content = await audio.read()
            f.write(content)
            logger.info(f"✅ Audio saved: {audio_path} ({len(content)} bytes)")

        logger.info("🤖 Calling Hugging Face model...")
        
        # Use params matching Colab success
        result = client.predict(
            image_input=file(image_path),
            audio_input=file(audio_path),
            api_name="/predict"
        )

        logger.info(f"🎯 Prediction result: {result}")
        if not result:
            logger.error("Empty result from Gradio")
            raise HTTPException(status_code=500, detail="Empty prediction from model")

        return JSONResponse(content={"prediction": result})

    except Exception as e:
        logger.error(f"❌ Prediction error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"An internal error occurred: {str(e)}"
        )
    finally:
        # Clean up temporary files
        for path in [image_path, audio_path]:
            if os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"🗑️ Cleaned up: {path}")
                except Exception as e:
                    logger.error(f"Failed to remove {path}: {e}")
        logger.info("✅ Temporary files cleaned up.")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting FastAPI server on host 0.0.0.0, port {port}")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)