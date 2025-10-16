import os
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from gradio_client import Client, file
import logging

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
    # This connects to your specific Gradio application API
    client = Client(HF_SPACE_NAME)
    logger.info("✅ Connection to Hugging Face Space successful!")
except Exception as e:
    logger.error(f"❌ Failed to connect to Hugging Face Space: {e}")
    # The server will still run, but /predict calls will fail.
    # The health check will report the failed connection status.

# --- FASTAPI APP SETUP ---
app = FastAPI(title="SynergySphere VQA Proxy API")

# Enable CORS to allow your frontend to communicate with this server
app.add_middleware(
    CORSMiddleware,
    # IMPORTANT: In production, restrict this to your actual frontend domain
    allow_origins=["https://genaizoom123.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API ROUTES ---

@app.post("/predict")
async def predict(image: UploadFile = File(...), audio: UploadFile = File(...)):
    """
    Proxy endpoint for the VQA model.
    Receives an image and audio file, saves them temporarily, sends them
    to the Gradio backend for prediction, and returns the result.
    """
    if not client:
        raise HTTPException(
            status_code=503, # Service Unavailable
            detail="Gradio client is not connected to the Hugging Face Space. The proxy cannot process requests."
        )

    # Generate unique filenames to prevent conflicts during simultaneous requests
    image_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_{image.filename}")
    audio_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_{audio.filename}")

    try:
        # Save the uploaded files to the temporary paths on the server's disk
        with open(image_path, "wb") as f:
            content = await image.read()
            f.write(content)
        
        with open(audio_path, "wb") as f:
            content = await audio.read()
            f.write(content)

        logger.info(f"Submitting prediction job for image: {image_path}, audio: {audio_path}")
        
        # Use the gradio_client to call the 'predict' API endpoint on your Space
        # The `file()` function handles the preparation of local files for the API call.
        result = client.predict(
            image_input=file(image_path),
            audio_input=file(audio_path),
            api_name="/predict" # This must match the API name on your Gradio app
        )

        logger.info(f"Received prediction: {result}")
        # The result from the model is the final prediction text
        return JSONResponse(content={"prediction": result})

    except Exception as e:
        logger.error(f"An error occurred during prediction: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"An internal error occurred: {str(e)}"
        )
    finally:
        # --- CRITICAL: Clean up the temporary files to prevent disk space issues ---
        if os.path.exists(image_path):
            os.remove(image_path)
        if os.path.exists(audio_path):
            os.remove(audio_path)
        logger.info("Temporary files cleaned up.")


@app.get("/")
async def health_check():
    """
    Health check to verify that the proxy server is running and connected.
    """
    if client:
        status = "✅ Proxy server is running and connected to Hugging Face Space."
        return {"status": status}
    else:
        status = "❌ Proxy server is running but FAILED to connect to Hugging Face Space."
        return JSONResponse(content={"status": status}, status_code=503)

# --- RUNNING THE APP (for platforms like Render) ---
if __name__ == "__main__":
    import uvicorn
    # Render provides the PORT environment variable
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting FastAPI server on host 0.0.0.0, port {port}")
    # Use "server:app" to match the filename
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
