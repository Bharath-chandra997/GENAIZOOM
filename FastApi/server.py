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

# FIXED: Enhanced CORS - Add frontend origin explicitly
app.add_middleware(
    CORSMiddleware, # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_origins=["*"],
    allow_headers=["*"],
)

# --- JWT AUTHENTICATION ---
security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        # FIXED: Log token issues
        logger.info(f"Verifying token for /predict...")
        payload = jwt.decode(token, os.getenv('JWT_SECRET'), algorithms=['HS256'])
        logger.info(f"Token verified for user: {payload.get('username', 'unknown')}")
        return payload
    except jwt.PyJWTError as e:
        logger.error(f"JWT verification failed: {e} (check JWT_SECRET env var)")
        raise HTTPException(status_code=401, detail='Invalid or expired token')

# --- API ROUTES ---

@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    audio: UploadFile = File(...),
    user: dict = Depends(verify_token)
):
    """
    Proxy endpoint for the VQA model.
    """
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
        raise HTTPException(status_code=400, detail="Invalid image format. Only JPEG/PNG allowed.")
    if audio.content_type not in valid_audio_types:
        raise HTTPException(status_code=400, detail="Invalid audio format. Only MP3/WAV allowed.")

    # Generate unique filenames
    image_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_{image.filename}")
    audio_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_{audio.filename}")

    try:
        # Save uploaded files
        logger.info(f"Saving files: image={image.filename} ({image.content_type}), audio={audio.filename} ({audio.content_type})")
        with open(image_path, "wb") as f:
            content = await image.read()
            f.write(content)
        with open(audio_path, "wb") as f:
            content = await audio.read()
            f.write(content)

        logger.info(f"Submitting prediction job for image: {image_path}, audio: {audio_path}")
        
        # Use params matching Colab success
        result = client.predict(
            image_input=file(image_path),
            audio_input=file(audio_path),
            api_name="/predict"
        )

        logger.info(f"Received prediction: {result}")
        if not result:
            logger.error("Empty result from Gradio")
            raise HTTPException(status_code=500, detail="Empty prediction from model")

        return JSONResponse(content={"prediction": result})

    except Exception as e:
        logger.error(f"An error occurred during prediction: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"An internal error occurred: {str(e)}"
        )
    finally:
        # Clean up temporary files
        for path in [image_path, audio_path]:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    logger.error(f"Failed to remove {path}: {e}")
        logger.info("Temporary files cleaned up.")

@app.get("/")
async def health_check():
    if client:
        return {"status": "✅ Proxy server is running and connected to Hugging Face Space."}
    else:
        return JSONResponse(content={"status": "❌ Proxy server is running but FAILED to connect."}, status_code=503)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting FastAPI server on host 0.0.0.0, port {port}")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)