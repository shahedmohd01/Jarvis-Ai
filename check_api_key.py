import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
print("=== Jarvis AI API Key Diagnostic ===")
if not api_key:
    print("[ERROR] GEMINI_API_KEY environment variable is not set in your .env file.")
    print("Please create/update your .env file and add:")
    print("GEMINI_API_KEY=your_actual_api_key_here")
    exit(1)

print(f"Detected Key: {api_key[:6]}...{api_key[-4:] if len(api_key) > 10 else ''}")

try:
    print("Testing connection to Gemini API using gemini-3.5-flash...")
    from google import genai
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model='gemini-3.5-flash',
        contents='say "Hello, I am Jarvis AI!"'
    )
    print("\n[SUCCESS] API Key is valid and working!")
    print("Response sample:", response.text)
except Exception as e:
    print("\n[ERROR] Connection test failed with error:")
    print(e)
    print("\nPlease verify that your API Key is correct and has not expired or been deleted.")
    print("You can get a free API Key from Google AI Studio: https://aistudio.google.com/")
