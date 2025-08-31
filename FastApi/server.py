import os
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# --- CONFIGURATION ---
REMOTE_API_ENDPOINT = "https://ruthwik-pathvqa-yesno-api.hf.space/predict"
UPLOAD_FOLDER = "./uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Kept for potential future use, though not needed for /predict

# --- FASTAPI APP SETUP ---
app = FastAPI(title="SynergySphere Proxy API")

# Enable CORS to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://genaizoomserver-0yn4.onrender.com"],  # Restrict to your frontend in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PREDICTION ROUTE ---
@app.post("/predict")
async def predict(image: UploadFile = File(...), audio: UploadFile = File(None)):
    """
    Receives image and optional audio files, reads them into memory,
    and forwards them to the remote ML model API.
    """
    try:
        # Read file contents into memory
        image_content = await image.read()
        audio_content = await audio.read() if audio else None

        # Prepare files for the forwarding request
        files = {
            "image": (image.filename, image_content, image.content_type),
        }
        if audio_content:
            files["audio"] = (audio.filename, audio_content, audio.content_type)

        # Forward to Hugging Face API
        async with httpx.AsyncClient(timeout=30.0) as client:  # Reduced timeout for faster failure
            response = await client.post(REMOTE_API_ENDPOINT, files=files)

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail={
                    "error": "Remote API call failed",
                    "status_code": response.status_code,
                    "details": response.text,
                },
            )

        return JSONResponse(content=response.json())

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Remote API request timed out")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {str(e)}")

# --- HEALTH CHECK ROUTE ---
@app.get("/")
async def health_check():
    """
    Verify that the proxy server is running.
    """
    return {"status": "✅ Proxy server is running and connected to Hugging Face Space."}

# --- RUNNING THE APP ---
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))  # Use Render's PORT or default to 8000 for local
    print(f"Starting FastAPI server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)